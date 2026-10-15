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
//
// Nothing is mathematically perfect: seeded by `lids.seed`, the margins
// wander a little off their arches, the margin thickness and the crease vary
// along the lid, the preseptal skin hoods the crease, the lower lid has its
// pretarsal roll, sulcus, fat pads and lid–cheek junction, and soft folds run
// along the lids and fan out of the lateral canthus (skinRelief()).
import { clamp01, smoothstep, vec3 } from '../math'
import { hash01 } from '../random'

// Profile partition: s in [0, WALL) the intermarginal strip, [WALL, EDGE) the
// rounded anterior edge, [EDGE, 1] the skin.
export const LID_PROFILE = Object.freeze({ wall: 0.07, edge: 0.14, reach: 34 })

// Samples of the margins' arc-length tables.
const ARC_SAMPLES = 256

// Skewed arch in [0, 1] with its maximum at `peak` (0–1).
function arch(s, peak, sharpness) {
	const k = Math.log(0.5) / Math.log(Math.min(Math.max(peak, 0.05), 0.95))
	const u = clamp01(s) ** k
	return (4 * u * (1 - u)) ** sharpness
}

// Seeded 2D gradient noise (quintic fade), about [-1, 1].
export function noise2(x, y, seed) {
	const ix = Math.floor(x)
	const iy = Math.floor(y)
	const fx = x - ix
	const fy = y - iy
	const corner = (i, j) => {
		const angle = 2 * Math.PI * hash01(ix + i, iy + j, seed)
		return Math.cos(angle) * (fx - i) + Math.sin(angle) * (fy - j)
	}
	const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
	const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
	const a = corner(0, 0)
	const b = corner(1, 0)
	const c = corner(0, 1)
	const d = corner(1, 1)
	return 1.4 * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy)
}

// Seeded noise along a closed curve parameter u (period 1), with about
// `cycles` undulations per period: the noise sampled on a circle.
function loopNoise(u, cycles, seed) {
	const radius = cycles / (2 * Math.PI)
	const angle = 2 * Math.PI * u
	return noise2(radius * Math.cos(angle) + 17.3, radius * Math.sin(angle) - 5.1, seed)
}

// Integer seed of the lid features (`lids.seed`, 1 when absent).
function lidSeed(lids) {
	return (Math.round(lids.seed ?? 1) * 64) >>> 0
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
	// A margin is not a perfect arch: it wanders off it by up to about 0.12 mm
	// (`irregularity`), in two or three gentle undulations that vanish at the
	// canthi. The amplitudes below include it, so MRD1 and MRD2 still hold.
	const seed = lidSeed(lids)
	const wander = (s, k) =>
		0.12 *
		(lids.irregularity ?? 0) *
		Math.sin(Math.PI * clamp01(s)) ** 1.5 *
		noise2(clamp01(s) * 2.6, 0.5 + 3 * k, seed + k)
	// The arch amplitude whose extreme over the sloping baseline is `target`
	// (bisection: the extreme grows monotonically with the amplitude).
	const amplitudeFor = (target, peak, sharpness, sign, k) => {
		const extreme = (amplitude) => {
			let best = -Infinity
			for (let i = 0; i <= 200; i++) {
				const s = i / 200
				best = Math.max(
					best,
					sign * (baseline(s) + sign * amplitude * arch(s, peak, sharpness) + wander(s, k)),
				)
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
	const upperAmplitude = amplitudeFor(lids.mrd1, upperPeak, lids.upperShape, 1, 0)
	const lowerAmplitude = amplitudeFor(-lids.mrd2, lowerPeak, lids.lowerShape, -1, 1)
	const x = (s) => medialX + (lateralX - medialX) * s
	const upper = (s) => [
		x(s),
		baseline(s) + upperAmplitude * arch(s, upperPeak, lids.upperShape) + wander(s, 0),
	]
	const lower = (s) => [
		x(s),
		baseline(s) - lowerAmplitude * arch(s, lowerPeak, lids.lowerShape) + wander(s, 1),
	]
	// t in [0, 0.5): upper margin medial → lateral; [0.5, 1): lower lateral → medial.
	const loop = (t) => {
		const u = ((t % 1) + 1) % 1
		return u < 0.5 ? upper(u * 2) : lower(2 - u * 2)
	}
	// Outward normal of the loop (away from the opening), by central difference.
	// Memoized: the mesh averages it over grids of samples shared by every
	// vertex of a ring row (smoothedNormal()).
	const normals = new Map()
	const normal = (t) => {
		let n = normals.get(t)
		if (n) return n
		const h = 1e-4
		const a = loop(t - h)
		const b = loop(t + h)
		const tx = b[0] - a[0]
		const ty = b[1] - a[1]
		const length = Math.hypot(tx, ty) || 1
		// The loop runs medial→lateral on top: for a right eye that is toward −X,
		// so the outward (upward) normal is (ty, −tx) / |t|; mirrored for left.
		n = [(nasalSign * ty) / length, (-nasalSign * tx) / length]
		normals.set(t, n)
		return n
	}
	// Arc length along each margin from the medial canthus (tables over the
	// arch parameter), for `along`: 0 at the medial, 1 at the lateral canthus.
	const arcTable = (curve) => {
		const lengths = new Float64Array(ARC_SAMPLES + 1)
		let previous = curve(0)
		for (let i = 1; i <= ARC_SAMPLES; i++) {
			const p = curve(i / ARC_SAMPLES)
			lengths[i] = lengths[i - 1] + Math.hypot(p[0] - previous[0], p[1] - previous[1])
			previous = p
		}
		return lengths
	}
	const arcs = [arcTable(upper), arcTable(lower)]
	const along = (t) => {
		const u = ((t % 1) + 1) % 1
		const lengths = arcs[u < 0.5 ? 0 : 1]
		const f = (u < 0.5 ? u * 2 : 2 - u * 2) * ARC_SAMPLES
		const i = Math.min(Math.floor(f), ARC_SAMPLES - 1)
		const length = lengths[i] + (lengths[i + 1] - lengths[i]) * (f - i)
		return length / lengths[ARC_SAMPLES]
	}
	return {
		upper,
		lower,
		loop,
		normal,
		along,
		medial: [medialX, medialY],
		lateral: [lateralX, lateralY],
		width,
		// Margin lengths (mm), upper and lower.
		lengths: arcs.map((lengths) => lengths[ARC_SAMPLES]),
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
// second keeps the concave orbit rim from folding the offset surface. The
// face recedes toward the temple (`templeDepth`, reached about 16 mm lateral
// of the axis, `lateralSign` the side of the lateral canthus), so the skin
// slopes back past the lateral canthus, which lies about at the globe's
// equator, instead of standing up in a wall in front of it.
function skinSurface(eye, lids, x, y, b, lateralSign) {
	const r = Math.hypot(x, y)
	const radius = eye.scleraRadius + b
	const sphere = Math.sqrt(Math.max(radius * radius - r * r, 0))
	const depth =
		lids.cheekDepth +
		(lids.browDepth - lids.cheekDepth) * smoothstep(-7, 7, y) +
		lids.templeDepth * smoothstep(4, 16, x * lateralSign)
	return [x, y, smoothMax(sphere, eye.apexZ - depth, 4)]
}

// Outward normal of the skin surface, averaged over a few millimeters (wide
// central differences): the relief rides on it, and the true normal turns too
// fast where the globe's offset meets the face plane, where a fold or a fat
// pad a millimeter or two high would fold the offset surface over.
function skinNormal(eye, lids, x, y, b, lateralSign) {
	const h = 2.5
	const at = (dx, dy) => skinSurface(eye, lids, x + dx, y + dy, b, lateralSign)
	return vec3.normalize(vec3.cross(vec3.sub(at(h, 0), at(-h, 0)), vec3.sub(at(0, h), at(0, -h))))
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

const bell = (value, center, width) => Math.exp(-(((value - center) / width) ** 2))

// Soft fold lines across `phase` (in units of their mean spacing), at
// irregular positions and depths, each broken into segments along the skin
// (2D noise at the front-plane point x, y): a sum of bumps of `width`.
function foldLines(phase, x, y, width, seed) {
	const k = Math.floor(phase)
	let sum = 0
	for (let j = k - 1; j <= k + 1; j++) {
		const center = j + 0.2 + 0.6 * hash01(j, 7, seed)
		const depth = 0.4 + 0.6 * hash01(j, 9, seed)
		const segment = smoothstep(-0.2, 0.35, noise2(x / 2.4 + 0.37 * j, y / 2.4 - 0.53 * j, seed))
		sum += depth * segment * bell(phase, center, width)
	}
	return sum
}

// The seeded relief of the lid skin at profile distance `a` (mm) from the
// margin, front-plane point (x, y): `offset` (mm along the surface normal)
// and `fold`, the grooves among it (≤ 0, for the shading). Every term that
// depends on the place along the lid vanishes at the canthi, where the upper
// and lower halves of the ring meet; the rest depends on (x, y) only.
function skinRelief(lids, fissure, t, a, x, y, upperLid) {
	const u = ((t % 1) + 1) % 1
	// 0 at the medial, 1 at the lateral canthus.
	const side = u < 0.5 ? u * 2 : 2 - u * 2
	const middle = Math.sin(Math.PI * side)
	const taper = cantalTaper(t)
	const seed = lidSeed(lids)
	const irregular = lids.irregularity
	const wave = (k, cycles) => loopNoise(t, cycles, seed + k)
	const vary = (k, cycles, amount) => Math.max(0, 1 + amount * irregular * wave(k, cycles))
	// Soft-tissue unevenness, growing away from the margin.
	let offset =
		0.16 *
		irregular *
		(noise2(x / 4.5, y / 4.5, seed + 2) + 0.4 * noise2(x / 1.9, y / 1.9, seed + 3)) *
		smoothstep(1, 5, a)
	let grooves = 0
	if (upperLid) {
		// The crease: closer to the margin toward the canthi, wandering, its
		// depth varying along it.
		const height = lids.creaseHeight * (0.62 + 0.38 * middle ** 0.6) + 0.7 * irregular * wave(4, 3)
		grooves +=
			lids.creaseDepth * taper * vary(5, 4, 0.45) * bell(a, height, 0.8 + 0.3 * lids.creaseDepth)
		// Hooding: the preseptal skin rolls down onto the crease, most on the
		// lateral side.
		const hood = lids.hooding * Math.sin(Math.PI * side ** 1.4) ** 0.8 * vary(6, 3, 0.35)
		offset += hood * bell(a, height + 1.3 + 0.6 * lids.hooding, 1.6 + 0.6 * lids.hooding)
		// An accessory crease above it, in broken segments.
		const accessory =
			0.4 * lids.folds * lids.creaseDepth * taper * smoothstep(-0.3, 0.5, wave(7, 5))
		grooves += accessory * bell(a, height + 2.8 + 0.6 * wave(8, 4), 0.6)
	} else {
		const fade = smoothstep(0, 0.2, side) * smoothstep(0, 0.2, 1 - side)
		// The pretarsal roll of the orbicularis just under the lash line.
		offset += 0.14 * fade * vary(9, 3, 0.4) * bell(a, 2.4, 1.2)
		// The lower-lid sulcus, and the fat pads below it (three, the central
		// one fullest).
		const sulcus = 4.4 + 0.6 * lids.bags + 0.6 * irregular * wave(10, 3)
		grooves += (0.1 + 0.18 * lids.bags) * fade * vary(11, 4, 0.4) * bell(a, sulcus, 0.9)
		const pads = 0.8 + 0.2 * Math.cos(6 * Math.PI * (side - 0.5))
		offset +=
			lids.bags *
			middle ** 0.7 *
			pads *
			vary(12, 4, 0.3) *
			bell(a, sulcus + 2.4 + 0.8 * lids.bags, 1.9 + 0.6 * lids.bags)
	}
	const [medialX, medialY] = fissure.medial
	const [lateralX, lateralY] = fissure.lateral
	// Outward along the fissure axis, from the medial to the lateral canthus.
	const ox = (lateralX - medialX) / fissure.width
	const oy = (lateralY - medialY) / fissure.width
	// The tear trough: a groove from below the medial canthus down and out,
	// clear of the margin.
	{
		const sx = x - medialX - ox * 1.5
		const sy = y - medialY + 4
		const dx = ox * 0.55
		const dy = -0.83
		const along = sx * dx + sy * dy
		const across = Math.abs(sx * dy - sy * dx)
		const reach = smoothstep(-1, 2, along) * (1 - smoothstep(6, 14, along)) * smoothstep(2.5, 5, a)
		grooves += 0.55 * lids.bags * reach * bell(across, 0, 1.4)
	}
	// Crow's feet: folds fanning out of the lateral canthus, curving a little.
	const dx = x - lateralX
	const dy = y - lateralY
	const r = Math.hypot(dx, dy)
	const angle = Math.atan2(dy * ox - dx * oy, dx * ox + dy * oy)
	const fan =
		smoothstep(3, 7, r) * (1 - smoothstep(14, 22, r)) * (1 - smoothstep(0.8, 1.3, Math.abs(angle)))
	if (fan > 0) {
		const phase =
			(angle * 9 + 0.01 * r * r * Math.sign(angle) + 0.7 * noise2(x / 5, y / 5, seed + 20)) / 2.2
		grooves += 0.14 * lids.folds * fan * foldLines(phase, x, y, 0.22, seed + 21)
	}
	// Soft folds along the lids, irregular and broken, giving way to the
	// crow's feet laterally.
	const lidFolds =
		smoothstep(1.2, 3, a) * (1 - smoothstep(14, 20, a)) * (1 - fan) * smoothstep(0, 0.15, side)
	if (lidFolds > 0) {
		const phase = (a + 0.7 * noise2(x / 3.2, y / 3.2, seed + 22)) / 1.6
		grooves += 0.1 * lids.folds * lidFolds * foldLines(phase, x, y, 0.22, seed + 23)
	}
	return { offset: offset - grooves, fold: -grooves }
}

// World position of ring vertex (t, s), whether it is on the upper lid, the
// profile coordinates, the outward direction in the front plane (`across`,
// along which `a` grows) and the folds (skinRelief()).
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
	// The margin's thickness and the roundness of its anterior edge vary a
	// little along the lid, not near the canthi, where the lids meet.
	const seed = lidSeed(lids)
	const side = upperLid ? u * 2 : 2 - u * 2
	const away = smoothstep(0.1, 0.3, Math.min(side, 1 - side))
	const vary = (k, cycles) => 1 + 0.2 * lids.irregularity * away * loopNoise(t, cycles, seed + k)
	const margin = lids.marginThickness * (0.15 + 0.85 * taper) * vary(0, 5)
	const edgeRadius = Math.min(0.45, margin * 0.4) * vary(1, 4)
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
		b = margin + (lids.lidThickness - margin) * smoothstep(0, 6, a)
	}
	const x = mx + nx * a
	const y = my + ny * a
	// The relief of the skin, kept 0.3 mm clear of the globe.
	let offset = 0
	let fold = 0
	if (s >= edge) {
		const relief = skinRelief(lids, fissure, t, a, x, y, upperLid)
		offset = smoothMax(b + relief.offset, 0.3, 0.3) - b
		fold = relief.fold
	}
	// Near the margin: the real eye surface (cornea included) offset along the
	// smooth sphere normal, so the corneal bulge does not fold the margin where
	// it crosses the limbus. Further out: the skin surface, where the lid is
	// thick enough to ride a smooth sphere. The relief rides on both.
	const k = smoothstep(0.3, 3, a)
	const contact = eyeSurfaceAt(eye, x, y)
	let p = vec3.madd(contact.point, sphereNormal(eye, x, y), b + offset)
	if (k > 0) {
		const lateralSign = Math.sign(fissure.lateral[0] - fissure.medial[0])
		const skin = vec3.madd(
			skinSurface(eye, lids, x, y, b, lateralSign),
			skinNormal(eye, lids, x, y, b, lateralSign),
			offset,
		)
		p = vec3.add(vec3.scale(p, 1 - k), vec3.scale(skin, k))
	}
	return { position: p, upperLid, a, b: b + offset, across: [nx, ny], fold }
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
// profile. Attributes `lid` = (t, s, a, upper ? 1 : 0) and `relief` = (across x,
// across y, fold, along): the front-plane direction in which `a` grows, the
// folds (mm, ≤ 0) and the share of the way along the margin from the medial
// canthus (0) to the lateral one (1), continuous around the whole ring.
export function createLidMesh(lids, eye, nasalSign = 1, { around = 480, across = 144 } = {}) {
	const fissure = createFissure(lids, nasalSign)
	const positions = new Float32Array(around * across * 3)
	const lid = new Float32Array(around * across * 4)
	const relief = new Float32Array(around * across * 4)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const t = i / around
		const along = fissure.along(t)
		for (let j = 0; j < across; j++) {
			const s = j / (across - 1)
			const point = lidPoint(t, s, fissure, eye, lids)
			const index = i * across + j
			positions.set(point.position, index * 3)
			lid.set([t, s, point.a, point.upperLid ? 1 : 0], index * 4)
			relief.set([point.across[0], point.across[1], point.fold, along], index * 4)
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
	return { positions, lid, relief, follow, indices, fissure }
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
	const relief = new Float32Array(around * across * 4)
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
			relief.set([cx, cy, 0, 0], index * 4)
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
	return { positions, lid, relief, follow, indices }
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
