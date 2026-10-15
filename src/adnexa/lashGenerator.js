// Seeded eyelash generator (pure): roots along the anterior lid margin in
// irregular rows, each lash a curve that leaves the lid tilted away from the
// fissure and curls further that way, with length varying along the lid,
// random deviations, clumps whose tips draw together, and a tapered tip
// (Kikuchi 2015, Thibaut 2010, Aumond & Bitton 2018: docs/RESEARCH.md).
// Output: centerlines with radii, ready for tube geometry (src/adnexa/lashes.js).
import { smoothstep, vec3 } from '../math'
import { createRandom } from '../random'
import { createFissure, LID_PROFILE, lidPoint } from './lidGeometry'

export const LASH_SEGMENTS = 14

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
		const span = upper ? [0.06, 0.44] : [0.56, 0.92]
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
