// Ambient occlusion baked into the lid mesh (pure): how much of the sky each
// vertex sees past the surfaces around it, deep in the canthi, along the
// posterior margins, in the crease. The skin, the conjunctiva and the globe are
// drawn into a height field seen from the front; each vertex then looks for
// the horizon in a few directions over that field (horizon-based ambient
// occlusion, Bavoil 2008), within OCCLUSION.radius. A surface that hangs
// into the conjunctival sac behind the margins (the palpebral conjunctiva) is
// a wall the field sees only edge-on: it darkens with its depth below the
// margin instead, over OCCLUSION.sac mm. The lids are at rest: the gaze moves
// them only a little.
import { smoothstep } from '../math'

export const OCCLUSION = Object.freeze({
	// The field: half width and height (mm) and its cell (mm).
	halfWidth: 24,
	halfHeight: 18,
	cell: 0.1,
	// Directions around each vertex, steps along each and how far they reach.
	directions: 8,
	steps: 14,
	radius: 3,
	// The fall-off (mm) of the light into the sac.
	sac: 0.8,
})

// The front height field: the highest z of the triangles over each cell, and
// of the globe under them.
function heightField(meshes, eye, settings) {
	const { halfWidth, halfHeight, cell } = settings
	const width = Math.round((2 * halfWidth) / cell)
	const height = Math.round((2 * halfHeight) / cell)
	const field = new Float32Array(width * height).fill(-Infinity)
	for (let j = 0; j < height; j++) {
		const y = -halfHeight + (j + 0.5) * cell
		for (let i = 0; i < width; i++) {
			const x = -halfWidth + (i + 0.5) * cell
			const r = Math.hypot(x, y)
			if (r < eye.scleraRadius) field[j * width + i] = eye.surfaceZ(r)
		}
	}
	const toI = (x) => (x + halfWidth) / cell - 0.5
	const toJ = (y) => (y + halfHeight) / cell - 0.5
	for (const { positions, indices } of meshes) {
		for (let t = 0; t < indices.length; t += 3) {
			const a = indices[t] * 3
			const b = indices[t + 1] * 3
			const c = indices[t + 2] * 3
			const ax = toI(positions[a])
			const ay = toJ(positions[a + 1])
			const bx = toI(positions[b])
			const by = toJ(positions[b + 1])
			const cx = toI(positions[c])
			const cy = toJ(positions[c + 1])
			const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
			if (Math.abs(area) < 1e-9) continue
			const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx)))
			const i1 = Math.min(width - 1, Math.floor(Math.max(ax, bx, cx)))
			const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy)))
			const j1 = Math.min(height - 1, Math.floor(Math.max(ay, by, cy)))
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					const w0 = ((bx - i) * (cy - j) - (cx - i) * (by - j)) / area
					const w1 = ((cx - i) * (ay - j) - (ax - i) * (cy - j)) / area
					const w2 = 1 - w0 - w1
					if (w0 < 0 || w1 < 0 || w2 < 0) continue
					const z = w0 * positions[a + 2] + w1 * positions[b + 2] + w2 * positions[c + 2]
					const k = j * width + i
					if (z > field[k]) field[k] = z
				}
			}
		}
	}
	return { field, width, height }
}

// Area-weighted vertex normals, turned toward the viewer (+Z).
export function vertexNormals(positions, indices) {
	const normals = new Float32Array(positions.length)
	for (let t = 0; t < indices.length; t += 3) {
		const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
		const e1 = [0, 1, 2].map((k) => positions[b + k] - positions[a + k])
		const e2 = [0, 1, 2].map((k) => positions[c + k] - positions[a + k])
		const n = [
			e1[1] * e2[2] - e1[2] * e2[1],
			e1[2] * e2[0] - e1[0] * e2[2],
			e1[0] * e2[1] - e1[1] * e2[0],
		]
		for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normals[v + k] += n[k]
	}
	let facing = 0
	for (let v = 0; v < normals.length; v += 3) facing += normals[v + 2]
	const sign = facing < 0 ? -1 : 1
	for (let v = 0; v < normals.length; v += 3) {
		const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1
		for (let k = 0; k < 3; k++) normals[v + k] *= sign / length
	}
	return normals
}

// Ambient occlusion of the vertices of `meshes` (each { positions, indices,
// and optionally `bakes(v)`, which vertices to bake, the others staying open,
// and `depth`, the vertices' depths into the sac }), 1 open to 0 closed, in
// the meshes' order.
export function bakeLidOcclusion(meshes, eye, settings = OCCLUSION) {
	const { field, width, height } = heightField(meshes, eye, settings)
	const { halfWidth, halfHeight, cell, directions, steps, radius } = settings
	const sample = (x, y) => {
		const i = Math.round((x + halfWidth) / cell - 0.5)
		const j = Math.round((y + halfHeight) / cell - 0.5)
		if (i < 0 || j < 0 || i >= width || j >= height) return -Infinity
		return field[j * width + i]
	}
	const ways = Array.from({ length: directions }, (_, d) => {
		const angle = ((d + 0.5) / directions) * 2 * Math.PI
		return [Math.cos(angle), Math.sin(angle)]
	})
	// Steps denser near the vertex; nearer occluders count more.
	const reach = Array.from({ length: steps }, (_, k) => ((k + 1) / steps) ** 1.5 * radius)
	const falloff = reach.map((r) => 1 - smoothstep(0.3 * radius, radius, r))
	const sine = (slope) => slope / Math.sqrt(1 + slope * slope)
	const result = []
	for (const { positions, indices, bakes, depth } of meshes) {
		const normals = vertexNormals(positions, indices)
		const ao = new Float32Array(positions.length / 3).fill(1)
		for (let v = 0; v < ao.length; v++) {
			const x = positions[v * 3]
			const y = positions[v * 3 + 1]
			if (Math.abs(x) > halfWidth - radius || Math.abs(y) > halfHeight - radius) continue
			if (bakes && !bakes(v)) continue
			// Just off the surface, so it does not see itself.
			const z = positions[v * 3 + 2] + 0.05
			const nx = normals[v * 3]
			const ny = normals[v * 3 + 1]
			const nz = Math.max(normals[v * 3 + 2], 0.2)
			let occlusion = 0
			for (const [dx, dy] of ways) {
				// Slopes: of the tangent plane in this direction, of the horizon.
				const tangent = -(nx * dx + ny * dy) / nz
				let horizon = tangent
				let weight = 0
				for (let k = 0; k < steps; k++) {
					const r = reach[k]
					const slope = (sample(x + dx * r, y + dy * r) - z) / r
					if (slope > horizon) {
						horizon = slope
						weight = Math.max(weight, falloff[k])
					}
				}
				occlusion += Math.min(1, sine(horizon) - sine(tangent)) * weight
			}
			ao[v] = 1 - occlusion / directions
			if (depth) ao[v] *= Math.exp(-depth[v] / settings.sac)
		}
		result.push(ao)
	}
	return result
}
