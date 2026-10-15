import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
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
	gaze.microsaccades = false
	gaze.settings = { ...gaze.settings, driftSigma: 0 }
	gaze.setTarget(10, -5)
	for (let i = 0; i < 120; i++) gaze.step(1 / 120)
	close(gaze.yaw, 10, 0.05)
	close(gaze.pitch, -5, 0.05)
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
	params.animation.microsaccades = false
	const animator = new Animator(3)
	animator.gaze.settings = { ...animator.gaze.settings, driftSigma: 0 }
	let state
	for (let i = 0; i < 240; i++) {
		state = animator.step(1 / 60, params, {
			sceneLuminance: 5,
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
		sceneLuminance: 50,
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
	const animator = new Animator(5)
	const state = animator.step(0, params, {
		sceneLuminance: 5,
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
		sceneLuminance: 5,
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
