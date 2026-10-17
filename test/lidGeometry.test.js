import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backShellSurface, GLOBE_CUT, keepInside } from '../src/adnexa/backShell'
import { createFissure } from '../src/adnexa/fissure'
import {
	createConjunctivaMesh,
	createLidMesh,
	createMeniscusMesh,
	createPalpebralMesh,
	followWeight,
	lidPoint,
} from '../src/adnexa/lidGeometry'
import { conjunctivaZ, supportAt, supportZ } from '../src/adnexa/periocular'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const params = createDefaults(BASE_PARAM_SCHEMA)
const eye = createEyeGeometry(params)
// The eye of each side: its nose side matches the fissure's.
const eyes = {
	1: eye,
	[-1]: createEyeGeometry({ ...params, eye: { ...params.eye, laterality: 'left' } }),
}
const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)
const DEG = Math.PI / 180

test('the fissure has the measured width, MRD1, MRD2 and canthal tilt', () => {
	const cases = [
		[params.lids, 1],
		[params.lids, -1],
		[{ ...params.lids, fissureWidth: 25, mrd1: 1.5, canthalTilt: -3 }, 1],
		[{ ...params.lids, fissureWidth: 31, mrd2: 7, upperPeak: 0.6, lowerMedialAngle: 35 }, -1],
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
		close(tilt / DEG, lids.canthalTilt, 1e-6, 'tilt')
		// The nose side is +X for a right eye.
		assert.equal(Math.sign(fissure.medial[0]), side)
	}
})

test('the margins leave the canthi at their medial and lateral angles', () => {
	const lids = params.lids
	const fissure = createFissure(lids, 1)
	const { along, up } = fissure.chord
	// Angle of a margin leaving a canthus, against the chord.
	const leaving = (curve, from, to) => {
		const a = curve(from)
		const b = curve(to)
		const d = [b[0] - a[0], b[1] - a[1]]
		return Math.abs(Math.atan2(d[0] * up[0] + d[1] * up[1], d[0] * along[0] + d[1] * along[1]))
	}
	close(leaving(fissure.upper, 0, 1e-6) / DEG, lids.upperMedialAngle, 0.5, 'upper medial')
	// The lower margin is shallow: its slope at the canthus is capped so it
	// stays monotonic up to its trough.
	const lowerMedial = leaving(fissure.lower, 0, 1e-6) / DEG
	assert.ok(lowerMedial > 15 && lowerMedial < lids.lowerMedialAngle + 0.5, `lower ${lowerMedial}`)
	close(180 - leaving(fissure.upper, 1, 1 - 1e-6) / DEG, lids.upperAngle, 0.5, 'upper lateral')
	close(180 - leaving(fissure.lower, 1, 1 - 1e-6) / DEG, lids.lowerAngle, 0.5, 'lower lateral')
})

test('closing brings the margins together without crossing', () => {
	const open = createFissure(params.lids, 1, 0)
	const half = createFissure(params.lids, 1, 0.5)
	const shut = createFissure(params.lids, 1, 1)
	for (let s = 0.01; s < 1; s += 0.01) {
		assert.ok(half.upper(s)[1] < open.upper(s)[1] + 1e-9, `the upper lid comes down at ${s}`)
		assert.ok(half.upper(s)[1] > half.lower(s)[1] - 1e-9, `no crossing at ${s}`)
		assert.ok(half.lower(s)[1] > open.lower(s)[1] - 1e-9, `the lower lid rises at ${s}`)
		close(shut.upper(s)[1], shut.lower(s)[1], 1e-9, 'closed')
	}
	// Closed, they meet below the pupil center.
	assert.ok(shut.upper(0.5)[1] < -2)
})

test('outward normals point away from the opening', () => {
	const fissure = createFissure(params.lids, 1)
	assert.ok(fissure.normal(0.25)[1] > 0.9)
	assert.ok(fissure.normal(0.75)[1] < -0.9)
	// The medial canthus is toward the nose (+X), the lateral one away from it.
	assert.ok(fissure.normal(0)[0] > 0.9)
	assert.ok(fissure.normal(0.5)[0] < -0.9)
})

test('the posterior margin rests on the support and no lid vertex enters the globe', () => {
	const fissure = createFissure(params.lids, 1)
	for (let t = 0.01; t < 1; t += 0.04) {
		// The posterior margin stands 0.03 mm off the support under the margin.
		const p = lidPoint(t, 0, fissure, eye, params.lids).position
		const [mx, my] = fissure.loop(t)
		const support = supportAt(eye, params.lids, fissure, mx, my).point
		close(Math.hypot(p[0] - mx, p[1] - my, p[2] - support[2]), 0.03, 0.005, `t ${t}`)
	}
	const shapes = [
		params.lids,
		{ ...params.lids, closure: 0.5 },
		{ ...params.lids, closure: 1 },
		{ ...params.lids, lidThickness: 1.5, creaseDepth: 1.5, creaseHeight: 4 },
		{ ...params.lids, mrd1: 5.5, mrd2: 7 },
	]
	for (const lids of shapes) {
		const mesh = createLidMesh(lids, eye, 1, { around: 160, across: 60 })
		for (let i = 0; i < mesh.positions.length; i += 3) {
			const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]
			const r = Math.hypot(x, y)
			if (r >= eye.scleraRadius * 0.99) continue
			assert.ok(z >= eye.surfaceZ(r) - 1e-6, `vertex inside the eye at ${x}, ${y}, ${z}`)
		}
	}
})

test('the lids do not fold or collapse in view', () => {
	const around = 320
	const across = 96
	const shapes = [
		{ label: 'right eye', side: 1, lids: params.lids },
		{ label: 'left eye', side: -1, lids: params.lids },
		{ label: 'narrow', side: 1, lids: { ...params.lids, fissureWidth: 25 } },
		{ label: 'wide, tilted', side: 1, lids: { ...params.lids, fissureWidth: 31, canthalTilt: 10 } },
		{ label: 'level', side: -1, lids: { ...params.lids, canthalTilt: -3 } },
		{ label: 'ptosis', side: 1, lids: { ...params.lids, mrd1: 1.5 } },
		{ label: 'deep crease', side: 1, lids: { ...params.lids, creaseDepth: 1.5, creaseHeight: 5 } },
		{ label: 'half closed', side: 1, lids: { ...params.lids, closure: 0.5 } },
		{
			label: 'prominent face',
			side: -1,
			lids: { ...params.lids, browProjection: 8, cheekDepth: -3 },
		},
	]
	for (const { label, side, lids } of shapes) {
		const mesh = createLidMesh(lids, eyes[side], side, { around, across })
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
			return length > 1e-9 ? n.map((v) => v / length) : null
		}
		const { medial, lateral } = mesh.fissure
		// The canthi, where the lids meet back to back, are left out; elsewhere
		// in view neighboring quads never face opposite ways, and the skin
		// (past the margin's profile) never collapses.
		const skip = ([x, y]) =>
			Math.hypot(x, y) > 24 ||
			Math.min(
				Math.hypot(x - medial[0], y - medial[1]),
				Math.hypot(x - lateral[0], y - lateral[1]),
			) < 1.5
		const skinRow = Math.ceil(0.15 * (across - 1))
		for (let i = 0; i < around; i++) {
			for (let j = 0; j < across - 2; j++) {
				if (skip(point(i, j))) continue
				const n = normal(i, j)
				if (!n) {
					assert.ok(j < skinRow, `${label}: collapsed skin quad ${i}, ${j}`)
					continue
				}
				for (const m of [normal(i + 1, j), normal(i, j + 1)]) {
					if (!m) continue
					const dot = n[0] * m[0] + n[1] * m[1] + n[2] * m[2]
					assert.ok(dot > -0.2, `${label}: fold at column ${i}, row ${j}`)
				}
			}
		}
	}
})

test('the skin turns into the face without creases', () => {
	// Away from the margin the skin's height across neighboring columns bends
	// gently (a crease left by a parameter changing too fast along the margin
	// bends it by more than 0.5 per mm).
	const around = 560
	const across = 150
	for (const side of [1, -1]) {
		const mesh = createLidMesh(params.lids, eyes[side], side, { around, across })
		const at = (i, j) => {
			const k = (((i % around) + around) % around) * across + j
			return mesh.positions.subarray(k * 3, k * 3 + 3)
		}
		let worst = 0
		for (let i = 0; i < around; i++) {
			for (let j = 40; j < across - 1; j++) {
				if (mesh.lid[(i * across + j) * 4 + 2] < 8) continue
				const [a, b, c] = [at(i - 1, j), at(i, j), at(i + 1, j)]
				const d1 = Math.hypot(b[0] - a[0], b[1] - a[1])
				const d2 = Math.hypot(c[0] - b[0], c[1] - b[1])
				const bend = ((c[2] - b[2]) / d2 - (b[2] - a[2]) / d1) / ((d1 + d2) / 2)
				worst = Math.max(worst, Math.abs(bend))
			}
		}
		assert.ok(worst < 0.5, `bend ${worst} per mm`)
	}
})

test('the lower lid flows into the cheek without a groove under it', () => {
	// Down each lower-lid column, from past the margin's edge to beyond the
	// junction with the cheek, the skin's profile bends gently (its skin
	// following the receding globe left a groove under the lid that bent it by
	// 0.7 per mm).
	const around = 280
	const across = 150
	const cases = [
		[params.lids, 1],
		[params.lids, -1],
		[{ ...params.lids, fissureWidth: 31, mrd2: 7 }, 1],
		[{ ...params.lids, fissureWidth: 25, mrd2: 4 }, -1],
		[{ ...params.lids, lowerHeight: 4, lowerFullness: 1 }, -1],
		[{ ...params.lids, lowerHeight: 9, cheekProjection: 4 }, 1],
	]
	for (const [lids, side] of cases) {
		const mesh = createLidMesh(lids, eyes[side], side, { around, across })
		let worst = 0
		for (let i = 0; i < around; i++) {
			if (mesh.lid[i * across * 4 + 3] > 0.01) continue
			const profile = []
			for (let j = 0; j < across; j++) {
				const k = i * across + j
				profile.push([mesh.lid[k * 4 + 2], mesh.positions[k * 3 + 2]])
			}
			const z = (a) => {
				const k = profile.findIndex((p) => p[0] >= a)
				const f = (a - profile[k - 1][0]) / (profile[k][0] - profile[k - 1][0])
				return profile[k - 1][1] + (profile[k][1] - profile[k - 1][1]) * f
			}
			for (let a = 1.5; a <= 10.5; a += 0.25) {
				const slope = (z(a + 0.5) - z(a - 0.5)) / 1
				const bend = (z(a + 0.5) - 2 * z(a) + z(a - 0.5)) / 0.25 / (1 + slope * slope) ** 1.5
				worst = Math.max(worst, bend)
			}
		}
		assert.ok(worst < 0.4, `bend ${worst} per mm`)
	}
})

test('the mesh keeps its layout as the lids close (a blink can morph between them)', () => {
	const size = { around: 120, across: 40 }
	const open = createLidMesh(params.lids, eye, 1, size)
	const shut = createLidMesh({ ...params.lids, closure: 1 }, eye, 1, size)
	assert.equal(open.positions.length, shut.positions.length)
	assert.deepEqual(open.indices, shut.indices)
	// The margins move, the face far out stays put.
	const last = (mesh, i) => mesh.positions.subarray((i * 40 + 39) * 3, (i * 40 + 40) * 3)
	for (let i = 0; i < 120; i += 10) assert.deepEqual(last(open, i), last(shut, i))
	// Column 0 leaves the middle of the upper margin.
	assert.ok(open.positions[1] - shut.positions[1] > 5, 'the upper margin comes down')
})

test('attributes: the row direction, the grooves, the place along the margin, the follow', () => {
	const around = 160
	const across = 40
	const lids = { ...params.lids, creaseDepth: 1 }
	const mesh = createLidMesh(lids, eye, 1, { around, across })
	const { relief, lid, follow } = mesh
	let deepest = 0
	for (let i = 0; i < around; i++) {
		const along = relief[i * across * 4 + 3]
		assert.ok(along >= 0 && along <= 1, `along ${along}`)
		for (let j = 0; j < across; j++) {
			const k = (i * across + j) * 4
			// The same along the whole column.
			assert.equal(relief[k + 3], along)
			close(Math.hypot(relief[k], relief[k + 1]), 1, 1e-5, 'unit direction')
			assert.ok(relief[k + 2] <= 0, 'grooves only')
			deepest = Math.min(deepest, relief[k + 2])
			// `a` grows along the column, away from the opening.
			if (j > 0) assert.ok(lid[k + 2] >= lid[k - 2], `a grows at column ${i}, row ${j}`)
			const share = lid[k + 3]
			assert.ok(share >= 0 && share <= 1)
			assert.equal(follow[(i * across + j) * 2], share)
		}
		// The margin follows the gaze; the face far out does not.
		assert.equal(follow[i * across * 2 + 1], 1)
		assert.equal(follow[(i * across + across - 1) * 2 + 1], 0)
	}
	assert.ok(deepest < -0.5, `the crease is recorded (${deepest})`)
	const [upper, lower] = mesh.fissure.lengths
	assert.ok(
		upper > 25 && upper < 36 && lower > 25 && lower < 36,
		`margin lengths ${upper}, ${lower}`,
	)
	assert.equal(followWeight(0), 1)
	assert.equal(followWeight(20), 0)
})

test('the upper share is 1 over the upper lid, 0 over the lower one, half at the canthi', () => {
	const fissure = createFissure(params.lids, 1)
	const share = (t) => lidPoint(t, 0.5, fissure, eye, params.lids).share
	close(share(0.25), 1, 1e-6, 'upper')
	close(share(0.75), 0, 1e-6, 'lower')
	close(share(0), 0.5, 0.05, 'medial canthus')
	close(share(0.5), 0.5, 0.05, 'lateral canthus')
})

test('the conjunctiva fills the canthi, facing out and only dipping under the globe', () => {
	const conjunctiva = createConjunctivaMesh(params.lids, eye, 1)
	const p = (index) => Array.from(conjunctiva.positions.subarray(index * 3, index * 3 + 3))
	let reachesCanthi = 0
	const { medial, lateral } = createFissure(params.lids, 1)
	for (let i = 0; i < conjunctiva.positions.length / 3; i++) {
		const [x, y, z] = p(i)
		const r = Math.hypot(x, y)
		// It dips (0.06 mm) under the sclera only, for a clean seam.
		if (r < eye.scleraRadius) assert.ok(z > eye.surfaceZ(r) - 0.061, `inside the globe at ${r}`)
		for (const corner of [medial, lateral]) {
			if (Math.hypot(x - corner[0], y - corner[1]) < 0.6) reachesCanthi++
		}
	}
	assert.ok(reachesCanthi >= 2, 'covers both canthi')
	for (let k = 0; k < conjunctiva.indices.length; k += 3) {
		const [a, b, c] = [
			p(conjunctiva.indices[k]),
			p(conjunctiva.indices[k + 1]),
			p(conjunctiva.indices[k + 2]),
		]
		const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
		const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
		const nz = e1[0] * e2[1] - e1[1] * e2[0]
		assert.ok(nz > 0, `face ${k / 3} faces away from the viewer`)
	}
})

test('the palpebral conjunctiva hangs from the margins, faces the opening, darkens inward', async () => {
	const { bakeLidOcclusion } = await import('../src/adnexa/lidOcclusion')
	const around = 280
	const rows = 12
	const lids = createLidMesh(params.lids, eye, 1, { around, across: 80 })
	const curtain = createPalpebralMesh(params.lids, eye, 1, { around, rows })
	const p = (mesh, index) => Array.from(mesh.positions.subarray(index * 3, index * 3 + 3))
	for (let i = 0; i < around; i++) {
		// Its top row is the lid's posterior margin.
		assert.deepEqual(p(curtain, i * rows), p(lids, i * 80))
		const bottom = p(curtain, i * rows + rows - 1)
		const r = Math.hypot(bottom[0], bottom[1])
		// It reaches under the conjunctiva, or into the globe where the margin
		// rests on it.
		const conjunctiva = conjunctivaZ(eye, params.lids, lids.fissure, bottom[0], bottom[1])
		assert.ok(bottom[2] < Math.min(conjunctiva, eye.surfaceZ(Math.min(r, eye.scleraRadius))) - 1)
	}
	const { indices, relief } = curtain
	for (let k = 0; k < indices.length; k += 3) {
		const [a, b, c] = [0, 1, 2].map((n) => p(curtain, indices[k + n]))
		const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
		const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
		const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2]]
		const outward = [relief[indices[k] * 4], relief[indices[k] * 4 + 1]]
		if (Math.hypot(...n) > 1e-9) assert.ok(n[0] * outward[0] + n[1] * outward[1] < 0, 'faces in')
	}
	// Deeper in the sac, darker.
	const conjunctiva = createConjunctivaMesh(params.lids, eye, 1)
	const ao = bakeLidOcclusion([lids, conjunctiva, curtain], eye)[2]
	const { medial } = lids.fissure
	let nearest = 0
	for (let i = 0; i < around; i++) {
		const [x, y] = p(curtain, i * rows)
		const [nx, ny] = p(curtain, nearest * rows)
		if (Math.hypot(x - medial[0], y - medial[1]) < Math.hypot(nx - medial[0], ny - medial[1]))
			nearest = i
	}
	for (let j = 1; j < rows; j++) assert.ok(ao[nearest * rows + j] < ao[nearest * rows + j - 1])
})

test('no line of sight through the opening near a canthus reaches the background', () => {
	// Orthographic views up to 60° to the side and 40° up or down: every point
	// within 5 mm of each canthus whose line of sight passes inside the fissure
	// at the depth of that canthus' margins must land on a front face of the
	// lids and face, the conjunctiva, the palpebral conjunctiva (both kept
	// inside the back shell, as the app builds them) or the globe in front of
	// its cut.
	const around = 280
	const lids = createLidMesh(params.lids, eye, 1, { around, across: 80 })
	const back = backShellSurface(lids, eye, params.shell)
	const { clearance } = params.shell
	const meshes = [
		lids,
		keepInside(createConjunctivaMesh(params.lids, eye, 1), back, clearance),
		keepInside(createPalpebralMesh(params.lids, eye, 1, { around }), back, clearance),
	]
	const { fissure } = lids
	const loop = Array.from({ length: 400 }, (_, i) => fissure.loop(i / 400))
	const inLoop = ([x, y]) => {
		let inside = false
		for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
			const [xi, yi] = loop[i]
			const [xj, yj] = loop[j]
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
		}
		return inside
	}
	const R = eye.scleraRadius
	const cell = 0.25
	for (const corner of ['medial', 'lateral']) {
		const [cx, cy] = fissure[corner]
		const marginZ = supportZ(eye, params.lids, fissure, cx, cy)
		for (const azimuth of [-60, -40, -20, 0, 20, 40, 60]) {
			for (const elevation of [-40, -20, 0, 20, 40]) {
				const [az, el] = [azimuth * DEG, elevation * DEG]
				// Toward the camera, and the picture's axes.
				const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
				const right = [Math.cos(az), 0, -Math.sin(az)]
				// d × right.
				const up = [d[1] * right[2], d[2] * right[0] - d[0] * right[2], -d[1] * right[0]]
				const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
				const center = [dot([cx, cy, marginZ], right), dot([cx, cy, marginZ], up)]
				const grid = new Map()
				for (const { positions: P, indices: I } of meshes) {
					for (let k = 0; k < I.length; k += 3) {
						const [a, b, c] = [0, 1, 2].map((n) =>
							Array.from(P.subarray(I[k + n] * 3, I[k + n] * 3 + 3)),
						)
						const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
						const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
						const n = [
							e1[1] * e2[2] - e1[2] * e2[1],
							e1[2] * e2[0] - e1[0] * e2[2],
							e1[0] * e2[1] - e1[1] * e2[0],
						]
						// The skin program draws front faces only.
						if (dot(n, d) <= 0) continue
						const t = [a, b, c].map((q) => [dot(q, right) - center[0], dot(q, up) - center[1]])
						const lo = [0, 1].map((m) => Math.min(t[0][m], t[1][m], t[2][m]))
						const hi = [0, 1].map((m) => Math.max(t[0][m], t[1][m], t[2][m]))
						if (hi[0] < -5 || lo[0] > 5 || hi[1] < -5 || lo[1] > 5) continue
						for (let i = Math.floor(lo[0] / cell); i <= Math.floor(hi[0] / cell); i++) {
							for (let j = Math.floor(lo[1] / cell); j <= Math.floor(hi[1] / cell); j++) {
								const key = `${i},${j}`
								if (!grid.has(key)) grid.set(key, [])
								grid.get(key).push(t)
							}
						}
					}
				}
				const covers = ([px, py], [a, b, c]) => {
					const s1 = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])
					const s2 = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0])
					const s3 = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0])
					return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
				}
				for (let u = -5; u <= 5; u += 0.1) {
					for (let v = -5; v <= 5; v += 0.1) {
						if (Math.hypot(u, v) > 5) continue
						const key = `${Math.floor(u / cell)},${Math.floor(v / cell)}`
						if ((grid.get(key) ?? []).some((t) => covers([u, v], t))) continue
						// The line of sight, and where it crosses the margins' depth.
						const o = [0, 1, 2].map((m) => (center[0] + u) * right[m] + (center[1] + v) * up[m])
						const along = (o[2] - marginZ) / d[2]
						if (!inLoop([o[0] - d[0] * along, o[1] - d[1] * along])) continue
						// The globe: its sphere, in front of its cut.
						const off = dot(o, o) - dot(o, d) ** 2
						if (off < R * R) {
							const hit = o.map((q, m) => q + d[m] * (Math.sqrt(R * R - off) - dot(o, d)))
							if (hit[2] >= GLOBE_CUT * R) continue
						}
						assert.fail(
							`${corner} canthus, view ${azimuth}°/${elevation}°: background at ${u.toFixed(1)}, ${v.toFixed(1)} mm`,
						)
					}
				}
			}
		}
	}
})

test('the meniscus lies on the eye along the margins, tapering at the canthi', () => {
	const around = 80
	const across = 10
	const meniscus = createMeniscusMesh(params.lids, eye, 1, { around, across })
	const fissure = createFissure(params.lids, 1)
	for (let i = 0; i < around; i++) {
		const radius = meniscus.meniscus[i * across * 3 + 2]
		const t = i / around
		if (t === 0 || t === 0.5) close(radius, 0, 1e-9, 'tapers at the canthi')
		else assert.ok(radius <= Math.max(params.lids.meniscusLower, params.lids.meniscusUpper) + 1e-6)
		// Full in the middle of the lids, where the margins rest on the globe.
		if (t === 0.25 || t === 0.75) assert.ok(radius > 0.15, `radius ${radius} at ${t}`)
		const [mx, my] = fissure.loop(t)
		for (let j = 0; j < across; j++) {
			const k = (i * across + j) * 3
			const [x, y, z] = meniscus.positions.subarray(k, k + 3)
			// Within its radius of the margin, never inside the eye.
			assert.ok(Math.hypot(x - mx, y - my) < radius + 0.05)
			const r = Math.hypot(x, y)
			if (r < eye.scleraRadius) assert.ok(z >= eye.surfaceZ(r) - 1e-6, 'outside the eye')
		}
	}
})

test('baked occlusion: open on the face, dark in the canthi and under the margins', async () => {
	const { bakeLidOcclusion } = await import('../src/adnexa/lidOcclusion')
	const lids = createLidMesh(params.lids, eye, 1, { around: 280, across: 80 })
	const conjunctiva = createConjunctivaMesh(params.lids, eye, 1)
	const [ao, conjunctivaAo] = bakeLidOcclusion([lids, conjunctiva], eye)
	assert.equal(ao.length, lids.positions.length / 3)
	assert.equal(conjunctivaAo.length, conjunctiva.positions.length / 3)
	for (const value of [...ao, ...conjunctivaAo]) assert.ok(value >= 0 && value <= 1)
	// Near each canthus the conjunctiva the opening shows is in a pocket.
	const near = (mesh, values, [cx, cy], radius) => {
		let sum = 0
		let count = 0
		for (let v = 0; v < values.length; v++) {
			const x = mesh.positions[v * 3]
			const y = mesh.positions[v * 3 + 1]
			if (Math.hypot(x - cx, y - cy) < radius) {
				sum += values[v]
				count++
			}
		}
		return sum / count
	}
	const { medial, lateral } = lids.fissure
	assert.ok(near(conjunctiva, conjunctivaAo, medial, 1.5) < 0.8, 'medial canthus')
	assert.ok(near(conjunctiva, conjunctivaAo, lateral, 1.5) < 0.8, 'lateral canthus')
	// The open cheek far below the eye sees the sky.
	assert.ok(near(lids, ao, [0, -20], 3) > 0.97, 'cheek')
	// The posterior margin, against the globe, is darker than the skin above.
	const k = (i, j) => i * 80 + j
	assert.ok(ao[k(0, 0)] < ao[k(0, 60)], 'margin against the skin above')
	assert.deepEqual(
		bakeLidOcclusion([lids], eye)[0].slice(0, 400),
		bakeLidOcclusion([lids], eye)[0].slice(0, 400),
	)
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
