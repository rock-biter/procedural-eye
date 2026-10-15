// The palpebral fissure in the front plane (pure): the two lid margins between
// the medial and the lateral canthus, world millimeters at primary gaze (the
// pupil center at the origin, +Y up, the nose toward +X for a right eye).
//
// Each margin is a height above the chord between the canthi (the lower one a
// depth below it), in two cubic Hermite parts: from the medial canthus, which
// it leaves at its medial angle, up to its extreme, and from there down to the
// lateral canthus, which it meets at its lateral angle. The margins close in
// a wider angle medially, which the lid mesh rounds into a U around the
// caruncle (src/adnexa/lidGeometry.js), and in an acute one laterally.
// The heights are solved so the upper margin reaches MRD1 above the pupil
// center and the lower one MRD2 below it (Rana 2023, docs/RESEARCH.md).
//
// `closure` (0 open, 1 closed) brings the margins together, as in a blink:
// the upper margin comes down onto the lower one, which hardly moves (Doane
// 1980), about 9 mm, as far as in a spontaneous blink (Casse 2007).
import { clamp, clamp01, DEG } from '../math'

// Samples of the arc-length tables and of the extreme searches.
const ARC_SAMPLES = 256
const EXTREME_SAMPLES = 200

// Medial part, from the canthus (0) to the extreme (1): a cubic Hermite from
// the canthus, with slope `slope` (in heights per length of the part;
// monotonic up to 3), to the flat extreme.
function rise(sigma, slope) {
	const s = clamp01(sigma)
	return slope * (s ** 3 - 2 * s ** 2 + s) + 3 * s ** 2 - 2 * s ** 3
}

// Lateral part, from the extreme (0) to the canthus (1): a cubic Hermite from
// the flat extreme down to the canthus with slope −`slope`.
function fall(sigma, slope) {
	const s = clamp01(sigma)
	return 2 * s ** 3 - 3 * s ** 2 + 1 - slope * (s ** 3 - s ** 2)
}

// A margin's height profile: 0 at both canthi, `amplitude` at `peak` (the
// share of the chord from the medial canthus), leaving the chord at
// `medialAngle` and meeting it at `lateralAngle`.
function marginProfile(amplitude, peak, medialAngle, lateralAngle, chord) {
	const slope = (angle, length) =>
		amplitude > 1e-9 ? clamp((Math.tan(angle) * length) / amplitude, 0, 3) : 0
	const medial = slope(medialAngle, chord * peak)
	const lateral = slope(lateralAngle, chord * (1 - peak))
	return (s) =>
		amplitude * (s < peak ? rise(s / peak, medial) : fall((s - peak) / (1 - peak), lateral))
}

// The amplitude whose margin reaches `target` (y, signed by `sign`): the
// extreme grows monotonically with the amplitude (bisection).
function solveAmplitude(target, sign, curveFor) {
	const extreme = (amplitude) => {
		const curve = curveFor(amplitude)
		let best = -Infinity
		for (let i = 0; i <= EXTREME_SAMPLES; i++)
			best = Math.max(best, sign * curve(i / EXTREME_SAMPLES)[1])
		return best
	}
	let low = 0
	let high = 30
	for (let i = 0; i < 48; i++) {
		const mid = (low + high) / 2
		if (extreme(mid) < sign * target) low = mid
		else high = mid
	}
	return (low + high) / 2
}

// Arc length table of a curve over its parameter [0, 1].
function arcTable(curve) {
	const lengths = new Float64Array(ARC_SAMPLES + 1)
	let previous = curve(0)
	for (let i = 1; i <= ARC_SAMPLES; i++) {
		const p = curve(i / ARC_SAMPLES)
		lengths[i] = lengths[i - 1] + Math.hypot(p[0] - previous[0], p[1] - previous[1])
		previous = p
	}
	return lengths
}

// `nasalSign` is +1 for a right eye (the nose toward +X), −1 for a left one.
export function createFissure(lids, nasalSign = 1, closure = lids.closure ?? 0) {
	const width = lids.fissureWidth
	const medial = [nasalSign * width * lids.medialShare, lids.medialHeight]
	const lateral = [
		-nasalSign * width * (1 - lids.medialShare),
		lids.medialHeight + width * Math.tan(lids.canthalTilt * DEG),
	]
	// The chord frame: `along` from the medial to the lateral canthus, `up`
	// perpendicular to it, upward.
	const chord = Math.hypot(lateral[0] - medial[0], lateral[1] - medial[1])
	const along = [(lateral[0] - medial[0]) / chord, (lateral[1] - medial[1]) / chord]
	const up = along[0] < 0 ? [along[1], -along[0]] : [-along[1], along[0]]
	const point = (s, height) => [
		medial[0] + along[0] * s * chord + up[0] * height,
		medial[1] + along[1] * s * chord + up[1] * height,
	]

	const upperFor = (amplitude) =>
		marginProfile(
			amplitude,
			lids.upperPeak,
			lids.upperMedialAngle * DEG,
			lids.upperAngle * DEG,
			chord,
		)
	const lowerFor = (amplitude) =>
		marginProfile(
			amplitude,
			lids.lowerPeak,
			lids.lowerMedialAngle * DEG,
			lids.lowerAngle * DEG,
			chord,
		)
	const upperHeight = upperFor(solveAmplitude(lids.mrd1, 1, (a) => (s) => point(s, upperFor(a)(s))))
	const lowerDepth = lowerFor(
		solveAmplitude(-lids.mrd2, -1, (a) => (s) => point(s, -lowerFor(a)(s))),
	)

	// Signed heights above the chord: the upper margin as closed as `closure`,
	// the lower one where it rests.
	const c = clamp01(closure)
	const lowerAt = (s) => -lowerDepth(s)
	const upperAt = (s) => (1 - c) * upperHeight(s) + c * lowerAt(s)

	// s: the share of the chord from the medial (0) to the lateral canthus (1).
	const upper = (s) => point(s, upperAt(s))
	const lower = (s) => point(s, lowerAt(s))
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
		// The loop runs medial → lateral on top: for a right eye that is toward
		// −X, so the outward (upward) normal is (ty, −tx) / |t|; mirrored for left.
		return [(nasalSign * ty) / length, (-nasalSign * tx) / length]
	}
	const arcs = [arcTable(upper), arcTable(lower)]
	// The share of a margin's arc length from the medial canthus.
	const alongMargin = (t) => {
		const u = ((t % 1) + 1) % 1
		const lengths = arcs[u < 0.5 ? 0 : 1]
		const f = (u < 0.5 ? u * 2 : 2 - u * 2) * ARC_SAMPLES
		const i = Math.min(Math.floor(f), ARC_SAMPLES - 1)
		return (lengths[i] + (lengths[i + 1] - lengths[i]) * (f - i)) / lengths[ARC_SAMPLES]
	}
	return {
		upper,
		lower,
		loop,
		normal,
		along: alongMargin,
		medial,
		lateral,
		width,
		chord: { length: chord, along, up },
		closure: c,
		// Margin lengths (mm), upper and lower.
		lengths: arcs.map((lengths) => lengths[ARC_SAMPLES]),
	}
}
