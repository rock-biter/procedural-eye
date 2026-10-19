// Seeded eyelash generator (pure): roots along the anterior lid margin in
// irregular rows, each lash a curve that leaves the lid tilted away from the
// fissure and curls further that way, with length varying along the lid,
// random deviations, clumps whose tips draw together, and a tapered tip
// (Kikuchi 2015, Thibaut 2010, Aumond & Bitton 2018: docs/RESEARCH.md).
// Output: centerlines with radii, ready for tube geometry (src/adnexa/lashes.js).
import { smoothstep, vec3 } from '../math'
import { createRandom } from '../random'
import { createFissure } from './fissure'
import { LID_PROFILE, lidPoint } from './lidGeometry'

export const LASH_SEGMENTS = 14
// Sides of each lash's tube.
export const LASH_SIDES = 6
const SIDES = LASH_SIDES

// Local frame of the lid surface at (t, s): the point, the outward skin
// normal, the direction across the lid away from the fissure, and along it.
function lidFrame(t, s, fissure, eye, lids) {
	const p = lidPoint(t, s, fissure, eye, lids).position
	const h = 1e-3
	const across = vec3.normalize(vec3.sub(lidPoint(t, s + 0.02, fissure, eye, lids).position, p))
	const along = vec3.normalize(
		vec3.sub(
			lidPoint(t + h, s, fissure, eye, lids).position,
			lidPoint(t - h, s, fissure, eye, lids).position,
		),
	)
	let normal = vec3.normalize(vec3.cross(along, across))
	// Away from the globe.
	if (vec3.dot(normal, p) < 0) normal = vec3.scale(normal, -1)
	return { p, normal, across, along }
}

// Rotates `v` toward the unit `toward` (made orthogonal to `v`) by `angle`.
function tilt(v, toward, angle) {
	const ortho = vec3.normalize(vec3.sub(toward, vec3.scale(v, vec3.dot(toward, v))))
	return vec3.normalize(
		vec3.add(vec3.scale(v, Math.cos(angle)), vec3.scale(ortho, Math.sin(angle))),
	)
}

function lashRow(side, settings, fissure, eye, lids, random) {
	const upper = side === 'upper'
	const count = Math.round(upper ? settings.upperCount : settings.lowerCount)
	const rows = upper ? 3 : 2
	const lengthBase = upper ? settings.upperLength : settings.lowerLength
	const lift = ((upper ? settings.upperLift : settings.lowerLift) * Math.PI) / 180
	const curl = upper ? settings.upperCurl : settings.lowerCurl
	const lashes = []
	// The edge between the intermarginal strip and the skin.
	const edgeS = (LID_PROFILE.wall + LID_PROFILE.edge) / 2
	for (let i = 0; i < count; i++) {
		// u: 0 at the medial end, 1 at the lateral end of the lashed margin.
		const u = (i + 0.5 + (random() - 0.5) * 0.9) / count
		// From the lacrimal punctum, about a fifth of the way from the medial
		// canthus (no lashes on the lacrimal part of the margin), to the lateral
		// canthus.
		const span = upper ? [0.1, 0.485] : [0.52, 0.9]
		// Upper t runs medial → lateral, lower t lateral → medial.
		const t = upper ? span[0] + (span[1] - span[0]) * u : span[1] - (span[1] - span[0]) * u
		const row = Math.floor(random() * rows)
		const s = edgeS + row * 0.012 + random() * 0.006
		// Root on the rounded edge; the lift is measured from the skin normal
		// just past it (on the edge the surface still half faces the fissure).
		const frame = lidFrame(t, LID_PROFILE.edge + 0.015 + row * 0.012, fissure, eye, lids)
		frame.p = lidPoint(t, s, fissure, eye, lids).position
		// Shorter toward the medial canthus, longest from the center outward.
		const profile = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.95 * u) ** 0.85)
		const length = lengthBase * profile * (0.8 + 0.35 * random()) * (1 - 0.12 * row)
		const deviation = (random() - 0.5) * 0.35 * settings.randomness
		let direction = tilt(
			frame.normal,
			frame.across,
			lift + (random() - 0.5) * 0.25 * settings.randomness,
		)
		direction = tilt(direction, frame.along, deviation)
		const lashCurl = curl * (0.75 + 0.5 * random())
		lashes.push({
			side,
			root: frame.p,
			direction,
			across: frame.across,
			length,
			curl: lashCurl,
			radius: (settings.thickness / 2) * (0.75 + 0.45 * random()) * (1 - 0.1 * row),
			clump: 0,
			u,
		})
	}
	// Clumps: runs of neighbors whose tips converge.
	lashes.sort((a, b) => a.u - b.u)
	let clump = 0
	for (let i = 0; i < lashes.length;) {
		const size = 2 + Math.floor(random() * 4)
		for (let k = i; k < Math.min(i + size, lashes.length); k++) lashes[k].clump = clump
		clump++
		i += size
	}
	return lashes
}

// Centerline of a lash: LASH_SEGMENTS + 1 points, bending toward `across`.
export function lashCenterline(lash) {
	const points = [lash.root]
	let p = lash.root
	const step = lash.length / LASH_SEGMENTS
	for (let k = 0; k < LASH_SEGMENTS; k++) {
		const u = (k + 0.5) / LASH_SEGMENTS
		const direction = tilt(lash.direction, lash.across, lash.curl * (Math.PI / 2) * u ** 1.4)
		p = vec3.madd(p, direction, step)
		points.push(p)
	}
	return points
}

export function generateLashes(params, eye) {
	const settings = params.lashes
	const lids = params.lids
	const fissure = createFissure(lids, eye.nasalSign)
	const random = createRandom(`lashes:${settings.seed}`)
	const lashes = [
		...lashRow('upper', settings, fissure, eye, lids, random),
		...lashRow('lower', settings, fissure, eye, lids, random),
	]
	const centerlines = lashes.map((lash) => lashCenterline(lash))
	// Pull each clump's tips toward their mean, more toward the tip.
	const byClump = new Map()
	lashes.forEach((lash, i) => {
		const key = `${lash.side}:${lash.clump}`
		if (!byClump.has(key)) byClump.set(key, [])
		byClump.get(key).push(i)
	})
	for (const members of byClump.values()) {
		if (members.length < 2) continue
		const tip = members.reduce((sum, i) => vec3.add(sum, centerlines[i].at(-1)), [0, 0, 0])
		const mean = vec3.scale(tip, 1 / members.length)
		for (const i of members) {
			const line = centerlines[i]
			const offset = vec3.sub(mean, line.at(-1))
			for (let k = 1; k < line.length; k++) {
				const w = settings.clumping * smoothstep(0.3, 1, k / LASH_SEGMENTS) * 0.6
				line[k] = vec3.madd(line[k], offset, w)
			}
		}
	}
	return lashes.map((lash, i) => ({ ...lash, points: centerlines[i] }))
}

// How much thicker the lashes are at camera `distance` (a share of their
// radius): `share` at the zoom-out end of `limits` ([zoom in, zoom out]
// distances), none at the zoom-in end, linear between on the log of the
// distance, as the HUD's zoom level runs.
export function lashWidening(distance, [near, far], share) {
	const level = Math.log(distance / near) / Math.log(far / near)
	return share * Math.min(Math.max(level, 0), 1)
}

// Tube geometry along every lash: parallel-transported rings, radius tapering
// over the last third. Attributes: positions, normals, tangents (along the
// lash), `lash` = (place along it, 0 root to 1 tip; a random per lash),
// `radii` (the ring's radius, which the lashes widen by as the camera zooms
// out) and `follow` = (upper lid, 1), and the triangles. `references`: the vector each
// lash's first ring is oriented by (returned); pass those of the open lids
// for a closing one, so the rings of the blink's frames correspond.
export function lashTubes(lashes, references = null) {
	const ringCount = lashes.reduce((sum, lash) => sum + lash.points.length, 0)
	const positions = new Float32Array(ringCount * SIDES * 3)
	const normals = new Float32Array(ringCount * SIDES * 3)
	const tangents = new Float32Array(ringCount * SIDES * 3)
	const attributes = new Float32Array(ringCount * SIDES * 2)
	const radii = new Float32Array(ringCount * SIDES)
	const follow = new Float32Array(ringCount * SIDES * 2)
	const indices = []
	const used = []
	let vertex = 0
	for (const [index, lash] of lashes.entries()) {
		const points = lash.points
		const random = ((index * 2654435761) % 1000) / 1000
		const first = vec3.normalize(vec3.sub(points[1], points[0]))
		let reference = references?.[index] ?? (Math.abs(first[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
		used.push(reference)
		const start = vertex
		for (let k = 0; k < points.length; k++) {
			const previous = points[Math.max(k - 1, 0)]
			const next = points[Math.min(k + 1, points.length - 1)]
			const tangent = vec3.normalize(vec3.sub(next, previous))
			const side = vec3.normalize(vec3.cross(tangent, reference))
			const up = vec3.cross(side, tangent)
			reference = up
			const u = k / (points.length - 1)
			const radius = lash.radius * (1 - 0.85 * Math.max(0, (u - 0.6) / 0.4) ** 1.5)
			for (let j = 0; j < SIDES; j++) {
				const angle = (j / SIDES) * Math.PI * 2
				const normal = vec3.add(vec3.scale(side, Math.cos(angle)), vec3.scale(up, Math.sin(angle)))
				positions.set(vec3.madd(points[k], normal, radius), vertex * 3)
				normals.set(normal, vertex * 3)
				tangents.set(tangent, vertex * 3)
				attributes.set([u, random], vertex * 2)
				radii[vertex] = radius
				follow.set([lash.side === 'upper' ? 1 : 0, 1], vertex * 2)
				vertex++
			}
		}
		for (let k = 0; k < points.length - 1; k++) {
			for (let j = 0; j < SIDES; j++) {
				const a = start + k * SIDES + j
				const b = start + k * SIDES + ((j + 1) % SIDES)
				const c = a + SIDES
				const d = b + SIDES
				indices.push(a, c, b, b, c, d)
			}
		}
	}
	return {
		positions,
		normals,
		tangents,
		lash: attributes,
		radii,
		follow,
		indices: new Uint32Array(indices),
		references: used,
	}
}
