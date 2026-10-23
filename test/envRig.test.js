import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kelvinToLinearRgb, luminance } from '../src/lighting/colorTemperature'
import {
	buildEmitters,
	EMITTER_TYPE,
	EMITTER_VEC4S,
	facingAxes,
	flashRig,
	LIT_EMITTERS,
	MAX_EMITTERS,
	packBackground,
	packEmitters,
	sceneLuminance,
	sphericalDirection,
} from '../src/lighting/envRig'
import { vec3 } from '../src/math'
import { applyOverrides, createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)
const camera = { position: [0, 0, 185], right: [1, 0, 0], up: [0, 1, 0] }

test('black-body colors have unit luminance and the right hue order', () => {
	for (const k of [2000, 3200, 5600, 6504, 9000])
		close(luminance(kelvinToLinearRgb(k)), 1, 1e-9, `${k}`)
	const warm = kelvinToLinearRgb(3000)
	assert.ok(warm[0] > warm[1] && warm[1] > warm[2])
	const cool = kelvinToLinearRgb(10000)
	assert.ok(cool[2] > cool[0])
	const daylight = kelvinToLinearRgb(6504)
	assert.ok(Math.max(...daylight) / Math.min(...daylight) < 1.15)
})

test('panels sit on their spherical direction and face the eye with orthonormal axes', () => {
	assert.deepEqual(sphericalDirection(0, 0), [0, 0, 1])
	close(sphericalDirection(90, 0)[0], 1, 1e-12)
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const list = buildEmitters(params.lighting, camera)
	const key = list[0]
	close(vec3.length(key.center), params.lighting.key.distance, 1e-9)
	const toEye = vec3.normalize(vec3.scale(key.center, -1))
	close(vec3.dot(key.u, toEye), 0, 1e-12)
	close(vec3.dot(key.v, toEye), 0, 1e-12)
	close(vec3.dot(key.u, key.v), 0, 1e-12)
	// Roll keeps the axes orthonormal.
	const rolled = facingAxes([300, 200, 400], [0, 0, 0], 30)
	close(vec3.dot(rolled.u, rolled.v), 0, 1e-12)
	close(vec3.length(rolled.u), 1, 1e-12)
})

test('the camera-mounted silhouettes and lights follow the camera', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	applyOverrides(BASE_PARAM_SCHEMA, params, {
		lighting: { ring: { enabled: true }, leds: { enabled: true } },
	})
	const list = buildEmitters(params.lighting, camera)
	const ring = list.find((item) => item.type === EMITTER_TYPE.RING)
	assert.deepEqual(ring.center, camera.position)
	const lens = list.find((item) => item.type === EMITTER_TYPE.LENS)
	assert.ok(lens.center[2] > camera.position[2])
	assert.ok(list.length <= MAX_EMITTERS)
})

test('the lit emitters come first, at most LIT_EMITTERS of them (the skin lights them per vertex)', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const on = { enabled: true, intensity: 1 }
	applyOverrides(BASE_PARAM_SCHEMA, params, {
		lighting: {
			key: on,
			fill: on,
			window: on,
			ring: on,
			leds: on,
			camera: { enabled: true, photographer: true },
		},
	})
	const list = buildEmitters(params.lighting, camera)
	const lit = (item) => item.type !== EMITTER_TYPE.LENS && item.type !== EMITTER_TYPE.BLOCKER
	const count = list.filter(lit).length
	assert.equal(count, LIT_EMITTERS)
	assert.ok(list.slice(0, count).every(lit))
	assert.ok(list.length > count)
})

test('packing writes six vec4s per emitter and transforms into another space', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const list = buildEmitters(params.lighting, camera)
	const { data, count } = packEmitters(list)
	assert.equal(count, list.length)
	assert.equal(data.length, MAX_EMITTERS * EMITTER_VEC4S * 4)
	assert.deepEqual(
		[...data.slice(0, 3)].map((x) => Math.round(x * 1e3)),
		list[0].center.map((x) => Math.round(x * 1e3)),
	)
	// A translation by +10 z moves centers but not axes.
	const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 10, 1]
	const moved = packEmitters(list, m).data
	close(moved[2], data[2] + 10, 1e-4)
	close(moved[6], data[6], 1e-6)
	assert.ok(sceneLuminance(params.lighting, list) > 0)
})

test('the pupil weighs each light by its angle from the line of sight', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const list = buildEmitters(params.lighting, camera)
	const key = sphericalDirection(params.lighting.key.azimuth, params.lighting.key.elevation)
	const away = sphericalDirection(-params.lighting.key.azimuth, -params.lighting.key.elevation)
	const full = sceneLuminance(params.lighting, list)
	const toward = sceneLuminance(params.lighting, list, key)
	assert.ok(toward <= full && toward > 0.8 * full, 'the key light at full weight')
	assert.ok(sceneLuminance(params.lighting, list, away) < 0.3 * toward)
	assert.ok(sceneLuminance(params.lighting, list, [0, 0, 1]) < toward)
})

test('a red flash turns the lights and the room red, as bright as asked', () => {
	const lighting = createDefaults(BASE_PARAM_SCHEMA).lighting
	const red = [1, 0.02, 0.01]
	const list = buildEmitters(lighting, camera)
	const background = packBackground(lighting)
	const before = list.map((item) => luminance(item.radiance))
	const room = luminance(background.uRoom.slice(0, 3))
	flashRig(list, background, red, 2, 0)
	assert.deepEqual(list, buildEmitters(lighting, camera))
	flashRig(list, background, red, 2, 1)
	list.forEach((item, i) => {
		close(item.radiance[0], 2 * before[i], 1e-9, 'red channel')
		assert.ok(item.radiance[1] < 0.03 * item.radiance[0] + 1e-12)
	})
	close(background.uRoom[0], 2 * room, 1e-9, 'room')
	assert.equal(background.uRoom[3], packBackground(lighting).uRoom[3])
})
