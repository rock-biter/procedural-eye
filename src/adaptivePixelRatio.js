// Pure rules for the renderer pixel ratio (applied by src/renderSetup.js): the cap, the
// `?dpr=` override, and the adaptive ratio that lowers the resolution when the
// interactive frame rate stays below its budget (about 30 fps on a desktop,
// 60 fps on a phone or tablet) and tries a higher one again whenever it is
// back within budget. Only interactive frames adapt (src/app.js): a resize
// would restart the accumulation.

// Highest pixel ratio the renderer uses, whatever the display reports.
export const PIXEL_RATIO_CAP = 2

// - `enabled`: adapt the ratio; otherwise it stays at the maximum.
// - `min`: lowest adaptive ratio (clamped to the maximum).
// - `step`: ratio change per step up. A step down takes as many steps as the
//   measured frame time asks for (the cost scales with the pixel count, the
//   square of the ratio), at least one and at most `maxDropSteps`.
// - `maxDropSteps`: the most steps one drop takes. Under vsync a frame a
//   little over its interval waits for the next one, so the measured time
//   overstates the work: a phone just past 16.7 ms measures 33.3 ms.
// - `maxFrameMs`: the budget. A window whose mean frame interval exceeds it is
//   slow, any other is within budget. On a desktop the raymarched iris
//   targets 30 fps, and 33.3 ms (30 fps at 60 Hz vsync) is within it: a frame
//   rate locked at 30 fps keeps the resolution, and gets it back. Phones and
//   tablets target 60 fps (MOBILE_PIXEL_RATIO): there a frame rate dropping to
//   30 fps (a GPU slowed down as it warms up) lowers the resolution a step
//   at a time until 60 fps hold again.
// - `windowMs`: interactive time per measurement window.
// - `trim`: share of each window's slowest frames left out of its mean, the
//   hitches a lower resolution would not fix (a garbage collection, a bake).
// - `dropWindows`: consecutive slow windows that lower the ratio (two
//   seconds): a shorter drop is a moment, not a trend.
// - `holdWindows`: consecutive windows within budget before trying a higher
//   ratio (two seconds). A try that stays within budget as long tries the
//   next step.
// - `undoWindows`: during a try, consecutive slow windows that undo it, back
//   to the ratio it started from. Each undone try doubles the wait, up to
//   `maxHoldWindows` (twenty seconds), so the ratio keeps trying, only rarely
//   where a higher one never holds.
// - `confirmWindows`: windows after which a try is confirmed (ten seconds)
//   and the wait returns to `holdWindows`. Until then a slowdown at the higher
//   ratio, even a late one, counts as a failed try: a ratio at the edge of the
//   budget stops going up and down every few seconds.
// - `settleFrames`: frames skipped after a change, while the buffers are
//   reallocated and the GPU catches up.
// - `ignoreFrameMs`: longer intervals (shader compiles, a hidden tab) say
//   nothing about the resolution and are skipped.
export const ADAPTIVE_PIXEL_RATIO_DEFAULTS = Object.freeze({
	enabled: true,
	min: 0.6,
	step: 0.2,
	maxDropSteps: Infinity,
	maxFrameMs: 36,
	windowMs: 500,
	trim: 0.2,
	dropWindows: 4,
	holdWindows: 4,
	undoWindows: 2,
	confirmWindows: 20,
	maxHoldWindows: 40,
	settleFrames: 10,
	ignoreFrameMs: 250,
})

// The overrides of phones and tablets (a coarse pointer): 60 fps, a step of
// 0.1 at a time either way (their screens are dense, so a step barely shows).
export const MOBILE_PIXEL_RATIO = Object.freeze({ maxFrameMs: 20, step: 0.1, maxDropSteps: 1 })

// Frames a window holds at most (half a second at 500 Hz).
const MAX_WINDOW_FRAMES = 256

// Ratios built from steps, without the float drift of repeated sums.
const snap = (ratio) => Math.round(ratio * 1e6) / 1e6

export function createAdaptivePixelRatioSettings(overrides = {}) {
	return { ...ADAPTIVE_PIXEL_RATIO_DEFAULTS, ...overrides }
}

// The display's ratio, capped.
export function getMaxPixelRatio(devicePixelRatio) {
	return Math.min(devicePixelRatio > 0 ? devicePixelRatio : 1, PIXEL_RATIO_CAP)
}

// `?dpr=<number>` pins the pixel ratio (clamped to 0.5 through the cap), for
// screenshots and benchmarks; null when absent or invalid.
export function parsePixelRatio(urlParams) {
	const value = urlParams.get('dpr')
	if (value === null || value.trim() === '') return null
	const ratio = Number(value)
	if (!Number.isFinite(ratio) || ratio <= 0) return null
	return Math.min(Math.max(ratio, 0.5), PIXEL_RATIO_CAP)
}

// Feed it every interactive frame interval with update(); it reads `settings`
// live, so GUI changes apply on the next frame.
export class AdaptivePixelRatio {
	constructor(settings, maxRatio) {
		this.settings = settings
		this.max = maxRatio
		this.ratio = maxRatio
		this.hold = settings.holdWindows
		// The window being measured.
		this.frames = new Float64Array(MAX_WINDOW_FRAMES)
		this.count = 0
		this.sum = 0
		// Runs of windows since the last change, and the least slow mean of the
		// slow run.
		this.goodWindows = 0
		this.slowWindows = 0
		this.slowMs = Infinity
		// The running try: the ratio it started from, and its windows so far.
		this.trying = false
		this.tryFrom = maxRatio
		this.tryWindows = 0
		this.settle = 0
		this.lastMeanMs = null
		this.changes = 0
	}

	// New maximum after a resize or a move to another display.
	setMax(maxRatio) {
		this.max = maxRatio
		if (this.ratio > maxRatio || !this.settings.enabled) {
			this.trying = false
			this.set(maxRatio)
		}
		return this.ratio
	}

	// The scene changed (a zoom, a preset): a higher ratio that failed before
	// may hold now, so the next try waits only `holdWindows`.
	resetHold() {
		this.hold = this.settings.holdWindows
	}

	// Returns the new ratio when it changes, otherwise null.
	update(intervalMs) {
		const settings = this.settings
		if (!settings.enabled) return this.set(this.max)
		const min = Math.min(Math.max(settings.min, 0.5), this.max)
		if (this.ratio < min) return this.set(min)
		if (!(intervalMs > 0) || intervalMs > settings.ignoreFrameMs) return null
		if (this.settle > 0) {
			this.settle--
			return null
		}

		this.frames[this.count++] = intervalMs
		this.sum += intervalMs
		if (this.sum < settings.windowMs && this.count < MAX_WINDOW_FRAMES) return null
		return this.judge(this.closeWindow(), min)
	}

	// The window's mean interval, its slowest `trim` share left out.
	closeWindow() {
		const sorted = this.frames.subarray(0, this.count).sort()
		const kept = Math.max(1, this.count - Math.floor(this.count * this.settings.trim))
		let sum = 0
		for (let i = 0; i < kept; i++) sum += sorted[i]
		this.count = 0
		this.sum = 0
		this.lastMeanMs = sum / kept
		return this.lastMeanMs
	}

	judge(meanMs, min) {
		const settings = this.settings
		if (meanMs > settings.maxFrameMs) {
			this.goodWindows = 0
			this.slowWindows++
			this.slowMs = Math.min(this.slowMs, meanMs)
		} else {
			this.goodWindows++
			this.slowWindows = 0
			this.slowMs = Infinity
		}

		if (this.trying) {
			if (this.slowWindows >= settings.undoWindows) {
				this.trying = false
				this.hold = Math.min(this.hold * 2, settings.maxHoldWindows)
				return this.set(Math.max(min, this.tryFrom))
			}
			if (++this.tryWindows >= settings.confirmWindows) {
				this.trying = false
				this.hold = settings.holdWindows
			}
		} else if (this.slowWindows >= settings.dropWindows && this.ratio > min) {
			// The ratio that would bring the least slow window of the run within
			// budget, in whole steps.
			const fit = this.ratio * Math.sqrt(settings.maxFrameMs / this.slowMs)
			const needed = Math.max(1, Math.ceil((this.ratio - fit) / settings.step))
			const steps = Math.min(needed, settings.maxDropSteps)
			return this.set(Math.max(min, snap(this.ratio - steps * settings.step)))
		}

		// During a try, `holdWindows` within budget start the next one: the
		// longer wait after undone tries delays only the first step of a climb.
		const hold = this.trying ? settings.holdWindows : this.hold
		if (this.ratio < this.max && this.goodWindows >= hold) {
			this.trying = true
			this.tryFrom = this.ratio
			this.tryWindows = 0
			return this.set(Math.min(this.max, snap(this.ratio + settings.step)))
		}
		return null
	}

	set(ratio) {
		if (ratio === this.ratio) return null
		this.ratio = ratio
		this.settle = this.settings.settleFrames
		this.count = 0
		this.sum = 0
		this.goodWindows = 0
		this.slowWindows = 0
		this.slowMs = Infinity
		this.changes++
		return ratio
	}

	getStats() {
		return {
			enabled: this.settings.enabled,
			ratio: this.ratio,
			min: Math.min(this.settings.min, this.max),
			max: this.max,
			lastMeanMs: this.lastMeanMs === null ? null : Math.round(this.lastMeanMs * 100) / 100,
			trying: this.trying,
			holdWindows: this.hold,
			changes: this.changes,
		}
	}
}
