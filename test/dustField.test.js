import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	createMotes,
	hgPhase,
	MOTE_FLOATS,
	MOTE_KINDS,
	VEIL_LIGHTS,
	veilLights,
} from '../src/atmosphere/dustField'
import { buildEmitters } from '../src/lighting/envRig'
import { luminance } from '../src/lighting/colorTemperature'
import { applyOverrides, createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('motes are seeded, finite, with log-normal sizes around 1', () => {
	const a = createMotes(7, 500)
	assert.equal(a.length, 500 * MOTE_FLOATS)
	assert.deepEqual(a, createMotes(7, 500))
	assert.notDeepEqual(a, createMotes(8, 500))
	assert.ok(a.every(Number.isFinite))
	const sizes = Array.from({ length: 500 }, (_, i) => a[i * MOTE_FLOATS + 3]).sort((x, y) => x - y)
	assert.ok(sizes[0] > 0)
	close(sizes[250], 1, 0.15, 'median size')
	assert.ok(sizes[475] > 2 * sizes[25])
})

test('the motes fill the unit cube evenly, with every kind and a slow spin', () => {
	const motes = createMotes(3, 2000)
	const cells = new Array(8).fill(0)
	const kinds = { crossed: 0, flakes: 0, fibers: 0 }
	for (let i = 0; i < 2000; i++) {
		const o = i * MOTE_FLOATS
		let cell = 0
		for (let axis = 0; axis < 3; axis++) {
			assert.ok(Math.abs(motes[o + axis]) <= 0.5)
			if (motes[o + axis] >= 0) cell += 1 << axis
		}
		cells[cell]++
		// Under a turn per minute.
		assert.ok(Math.abs(motes[o + 9]) < (2 * Math.PI) / 60)
		const kind = motes[o + 11]
		if (kind < MOTE_KINDS.CROSSED) kinds.crossed++
		else if (kind < MOTE_KINDS.FLAKES) kinds.flakes++
		else kinds.fibers++
	}
	for (const count of cells) close(count, 250, 60, 'octant')
	close(kinds.crossed, 300, 60, 'crossed')
	close(kinds.flakes, 700, 90, 'flakes')
	close(kinds.fibers, 1000, 90, 'fibers')
})

test('the haze scatters the brightest lights first and the room everywhere', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	applyOverrides(BASE_PARAM_SCHEMA, params, {
		lighting: { ring: { enabled: true }, camera: { enabled: true } },
	})
	const camera = { position: [0, 0, 185], right: [1, 0, 0], up: [0, 1, 0] }
	const emitters = buildEmitters(params.lighting, camera)
	const { lights, ambient } = veilLights(params.lighting, emitters)
	assert.ok(lights.length > 0 && lights.length <= VEIL_LIGHTS)
	for (let i = 1; i < lights.length; i++)
		assert.ok(luminance(lights[i - 1].irradiance) >= luminance(lights[i].irradiance))
	for (const light of lights) close(Math.hypot(...light.direction), 1, 1e-9, 'direction')
	assert.ok(luminance(ambient) > 0)
})

test('the Henyey–Greenstein phase integrates to one and peaks forward', () => {
	for (const g of [0, 0.5, 0.9]) {
		let total = 0
		const steps = 20000
		for (let i = 0; i < steps; i++) {
			const cosTheta = -1 + (2 * (i + 0.5)) / steps
			total += hgPhase(cosTheta, g) * 2 * Math.PI * (2 / steps)
		}
		close(total, 1, 2e-3, `g ${g}`)
	}
	close(hgPhase(0.3, 0), 1 / (4 * Math.PI), 1e-12)
	assert.ok(hgPhase(1, 0.65) > 50 * hgPhase(-1, 0.65))
})
