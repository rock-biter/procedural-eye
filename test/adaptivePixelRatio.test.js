import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	ADAPTIVE_PIXEL_RATIO_DEFAULTS,
	AdaptivePixelRatio,
	MOBILE_PIXEL_RATIO,
	PIXEL_RATIO_CAP,
	createAdaptivePixelRatioSettings,
	getMaxPixelRatio,
	parsePixelRatio,
} from '../src/adaptivePixelRatio'

const {
	windowMs,
	settleFrames,
	dropWindows,
	holdWindows,
	undoWindows,
	confirmWindows,
	maxHoldWindows,
} = ADAPTIVE_PIXEL_RATIO_DEFAULTS

// 30 fps at 60 Hz vsync, and two slow rates.
const LOCKED_30 = 33.3
const SLOW = 50
const BORDERLINE = 40

// Feeds whole windows of one interval and returns every ratio change.
function feed(adaptive, intervalMs, windows) {
	const changes = []
	for (let window = 0; window < windows; window++) {
		// A window after a change also waits out the settle frames.
		const frames = Math.ceil(windowMs / intervalMs) + adaptive.settle
		for (let frame = 0; frame < frames; frame++) {
			const ratio = adaptive.update(intervalMs)
			if (ratio !== null) changes.push(ratio)
		}
	}
	return changes
}

const create = (maxRatio = 2, overrides) =>
	new AdaptivePixelRatio(createAdaptivePixelRatioSettings(overrides), maxRatio)

test('the maximum is the display ratio, capped', () => {
	assert.equal(getMaxPixelRatio(3), PIXEL_RATIO_CAP)
	assert.equal(getMaxPixelRatio(1.5), 1.5)
	assert.equal(getMaxPixelRatio(0), 1)
	assert.equal(getMaxPixelRatio(undefined), 1)
})

test('?dpr= pins a clamped ratio and ignores invalid values', () => {
	const parse = (query) => parsePixelRatio(new URLSearchParams(query))
	assert.equal(parse('dpr=1.5'), 1.5)
	assert.equal(parse('dpr=4'), PIXEL_RATIO_CAP)
	assert.equal(parse('dpr=0.1'), 0.5)
	assert.equal(parse(''), null)
	assert.equal(parse('dpr='), null)
	assert.equal(parse('dpr=abc'), null)
	assert.equal(parse('dpr=-1'), null)
})

test('windows last half a second of frames, whatever the frame rate', () => {
	const adaptive = create()
	for (let frame = 0; frame < windowMs / SLOW - 1; frame++) adaptive.update(SLOW)
	assert.equal(adaptive.lastMeanMs, null)
	adaptive.update(SLOW)
	assert.equal(adaptive.lastMeanMs, SLOW)
	assert.equal(adaptive.count, 0)
})

test('only a sustained slowdown lowers the ratio', () => {
	const adaptive = create()
	// A slow second and a half between frames locked at 30 fps: a moment.
	assert.deepEqual(feed(adaptive, SLOW, dropWindows - 1), [])
	assert.deepEqual(feed(adaptive, LOCKED_30, 1), [])
	assert.deepEqual(feed(adaptive, SLOW, dropWindows - 1), [])
	assert.equal(adaptive.ratio, 2)
	// Two seconds: a trend. 50 ms asks for 0.72 times the pixels, two steps.
	assert.deepEqual(feed(adaptive, SLOW, 1), [1.6])
})

test('a slow minority of frames does not lower the ratio', () => {
	const adaptive = create()
	// One frame in ten at 200 ms: a 50 ms mean, the hitches left out.
	for (let frame = 0; frame < 600; frame++) {
		assert.equal(adaptive.update(frame % 10 === 0 ? 200 : LOCKED_30), null)
	}
	assert.ok(Math.abs(adaptive.lastMeanMs - LOCKED_30) < 1e-9)
	assert.equal(adaptive.ratio, 2)
})

test('a deep slowdown drops several steps at once, down to the minimum', () => {
	const adaptive = create()
	assert.deepEqual(feed(adaptive, 90, dropWindows), [1.2])
	assert.deepEqual(feed(adaptive, 200, dropWindows), [0.6])
	assert.deepEqual(feed(adaptive, 200, dropWindows * 2), [])
})

test('frames locked at 30 fps climb back to the maximum', () => {
	const adaptive = create()
	feed(adaptive, SLOW, dropWindows)
	assert.equal(adaptive.ratio, 1.6)
	assert.deepEqual(feed(adaptive, LOCKED_30, holdWindows - 1), [])
	assert.deepEqual(feed(adaptive, LOCKED_30, 1), [1.8])
	assert.equal(adaptive.trying, true)
	// The next step follows as soon as the try holds as long.
	assert.deepEqual(feed(adaptive, LOCKED_30, holdWindows), [2])
	assert.deepEqual(feed(adaptive, LOCKED_30, confirmWindows), [])
	assert.equal(adaptive.trying, false)
	assert.equal(adaptive.hold, holdWindows)
})

test('a try that fails is undone and doubles the wait, up to its cap', () => {
	const adaptive = create(1)
	feed(adaptive, BORDERLINE, dropWindows)
	assert.equal(adaptive.ratio, 0.8)
	feed(adaptive, LOCKED_30, holdWindows)
	assert.equal(adaptive.ratio, 1)
	assert.deepEqual(feed(adaptive, BORDERLINE, undoWindows), [0.8])
	assert.equal(adaptive.hold, holdWindows * 2)
	// The longer wait: no try before it ends.
	assert.deepEqual(feed(adaptive, LOCKED_30, holdWindows * 2 - 1), [])
	assert.deepEqual(feed(adaptive, LOCKED_30, 1), [1])
	for (let i = 0; i < 8; i++) {
		feed(adaptive, BORDERLINE, undoWindows)
		feed(adaptive, LOCKED_30, adaptive.hold)
	}
	assert.equal(adaptive.hold, maxHoldWindows)
	// The ratio keeps trying at the longest wait.
	assert.equal(adaptive.ratio, 1)
	// A new scene: the next try comes after the base wait.
	feed(adaptive, BORDERLINE, undoWindows)
	adaptive.resetHold()
	assert.deepEqual(feed(adaptive, LOCKED_30, holdWindows), [1])
})

test('a slowdown late in a try fails it, after confirmation it drops as usual', () => {
	const adaptive = create(1)
	feed(adaptive, BORDERLINE, dropWindows)
	feed(adaptive, LOCKED_30, holdWindows)
	assert.equal(adaptive.ratio, 1)
	assert.deepEqual(feed(adaptive, LOCKED_30, confirmWindows - undoWindows - 1), [])
	assert.deepEqual(feed(adaptive, BORDERLINE, undoWindows), [0.8])
	assert.equal(adaptive.hold, holdWindows * 2)

	feed(adaptive, LOCKED_30, adaptive.hold)
	assert.equal(adaptive.ratio, 1)
	feed(adaptive, LOCKED_30, confirmWindows)
	assert.equal(adaptive.trying, false)
	assert.equal(adaptive.hold, holdWindows)
	assert.deepEqual(feed(adaptive, BORDERLINE, dropWindows - 1), [])
	assert.deepEqual(feed(adaptive, BORDERLINE, 1), [0.8])
	assert.equal(adaptive.hold, holdWindows)
})

test('hitches and hidden-tab intervals are skipped', () => {
	const adaptive = create()
	for (let frame = 0; frame < 300; frame++) {
		assert.equal(adaptive.update(frame % 2 ? 0 : 400), null)
	}
	assert.equal(adaptive.count, 0)
	assert.equal(adaptive.ratio, 2)
})

test('frames right after a change are not measured', () => {
	const adaptive = create()
	feed(adaptive, SLOW, dropWindows)
	assert.equal(adaptive.settle, settleFrames)
	for (let frame = 0; frame < settleFrames; frame++) adaptive.update(SLOW)
	assert.equal(adaptive.count, 0)
})

test('settings apply live and the maximum follows the display', () => {
	const settings = createAdaptivePixelRatioSettings()
	const adaptive = new AdaptivePixelRatio(settings, 2)
	feed(adaptive, 90, dropWindows)
	assert.equal(adaptive.ratio, 1.2)
	settings.min = 1.5
	assert.equal(adaptive.update(LOCKED_30), 1.5)
	settings.enabled = false
	assert.equal(adaptive.update(SLOW), 2)
	assert.equal(adaptive.update(SLOW), null)
	settings.enabled = true
	assert.equal(adaptive.setMax(1), 1)
	// A minimum above the maximum is clamped to it.
	assert.deepEqual(feed(adaptive, SLOW, dropWindows * 2), [])
	assert.equal(adaptive.getStats().min, 1)
})

test('phones target 60 fps: locked at 30 fps they drop a step at a time, at 60 fps they climb back', () => {
	const adaptive = create(2, { ...MOBILE_PIXEL_RATIO, min: 1 })
	const LOCKED_60 = 16.7
	assert.deepEqual(feed(adaptive, LOCKED_60, dropWindows * 4), [])
	// A GPU slowed down as it warms up: 30 fps, one step down after each run.
	assert.deepEqual(feed(adaptive, LOCKED_30, dropWindows), [1.9])
	assert.deepEqual(feed(adaptive, LOCKED_30, dropWindows), [1.8])
	// Back at 60 fps, it tries the step up after the hold.
	assert.deepEqual(feed(adaptive, LOCKED_60, holdWindows), [1.9])
	assert.deepEqual(feed(adaptive, LOCKED_60, holdWindows), [2])
	// It never goes under the minimum.
	assert.deepEqual(feed(adaptive, 200, dropWindows * 30).at(-1), 1)
})
