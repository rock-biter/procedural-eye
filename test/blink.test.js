import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BufferAttribute, BufferGeometry } from 'three'
import Animator from '../src/animation/animator'
import { BLINK, BlinkModel } from '../src/animation/blink'
import {
	BLINK_FRAMES,
	blinkClosures,
	blinkWeights,
	createBlinkFrames,
	vertexNormals,
} from '../src/adnexa/blinkFrames'
import { generateLashes, lashTubes } from '../src/adnexa/lashGenerator'
import { createLidMesh, createMeniscusMesh } from '../src/adnexa/lidGeometry'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'
import { createRandom } from '../src/random'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

// The closure over time of one blink started at t = 0, stepped by `dt`.
function blinkCurve(dt, { depth = 1, slowdown = 1, seconds = 1 } = {}) {
	const blink = new BlinkModel(createRandom('curve'))
	blink.step(0, 0)
	blink.start()
	blink.depth = depth
	const curve = []
	for (let t = dt; t <= seconds + 1e-9; t += dt) curve.push([t, blink.step(dt, 0, slowdown)])
	return curve
}
const at = (curve, time) => curve.find(([t]) => t >= time - 1e-9)[1]

test('a blink closes in 0.1 s, rests closed, and opens slower, creeping at the end', () => {
	const curve = blinkCurve(1 / 240)
	close(at(curve, 0.05), 0.5, 0.01, 'half closed half way')
	close(at(curve, BLINK.closing), 1, 1e-9, 'closed')
	close(at(curve, BLINK.closing + BLINK.closed / 2), 1, 1e-9, 'rests closed')
	// Opening: 90% of the way in 0.21 s, the rest over 0.5 s.
	const opened = at(curve, BLINK.closing + BLINK.closed + BLINK.opening)
	assert.ok(opened > 0.02 && opened < BLINK.creep, `${opened} left after the opening`)
	close(at(curve, BLINK.closing + BLINK.closed + BLINK.settle), 0, 1e-9, 'open')
	// The closing is faster than the opening.
	let closing = 0
	let opening = 0
	for (let i = 1; i < curve.length; i++) {
		const speed = (curve[i][1] - curve[i - 1][1]) / (curve[i][0] - curve[i - 1][0])
		closing = Math.max(closing, speed)
		opening = Math.max(opening, -speed)
	}
	assert.ok(closing > 2 * opening, `${closing} vs ${opening} per second`)
	// Smooth: no jump between steps.
	for (let i = 1; i < curve.length; i++) assert.ok(Math.abs(curve[i][1] - curve[i - 1][1]) < 0.07)
})

test('blinks do not depend on the frame rate; the slowdown stretches them', () => {
	const fine = blinkCurve(1 / 240)
	const coarse = blinkCurve(1 / 20)
	for (const [t, closure] of coarse) close(closure, at(fine, t), 1e-6, `t ${t}`)
	const slow = blinkCurve(1 / 240, { slowdown: 2, seconds: 2 })
	for (const k of [6, 24, 48, 96]) close(at(slow, (2 * k) / 240), at(fine, k / 240), 1e-6, `t ${k}`)
	const fast = blinkCurve(1 / 240, { slowdown: 0.5 })
	for (const k of [6, 12, 24, 48]) close(at(fast, k / 240), at(fine, (2 * k) / 240), 1e-6, `t ${k}`)
	// An incomplete blink stops short and opens without resting.
	const partial = blinkCurve(1 / 240, { depth: 0.6 })
	close(Math.max(...partial.map(([, c]) => c)), 0.6, 1e-9)
})

test('blinks come at the rate, at irregular intervals, some incomplete', () => {
	const blink = new BlinkModel(createRandom('rate'))
	const dt = 1 / 60
	const minutes = 30
	const starts = []
	const depths = []
	let count = 0
	for (let t = 0; t < minutes * 60; t += dt) {
		blink.step(dt, 15)
		if (blink.count !== count) {
			count = blink.count
			starts.push(t)
			depths.push(blink.depth)
		}
	}
	close(starts.length / minutes, 15, 1.5, 'per minute')
	const intervals = starts.slice(1).map((t, i) => t - starts[i])
	const mean = intervals.reduce((sum, x) => sum + x, 0) / intervals.length
	const sd = Math.sqrt(intervals.reduce((sum, x) => sum + (x - mean) ** 2, 0) / intervals.length)
	assert.ok(sd / mean > 0.5 && sd / mean < 1.1, `coefficient of variation ${sd / mean}`)
	assert.ok(intervals.some((x) => x < 1) && intervals.some((x) => x > 10), 'bursts and pauses')
	const incomplete = depths.filter((d) => d < 1).length / depths.length
	close(incomplete, BLINK.incomplete, 0.06, 'incomplete share')
	// No blinks at rate 0, and a blink under way finishes.
	blink.start()
	let closure = 0
	for (let t = 0; t < 60; t += dt) closure = blink.step(dt, 0)
	assert.equal(blink.count, count + 1)
	assert.equal(closure, 0)
})

test('a large gaze shift brings a blink with it, a small one does not', () => {
	const evoked = (amplitude) => {
		let blinks = 0
		for (let i = 0; i < 400; i++) {
			const blink = new BlinkModel(createRandom(`shift:${i}`))
			blink.step(0, 15)
			blink.gazeShift(amplitude, 15)
			blinks += blink.count
		}
		return blinks / 400
	}
	assert.equal(evoked(5), 0)
	close(evoked(40), BLINK.evokedChance, 0.05)
	const middle = evoked(20)
	assert.ok(middle > 0.1 && middle < 0.5, `${middle} at 20°`)
	// Not while the lids close, and not at rate 0.
	const blink = new BlinkModel(createRandom('busy'))
	blink.step(0, 15)
	blink.start()
	blink.gazeShift(40, 15)
	blink.gazeShift(40, 0)
	assert.equal(blink.count, 1)
})

test('held, an eye blinks neither on its own nor with a gaze shift, and its timer waits', () => {
	const blink = new BlinkModel(createRandom('held'))
	blink.step(0, 15)
	const timer = blink.timer
	blink.held = true
	for (let i = 0; i < 60 * 30; i++) blink.step(1 / 60, 15)
	blink.gazeShift(40, 15)
	assert.equal(blink.count, 0)
	assert.equal(blink.closure, 0)
	assert.equal(blink.timer, timer)
	// Let go, it blinks again at its rate, the interval it had left first.
	blink.held = false
	let steps = 0
	while (blink.count === 0) {
		blink.step(1 / 60, 15)
		steps++
	}
	close(steps / 60, (timer * 60) / 15, 1 / 60 + 1e-9, 'the interval left')
	// A blink started by hand runs while held (the intro's first one is let go
	// first).
	blink.held = true
	blink.start()
	assert.ok(blink.step(0.05, 15) > 0)
})

test('the animator blinks a living eye, not a still one, nor a frozen start', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	params.animation.blinkRate = 30
	const context = {
		luminance: () => 5,
		pointer: { x: 0, y: 0 },
		camera: { yaw: 0, pitch: 0 },
		nasalSign: 1,
	}
	const animator = new Animator(2)
	assert.equal(animator.step(0, params, context).blink, 0, 'a frozen start is open')
	let closed = 0
	for (let i = 0; i < 60 * 60; i++)
		closed = Math.max(closed, animator.step(1 / 60, params, context).blink)
	assert.ok(animator.blink.count >= 15, `${animator.blink.count} blinks in a minute`)
	assert.equal(closed, 1)
	params.animation.enabled = false
	assert.equal(animator.step(1 / 60, params, context).blink, 0)
})

test('the frames weigh like a spline: open, each frame in turn, closed', () => {
	assert.deepEqual(blinkWeights(0), [0, 0, 0, 0])
	assert.deepEqual(blinkWeights(1), [0, 0, 0, 1])
	for (let k = 1; k <= BLINK_FRAMES; k++) {
		const weights = blinkWeights(k / BLINK_FRAMES)
		weights.forEach((w, i) => close(w, i === k - 1 ? 1 : 0, 1e-12, `frame ${k}`))
	}
	// Continuous, and a straight path stays straight: frames along a line
	// blend to the point of the closure.
	let previous = blinkWeights(0)
	for (let b = 0.001; b <= 1; b += 0.001) {
		const weights = blinkWeights(b)
		weights.forEach((w, i) => assert.ok(Math.abs(w - previous[i]) < 0.01))
		const point = weights.reduce((p, w, i) => p + w * ((i + 1) / BLINK_FRAMES), 0)
		close(point, b, 1e-12, `linear at ${b}`)
		previous = weights
	}
	assert.deepEqual(
		blinkClosures(0.2).map((c) => Math.round(c * 1000) / 1000),
		[0.4, 0.6, 0.8, 1],
	)
})

test('the blink frames keep the layout, end closed, and the spline follows the closing lid', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const eye = createEyeGeometry(params)
	const frames = createBlinkFrames(params)
	const side = eye.nasalSign
	const open = createLidMesh(params.lids, eye, side)
	// The lids rebuilt closing, with the layout of the lids at rest (as the
	// frames).
	const closedAt = (closure) =>
		createLidMesh({ ...params.lids, closure }, eye, side, { layout: open.layout })
	const closed = closedAt(1)
	assert.equal(frames.lids.length, BLINK_FRAMES)
	for (const frame of frames.lids) {
		assert.equal(frame.positions.length, open.positions.length)
		// Each frame bakes its occlusion, in [0, 1], darker in the canthi.
		assert.equal(frame.ao.length, open.positions.length / 3)
		assert.ok(frame.ao.every((ao) => ao >= 0 && ao <= 1))
		assert.ok(Math.min(...frame.ao) < 0.7)
	}
	assert.deepEqual(frames.lids.at(-1).positions, closed.positions)
	// Given the layout at rest (posted to the worker, so cloned), the same frames.
	const given = createBlinkFrames(params, { layout: structuredClone(open.layout) })
	assert.deepEqual(given.lids, frames.lids)
	// The normals are unit length, and three.js's.
	const normals = frames.lids[0].normals
	for (let v = 0; v < normals.length; v += 3 * 97) {
		close(Math.hypot(normals[v], normals[v + 1], normals[v + 2]), 1, 1e-5)
	}
	const meniscus = createMeniscusMesh(params.lids, eye, side)
	assert.equal(frames.meniscus[0].positions.length, meniscus.positions.length)
	const lashes = lashTubes(generateLashes(params, eye))
	for (const frame of frames.lashes) assert.equal(frame.positions.length, lashes.positions.length)
	assert.equal(frames.fissure.length, 256 * 256)

	// Between the frames the spline lands near the lid rebuilt at that
	// closure: the margin within a tenth of a millimeter, where a straight
	// blend from open to closed cuts half a millimeter into the cornea; the
	// skin within 0.4 mm (the crease's groove sweeps across the rows).
	for (const blink of [0.125, 0.375, 0.625, 0.875]) {
		const exact = closedAt(blink)
		const weights = blinkWeights(blink)
		const base = 1 - weights.reduce((sum, w) => sum + w, 0)
		let margin = 0
		let skin = 0
		let straight = 0
		for (let v = 0; v < open.positions.length; v++) {
			let value = base * open.positions[v]
			weights.forEach((w, k) => (value += w * frames.lids[k].positions[v]))
			const error = Math.abs(value - exact.positions[v])
			const line = open.positions[v] + (closed.positions[v] - open.positions[v]) * blink
			if (exact.lid[Math.floor(v / 3) * 4 + 2] < 1.5) {
				margin = Math.max(margin, error)
				straight = Math.max(straight, Math.abs(line - exact.positions[v]))
			} else skin = Math.max(skin, error)
		}
		assert.ok(margin < 0.1, `${blink}: the margin off by ${margin} mm`)
		assert.ok(skin < 0.4, `${blink}: the skin off by ${skin} mm`)
		if (blink === 0.375) assert.ok(straight > 1, `a straight blend off by ${straight} mm`)
	}
	// vertexNormals() matches three.js's computeVertexNormals().
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(closed.positions, 3))
	geometry.setIndex(new BufferAttribute(closed.indices, 1))
	geometry.computeVertexNormals()
	const three = geometry.getAttribute('normal').array
	const ours = vertexNormals(closed.positions, closed.indices)
	for (let i = 0; i < ours.length; i += 7) close(ours[i], three[i], 1e-5, `normal ${i}`)

	// The lashes' rings correspond from frame to frame: blended halfway, a
	// ring keeps its width (it does not twist about the lash).
	const sides = 6
	const steps = [lashes, ...frames.lashes].map((frame) => frame.positions)
	const point = (positions, ring, j) => [0, 1, 2].map((c) => positions[(ring * sides + j) * 3 + c])
	let thinnest = Infinity
	for (let k = 1; k < steps.length; k++) {
		for (let ring = 0; ring < steps[0].length / 3 / sides; ring++) {
			const width = (j) => {
				const a = point(steps[k - 1], ring, j)
				const b = point(steps[k - 1], ring, j + 3)
				return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
			}
			const blended = (j) =>
				point(steps[k - 1], ring, j).map((x, c) => (x + point(steps[k], ring, j)[c]) / 2)
			const a = blended(0)
			const b = blended(3)
			if (width(0) > 1e-4) {
				thinnest = Math.min(thinnest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / width(0))
			}
		}
	}
	assert.ok(thinnest > 0.9, `a blended ring keeps ${thinnest} of its width`)
})
