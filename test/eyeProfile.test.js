import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conicSag, createEyeGeometry } from '../src/eye/eyeProfile'
import { DEG } from '../src/math'
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

test('the eyeball mesh covers the surface tightly where it shows, loosely where the lids cover it', async () => {
	const { createEyeballGeometry } = await import('../src/eye/eyeballGeometry')
	const mesh = createEyeballGeometry(geometry)
	const positions = mesh.getAttribute('position').array
	const index = mesh.getIndex().array
	const p = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]
	// About two thousand vertices, one at the pole.
	assert.ok(positions.length / 3 < 2200, `${positions.length / 3} vertices`)
	let poles = 0
	for (let v = 0; v < positions.length / 3; v++) {
		if (positions[v * 3] === 0 && positions[v * 3 + 1] === 0) poles++
	}
	assert.equal(poles, 1)
	// The cap's triangles first, then the sclera's, together the whole index.
	assert.equal(mesh.groups[0].start, 0)
	assert.equal(mesh.groups[0].count + mesh.groups[1].count, index.length)
	// How deep a point lies inside the exact surface, and where it lies:
	// degrees from the axis and above or below the horizontal plane.
	const capEnd = geometry.blendEnd + 0.25
	const inside = ([x, y, z]) => {
		const r = Math.hypot(x, y)
		if (r < capEnd && z > 0) return geometry.surfaceZ(r) - z
		return geometry.scleraRadius - Math.hypot(x, y, z)
	}
	const place = ([x, y, z]) => {
		const d = Math.hypot(x, y, z)
		return [Math.atan2(Math.hypot(x, y), z) / DEG, Math.asin(Math.abs(y) / d) / DEG]
	}
	const worst = { cap: 0, shown: 0, covered: 0 }
	const edges = new Map()
	for (let k = 0; k < index.length; k += 3) {
		const corners = [index[k], index[k + 1], index[k + 2]]
		const [a, b, c] = corners.map(p)
		// Faces out.
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
		const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
		const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
		const middle = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3)
		assert.ok(n[0] * middle[0] + n[1] * middle[1] + n[2] * middle[2] > 0, 'faces out')
		const points = [middle]
		for (let e = 0; e < 3; e++) {
			const [s, t] = [corners[e], corners[(e + 1) % 3]]
			const key = Math.min(s, t) * 1e6 + Math.max(s, t)
			edges.set(key, (edges.get(key) ?? 0) + 1)
			points.push([0, 1, 2].map((i) => (positions[s * 3 + i] + positions[t * 3 + i]) / 2))
		}
		for (const point of points) {
			const depth = inside(point)
			// Inside the surface: only over the limbus' sulcus, where the profile
			// is concave, a chord passes a little in front of it.
			const r = Math.hypot(point[0], point[1])
			const sulcus = r > geometry.blendStart && r < geometry.blendEnd
			assert.ok(depth > (sulcus ? -0.008 : -1e-5), `in front of the surface by ${-depth} at ${r}`)
			const [polar, height] = place(point)
			if (polar > 100) continue
			const zone =
				Math.hypot(point[0], point[1]) < capEnd ? 'cap' : height < 45 ? 'shown' : 'covered'
			worst[zone] = Math.max(worst[zone], depth)
		}
	}
	// Closed but along its outer ring, the only edges with one triangle.
	assert.ok([...edges.values()].every((count) => count <= 2))
	const open = [...edges.values()].filter((count) => count === 1).length
	assert.ok(open > 0 && open < 64, `${open} open edges`)
	// The cornea within 12 µm, the sclera that shows within 16 µm (its
	// silhouette, under a pixel and a half zoomed in), the parts the lids
	// cover under the 60 µm the conjunctiva dips under the globe.
	const label = JSON.stringify(worst)
	assert.ok(worst.cap < 0.012 && worst.shown < 0.016 && worst.covered < 0.05, label)
})
