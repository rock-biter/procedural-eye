// Eyelid geometry (pure): the palpebral fissure, the lid margins and the skin
// around them, as a ring of quads around the fissure. World space at primary
// gaze (the globe center is the origin; +X is the right of the picture, +Y up).
//
// The fissure is an almond: from the medial to the lateral canthus the upper
// margin arches up to MRD1 above the pupil center and the lower margin down to
// MRD2 below it (Rana 2023), the lateral canthus raised by the canthal tilt.
// Around it, each ring vertex (t, s) follows a profile across the lid: the
// posterior margin rests on the eye surface (cornea included, which the upper
// lid covers), the intermarginal strip rises `marginThickness` off the globe,
// a rounded anterior edge (where the lashes grow) turns into the skin, which
// keeps about `lidThickness` off the globe, folds at the upper crease, and
// blends into the face plane further out.
import { clamp01, smoothstep, vec3 } from '../math'

// Profile partition: s in [0, WALL) the intermarginal strip, [WALL, EDGE) the
// rounded anterior edge, [EDGE, 1] the skin.
export const LID_PROFILE = Object.freeze({ wall: 0.07, edge: 0.14, reach: 34 })

// Skewed arch in [0, 1] with its maximum at `peak` (0–1).
function arch(s, peak, sharpness) {
	const k = Math.log(0.5) / Math.log(Math.min(Math.max(peak, 0.05), 0.95))
	const u = clamp01(s) ** k
	return (4 * u * (1 - u)) ** sharpness
}

// The fissure outline in the front plane. `nasalSign` is +1 for a right eye
// (the nose toward +X).
export function createFissure(lids, nasalSign = 1) {
	const width = lids.fissureWidth
	const medialX = nasalSign * width * 0.52
	const lateralX = -nasalSign * width * 0.48
	const medialY = lids.medialHeight
	const lateralY = medialY + width * Math.tan((lids.canthalTilt * Math.PI) / 180)
	// Peak positions as a share of the way from the medial canthus.
	const upperPeak = 0.5 + lids.upperPeak
	const lowerPeak = 0.5 + lids.lowerPeak
	const baseline = (s) => medialY + (lateralY - medialY) * s
	// The arch amplitude whose extreme over the sloping baseline is `target`
	// (bisection: the extreme grows monotonically with the amplitude).
	const amplitudeFor = (target, peak, sharpness, sign) => {
		const extreme = (amplitude) => {
			let best = -Infinity
			for (let i = 0; i <= 200; i++) {
				const s = i / 200
				best = Math.max(best, sign * (baseline(s) + sign * amplitude * arch(s, peak, sharpness)))
			}
			return best
		}
		let low = 0
		let high = 40
		for (let i = 0; i < 50; i++) {
			const mid = (low + high) / 2
			if (extreme(mid) < sign * target) low = mid
			else high = mid
		}
		return (low + high) / 2
	}
	const upperAmplitude = amplitudeFor(lids.mrd1, upperPeak, lids.upperShape, 1)
	const lowerAmplitude = amplitudeFor(-lids.mrd2, lowerPeak, lids.lowerShape, -1)
	const x = (s) => medialX + (lateralX - medialX) * s
	const upper = (s) => [x(s), baseline(s) + upperAmplitude * arch(s, upperPeak, lids.upperShape)]
	const lower = (s) => [x(s), baseline(s) - lowerAmplitude * arch(s, lowerPeak, lids.lowerShape)]
	// t in [0, 0.5): upper margin medial → lateral; [0.5, 1): lower lateral → medial.
	const loop = (t) => {
		const u = ((t % 1) + 1) % 1
		return u < 0.5 ? upper(u * 2) : lower(2 - u * 2)
	}
	// Outward normal of the loop (away from the opening), by central difference.
	const normal = (t) => {
		const h = 1e-4
		const a = loop(t - h)
		const b = loop(t + h)
		const tx = b[0] - a[0]
		const ty = b[1] - a[1]
		const length = Math.hypot(tx, ty) || 1
		// The loop runs medial→lateral on top: for a right eye that is toward −X,
		// so the outward (upward) normal is (ty, −tx) / |t|; mirrored for left.
		return [(nasalSign * ty) / length, (-nasalSign * tx) / length]
	}
	return {
		upper,
		lower,
		loop,
		normal,
		medial: [medialX, medialY],
		lateral: [lateralX, lateralY],
		width,
	}
}

// Past this share of the sclera radius the support surface of the lids leaves
// the globe. The canthi lie beyond the globe's outline (a 27 mm fissure around
// a 24 mm globe), where the lids wrap around it toward the orbit: there the
// support leaves the sphere tangentially and its slope eases off over
// SUPPORT_EASE mm, so the margin stays smooth, outside the globe and about at
// the equator, instead of piling every vertex onto the outline.
const SUPPORT_EDGE = 0.96
const SUPPORT_EASE = 1.5

// Height and slope of the lids' support surface at radius r: the analytic eye
// profile, continued past SUPPORT_EDGE with a slope that eases off (C1, and
// above the sphere because it is never steeper than the sphere's tangent).
function supportProfile(eye, r) {
	const edge = eye.scleraRadius * SUPPORT_EDGE
	if (r <= edge) return { z: eye.surfaceZ(r), slope: eye.surfaceSlope(r) }
	const edgeSlope = eye.surfaceSlope(edge)
	const ease = Math.exp(-(r - edge) / SUPPORT_EASE)
	return {
		z: eye.surfaceZ(edge) + edgeSlope * SUPPORT_EASE * (1 - ease),
		slope: edgeSlope * ease,
	}
}

// Outward normal of a surface of revolution with dz/dr = slope at (x, y).
function profileNormal(x, y, slope) {
	const r = Math.hypot(x, y)
	const radial = r > 1e-9 ? [x / r, y / r] : [0, 0]
	return vec3.normalize([-slope * radial[0], -slope * radial[1], 1])
}

// The eye surface point and outward normal under a front-plane point (world
// space at primary gaze): the analytic profile, continued past the globe's
// outline (supportProfile).
export function eyeSurfaceAt(eye, x, y) {
	const { z, slope } = supportProfile(eye, Math.hypot(x, y))
	return { point: [x, y, z], normal: profileNormal(x, y, slope) }
}

// Polynomial smooth maximum (iq), as in common.glsl.
function smoothMax(a, b, k) {
	const h = Math.max(k - Math.abs(a - b), 0) / k
	return Math.max(a, b) + h * h * k * 0.25
}

// The skin surface away from the margin, `b` mm off the globe: the sphere
// grown by `b`, merged into the plane of the face (brow above, cheek below,
// blended by height so the canthi have no seam). Offsetting first and merging
// second keeps the concave orbit rim from folding the offset surface.
function skinSurface(eye, lids, x, y, b) {
	const r = Math.hypot(x, y)
	const radius = eye.scleraRadius + b
	const sphere = Math.sqrt(Math.max(radius * radius - r * r, 0))
	const depth = lids.cheekDepth + (lids.browDepth - lids.cheekDepth) * smoothstep(-7, 7, y)
	return [x, y, smoothMax(sphere, eye.apexZ - depth, 4)]
}

// The smooth sclera-sphere normal under a front-plane point (the support's
// past the support edge).
function sphereNormal(eye, x, y) {
	const r = Math.hypot(x, y)
	const edge = eye.scleraRadius * SUPPORT_EDGE
	if (r > edge) return profileNormal(x, y, supportProfile(eye, r).slope)
	return vec3.normalize([x, y, eye.scleraZ(r)])
}

// The loop normal averaged over a window that widens away from the margin
// (`far` 0–1): around the canthi the outward directions turn by more than
// 90°, and averaging fans the outer skin evenly instead of in a few huge
// triangles. The samples sit on a grid fixed along the loop, not at offsets
// from t, and the kernel is smooth and compact: the average then turns
// smoothly with t across the corners, where the loop normal jumps (offset
// samples would cross the jump one by one and fold the outer skin).
function smoothedNormal(fissure, t, far) {
	const sigma = 0.003 + 0.06 * far
	const radius = 3 * sigma
	const step = sigma / 4
	let x = 0
	let y = 0
	for (let k = Math.ceil((t - radius) / step); k <= Math.floor((t + radius) / step); k++) {
		const u = k * step
		const w = (1 - ((u - t) / radius) ** 2) ** 3
		const [nx, ny] = fissure.normal(u)
		x += nx * w
		y += ny * w
	}
	const length = Math.hypot(x, y) || 1
	return [x / length, y / length]
}

// Margin thickness shrinks to nothing at the canthi.
function cantalTaper(t) {
	const u = ((t % 1) + 1) % 1
	const side = u < 0.5 ? u * 2 : 2 - u * 2
	return smoothstep(0, 0.12, side) * smoothstep(0, 0.12, 1 - side)
}

// World position of ring vertex (t, s), plus whether it is on the upper lid.
export function lidPoint(t, s, fissure, eye, lids) {
	const u = ((t % 1) + 1) % 1
	const upperLid = u < 0.5
	const [mx, my] = fissure.loop(t)
	const [nx, ny] = smoothedNormal(
		fissure,
		t,
		s < LID_PROFILE.edge ? 0 : (s - LID_PROFILE.edge) / (1 - LID_PROFILE.edge),
	)
	const taper = cantalTaper(t)
	const margin = lids.marginThickness * (0.15 + 0.85 * taper)
	const edgeRadius = Math.min(0.45, margin * 0.4)
	const gap = 0.03
	const { wall, edge, reach } = LID_PROFILE

	// Profile coordinates: `a` along the skin away from the fissure (mm, in the
	// front plane), `b` off the eye surface along its normal (mm).
	let a
	let b
	if (s < wall) {
		a = 0
		b = gap + (margin - edgeRadius - gap) * (s / wall)
	} else if (s < edge) {
		const phi = Math.PI - (Math.PI / 2) * ((s - wall) / (edge - wall))
		a = edgeRadius + edgeRadius * Math.cos(phi)
		b = margin - edgeRadius + edgeRadius * Math.sin(phi)
	} else {
		const k = (s - edge) / (1 - edge)
		a = edgeRadius + (reach - edgeRadius) * k ** 1.7
		const thick = margin + (lids.lidThickness - margin) * smoothstep(0, 6, a)
		const crease = upperLid
			? lids.creaseDepth * taper * Math.exp(-(((a - lids.creaseHeight) / 2.2) ** 2))
			: 0
		b = thick - crease
	}
	const x = mx + nx * a
	const y = my + ny * a
	// The margin rests on the real eye surface (cornea included); further away
	// the lid is thick enough to ride a smooth sphere, so the corneal bulge
	// does not print through the skin.
	// Near the margin: the real eye surface (cornea included) offset along the
	// smooth sphere normal, so the corneal bulge does not fold the margin where
	// it crosses the limbus. Further out: the skin surface.
	const contact = eyeSurfaceAt(eye, x, y)
	const nearMargin = vec3.madd(contact.point, sphereNormal(eye, x, y), b)
	const skin = skinSurface(eye, lids, x, y, b)
	const k = smoothstep(0.3, 3, a)
	const p = vec3.add(vec3.scale(nearMargin, 1 - k), vec3.scale(skin, k))
	return { position: p, upperLid, a, b }
}

// How much a lid vertex follows the gaze: fully at the margin, not at all
// far up the skin (lid-follow.glsl).
export function followWeight(a) {
	return 1 - smoothstep(3, 14, a)
}

// Upper-lid share along the fissure loop, blended across the canthi.
export function upperShare(t) {
	const u = ((t % 1) + 1) % 1
	const side = u < 0.5 ? u * 2 : 2 - u * 2
	const edge = Math.min(side, 1 - side)
	return u < 0.5 ? 0.5 + 0.5 * smoothstep(0, 0.08, edge) : 0.5 - 0.5 * smoothstep(0, 0.08, edge)
}

// Ring mesh data: `around` vertices along the fissure loop, `across` along the
// profile. Attribute `lid` = (t, s, a, upper ? 1 : 0).
export function createLidMesh(lids, eye, nasalSign = 1, { around = 320, across = 96 } = {}) {
	const fissure = createFissure(lids, nasalSign)
	const positions = new Float32Array(around * across * 3)
	const lid = new Float32Array(around * across * 4)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const t = i / around
		for (let j = 0; j < across; j++) {
			const s = j / (across - 1)
			const point = lidPoint(t, s, fissure, eye, lids)
			const index = i * across + j
			positions.set(point.position, index * 3)
			lid.set([t, s, point.a, point.upperLid ? 1 : 0], index * 4)
			follow.set([upperShare(t), followWeight(point.a)], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			// Front faces toward +Z: the loop runs clockwise (seen from the front)
			// for a right eye, counter-clockwise for a left one.
			indices.set(nasalSign > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d], k)
			k += 6
		}
	}
	return { positions, lid, follow, indices, fissure }
}

// The conjunctival fornix and caruncle at the canthi: where the fissure
// reaches past the globe's outline, the opening shows the tissue the
// conjunctiva folds into, not the background. An annulus on the lids' support
// surface past SUPPORT_EDGE, dipping under the globe at its inner edge so the
// sclera meets it in a clean line; the lids cover all but the corners. The
// skin program shades it as wet mucosa (`lid` s = 0); it does not follow the
// gaze. Front faces toward +Z.
export function createFornixMesh(eye, { around = 256, across = 24, reach = 22 } = {}) {
	const inner = eye.scleraRadius * SUPPORT_EDGE
	const positions = new Float32Array(around * across * 3)
	const lid = new Float32Array(around * across * 4)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const angle = (i / around) * Math.PI * 2
		const cx = Math.cos(angle)
		const cy = Math.sin(angle)
		for (let j = 0; j < across; j++) {
			// Denser toward the inner edge, where it meets the sclera.
			const r = inner + (reach - inner) * (j / (across - 1)) ** 2
			const dip = 0.06 * (1 - smoothstep(0, 0.3, r - inner))
			const index = i * across + j
			positions.set([cx * r, cy * r, supportProfile(eye, r).z - dip], index * 3)
			lid.set([i / around, 0, r - inner, cy > 0 ? 1 : 0], index * 4)
			follow.set([cy > 0 ? 1 : 0, 0], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			indices.set([a, c, b, a, d, c], k)
			k += 6
		}
	}
	return { positions, lid, follow, indices }
}

// The tear meniscus: a concave water fillet in the corner between the lid's
// intermarginal strip and the eye surface, along both margins, its radius
// tapering at the canthi (lower about 0.36 mm, upper smaller: Yokoi 1999,
// Shen 2008). Attribute `meniscus` = (t, φ across the fillet, radius).
export function createMeniscusMesh(lids, eye, nasalSign = 1, { around = 320, across = 10 } = {}) {
	const fissure = createFissure(lids, nasalSign)
	const positions = new Float32Array(around * across * 3)
	const normals = new Float32Array(around * across * 3)
	const meniscus = new Float32Array(around * across * 3)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const t = i / around
		const upperLid = t < 0.5
		const radius = (upperLid ? lids.meniscusUpper : lids.meniscusLower) * cantalTaper(t)
		const [mx, my] = fissure.loop(t)
		const [nx, ny] = fissure.normal(t)
		for (let j = 0; j < across; j++) {
			const phi = (j / (across - 1)) * (Math.PI / 2)
			// Arc center at a = −R (into the opening), b = R (off the globe).
			const a = -radius + radius * Math.sin(phi)
			const b = 0.03 + radius - radius * Math.cos(phi)
			const x = mx + nx * a
			const y = my + ny * a
			const contact = eyeSurfaceAt(eye, x, y)
			const up = sphereNormal(eye, x, y)
			const p = vec3.madd(contact.point, up, b)
			// The water surface faces the arc center.
			const outward = [nx, ny, 0]
			const normal = vec3.normalize(
				vec3.add(vec3.scale(outward, -Math.sin(phi)), vec3.scale(up, Math.cos(phi))),
			)
			const index = i * across + j
			positions.set(p, index * 3)
			normals.set(normal, index * 3)
			meniscus.set([t, j / (across - 1), radius], index * 3)
			follow.set([upperShare(t), 1], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			indices.set(nasalSign > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d], k)
			k += 6
		}
	}
	return { positions, normals, meniscus, follow, indices }
}
