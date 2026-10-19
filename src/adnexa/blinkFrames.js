// The blink's frames (pure): the lid ring, the tear meniscus and the lashes
// closed by steps from where `lids.closure` rests them to closed, which the
// lid meshes morph through (src/adnexa/lidBlink.js). A closure keeps the
// meshes' layout (src/adnexa/lidGeometry.js), so vertex i of every frame is
// vertex i of the open mesh, moved. Each frame of the lid ring bakes its own
// ambient occlusion, so the occlusion follows the closing lid instead of
// staying where it was baked at rest.
//
// The margin travels about 9 mm over the cornea's bulge: blended in a straight
// line from open to closed it would stray up to 1.5 mm from its path, into it.
// A Catmull–Rom spline through the open mesh and BLINK_FRAMES frames
// (blinkWeights()) keeps the margin within 0.08 mm of the lid rebuilt at that
// closure. The rest of the lid stays within 0.35 mm: the fold over the crease
// unfolds as the lid closes (src/adnexa/lidGeometry.js), so its groove sweeps
// across the rows, and between two frames it is their blend.
import { createEyeGeometry } from '../eye/eyeProfile'
import { bakeFissureMap } from './fissureMap'
import { generateLashes, lashTubes } from './lashGenerator'
import { createConjunctivaMesh, createLidMesh, createMeniscusMesh } from './lidGeometry'
import { bakeLidOcclusion } from './lidOcclusion'

export const BLINK_FRAMES = 4

// The closures of the frames past the open one (`closure`, where the lids
// rest), evenly up to closed.
export function blinkClosures(closure, count = BLINK_FRAMES) {
	return Array.from({ length: count }, (_, k) => closure + ((1 - closure) * (k + 1)) / count)
}

// The weights of frames 1 to `count` (the open mesh takes the rest) at the
// blink's closure `blink` (0 open, 1 closed): a uniform Catmull–Rom spline
// through the open mesh and the frames, continued straight past both ends.
// All 0 when open, frame `count` alone when closed.
export function blinkWeights(blink, count = BLINK_FRAMES) {
	const weights = new Array(count).fill(0)
	const x = Math.min(Math.max(blink, 0), 1) * count
	const j = Math.min(Math.floor(x), count - 1)
	const u = x - j
	const u2 = u * u
	const u3 = u2 * u
	const basis = [
		(-u3 + 2 * u2 - u) / 2,
		(3 * u3 - 5 * u2 + 2) / 2,
		(-3 * u3 + 4 * u2 + u) / 2,
		(u3 - u2) / 2,
	]
	// Point i: 0 the open mesh (its weight is the rest), `count` the closed
	// frame. The points past the ends are reflected: P(−1) = 2 P(0) − P(1).
	const add = (i, w) => {
		if (i >= 1) weights[i - 1] += w
	}
	basis.forEach((w, k) => {
		const i = j - 1 + k
		if (w === 0) return
		if (i < 0) {
			add(0, 2 * w)
			add(1, -w)
		} else if (i > count) {
			add(count, 2 * w)
			add(count - 1, -w)
		} else add(i, w)
	})
	return weights
}

// Area-weighted vertex normals of a triangle mesh, as three.js computes them.
export function vertexNormals(positions, indices) {
	const normals = new Float32Array(positions.length)
	for (let t = 0; t < indices.length; t += 3) {
		const a = indices[t] * 3
		const b = indices[t + 1] * 3
		const c = indices[t + 2] * 3
		// (C − B) × (A − B)
		const cx = positions[c] - positions[b]
		const cy = positions[c + 1] - positions[b + 1]
		const cz = positions[c + 2] - positions[b + 2]
		const ax = positions[a] - positions[b]
		const ay = positions[a + 1] - positions[b + 1]
		const az = positions[a + 2] - positions[b + 2]
		const nx = cy * az - cz * ay
		const ny = cz * ax - cx * az
		const nz = cx * ay - cy * ax
		for (const v of [a, b, c]) {
			normals[v] += nx
			normals[v + 1] += ny
			normals[v + 2] += nz
		}
	}
	for (let v = 0; v < normals.length; v += 3) {
		const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2])
		if (length > 0) {
			normals[v] /= length
			normals[v + 1] /= length
			normals[v + 2] /= length
		}
	}
	return normals
}

// The frames for `params`: per closure of blinkClosures(), the lid ring
// (`lids`, positions, normals and occlusion, when `lids` is set: it takes most
// of the time), the meniscus (positions, normals) and the lashes (positions,
// normals, tangents); and `fissure`, the fissure map closed (bakeFissureMap()),
// with the lids.
export function createBlinkFrames(params, { lids: withLids = true } = {}) {
	const eye = createEyeGeometry(params)
	const side = eye.nasalSign
	// The open lashes' rings orient the closing ones.
	const { references } = lashTubes(generateLashes(params, eye))
	const frames = { lids: withLids ? [] : null, meniscus: [], lashes: [], fissure: null }
	// The conjunctiva, which the occlusion sees around the opening (it does not
	// move; under the lids it is hidden).
	const fornix = withLids
		? { ...createConjunctivaMesh(params.lids, eye, side), bakes: () => false }
		: null
	// The lids at rest lay the mesh out (its rows, columns and quads'
	// diagonals), so the frames' vertices and triangles are theirs.
	const layout = withLids ? createLidMesh(params.lids, eye, side).layout : null
	for (const closure of blinkClosures(params.lids.closure)) {
		const lids = { ...params.lids, closure }
		if (withLids) {
			const ring = createLidMesh(lids, eye, side, { layout })
			// Baked over the lid band, as src/adnexa/lids.js bakes the rest.
			const band = { ...ring, bakes: (v) => ring.lid[v * 4 + 2] < 10 }
			frames.lids.push({
				positions: ring.positions,
				normals: vertexNormals(ring.positions, ring.indices),
				ao: bakeLidOcclusion([band, fornix], eye)[0],
			})
		}
		const meniscus = createMeniscusMesh(lids, eye, side)
		frames.meniscus.push({ positions: meniscus.positions, normals: meniscus.normals })
		const tubes = lashTubes(generateLashes({ ...params, lids }, eye), references)
		frames.lashes.push({
			positions: tubes.positions,
			normals: tubes.normals,
			tangents: tubes.tangents,
		})
	}
	if (withLids) frames.fissure = bakeFissureMap({ ...params.lids, closure: 1 }, side)
	return frames
}

// The buffers of `frames`, to transfer them to another thread.
export function frameBuffers(frames) {
	const buffers = []
	for (const list of [frames.lids ?? [], frames.meniscus, frames.lashes]) {
		for (const frame of list) for (const array of Object.values(frame)) buffers.push(array.buffer)
	}
	if (frames.fissure) buffers.push(frames.fissure.buffer)
	return buffers
}
