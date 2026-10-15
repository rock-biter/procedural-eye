import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	GAZE,
	gazeQuaternion,
	GazeModel,
	saccadeDuration,
	saccadePeakVelocity,
} from '../src/animation/gaze'
import { PupilDynamics, watsonYellottDiameter } from '../src/animation/pupilDynamics'
import { createRandom } from '../src/random'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('Watson–Yellott: brighter means smaller, older means smaller, one eye larger', () => {
	const bright = watsonYellottDiameter({ luminance: 1000 })
	const dim = watsonYellottDiameter({ luminance: 1 })
	assert.ok(bright < dim)
	assert.ok(bright > 1.5 && dim < 8)
	assert.ok(
		watsonYellottDiameter({ luminance: 100, age: 70 }) <
			watsonYellottDiameter({ luminance: 100, age: 20 }),
	)
	assert.ok(
		watsonYellottDiameter({ luminance: 100, eyes: 1 }) >
			watsonYellottDiameter({ luminance: 100, eyes: 2 }),
	)
	// The worked example: 100 cd/m², 30° field (≈ 707 deg²), age 45 → about 3.2 mm.
	close(watsonYellottDiameter({ luminance: 100, fieldArea: 706.86, age: 45 }), 3.2, 0.15, 'example')
})

test('the pupil waits for the latency, constricts faster than it dilates, and settles', () => {
	const pupil = new PupilDynamics(6)
	pupil.step(0.2, 3)
	close(pupil.diameter, 6, 1e-9, 'no response before the latency')
	pupil.step(0.5, 3)
	const constricted = 6 - pupil.diameter
	pupil.step(5, 3)
	close(pupil.diameter, 3, 0.01, 'settles')
	const dilating = new PupilDynamics(3)
	dilating.step(0.7, 6)
	const dilated = dilating.diameter - 3
	assert.ok(constricted > dilated, `constriction ${constricted} vs dilation ${dilated}`)
	assert.ok(dilated <= 1.1 * (0.7 - 0.23) + 1e-9, 'dilation speed limit')
})

test('pupil dynamics do not depend on the frame rate', () => {
	const a = new PupilDynamics(6)
	const b = new PupilDynamics(6)
	for (let i = 0; i < 30; i++) a.step(1 / 30, 3)
	for (let i = 0; i < 120; i++) b.step(1 / 120, 3)
	close(a.diameter, b.diameter, 0.02)
})

test('saccades follow the main sequence and land on target', () => {
	close(saccadeDuration(10), 0.043, 1e-12)
	assert.ok(saccadePeakVelocity(20) > saccadePeakVelocity(5))
	const gaze = new GazeModel(createRandom('g'))
	gaze.micro = 0
	gaze.setTarget(10, -5)
	for (let i = 0; i < 120; i++) gaze.step(1 / 120)
	close(gaze.yaw, 10, 1e-9)
	close(gaze.pitch, -5, 1e-9)
	assert.equal(gaze.shifts, 1)
})

test('the slowdown stretches saccades along the same minimum-jerk profile', () => {
	const path = (slowdown) => {
		const gaze = new GazeModel(createRandom('s'))
		gaze.micro = 0
		gaze.slowdown = slowdown
		gaze.setTarget(10, 0)
		const yaws = []
		for (let i = 0; i < 300; i++) yaws.push(gaze.step(1 / 1000).yaw)
		return yaws
	}
	const real = path(1)
	const slow = path(5)
	// Halfway through: 21.5 ms at the main sequence, 107.5 ms five times slower.
	close(real[21], 5, 0.3)
	close(slow[106], 5, 0.3)
	assert.ok(slow[42] < 2 && real[42] > 9.9)
})

test('the drift is smooth and scales with the micro-movements', () => {
	const run = (micro) => {
		const gaze = new GazeModel(createRandom('d'), { ...GAZE, microsaccadeRate: 0 })
		gaze.micro = micro
		let previous = 0
		let maxStep = 0
		let sum = 0
		const frames = 60 * 120
		for (let i = 0; i < frames; i++) {
			const { yaw } = gaze.step(1 / 60)
			maxStep = Math.max(maxStep, Math.abs(yaw - previous))
			previous = yaw
			sum += yaw * yaw
		}
		return { rms: Math.sqrt(sum / frames), maxStep }
	}
	const full = run(1)
	close(full.rms, 0.11, 0.04, 'physiological RMS offset')
	assert.ok(full.maxStep < 0.03, `no frame-to-frame jitter: ${full.maxStep}`)
	const reduced = run(0.3)
	close(reduced.rms / full.rms, 0.3, 0.05, 'linear in the scale')
	assert.equal(run(0).rms, 0)
})

test("Listing's law: no torsion, the quaternion turns +Z onto the gaze", () => {
	const [x, y, z, w] = gazeQuaternion(20, 10)
	assert.equal(z, 0)
	// Rotate +Z: v' = v + 2w(q×v) + 2q×(q×v).
	const q = [x, y, z]
	const v = [0, 0, 1]
	const cross = (a, b) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
	const t = cross(q, v).map((c) => 2 * c)
	const r = v.map((c, i) => c + w * t[i] + cross(q, t)[i])
	const yaw = (20 * Math.PI) / 180
	const pitch = (10 * Math.PI) / 180
	close(r[0], Math.sin(yaw) * Math.cos(pitch), 1e-12)
	close(r[1], Math.sin(pitch), 1e-12)
	close(r[2], Math.cos(yaw) * Math.cos(pitch), 1e-12)
})

test('the animator looks at the camera along the visual axis and lids follow the pitch', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const params = createDefaults(PARAM_SCHEMA)
	params.animation.gaze = 'camera'
	params.animation.microMovements = 0
	const animator = new Animator(3)
	let state
	for (let i = 0; i < 240; i++) {
		state = animator.step(1 / 60, params, {
			luminance: () => 5,
			pointer: { x: 0, y: 0 },
			camera: { yaw: 0, pitch: 10 },
			nasalSign: 1,
		})
	}
	close(state.pitch, 10, 0.05)
	close(state.yaw, -params.eye.kappa, 0.05, 'optical axis temporal of the line of sight')
	assert.ok(state.lidFollow[0] > state.lidFollow[1] && state.lidFollow[1] > 0)
	assert.ok(state.pupilDiameter > 1.5 && state.pupilDiameter < 8)
})

test('a still eye takes its pupil and gaze from the parameters, not the camera', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const params = createDefaults(PARAM_SCHEMA)
	params.animation.enabled = false
	params.animation.yaw = 6
	params.animation.pitch = -4
	params.iris.pupilDiameter = 4.2
	const animator = new Animator(3)
	const context = {
		luminance: () => 50,
		pointer: { x: 0.5, y: 0.5 },
		camera: { yaw: 30, pitch: 20 },
	}
	const first = animator.step(0, params, { ...context, nasalSign: -1 })
	close(first.pupilDiameter, 4.2, 1e-9, 'no light reflex')
	close(first.pitch, -4, 1e-9)
	close(first.yaw, 6 + params.eye.kappa, 1e-9, 'left eye: nasal is −X')
	assert.ok(first.lidFollow[0] < 0 && first.lidFollow[1] < 0, 'lids follow the downward gaze')
	assert.deepEqual(animator.step(0.5, params, { ...context, nasalSign: -1 }), first, 'no movement')
	assert.deepEqual(first.framing, { yaw: 6, pitch: -4 })
})

test('a living eye starts at rest on its target: a frozen start is the steady state', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const params = createDefaults(PARAM_SCHEMA)
	params.animation.gaze = 'camera'
	const animator = new Animator(5)
	const state = animator.step(0, params, {
		luminance: () => 5,
		pointer: { x: 0, y: 0 },
		camera: { yaw: -26, pitch: -7.8 },
		nasalSign: 1,
	})
	close(state.yaw, -26 - params.eye.kappa, 1e-9)
	close(state.pitch, -7.8, 1e-9)
	// The camera frames the settled line of sight: here the camera itself.
	assert.deepEqual(state.framing, { yaw: -26, pitch: -7.8 })
	params.animation.gaze = 'cursor'
	const roaming = animator.step(1 / 60, params, {
		luminance: () => 5,
		pointer: { x: 0.5, y: 0.5 },
		camera: { yaw: -26, pitch: -7.8 },
		nasalSign: 1,
	})
	assert.deepEqual(
		roaming.framing,
		{ yaw: 0, pitch: 0 },
		'a roaming eye moves within a still frame',
	)
})

test('looking around: starts straight ahead, then looks within the range, framed still', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const params = createDefaults(PARAM_SCHEMA)
	assert.equal(params.animation.gaze, 'wander', 'the default')
	params.animation.microMovements = 0
	const animator = new Animator(7)
	const context = {
		luminance: () => 5,
		pointer: { x: 0, y: 0 },
		camera: { yaw: -26, pitch: -7.8 },
		nasalSign: 1,
	}
	const first = animator.step(0, params, context)
	close(first.yaw, -params.eye.kappa, 1e-9, 'straight ahead')
	close(first.pitch, 0, 1e-9)
	const lines = new Set()
	let state
	for (let i = 0; i < 60 * 30; i++) {
		state = animator.step(1 / 60, params, context)
		const yaw = state.yaw + params.eye.kappa
		assert.ok(Math.hypot(yaw, state.pitch / 0.6) <= params.animation.lookRange + 1e-6)
		assert.deepEqual(state.framing, { yaw: 0, pitch: 0 })
		lines.add(`${Math.round(yaw)},${Math.round(state.pitch)}`)
	}
	assert.ok(animator.gaze.shifts >= 5, `${animator.gaze.shifts} looks in 30 s`)
	assert.ok(lines.size >= 5)
	// The looks move with their center.
	params.animation.yaw = 10
	for (let i = 0; i < 60 * 10; i++) state = animator.step(1 / 60, params, context)
	assert.deepEqual(state.framing, { yaw: 10, pitch: 0 })
})

test('each look brings its own pupil size, eased in', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const run = (response) => {
		const params = createDefaults(PARAM_SCHEMA)
		params.animation.microMovements = 0
		params.animation.hippus = 0
		params.animation.pupilResponse = response
		const animator = new Animator(11)
		const context = {
			luminance: () => 5,
			pointer: { x: 0, y: 0 },
			camera: { yaw: 0, pitch: 0 },
			nasalSign: 1,
		}
		const diameters = []
		for (let i = 0; i < 60 * 30; i++)
			diameters.push(animator.step(1 / 60, params, context).pupilDiameter)
		return diameters
	}
	const still = run(0)
	assert.ok(Math.max(...still) - Math.min(...still) < 1e-9, 'constant light, no look response')
	const living = run(0.8)
	assert.ok(Math.max(...living) - Math.min(...living) > 0.2, 'the pupil changes with the looks')
	let maxStep = 0
	for (let i = 1; i < living.length; i++)
		maxStep = Math.max(maxStep, Math.abs(living[i] - living[i - 1]))
	assert.ok(maxStep < 0.03, `smoothly: ${maxStep} mm per frame`)
})

test('the light along the line of sight sets the pupil', async () => {
	const { default: Animator } = await import('../src/animation/animator')
	const { createDefaults } = await import('../src/params/params')
	const { PARAM_SCHEMA } = await import('../src/params/paramSchema')
	const params = createDefaults(PARAM_SCHEMA)
	params.animation.gaze = 'fixed'
	params.animation.microMovements = 0
	params.animation.hippus = 0
	params.animation.pupilResponse = 0
	const settle = (yaw) => {
		params.animation.yaw = yaw
		const animator = new Animator(1)
		const context = {
			// A light toward +yaw.
			luminance: (y) => 1 + 20 * Math.max(0, y / 20),
			pointer: { x: 0, y: 0 },
			camera: { yaw: 0, pitch: 0 },
			nasalSign: 1,
		}
		return animator.step(0, params, context).pupilDiameter
	}
	assert.ok(settle(20) < settle(-20) - 0.5)
})
