import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDefaults, createParams, forEachLeaf, getValue } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'
import { ParamTransition, transitionMode } from '../src/params/paramTransition'
import { PRESETS } from '../src/params/presets'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('numbers and colors glide; seeds, counts, toggles, choices and geometry switch', () => {
	const leaf = (path) => {
		let found
		forEachLeaf(BASE_PARAM_SCHEMA, (l, p) => (p === path ? (found = l) : null))
		return found
	}
	assert.equal(transitionMode(leaf('irisColor.ablMelanin')), 'glide')
	assert.equal(transitionMode(leaf('skin.color')), 'glide')
	assert.equal(transitionMode(leaf('lighting.key.azimuth')), 'glide')
	assert.equal(transitionMode(leaf('irisStructure.seed')), 'switch')
	assert.equal(transitionMode(leaf('irisColor.freckles.count')), 'switch')
	assert.equal(transitionMode(leaf('animation.enabled')), 'switch')
	assert.equal(transitionMode(leaf('lighting.key.shape')), 'switch')
	assert.equal(transitionMode(leaf('cornea.radius')), 'switch', 'rebuilds geometry')
	assert.equal(transitionMode(leaf('debug.view')), 'switch', 'recompiles')
})

test('every seed and count is discrete', () => {
	forEachLeaf(BASE_PARAM_SCHEMA, (leaf, path) => {
		if (/(seed|count|Count)$/.test(path)) assert.ok(leaf.discrete, path)
	})
})

test('a transition switches at the start, glides on a minimum-jerk curve, lands exactly', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const target = createDefaults(BASE_PARAM_SCHEMA)
	target.irisColor.ablMelanin = 0.85
	target.camera.azimuth = 10
	target.skin.color = '#9c6a4a'
	target.irisStructure.seed = 42
	target.animation.enabled = false
	const transition = new ParamTransition(BASE_PARAM_SCHEMA, params, target, 2)
	assert.deepEqual(transition.switched.sort(), ['animation.enabled', 'irisStructure.seed'])
	assert.equal(params.irisStructure.seed, 42)
	assert.equal(params.irisColor.ablMelanin, 0.45, 'nothing glides before the first step')
	const paths = transition.step(1)
	assert.deepEqual(paths.sort(), ['camera.azimuth', 'irisColor.ablMelanin', 'skin.color'])
	close(params.irisColor.ablMelanin, 0.65, 1e-9, 'halfway')
	close(params.camera.azimuth, -8, 1e-9, 'unrounded')
	assert.match(params.skin.color, /^#[0-9a-f]{6}$/)
	assert.notEqual(params.skin.color, '#c98f6e')
	transition.step(0.5)
	assert.ok(params.irisColor.ablMelanin > 0.65 && params.irisColor.ablMelanin < 0.85)
	transition.step(0.5)
	assert.ok(transition.done)
	assert.deepEqual(params, target)
})

test('lights fade in and out through their intensity', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const target = createDefaults(BASE_PARAM_SCHEMA)
	target.lighting.key.enabled = false
	target.lighting.key.intensity = 12
	target.lighting.window.enabled = true
	target.lighting.window.intensity = 20
	const transition = new ParamTransition(BASE_PARAM_SCHEMA, params, target, 1)
	assert.equal(params.lighting.window.enabled, true, 'on at the start')
	assert.equal(params.lighting.window.intensity, 0, 'from zero')
	assert.equal(params.lighting.key.enabled, true, 'still on while it fades')
	transition.step(0.5)
	close(params.lighting.window.intensity, 10, 1e-9)
	close(params.lighting.key.intensity, 4.5, 1e-9, 'fading out')
	transition.step(0.5)
	assert.equal(params.lighting.key.enabled, false, 'off at the end')
	assert.equal(params.lighting.key.intensity, 12, 'with its target intensity')
	assert.deepEqual(params, target)
})

test('a cancelled glide keeps its value and the target follows it', () => {
	const params = createDefaults(BASE_PARAM_SCHEMA)
	const target = createParams(BASE_PARAM_SCHEMA, PRESETS['amber-lattice'].params)
	const transition = new ParamTransition(BASE_PARAM_SCHEMA, params, target, 1)
	transition.step(0.5)
	params.camera.azimuth = 30
	transition.cancel('camera')
	const distance = params.camera.distance
	transition.step(0.5)
	assert.equal(params.camera.azimuth, 30)
	assert.equal(params.camera.distance, distance)
	assert.equal(transition.target.camera.azimuth, 30)
	assert.equal(params.irisColor.ablMelanin, target.irisColor.ablMelanin)
})

test('every preset is reachable from every other one', () => {
	for (const from of Object.keys(PRESETS)) {
		for (const to of Object.keys(PRESETS)) {
			const params = createParams(BASE_PARAM_SCHEMA, PRESETS[from].params)
			const target = createParams(BASE_PARAM_SCHEMA, PRESETS[to].params)
			const transition = new ParamTransition(BASE_PARAM_SCHEMA, params, target, 1.5)
			for (let i = 0; i < 9; i++) transition.step(1 / 6)
			forEachLeaf(BASE_PARAM_SCHEMA, (leaf, path) => {
				const value = getValue(params, path)
				if (typeof value === 'number')
					assert.ok(value >= leaf.min && value <= leaf.max, `${from}→${to} ${path}`)
			})
			transition.step(1)
			assert.deepEqual(params, target, `${from}→${to}`)
		}
	}
})
