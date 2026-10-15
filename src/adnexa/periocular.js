// The surfaces the lids are built between (pure), world millimeters at primary
// gaze (the globe center at the origin, +Z toward the viewer, the nose toward
// +X for a right eye). Depths are millimeters behind the corneal apex
// (docs/RESEARCH.md).
// - The support, which the posterior lid margins rest on: the eye surface
//   (cornea included) in the middle; toward the canthi, where the lids pass in
//   front of the receding globe, a surface through the canthi (the medial one
//   about 4.5 mm behind the apex, the lateral one about 8.5, Liu 2023 and
//   Gao 2025 by 3D photogrammetry).
// - The conjunctiva behind them: the globe, past its outline turning back into
//   the fornix, and the caruncle in the medial canthus.
// - The face around the orbit: a thin-plate spline through anatomical
//   landmarks (brow, nasion and nasal dorsum, infraorbital rim and cheek,
//   lateral orbital rim and temple).
import { smoothstep, vec3 } from '../math'

// Share of the sclera radius past which the conjunctiva leaves the globe.
export const FORNIX_START = 0.96
// How far (mm) the fornix eases off past it: deep laterally, shallow medially.
const FORNIX_EASE = { lateral: 1.6, medial: 0.9 }
// The caruncle (about 5 mm high and 3 wide, Levy 2009): center from the medial
// canthus (mm along the chord), semi-axes along and across the chord, depth of
// its top behind the posterior margins there and its fall-off; lateral of it
// the plica semilunaris, a crescent fold about 2 mm wide (`at` mm from the
// canthus, its height, width, half its length and its curvature).
const CARUNCLE = { inset: 1.8, length: 1.7, height: 2.4, behind: 0.3, bulge: 1.3 }
const PLICA = { at: 4, height: 0.35, width: 0.6, length: 3.2, bend: 0.08 }
// The support surface through the canthi recedes above and below the chord.
const CANTHAL_CURVATURE = 0.012
// The blend between the eye surface and the canthal surface (mm). For it the
// globe leaves its sphere tangentially past SUPPORT_EDGE of its radius and its
// slope eases off over SUPPORT_EASE mm: it never turns into the sphere's
// vertical outline, which the margins could not follow.
const SUPPORT_BLEND = 4
const SUPPORT_EDGE = 0.88
const SUPPORT_EASE = 2
// The lids bridge the corneoscleral sulcus: the cornea and the sphere joined
// by a smooth maximum this wide (mm), not the eye surface's limbal groove.
const LIMBUS_BRIDGE = 0.8

// How loosely the face passes through its landmarks, and through the points
// the lids hand it, which it follows closely (thinPlate()).
const FACE_SMOOTHING = 60
const LID_SMOOTHING = 1

// Polynomial smooth maximum (iq), as in common.glsl.
export function smoothMax(a, b, k) {
	const h = Math.max(k - Math.abs(a - b), 0) / k
	return Math.max(a, b) + h * h * k * 0.25
}

// The chord coordinates of (x, y): share `s` from the medial (0) to the
// lateral canthus (1), and the distance above the chord.
function chordFrame(fissure, x, y) {
	const { medial, chord } = fissure
	const dx = x - medial[0]
	const dy = y - medial[1]
	return {
		s: (dx * chord.along[0] + dy * chord.along[1]) / chord.length,
		v: dx * chord.up[0] + dy * chord.up[1],
	}
}

// The eye surface, past `edge` (a share of the sclera radius) continued by a
// slope that eases off over `ease` mm (C1, never steeper than the sphere).
function easedGlobe(eye, r, edge, ease) {
	const start = eye.scleraRadius * edge
	if (r <= start) return eye.surfaceZ(r)
	return eye.surfaceZ(start) + eye.surfaceSlope(start) * ease * (1 - Math.exp(-(r - start) / ease))
}

// The globe under the lids: the sphere and the cornea, the sulcus between
// them bridged; past SUPPORT_EDGE as easedGlobe().
function lidGlobe(eye, r) {
	const start = eye.scleraRadius * SUPPORT_EDGE
	if (r > start) return easedGlobe(eye, r, SUPPORT_EDGE, SUPPORT_EASE)
	// The cornea's conic is defined out to about 9 mm, well past the limbus.
	const cornea = r < eye.limbusRadius + 2 ? eye.corneaZ(r) : -Infinity
	return Math.max(eye.surfaceZ(r), smoothMax(eye.scleraZ(r), cornea, LIMBUS_BRIDGE))
}

// Height of the margins' support at (x, y).
export function supportZ(eye, lids, fissure, x, y) {
	const { s, v } = chordFrame(fissure, x, y)
	// Through the canthi, set back by part of the margin's thickness, so the
	// skin at the canthi lies at the measured depths.
	const back = 0.6 * lids.marginThickness
	const medial = eye.apexZ - lids.medialDepth - back
	const lateral = eye.apexZ - lids.lateralDepth - back
	const canthal = medial + (lateral - medial) * s - CANTHAL_CURVATURE * v * v
	return smoothMax(lidGlobe(eye, Math.hypot(x, y)), canthal, SUPPORT_BLEND)
}

// The support point under (x, y) and its smooth outward normal: over the globe
// the sphere's (the lid is not drawn into the corneoscleral sulcus or over the
// cornea's bulge), elsewhere the support's, averaged over about 3 mm (the lid
// is thicker than the bend from the globe to the canthi is tight).
export function supportAt(eye, lids, fissure, x, y) {
	const h = 1.5
	const z = supportZ(eye, lids, fissure, x, y)
	const height = (px, py) => {
		const r = Math.min(Math.hypot(px, py), eye.scleraRadius * SUPPORT_EDGE)
		return supportZ(eye, lids, fissure, px, py) - (eye.surfaceZ(r) - eye.scleraZ(r))
	}
	const dx = (height(x + h, y) - height(x - h, y)) / (2 * h)
	const dy = (height(x, y + h) - height(x, y - h)) / (2 * h)
	return { point: [x, y, z], normal: vec3.normalize([-dx, -dy, 1]) }
}

// How far the support stands off the eye surface at (x, y) (mm): 0 where the
// margins rest on the globe, more toward the canthi.
export function supportLift(eye, lids, fissure, x, y) {
	return supportZ(eye, lids, fissure, x, y) - eye.surfaceZ(Math.hypot(x, y))
}

// Height of the conjunctiva at (x, y): the globe, continued past FORNIX_START
// by the fornix, whose slope eases off over a few millimeters, and the
// caruncle in the medial canthus.
export function conjunctivaZ(eye, lids, fissure, x, y) {
	const r = Math.hypot(x, y)
	const nasal = (eye.nasalSign * x) / Math.max(r, 1e-6)
	const ease =
		FORNIX_EASE.lateral + (FORNIX_EASE.medial - FORNIX_EASE.lateral) * smoothstep(-0.5, 0.5, nasal)
	const globe = easedGlobe(eye, r, FORNIX_START, ease)
	const { s, v } = chordFrame(fissure, x, y)
	const fromCanthus = s * fissure.chord.length
	// The plica: a fold over the globe, its crescent open toward the nose.
	const plica =
		PLICA.height *
		Math.exp(-(((fromCanthus - PLICA.at + PLICA.bend * v * v) / PLICA.width) ** 2)) *
		Math.exp(-((v / PLICA.length) ** 2))
	const u = (fromCanthus - CARUNCLE.inset) / CARUNCLE.length
	const w = v / CARUNCLE.height
	const top = eye.apexZ - lids.medialDepth - 0.6 * lids.marginThickness - CARUNCLE.behind
	return smoothMax(globe + plica, top - CARUNCLE.bulge * (u * u + w * w), 1)
}

// The face's landmarks: (nasal, up, depth in front of the apex), mm from the
// pupil center. Values from docs/RESEARCH.md (Yaremchuk 2001, Byrd & Hobar
// 1993, Migliori & Gladstone 1984, Gao 2025, Farkas 1994). Around the eye the
// lids hand it points of their shell (createFace()).
export function faceLandmarks(lids) {
	const brow = lids.browProjection
	const browY = lids.browHeight
	const nose = lids.noseProjection
	const midline = lids.noseDistance
	const cheek = lids.cheekProjection
	const rim = -lids.rimDepth
	const canthus = -lids.medialDepth
	return [
		// The brow: a roll over the supraorbital rim, its lower border at
		// `browHeight`, highest between the lateral limbus and the lateral
		// canthus, its head lower and a little back by the nose, its tail
		// falling back toward the temple.
		[-27, browY, -7],
		[-14, browY + 3.5, brow - 1.5],
		[-5, browY + 3.5, brow],
		[5, browY + 2.5, brow - 0.5],
		[15, browY + 1, brow - 2],
		// The forehead above it, a little behind.
		[-25, browY + 18, brow - 8],
		[0, browY + 18, brow - 2],
		[22, browY + 18, brow - 1.5],
		// The glabella between the brows, the nasion below it (about 6 mm above
		// the pupils), the dorsum at the canthi, projecting more downward.
		[midline, browY + 3, brow - 1],
		[midline, 6, nose - 2],
		[midline, -3, nose],
		[midline, -22, nose + 1.5],
		// The nasal sidewall, rising from its root by the medial canthus (the
		// root about 19 mm wide, Farkas), convex toward the dorsum.
		[midline - 4.5, -3, nose - 0.4 * (nose - canthus)],
		[midline - 9.5, -3, canthus + 1.5],
		[midline - 8, -20, canthus + 0.5 * (nose - canthus)],
		// Beside the medial canthus, a shallow recess (the canthi themselves
		// come with the lids).
		[20.5, 3, canthus],
		[20.5, -8, canthus - 1],
		// The lateral orbital rim (Hertel), about 8 mm lateral of the canthus
		// (Shin 2019), and the temple behind it.
		[-22.5, -1, rim],
		[-23, 9, rim + 7],
		[-33, 2, rim - 4],
		// The infraorbital rim and the cheek's prominence below and lateral of
		// the eye.
		[-4, -17, -3 + 0.5 * cheek],
		[8, -16, -3.5 + 0.5 * cheek],
		[-16, -16, -4.5 + 0.6 * cheek],
		[-24, -20, cheek - 1.5],
		[-12, -27, cheek - 0.5],
		[4, -29, cheek - 1],
		[18, -27, cheek + 1],
		// Down the cheek, receding.
		[-24, -38, cheek - 5],
		[6, -42, cheek - 3],
	]
}

// Thin-plate spline near the landmarks (z = Σ wᵢ φ(|p − pᵢ|) + a + b·x + c·y,
// φ(r) = r² log r): the smoothest surface that passes close to them. A point's
// fourth value (else `smoothing`) relaxes the interpolation at it.
export function thinPlate(points, smoothing = 0) {
	const n = points.length
	const size = n + 3
	const phi = (r) => (r > 1e-9 ? r * r * Math.log(r) : 0)
	const matrix = Array.from({ length: size }, () => new Float64Array(size))
	const rhs = new Float64Array(size)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			matrix[i][j] = phi(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]))
		}
		matrix[i][i] += points[i][3] ?? smoothing
		matrix[i][n] = matrix[n][i] = 1
		matrix[i][n + 1] = matrix[n + 1][i] = points[i][0]
		matrix[i][n + 2] = matrix[n + 2][i] = points[i][1]
		rhs[i] = points[i][2]
	}
	// Gaussian elimination with partial pivoting.
	for (let c = 0; c < size; c++) {
		let pivot = c
		for (let r = c + 1; r < size; r++) {
			if (Math.abs(matrix[r][c]) > Math.abs(matrix[pivot][c])) pivot = r
		}
		;[matrix[c], matrix[pivot]] = [matrix[pivot], matrix[c]]
		;[rhs[c], rhs[pivot]] = [rhs[pivot], rhs[c]]
		for (let r = c + 1; r < size; r++) {
			const f = matrix[r][c] / matrix[c][c]
			if (f === 0) continue
			for (let k = c; k < size; k++) matrix[r][k] -= f * matrix[c][k]
			rhs[r] -= f * rhs[c]
		}
	}
	const weights = new Float64Array(size)
	for (let r = size - 1; r >= 0; r--) {
		let value = rhs[r]
		for (let k = r + 1; k < size; k++) value -= matrix[r][k] * weights[k]
		weights[r] = value / matrix[r][r]
	}
	return (x, y) => {
		let z = weights[n] + weights[n + 1] * x + weights[n + 2] * y
		for (let i = 0; i < n; i++)
			z += weights[i] * phi(Math.hypot(x - points[i][0], y - points[i][1]))
		return z
	}
}

// The face around the orbit: height z at (x, y), for these lid settings,
// through the landmarks and `through`, world points the lids hand it.
export function createFace(eye, lids, through = []) {
	const points = [
		...faceLandmarks(lids),
		...through.map(([x, y, z]) => [eye.nasalSign * x, y, z - eye.apexZ, LID_SMOOTHING]),
	]
	const depth = thinPlate(points, FACE_SMOOTHING)
	return (x, y) => eye.apexZ + depth(eye.nasalSign * x, y)
}
