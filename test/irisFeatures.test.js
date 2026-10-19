import assert from 'node:assert/strict'
import { test } from 'node:test'
import { irisThickness } from '../src/iris/irisFeatures'

const profile = { margin: 0.1, collarette: 0.55, root: 0.25, collaretteRho: 0.3 }
const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

// irisThickness() is the twin of irisThickness() in iris-bake-fragment.glsl,
// which takes the profile as uThickness = (margin, collarette, root,
// collaretteRho): the same function written with mix() and GLSL smoothstep().
function glslThickness(rho, { margin, collarette, root, collaretteRho }) {
	const mix = (a, b, t) => a * (1 - t) + b * t
	const smoothstep = (e0, e1, x) => {
		const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
		return t * t * (3 - 2 * t)
	}
	if (rho <= collaretteRho) return mix(margin, collarette, smoothstep(0, collaretteRho, rho))
	return mix(collarette, root, Math.sqrt(smoothstep(collaretteRho, 1, rho)))
}

test('the profile passes through the margin, the collarette and the root', () => {
	close(irisThickness(0, profile), profile.margin, 1e-12, 'margin')
	close(irisThickness(profile.collaretteRho, profile), profile.collarette, 1e-12, 'collarette')
	close(irisThickness(1, profile), profile.root, 1e-12, 'root')
})

test('it is continuous at the collarette and thickest there', () => {
	const at = profile.collaretteRho
	close(irisThickness(at - 1e-9, profile), irisThickness(at + 1e-9, profile), 1e-6, 'continuity')
	for (let rho = 0; rho <= 1; rho += 0.01) {
		assert.ok(irisThickness(rho, profile) <= profile.collarette + 1e-12, `ρ ${rho}`)
	}
})

test('it rises to the collarette and falls to the root', () => {
	let previous = irisThickness(0, profile)
	for (let rho = 0.01; rho <= profile.collaretteRho; rho += 0.01) {
		const value = irisThickness(rho, profile)
		assert.ok(value >= previous - 1e-12, `rising at ρ ${rho}`)
		previous = value
	}
	previous = irisThickness(profile.collaretteRho, profile)
	for (let rho = profile.collaretteRho + 0.01; rho <= 1; rho += 0.01) {
		const value = irisThickness(rho, profile)
		assert.ok(value <= previous + 1e-12, `falling at ρ ${rho}`)
		previous = value
	}
})

test('it matches the GLSL form of the bake', () => {
	for (const shape of [profile, { margin: 0.2, collarette: 0.4, root: 0.3, collaretteRho: 0.45 }]) {
		for (let rho = 0; rho <= 1; rho += 1 / 64) {
			close(irisThickness(rho, shape), glslThickness(rho, shape), 1e-12, `ρ ${rho}`)
		}
	}
})
