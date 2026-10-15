import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	createFissure,
	createFornixMesh,
	createLidMesh,
	eyeSurfaceAt,
	lidPoint,
} from '../src/adnexa/lidGeometry'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { PARAM_SCHEMA } from '../src/params/paramSchema'

const params = createDefaults(PARAM_SCHEMA)
const eye = createEyeGeometry(params)
const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)
// The most irregular, full, baggy and folded lids the schema allows.
const aged = { ...params.lids, irregularity: 1, fullness: 1.5, bags: 1.5, folds: 1 }

test('the fissure has the measured width, MRD1, MRD2 and canthal tilt', () => {
	// The margins wander off their arches by the seed, MRD1 and MRD2 hold.
	const cases = [
		[params.lids, 1],
		[params.lids, -1],
		[{ ...aged, seed: 7 }, 1],
		[{ ...aged, seed: 4242 }, -1],
	]
	for (const [lids, side] of cases) {
		const fissure = createFissure(lids, side)
		close(Math.abs(fissure.medial[0] - fissure.lateral[0]), lids.fissureWidth, 1e-9)
		let top = -Infinity
		let bottom = Infinity
		for (let s = 0; s <= 1; s += 0.001) {
			top = Math.max(top, fissure.upper(s)[1])
			bottom = Math.min(bottom, fissure.lower(s)[1])
		}
		close(top, lids.mrd1, 0.01, 'MRD1')
		close(bottom, -lids.mrd2, 0.01, 'MRD2')
		const tilt = Math.atan2(
			fissure.lateral[1] - fissure.medial[1],
			Math.abs(fissure.lateral[0] - fissure.medial[0]),
		)
		close((tilt * 180) / Math.PI, lids.canthalTilt, 1e-6, 'tilt')
		// The nose side is +X for a right eye.
		assert.equal(Math.sign(fissure.medial[0]), side)
	}
})

test('outward normals point away from the opening', () => {
	const fissure = createFissure(params.lids, 1)
	assert.ok(fissure.normal(0.25)[1] > 0.9)
	assert.ok(fissure.normal(0.75)[1] < -0.9)
})

test('the posterior margin rests on the eye surface and no lid vertex enters the globe', () => {
	const fissure = createFissure(params.lids, 1)
	for (let t = 0.02; t < 1; t += 0.05) {
		// The canthi lie beyond the globe's outline; check the margin in front of it.
		const [mx, my] = fissure.loop(t)
		if (Math.hypot(mx, my) > 0.85 * eye.scleraRadius) continue
		const p = lidPoint(t, 0, fissure, eye, params.lids).position
		const surface = eyeSurfaceAt(eye, p[0], p[1])
		close(p[2], surface.point[2], 0.1, `t ${t}`)
	}
	const thin = { ...aged, lidThickness: 1.5, creaseDepth: 3, creaseHeight: 5 }
	for (const lids of [params.lids, aged, thin]) {
		const mesh = createLidMesh(lids, eye, 1, { around: 120, across: 40 })
		for (let i = 0; i < mesh.positions.length; i += 3) {
			const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]
			const r = Math.hypot(x, y)
			if (r >= eye.scleraRadius * 0.99) continue
			assert.ok(z >= eye.surfaceZ(r) - 1e-6, `vertex inside the eye at ${x}, ${y}, ${z}`)
		}
	}
})

test('the lids do not fold or collapse in view, also where the canthi lie beyond the globe', () => {
	const around = 320
	const across = 96
	// Realistic shapes. Extreme ones (very open or thick lids, strongly tilted
	// wide fissures) still crease near the canthi or far out: docs/ROADMAP.md.
	const shapes = [
		{ label: 'right eye', side: 1, lids: params.lids },
		{ label: 'left eye', side: -1, lids: params.lids },
		{ label: 'narrow', side: 1, lids: { ...params.lids, fissureWidth: 25 } },
		{ label: 'wide, tilted', side: 1, lids: { ...params.lids, fissureWidth: 29, canthalTilt: 8 } },
		{ label: 'level', side: -1, lids: { ...params.lids, canthalTilt: -3 } },
		{ label: 'ptosis', side: 1, lids: { ...params.lids, mrd1: 1.5 } },
		{ label: 'deep crease', side: 1, lids: { ...params.lids, creaseDepth: 2.5, creaseHeight: 6 } },
		{ label: 'aged', side: 1, lids: aged },
		{ label: 'aged, left, another seed', side: -1, lids: { ...aged, seed: 512 } },
		{ label: 'receding temple', side: 1, lids: { ...params.lids, templeDepth: 12 } },
	]
	for (const { label, side, lids } of shapes) {
		const mesh = createLidMesh(lids, eye, side, { around, across })
		const point = (i, j) => {
			const k = (((i % around) + around) % around) * across + j
			return Array.from(mesh.positions.subarray(k * 3, k * 3 + 3))
		}
		const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
		// Quad normal from its diagonals.
		const normal = (i, j) => {
			const d1 = sub(point(i + 1, j + 1), point(i, j))
			const d2 = sub(point(i, j + 1), point(i + 1, j))
			const n = [
				d1[1] * d2[2] - d1[2] * d2[1],
				d1[2] * d2[0] - d1[0] * d2[2],
				d1[0] * d2[1] - d1[1] * d2[0],
			]
			const length = Math.hypot(...n)
			assert.ok(length > 1e-7, `${label}: collapsed quad ${i}, ${j}`)
			return n.map((v) => v / length)
		}
		const { medial, lateral } = mesh.fissure
		// At the canthi the two lids meet in a crease, back to back; elsewhere in
		// view (20 mm around the axis) neighboring quads never face opposite ways.
		const skip = ([x, y]) =>
			Math.hypot(x, y) > 20 ||
			Math.min(
				Math.hypot(x - medial[0], y - medial[1]),
				Math.hypot(x - lateral[0], y - lateral[1]),
			) < 1.5
		for (let i = 0; i < around; i++) {
			for (let j = 0; j < across - 2; j++) {
				const n = normal(i, j)
				if (skip(point(i, j))) continue
				for (const m of [normal(i + 1, j), normal(i, j + 1)]) {
					const dot = n[0] * m[0] + n[1] * m[1] + n[2] * m[2]
					assert.ok(dot > -0.2, `${label}: fold at t ${(i / around).toFixed(3)}, row ${j}`)
				}
			}
		}
	}
})

test('the lid relief is seeded; without irregularity and folds the seed changes nothing', () => {
	const size = { around: 60, across: 24 }
	const positions = (lids) => createLidMesh(lids, eye, 1, size).positions
	assert.deepEqual(positions(params.lids), positions({ ...params.lids }))
	const other = positions({ ...params.lids, seed: params.lids.seed + 1 })
	assert.ok(other.some((value, i) => Math.abs(value - positions(params.lids)[i]) > 1e-3))
	const plain = { ...params.lids, irregularity: 0, folds: 0 }
	assert.deepEqual(positions(plain), positions({ ...plain, seed: 77 }))
})

test('relief attributes: the outward direction, the folds and the place along the margin', () => {
	const around = 160
	const across = 40
	const mesh = createLidMesh(aged, eye, 1, { around, across })
	const { relief, lid } = mesh
	let deepest = 0
	for (let i = 0; i < around; i++) {
		const t = i / around
		const along = relief[i * across * 4 + 3]
		assert.ok(along >= 0 && along <= 1, `along ${along}`)
		// The same along the whole profile of a ring column.
		assert.equal(relief[(i * across + across - 1) * 4 + 3], along)
		if (i > 0 && i < around / 2) assert.ok(along > relief[(i - 1) * across * 4 + 3], 'grows on top')
		if (i > around / 2) assert.ok(along < relief[(i - 1) * across * 4 + 3], 'shrinks below')
		for (let j = 0; j < across; j++) {
			const k = (i * across + j) * 4
			close(Math.hypot(relief[k], relief[k + 1]), 1, 1e-5, 'unit across')
			assert.ok(relief[k + 2] <= 0, 'folds are grooves')
			deepest = Math.min(deepest, relief[k + 2])
			// `a` grows along `across`, away from the opening.
			if (j > 0) assert.ok(lid[k + 2] >= lid[k - 2], `a grows at t ${t}, row ${j}`)
		}
		close(lid[(i * across + across - 1) * 4 + 2], 34, 1e-6, 'the skin reaches out 34 mm')
	}
	close(relief[3], 0, 1e-9, 'medial canthus')
	close(relief[(around / 2) * across * 4 + 3], 1, 1e-9, 'lateral canthus')
	assert.ok(deepest < -0.3, `the crease and folds are recorded (${deepest})`)
	const [upper, lower] = mesh.fissure.lengths
	assert.ok(
		upper > 25 && upper < 35 && lower > 25 && lower < 35,
		`margin lengths ${upper}, ${lower}`,
	)
})

test('the fornix fills the canthi beyond the globe, facing out and outside the globe', () => {
	const fornix = createFornixMesh(eye)
	const p = (index) => Array.from(fornix.positions.subarray(index * 3, index * 3 + 3))
	let reachesCanthi = 0
	const { medial, lateral } = createFissure(params.lids, 1)
	for (let i = 0; i < fornix.positions.length / 3; i++) {
		const [x, y, z] = p(i)
		const r = Math.hypot(x, y)
		// Only its inner edge dips (0.06 mm) under the sclera, for a clean seam.
		if (r < eye.scleraRadius) assert.ok(z > eye.surfaceZ(r) - 0.061, `inside the globe at ${r}`)
		for (const corner of [medial, lateral]) {
			if (Math.hypot(x - corner[0], y - corner[1]) < 0.5) reachesCanthi++
		}
	}
	assert.ok(reachesCanthi >= 2, 'covers both canthi')
	for (let k = 0; k < fornix.indices.length; k += 3) {
		const [a, b, c] = [p(fornix.indices[k]), p(fornix.indices[k + 1]), p(fornix.indices[k + 2])]
		const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
		const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
		const n = [
			e1[1] * e2[2] - e1[2] * e2[1],
			e1[2] * e2[0] - e1[0] * e2[2],
			e1[0] * e2[1] - e1[1] * e2[0],
		]
		// Outward: along +Z and away from the axis.
		assert.ok(n[2] > 0 && n[0] * a[0] + n[1] * a[1] >= 0, `face ${k / 3} faces in`)
	}
})

test('lashes: counts, lengths, roots on the margin, pointing away from the eye', async () => {
	const { generateLashes, LASH_SEGMENTS } = await import('../src/adnexa/lashGenerator')
	const lashes = generateLashes(params, eye)
	const upper = lashes.filter((lash) => lash.side === 'upper')
	const lower = lashes.filter((lash) => lash.side === 'lower')
	assert.equal(upper.length, params.lashes.upperCount)
	assert.equal(lower.length, params.lashes.lowerCount)
	const mean = (list) => list.reduce((sum, lash) => sum + lash.length, 0) / list.length
	assert.ok(mean(upper) > mean(lower))
	assert.ok(mean(upper) > 5 && mean(upper) < 11, `upper mean ${mean(upper)}`)
	for (const lash of lashes) {
		assert.equal(lash.points.length, LASH_SEGMENTS + 1)
		// Tips end up further from the globe center than the roots, and upper
		// lashes rise while lower ones fall.
		const root = lash.points[0]
		const tip = lash.points.at(-1)
		assert.ok(Math.hypot(...tip) > Math.hypot(...root))
		if (lash.side === 'upper') assert.ok(tip[1] > root[1])
		else assert.ok(tip[1] < root[1])
	}
	assert.deepEqual(generateLashes(params, eye)[5].points, lashes[5].points)
})

test('the fissure distance is positive in the opening and negative under the lids', async () => {
	const { fissurePolygon, signedFissureDistance } = await import('../src/adnexa/fissureMap')
	const polygon = fissurePolygon(params.lids, 1)
	assert.ok(signedFissureDistance(polygon, 0, 0) > 3)
	assert.ok(signedFissureDistance(polygon, 0, params.lids.mrd1 + 2) < -1.9)
	close(signedFissureDistance(polygon, 0, -params.lids.mrd2), 0, 0.05, 'on the lower margin')
})
