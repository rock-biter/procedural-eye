import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createIrisSpace } from '../src/iris/irisSpace'

const space = createIrisSpace({
	restPupilRadius: 1.8,
	rootRadius: 5.75,
	collaretteFraction: 0.3,
	thicknessResponse: 0.6,
})
const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('at rest the mapping is the identity', () => {
	for (let r = 1.8; r <= 5.75; r += 0.25) {
		const m = space.toRest(r, 1.8)
		close(m.r0, r, 1e-12)
		close(m.thickness, 1, 1e-12)
	}
})

test('margin, collarette and root map onto themselves for any pupil', () => {
	for (const rp of [0.8, 1.5, 2.5, 3.5]) {
		close(space.toRest(rp, rp).r0, space.rp0, 1e-9, 'margin')
		close(space.toRest(space.collaretteRadius(rp), rp).r0, space.rc0, 1e-9, 'collarette')
		close(space.toRest(space.R, rp).r0, space.R, 1e-9, 'root')
	}
})

test('the mapping is monotonic and round-trips', () => {
	for (const rp of [0.9, 1.8, 3.2]) {
		let previous = -Infinity
		for (let r = rp; r <= space.R; r += 0.01) {
			const { r0 } = space.toRest(r, rp)
			assert.ok(r0 > previous)
			previous = r0
			close(space.toCurrent(r0, rp), r, 1e-6, `round trip ${rp} ${r}`)
		}
	}
})

test('the pupillary zone keeps its area and thickness; dilation thickens the ciliary zone', () => {
	const rp = 3
	const rc = space.collaretteRadius(rp)
	close(rc * rc - rp * rp, space.rc0 ** 2 - space.rp0 ** 2, 1e-9, 'area')
	close(space.toRest((rp + rc) / 2, rp).thickness, 1, 1e-9)
	assert.ok(space.toRest((rc + space.R) / 2, rp).thickness > 1)
	// Constriction stretches it thinner.
	assert.ok(space.toRest(4.5, 1).thickness < 1)
})

test('distance scale is the inverse of the largest stretch and never above 1 at rest', () => {
	close(space.distanceScale(space.toRest(3, 1.8)), 1, 1e-12)
	const m = space.toRest(4.5, 3)
	close(space.distanceScale(m), 1 / Math.max(m.radial, m.tangential, 1 / m.thickness), 1e-12)
	assert.ok(space.distanceScale(m) < 1)
})

test('collarette curve and features are seeded and in range', async () => {
	const { createCollaretteCurve, createFreckles, createFurrows, COLLARETTE_SAMPLES } =
		await import('../src/iris/irisFeatures')
	const options = { position: 0.3, amplitude: 0.05, teeth: 16, irregularity: 0.6, seed: 7 }
	const a = createCollaretteCurve(options)
	const b = createCollaretteCurve(options)
	assert.equal(a.length, COLLARETTE_SAMPLES)
	assert.deepEqual([...a], [...b])
	for (const rho of a) assert.ok(rho > 0.15 && rho < 0.45)
	const furrows = createFurrows({ count: 4, extent: 0.5, depth: 0.05, width: 0.06, seed: 3 })
	assert.equal(furrows.length, 4)
	for (const f of furrows) assert.ok(f.rho > 0.55 && f.rho < 0.96)
	// The inferior-temporal bias puts most freckles in the lower half.
	const freckles = createFreckles({ count: 32, size: 0.3, inferotemporal: 1, seed: 5 })
	const lower = freckles.filter((f) => Math.sin(f.theta) < 0).length
	assert.ok(lower > 24, `${lower} of 32 in the lower half`)
})
