import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backShellSurface, createBackShell, GLOBE_CUT, keepInside } from '../src/adnexa/backShell'
import {
	createConjunctivaMesh,
	createLidMesh,
	createPalpebralMesh,
	LID_PATCH,
} from '../src/adnexa/lidGeometry'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const params = createDefaults(BASE_PARAM_SCHEMA)
const eyeOf = (side) =>
	createEyeGeometry({
		...params,
		eye: { ...params.eye, laterality: side > 0 ? 'right' : 'left' },
	})
// Coarser lid meshes than the app's: the tests only need their extent.
const SIZE = { around: 160, across: 60 }

// As src/adnexa/lids.js builds them: the lids, the shell, and the conjunctiva
// and the palpebral conjunctiva kept inside it (`raw`: as they were).
function build(lids = params.lids, side = 1, shell = params.shell) {
	const eye = eyeOf(side)
	const lid = createLidMesh(lids, eye, side, SIZE)
	const surface = backShellSurface(lid, eye, shell)
	const raw = [
		createConjunctivaMesh(lids, eye, side),
		createPalpebralMesh(lids, eye, side, { around: SIZE.around }),
	]
	const copy = (part) => ({
		...part,
		positions: part.positions.slice(),
		depth: part.depth?.slice(),
	})
	const [fornix, curtain] = raw.map((part) => keepInside(copy(part), surface, shell.clearance))
	return {
		eye,
		lid,
		raw,
		parts: [lid, fornix, curtain],
		back: createBackShell(lid, surface, shell),
	}
}

const point = (positions, v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]
const key = (p) => p.map((c) => c.toFixed(4)).join(',')
const triangleNormal = (positions, a, b, c) => {
	const [p, q, r] = [a, b, c].map((v) => point(positions, v))
	const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
	const w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]
	return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
}

test('the patch edge lies on the patch ellipse, the band starts on it', () => {
	const { lid, back } = build()
	const edge = new Set()
	for (let i = 0; i < lid.rim.length / 3; i++) {
		const [x, y] = point(lid.rim, i)
		const outside = Math.hypot(x / LID_PATCH.width, y / LID_PATCH.height)
		assert.ok(Math.abs(outside - 1) < 1e-3, `edge point ${i} at ${outside}`)
		edge.add(key(point(lid.rim, i)))
	}
	// The lid mesh's outer row is its rim.
	const across = SIZE.across
	assert.deepEqual(point(lid.positions, across - 1), point(lid.rim, 0))
	let onEdge = 0
	for (let v = 0; v < back.positions.length / 3; v++) {
		if (edge.has(key(point(back.positions, v)))) onEdge++
	}
	assert.equal(onEdge, edge.size)
})

test('the shell closes the patch: every edge is shared but the patch edge', () => {
	for (const side of [1, -1]) {
		const { lid, back } = build(params.lids, side)
		const edge = new Set()
		for (let i = 0; i < lid.rim.length / 3; i++) edge.add(key(point(lid.rim, i)))
		// Edges by position: the band and the dome meet in coincident vertices.
		const uses = new Map()
		const { indices, positions } = back
		for (let t = 0; t < indices.length; t += 3) {
			for (let k = 0; k < 3; k++) {
				const a = key(point(positions, indices[t + k]))
				const b = key(point(positions, indices[t + ((k + 1) % 3)]))
				const id = a < b ? `${a}|${b}` : `${b}|${a}`
				uses.set(id, (uses.get(id) ?? 0) + 1)
			}
		}
		for (const [id, count] of uses) {
			const [a, b] = id.split('|')
			const open = edge.has(a) && edge.has(b)
			assert.equal(count, open ? 1 : 2, `edge ${id}`)
		}
	}
})

test('front faces out: the band away from the patch, the dome backward', () => {
	const { back, lid } = build()
	const edge = new Set()
	for (let i = 0; i < lid.rim.length / 3; i++) {
		const [x, y] = point(lid.rim, i)
		edge.add(`${x.toFixed(4)},${y.toFixed(4)}`)
	}
	const { indices, positions } = back
	let band = 0
	for (let t = 0; t < indices.length; t += 3) {
		const [a, b, c] = indices.subarray(t, t + 3)
		const n = triangleNormal(positions, a, b, c)
		const length = Math.hypot(...n)
		if (length < 1e-12) continue
		const center = [a, b, c]
			.map((v) => point(positions, v))
			.reduce((sum, p) => sum.map((s, i) => s + p[i] / 3), [0, 0, 0])
		const onBand = [a, b, c].every((v) => {
			const [x, y] = point(positions, v)
			return edge.has(`${x.toFixed(4)},${y.toFixed(4)}`)
		})
		if (onBand) {
			band++
			assert.ok(Math.abs(n[2]) / length < 1e-3, 'the band runs straight back')
			assert.ok(n[0] * center[0] + n[1] * center[1] > 0, 'the band faces out')
		} else {
			assert.ok(n[2] / length < -0.05, `the dome faces backward at ${center}`)
		}
	}
	assert.equal(band, (2 * lid.rim.length) / 3)
})

test('the shell passes the clearance behind the globe and the lids, the hidden parts inside it', () => {
	const shapes = [
		[params.lids, 1],
		[params.lids, -1],
		[{ ...params.lids, closure: 1 }, 1],
		[{ ...params.lids, fissureWidth: 32, mrd1: 6, mrd2: 8 }, 1],
		[{ ...params.lids, noseProjection: 18, browProjection: 12 }, -1],
		[{ ...params.lids, rimDepth: 21, lateralDepth: 12, cheekProjection: -6 }, 1],
	]
	const shell = { ...params.shell, clearance: 1.5 }
	for (const [lids, side] of shapes) {
		const { eye, parts, back } = build(lids, side, shell)
		const behind = (x, y, z, label) => {
			const margin = z - back.heightAt(x, y)
			assert.ok(margin > shell.clearance - 0.05, `${label} ${margin} at ${x}, ${y}, ${z}`)
		}
		// The globe in front of its cut: it turns with the gaze, about its center.
		const R = eye.scleraRadius
		for (let r = 0; r < R; r += 0.25) {
			for (let k = 0; k < 48; k++) {
				const angle = (k / 48) * Math.PI * 2
				const z = Math.max(GLOBE_CUT * R, -Math.sqrt(R * R - r * r))
				behind(r * Math.cos(angle), r * Math.sin(angle), z, 'globe')
			}
		}
		// The lids, the conjunctiva and the curtain; the lids and the curtain
		// follow the gaze (lid-follow.glsl), the lids keep the clearance up to 60°
		// of pitch, the curtain's deep end stays inside.
		for (const [index, { positions, follow }] of parts.entries()) {
			for (let v = 0; v < positions.length / 3; v++) {
				const [x, y, z] = point(positions, v)
				if (Math.hypot(x / LID_PATCH.width, y / LID_PATCH.height) > 0.95) continue
				behind(x, y, z, `part ${index}`)
				const weight = follow[v * 2 + 1]
				if (weight === 0) continue
				for (const pitch of [-60, -30, 30, 60]) {
					const turn = (pitch * Math.PI) / 180
					const angle = -turn * (0.35 + 0.55 * follow[v * 2]) * weight
					const c = Math.cos(angle)
					const s = Math.sin(angle)
					const [ty, tz] = [c * y - s * z, s * y + c * z]
					if (index === 0) behind(x, ty, tz, `lid at ${pitch}°`)
					else assert.ok(tz > back.heightAt(x, ty), `curtain at ${pitch}°: ${x}, ${ty}, ${tz}`)
				}
			}
		}
		// The skin near the edge stands on the band, in front of the dome.
		const { positions } = parts[0]
		for (let v = 0; v < positions.length / 3; v++) {
			const [x, y, z] = point(positions, v)
			const rho = Math.hypot(x / LID_PATCH.width, y / LID_PATCH.height)
			if (rho > 0.95 && rho < 0.999) assert.ok(z > back.heightAt(x, y), `skin at ${x}, ${y}`)
		}
	}
})

test('only the hidden parts move inside: the fornix past the globe, the curtain under its margin', () => {
	for (const side of [1, -1]) {
		const { eye, raw, parts } = build(params.lids, side)
		const [fornix, curtain] = parts.slice(1)
		let moved = 0
		for (let v = 0; v < fornix.positions.length / 3; v++) {
			const before = point(raw[0].positions, v)
			const after = point(fornix.positions, v)
			if (after[2] === before[2]) continue
			moved++
			assert.ok(after[2] > before[2], 'it only rises')
			// Past the conjunctiva's start, where it no longer lies on the globe.
			const r = Math.hypot(before[0], before[1])
			assert.ok(r > 0.96 * eye.scleraRadius, `fornix moved at ${r}`)
		}
		assert.ok(moved > 0, 'the upper fornix reached past the shell')
		// The curtain keeps its top row, on the posterior margin, and its depth
		// into the sac shrinks with its rise.
		const rows = curtain.positions.length / 3 / SIZE.around
		for (let i = 0; i < SIZE.around; i++) {
			const v = i * rows
			assert.deepEqual(point(curtain.positions, v), point(raw[1].positions, v))
			for (let j = 1; j < rows; j++) {
				const rise = curtain.positions[(v + j) * 3 + 2] - raw[1].positions[(v + j) * 3 + 2]
				const shrink = raw[1].depth[v + j] - curtain.depth[v + j]
				assert.ok(Math.abs(Math.min(rise, raw[1].depth[v + j]) - shrink) < 1e-4)
			}
		}
	}
})

test('a larger clearance or band pushes the dome back', () => {
	const near = build(params.lids, 1, { ...params.shell, clearance: 1 })
	const far = build(params.lids, 1, { ...params.shell, clearance: 6 })
	const wide = build(params.lids, 1, { ...params.shell, clearance: 1, band: 4 })
	assert.ok(far.back.thickness > near.back.thickness)
	assert.ok(far.back.heightAt(0, 0) < near.back.heightAt(0, 0) - 4)
	assert.ok(wide.back.heightAt(20, 20) < near.back.heightAt(20, 20))
	// Deterministic.
	assert.deepEqual(build().back.positions, build().back.positions)
})

test('skin coordinates: unrolled into the patch, continuous over the band onto the dome', () => {
	const { back, lid } = build()
	const { positions, coords, indices } = back
	const coord = (v) => [coords[v * 2], coords[v * 2 + 1]]
	const edge = new Map()
	for (let i = 0; i < lid.rim.length / 3; i++) {
		const p = point(lid.rim, i)
		edge.set(key(p), p)
	}
	// On the patch's edge they are the front plane's, as on the lids.
	const byPosition = new Map()
	for (let v = 0; v < positions.length / 3; v++) {
		const p = point(positions, v)
		const [u, w] = coord(v)
		const at = edge.get(key(p))
		if (at) {
			assert.ok(Math.hypot(u - at[0], w - at[1]) < 1e-4, 'the edge keeps its coordinates')
		}
		// Inside the patch, where the skin patterns are baked.
		assert.ok(Math.hypot(u / LID_PATCH.width, w / LID_PATCH.height) < 1 + 1e-4)
		// Coincident vertices (the band's back edge and the dome's) share them.
		const id = key(p)
		if (byPosition.has(id)) {
			const [u0, w0] = byPosition.get(id)
			assert.ok(Math.hypot(u - u0, w - w0) < 1e-4, `seam at ${id}`)
		} else byPosition.set(id, [u, w])
	}
	// Unrolled without folding (every triangle turns the same way, seen from
	// outside the shell: clockwise in the front plane) or much stretching.
	for (let t = 0; t < indices.length; t += 3) {
		const [a, b, c] = indices.subarray(t, t + 3)
		const n = triangleNormal(positions, a, b, c)
		const area = Math.hypot(...n) / 2
		if (area < 1e-6) continue
		const [p, q, r] = [a, b, c].map(coord)
		const flat = ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2
		assert.ok(flat < 0, `folded at ${point(positions, a)}`)
		const stretch = -flat / area
		assert.ok(stretch > 0.4 && stretch < 1.6, `stretch ${stretch}`)
	}
})
