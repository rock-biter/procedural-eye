import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conicSag, createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const geometry = createEyeGeometry(createDefaults(BASE_PARAM_SCHEMA))
const sag = (r) => geometry.apexZ - geometry.surfaceZ(r)

test('conic sag matches the closed form of a sphere when Q = 0', () => {
	const R = 7.8
	for (const r of [0, 1, 3, 5.5]) {
		assert.ok(Math.abs(conicSag(r, R, 0) - (R - Math.sqrt(R * R - r * r))) < 1e-12)
	}
})

test('default profile reproduces the measured corneoscleral sag (Chen et al. 2023)', () => {
	// Sagittal height at chords of 10, 12.3 and 15 mm.
	for (const [chord, measured] of [
		[10, 1.756],
		[12.3, 2.658],
		[15, 3.676],
	]) {
		const value = sag(chord / 2)
		assert.ok(Math.abs(value - measured) < 0.1, `chord ${chord}: ${value} vs ${measured}`)
	}
})

test('the cornea meets the sclera sphere at the limbus radius', () => {
	assert.ok(Math.abs(geometry.corneaZ(geometry.limbusRadius) - geometry.limbusZ) < 1e-9)
	assert.ok(geometry.apexZ > geometry.scleraRadius)
})

test('the blended surface is continuous with a continuous slope (C1)', () => {
	const eps = 1e-5
	for (const r of [geometry.blendStart, geometry.limbusRadius, geometry.blendEnd]) {
		const zJump = Math.abs(geometry.surfaceZ(r - eps) - geometry.surfaceZ(r + eps))
		const slopeJump = Math.abs(geometry.surfaceSlope(r - eps) - geometry.surfaceSlope(r + eps))
		assert.ok(zJump < 1e-4, `z jump at ${r}: ${zJump}`)
		assert.ok(slopeJump < 1e-3, `slope jump at ${r}: ${slopeJump}`)
	}
})

test('surfaceSlope() is the derivative of surfaceZ()', () => {
	const h = 1e-5
	for (let r = 0.2; r < 9; r += 0.37) {
		const numeric = (geometry.surfaceZ(r + h) - geometry.surfaceZ(r - h)) / (2 * h)
		assert.ok(Math.abs(numeric - geometry.surfaceSlope(r)) < 1e-4, `r ${r}`)
	}
})

test('the pupil margin rests on the anterior lens and the iris bows forward', () => {
	assert.ok(Math.abs(geometry.irisBackZ(geometry.restPupilRadius) - geometry.pupilMarginZ) < 1e-9)
	const drop = geometry.pupilMarginZ - geometry.irisBackZ(geometry.irisRootRadius)
	assert.ok(Math.abs(drop - 0.45) < 1e-9)
	// About 3.7 mm behind the apex (Navarro chamber + lens sag).
	const depth = geometry.apexZ - geometry.pupilMarginZ
	assert.ok(depth > 3.6 && depth < 3.85, `pupil margin depth ${depth}`)
})

test('the iris front stays behind the posterior cornea until the angle', () => {
	const r = geometry.irisRootRadius - 0.3
	const irisFront = geometry.irisBackZ(r) + 0.42
	const posterior = geometry.posteriorCenterZ + Math.sqrt(geometry.posteriorRadius ** 2 - r * r)
	assert.ok(irisFront < posterior - 0.1, `${irisFront} vs ${posterior}`)
})
