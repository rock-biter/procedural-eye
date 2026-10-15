// Eyelid geometry (pure): the palpebral fissure, the lid margins and the skin
// around them, as a ring of quads around the fissure. World space at primary
// gaze (the globe center is the origin; +X is the right of the picture, +Y up).
//
// The fissure is an almond: from the medial to the lateral canthus the upper
// margin arches up to MRD1 above the pupil center and the lower margin down to
// MRD2 below it (Rana 2023), the lateral canthus raised by the canthal tilt.
// Around it the surface is built from the volumes of the region, as a sculptor
// blocks them out:
// - the margins: the posterior margin rests on the eye surface (cornea
//   included, which the upper lid covers), the intermarginal strip rises
//   `marginThickness` off the globe, a rounded anterior edge carries the lashes;
// - the lids (lidShell()): two convex crescent bands wrapped over the globe,
//   the upper one up to its crease, the lower one down to the lid–cheek
//   junction, both narrowing toward the canthi where they meet;
// - the face around the orbit (faceDepth()): the brow ridge over the upper
//   lid, the cheek below, the nose, the lateral orbital rim and the temple;
//   past the edge of each band the skin turns from the lid into the face (from
//   the crease up under the brow, from the lid–cheek junction onto the cheek).
//
// Seeded by `lids.seed`, the margins wander a little off their arches, the
// tissue is uneven, soft folds run along the lids and fan out of the lateral
// canthus (skinRelief()), and the face is a little asymmetric.
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

const bell = (value, center, width) => Math.exp(-(((value - center) / width) ** 2))

// 0 at the medial canthus, 1 at the lateral one, for loop parameter t.
function sideOf(t) {
	const u = ((t % 1) + 1) % 1
	return u < 0.5 ? u * 2 : 2 - u * 2
}

// The face around the orbit: its depth behind the corneal apex (mm, negative
// in front of it) at front-plane point (x, y), `nasalSign` +1 when the nose is
// toward +X. A height field summed from the volumes of the region:
// - the orbital opening, about 38 × 34 mm, centered near the pupil, where the
//   face falls back (the lids cover it; deeper under the brow than above the
//   cheek), within a rim 6 mm behind the apex;
// - the brow ridge: an arch over the eye at `browDepth`, its underside steep
//   down to the crease, fading laterally toward the orbital rim and medially
//   into the glabella;
// - the cheek: a broad swell below and lateral of the eye, at `cheekDepth`;
//   the cheekbone keeps it forward under the lateral canthus;
// - the nose: rising medially to its bridge, about 31 mm from the axis;
// - the lateral orbital rim, far back, and the temple (`templeDepth`);
// - the forehead receding above the brow;
// - a seeded asymmetry (`irregularity`) away from the lids.
export function faceDepth(lids, x, y, nasalSign = 1) {
	const n = x * nasalSign
	const RIM = 6
	const opening = Math.hypot((n - 1) / 19, (y - 1) / 17)
	// Deeper under the brow, shallow below, where the lower lid flows into
	// the cheek.
	const socket = 0.5 + 3.5 * smoothstep(-8, 8, y)
	let depth = RIM + socket * (1 - smoothstep(0.7, 1.05, opening))
	// The brow ridge: higher in the middle, bending down toward the lateral rim.
	const browY = 18.5 - 0.004 * n * n - 0.006 * Math.max(0, -n) ** 2
	const below = y < browY
	const brow =
		bell(y, browY, below ? 5.5 : 8) * smoothstep(-28, -6, n) * (1 - smoothstep(20, 32, n))
	depth -= (RIM - lids.browDepth) * brow
	// The cheek, below and lateral of the eye.
	depth -= (RIM - lids.cheekDepth) * Math.exp(-(((n + 6) / 18) ** 2) - ((y + 15.5) / 10) ** 2)
	// The nose: its side rising to the bridge, then falling to the other eye.
	const noseSpan = 1 - smoothstep(18, 30, Math.abs(y + 2))
	depth -= 13 * smoothstep(12, 31, n) * noseSpan
	depth += 1.2 * Math.max(0, n - 31) * noseSpan
	// The lateral orbital rim and the temple behind it, at the canthus and
	// above: lower down the cheekbone stands forward.
	const lateral = smoothstep(12, 22, -n) * (1 - 0.7 * smoothstep(-6, -18, y))
	depth += (7 + lids.templeDepth * smoothstep(16, 30, -n)) * lateral
	// The forehead and the lower face recede.
	depth += 0.03 * Math.max(0, y - 22) ** 2 + 0.02 * Math.max(0, -y - 30) ** 2
	const seed = lidSeed(lids) + 30
	const asymmetry =
		(lids.irregularity ?? 0) *
		smoothstep(0.9, 1.2, opening) *
		(0.8 * noise2(x / 11, y / 11, seed) + 0.3 * noise2(x / 4.5, y / 4.5, seed + 1))
	return depth + asymmetry
}

// Height (z) of a dome over the globe, the sclera sphere grown by `b` mm,
// continued past 0.88 of its radius by its tangent, so it never stands up in
// a wall at its outline (at the lateral canthus).
function domeZ(eye, r, b) {
	const radius = eye.scleraRadius + b
	const edge = 0.88 * radius
	const edgeZ = Math.sqrt(radius * radius - edge * edge)
	return r < edge ? Math.sqrt(radius * radius - r * r) : edgeZ - (edge / edgeZ) * (r - edge)
}

// The surface around the lids at front-plane point (x, y): the dome `b` mm off
// the globe merged by smooth maximum into the face (faceDepth()), so neither
// can cut into the other.
function outerSurface(eye, lids, x, y, b, nasalSign) {
	const face = eye.apexZ - faceDepth(lids, x, y, nasalSign)
	return [x, y, smoothMax(domeZ(eye, Math.hypot(x, y), b), face, 4)]
}

// Outward normal of the outer surface, averaged over a few millimeters (wide
// central differences): the relief rides on it.
function outerNormal(eye, lids, x, y, b, nasalSign) {
	const h = 2.5
	const at = (dx, dy) => outerSurface(eye, lids, x + dx, y + dy, b, nasalSign)
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
// triangles. The samples sit on grids fixed along the loop, not at offsets
// from t, and the kernel is smooth and compact: the average then turns
// smoothly with t across the corners, where the loop normal jumps (offset
// samples would cross the jump one by one and fold the outer skin). The grid
// steps are powers of two, the average blended between the two around the
// window's width, so it also changes smoothly with `far` (a step following
// the width would move the samples, and the dense rows of the lid fold would
// zigzag around the corners).
function smoothedNormal(fissure, t, far) {
	const sigma = 0.003 + 0.06 * far
	const radius = 3 * sigma
	const average = (step) => {
		let x = 0
		let y = 0
		let total = 0
		for (let k = Math.ceil((t - radius) / step); k <= Math.floor((t + radius) / step); k++) {
			const u = k * step
			const w = (1 - ((u - t) / radius) ** 2) ** 3
			const [nx, ny] = fissure.normal(u)
			x += nx * w
			y += ny * w
			total += w
		}
		return [x / total, y / total]
	}
	const level = Math.log2(sigma / 4)
	const low = Math.floor(level)
	const f = level - low
	const fine = average(2 ** low)
	const coarse = average(2 ** (low + 1))
	const x = fine[0] + (coarse[0] - fine[0]) * f
	const y = fine[1] + (coarse[1] - fine[1]) * f
	const length = Math.hypot(x, y) || 1
	return [x / length, y / length]
}

// Margin thickness shrinks to nothing at the canthi.
function cantalTaper(t) {
	const u = ((t % 1) + 1) % 1
	const side = u < 0.5 ? u * 2 : 2 - u * 2
	return smoothstep(0, 0.12, side) * smoothstep(0, 0.12, 1 - side)
}

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

// The crescent of a lid band along it (`side` 0–1 from the medial canthus):
// 0 at the canthi, 1 at `peak`, rounded, with no kink at the ends.
function crescent(side, peak) {
	const k = Math.log(0.5) / Math.log(peak)
	const u = clamp01(side) ** k
	return Math.sin(Math.PI * u * u * (3 - 2 * u))
}

// The lid bands' height at the canthi (mm), where the upper and lower meet.
const CANTHAL_BAND = 2

// The lid band at loop parameter t: its height from the margin (mm along the
// skin; to the crease on the upper lid, `creaseHeight` in the middle, to the
// lid–cheek junction on the lower lid, `lowerHeight`), its crescent (0 at the
// canthi), and its thickness off the globe (the upper lid `lidThickness`, the
// lower one 0.7 of it, blended across the canthi).
function lidBand(lids, t) {
	const upper = ((t % 1) + 1) % 1 < 0.5
	const side = sideOf(t)
	const shape = crescent(side, upper ? 0.45 : 0.55)
	const middle = upper ? lids.creaseHeight : lids.lowerHeight
	const wave = 0.5 * lids.irregularity * loopNoise(t, 3, lidSeed(lids) + 4)
	const share = upperShare(t)
	return {
		upper,
		shape,
		height: CANTHAL_BAND + (middle - CANTHAL_BAND + wave) * shape,
		thickness: lids.lidThickness * (0.7 + 0.3 * share),
		fullness: upper ? lids.fullness : lids.bags,
	}
}

// The lid's thickness off the globe at `a` mm from the margin, starting from
// `margin` (the anterior edge): it reaches the band's thickness within
// 2.5 mm in the middle of the lid (6 mm at the canthi, where the lids wrap
// past the globe's outline and a steep rise would fold them), swells by the band's fullness around 0.6 of its height (the convex
// lid over the tarsus and the fat behind the septum, rising gently off the
// margin), and dips into the groove at its
// edge, the crease (`creaseDepth`) or the lid–cheek junction. Returns the
// thickness and the groove (≥ 0, for the shading).
function lidShell(lids, band, a, margin) {
	const base = margin + (band.thickness - margin) * smoothstep(0, 6 - 3.5 * band.shape, a)
	const swell =
		band.fullness *
		band.shape *
		bell(a, 0.6 * band.height, 0.3 * band.height) *
		smoothstep(0.5, 2.5, a)
	const depth = band.upper ? lids.creaseDepth : 0.25 + 0.2 * lids.bags
	const groove =
		depth * band.shape * bell(a, band.height, band.upper ? 0.6 + 0.3 * lids.creaseDepth : 1.3)
	return { thickness: base + swell - groove, groove }
}

// The seeded relief of the skin at `a` mm from the margin, front-plane point
// (x, y): `offset` (mm along the surface normal) and `grooves` (≥ 0, for the
// shading). Every term that depends on the place along the lid vanishes at the
// canthi; the rest depends on (x, y) only.
function skinRelief(lids, fissure, t, a, x, y, upperLid) {
	const side = sideOf(t)
	const seed = lidSeed(lids)
	// Soft-tissue unevenness, growing away from the margin.
	const offset =
		0.16 *
		lids.irregularity *
		(noise2(x / 4.5, y / 4.5, seed + 2) + 0.4 * noise2(x / 1.9, y / 1.9, seed + 3)) *
		smoothstep(1, 5, a)
	let grooves = 0
	const [medialX, medialY] = fissure.medial
	const [lateralX, lateralY] = fissure.lateral
	// Outward along the fissure axis, from the medial to the lateral canthus.
	const ox = (lateralX - medialX) / fissure.width
	const oy = (lateralY - medialY) / fissure.width
	// The tear trough: a groove from below the medial canthus down and out.
	{
		const sx = x - medialX - ox * 1.5
		const sy = y - medialY + 4
		const dx = ox * 0.55
		const dy = -0.83
		const along = sx * dx + sy * dy
		const across = Math.abs(sx * dy - sy * dx)
		const reach = smoothstep(-1, 2, along) * (1 - smoothstep(6, 14, along)) * smoothstep(2.5, 5, a)
		grooves += 0.35 * lids.bags * reach * bell(across, 0, 1.4)
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
	// crow's feet laterally; finer and deeper on the thin lower lid.
	const lidFolds =
		smoothstep(1.8, 3.5, a) * (1 - smoothstep(14, 20, a)) * (1 - fan) * smoothstep(0, 0.15, side)
	if (lidFolds > 0) {
		const spacing = upperLid ? 1.6 : 1.25
		const depth = upperLid ? 0.1 : 0.13
		const phase = (a + 0.7 * noise2(x / 3.2, y / 3.2, seed + 22)) / spacing
		grooves += depth * lids.folds * lidFolds * foldLines(phase, x, y, 0.24, seed + 23)
	}
	return { offset: offset - grooves, grooves }
}

// World position of ring vertex (t, s), whether it is on the upper lid, the
// distance `a` from the margin, the outward direction in the front plane
// (`across`, along which `a` grows), the depth of the grooves (`fold`, ≤ 0)
// and the band's height (for the gaze follow).
export function lidPoint(t, s, fissure, eye, lids) {
	const u = ((t % 1) + 1) % 1
	const upperLid = u < 0.5
	const [mx, my] = fissure.loop(t)
	const taper = cantalTaper(t)
	// The margin's thickness and the roundness of its anterior edge vary a
	// little along the lid, not near the canthi, where the lids meet.
	const seed = lidSeed(lids)
	const side = sideOf(t)
	const away = smoothstep(0.1, 0.3, Math.min(side, 1 - side))
	const vary = (k, cycles) => 1 + 0.2 * lids.irregularity * away * loopNoise(t, cycles, seed + k)
	const margin = lids.marginThickness * (0.15 + 0.85 * taper) * vary(0, 5)
	const edgeRadius = Math.min(0.65, margin * 0.42) * vary(1, 4)
	const gap = 0.03
	const { wall, edge, reach } = LID_PROFILE
	const band = lidBand(lids, t)

	// Profile coordinates: `a` along the skin away from the fissure (mm, in the
	// front plane), `b` off the eye surface along its normal (mm).
	let a
	let b
	let groove = 0
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
		;({ thickness: b, groove } = lidShell(lids, band, a, margin))
	}
	const far = s < edge ? 0 : (s - edge) / (1 - edge)
	const [nx, ny] = smoothedNormal(fissure, t, far)
	const x = mx + nx * a
	const y = my + ny * a

	// The lid: the eye surface (cornea included) offset along the smooth
	// sphere normal near the margin, so the corneal bulge does not fold it,
	// turning within 3 mm into a dome over the globe. The lower lid rests on
	// the cheek too where the cheek stands in front of that dome (it does not
	// sink between globe and cheek); the lid–cheek groove is cut after.
	const nasalSign = Math.sign(fissure.medial[0] - fissure.lateral[0])
	const contact = eyeSurfaceAt(eye, x, y)
	const drape = vec3.madd(contact.point, sphereNormal(eye, x, y), b)
	const k = smoothstep(0.3, 3, a)
	let p = drape
	if (k > 0) {
		const r = Math.hypot(x, y)
		let z = domeZ(eye, r, b)
		// Full on the lower lid, none on the upper, blended across the canthi.
		const rest = 1 - upperShare(t)
		if (rest > 0) {
			const face = eye.apexZ - faceDepth(lids, x, y, nasalSign)
			z += (smoothMax(domeZ(eye, r, b + groove), face, 3) - groove - z) * rest
		}
		p = vec3.lerp(drape, [x, y, z], k)
	}
	let fold = -groove
	if (s >= edge) {
		// Past the band's edge the skin turns into the face around the orbit.
		const edgeThickness = band.thickness
		const turn = smoothstep(band.height, band.height + (band.upper ? 3.5 : 4.5), a)
		if (turn > 0) p = vec3.lerp(p, outerSurface(eye, lids, x, y, edgeThickness, nasalSign), turn)
		// The relief, along the averaged normal, kept 0.3 mm clear of the globe.
		const relief = skinRelief(lids, fissure, t, a, x, y, upperLid)
		const normal = outerNormal(eye, lids, x, y, edgeThickness, nasalSign)
		const offset = smoothMax(b + relief.offset, 0.3, 0.3) - b
		p = vec3.madd(p, normal, offset)
		fold -= relief.grooves
	}
	return { position: p, upperLid, a, b, across: [nx, ny], fold, band: band.height }
}

// How much a lid vertex follows the gaze (lid-follow.glsl): fully over most
// of its lid band, not at all once past its edge (the brow and the cheek
// stay put).
export function followWeight(a, bandHeight = 8) {
	return 1 - smoothstep(0.5 * bandHeight, bandHeight + 3, a)
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
			follow.set([upperShare(t), followWeight(point.a, point.band)], index * 2)
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
export function createFornixMesh(eye, { around = 256, across = 24, reach = 16 } = {}) {
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
			// It dips under the globe at its inner edge, and falls back past 14 mm,
			// behind the skin, which recedes there toward the temple.
			const dip = 0.06 * (1 - smoothstep(0, 0.3, r - inner)) + 1.5 * Math.max(0, r - 14) ** 2
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
