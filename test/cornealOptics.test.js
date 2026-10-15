import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	conicNormal,
	entrancePupil,
	fresnelDielectric,
	intersectConic,
	intersectParaboloid,
	reflect,
	refract,
	traceCornea,
} from '../src/eye/cornealOptics'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { vec3 } from '../src/math'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const geometry = createEyeGeometry(createDefaults(BASE_PARAM_SCHEMA))
const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('normal-incidence Fresnel reflectance of tear film and cornea is 2–2.5%', () => {
	close(fresnelDielectric(1, 1.337), 0.0208, 2e-4, 'tear')
	close(fresnelDielectric(1, 1.376), 0.025, 2e-4, 'cornea')
	assert.equal(fresnelDielectric(1, 1), 0)
	// Grazing incidence reflects everything.
	close(fresnelDielectric(1e-6, 1.376), 1, 1e-4)
})

test('refract() obeys Snell and reports total internal reflection', () => {
	const angle = (30 * Math.PI) / 180
	const d = [Math.sin(angle), 0, -Math.cos(angle)]
	const t = refract(d, [0, 0, 1], 1 / 1.376)
	close(Math.sin(angle), 1.376 * t[0], 1e-12, 'snell')
	close(vec3.length(t), 1, 1e-12)
	// Cornea to air: critical angle asin(1/1.376) = 46.6°.
	const inside = (deg) => [Math.sin((deg * Math.PI) / 180), 0, Math.cos((deg * Math.PI) / 180)]
	assert.ok(refract(inside(46), [0, 0, -1], 1.376) !== null)
	assert.equal(refract(inside(47), [0, 0, -1], 1.376), null)
	assert.deepEqual(reflect([1, -1, 0], [0, 1, 0]), [1, 1, 0])
})

test('the conic intersection lands on the surface with an outward normal', () => {
	const o = [0.7, -0.4, 40]
	const d = vec3.normalize([0.01, 0.02, -1])
	const t = intersectConic(o, d, geometry.apexZ, geometry.corneaRadius, geometry.corneaQ)
	const p = vec3.madd(o, d, t)
	const r = Math.hypot(p[0], p[1])
	close(p[2], geometry.corneaZ(r), 1e-9, 'on surface')
	assert.ok(conicNormal(p, geometry.apexZ, geometry.corneaRadius, geometry.corneaQ)[2] > 0.9)
	// The lens hyperboloid (Q < -1) keeps the apex sheet.
	const tl = intersectConic([0, 0, 20], [0, 0, -1], geometry.lensApexZ, 10.2, -3.1316)
	close(20 - tl, geometry.lensApexZ, 1e-9, 'lens apex')
	const tp = intersectParaboloid([1, 0, 20], [0, 0, -1], geometry.irisBaseZ, geometry.irisCurvature)
	close(20 - tp, geometry.irisBackZ(1), 1e-9, 'paraboloid')
})

test('an axial ray crosses the cornea undeviated', () => {
	const result = traceCornea(geometry, [0, 0, geometry.apexZ], [0, 0, -1])
	close(result.d2[2], -1, 1e-12)
	close(result.p2[2], geometry.posteriorApexZ, 1e-9)
	close(result.reflectance, 0.0208, 2e-4)
})

test('the entrance pupil is about 3.05 mm deep and magnified about 1.13x', () => {
	const { depth, magnification } = entrancePupil(geometry)
	close(depth, 3.05, 0.1, 'depth')
	close(magnification, 1.13, 0.02, 'magnification')
})
