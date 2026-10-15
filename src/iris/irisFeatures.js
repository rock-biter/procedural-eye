// Seeded generators of the iris features that live in rest space and only
// depend on (ρ, θ): the thickness profile, the zig-zag collarette and the
// contraction furrows. The GPU bake (src/iris/irisAtlas.js,
// iris-bake-fragment.glsl) turns them into the structure atlas. ρ is the
// normalized rest radius (0 at the pupil margin, 1 at the root), θ the polar
// angle in eye space (0 toward +X, counter-clockwise seen from the front).
import { clamp01, smoothstep } from '../math'
import { createRandom } from '../random'

export const COLLARETTE_SAMPLES = 2048
export const MAX_FURROWS = 6
export const MAX_FRECKLES = 32

// Rest thickness (mm) at ρ: from the margin up to the collarette, where the
// iris is thickest, then down to the thin root (AS-OCT and UBM profiles).
// Twin of irisThickness() in iris-bake-fragment.glsl.
export function irisThickness(rho, { margin, collarette, root, collaretteRho }) {
	if (rho <= collaretteRho)
		return margin + (collarette - margin) * smoothstep(0, collaretteRho, rho)
	const t = smoothstep(collaretteRho, 1, rho)
	return collarette + (root - collarette) * Math.sqrt(t)
}

// The collarette as ρ_col(θ) sampled at COLLARETTE_SAMPLES angles: teeth at
// jittered angles pointing outward, valleys between them, both with seeded
// amplitudes, joined by straight segments and lightly smoothed.
export function createCollaretteCurve({ position, amplitude, teeth, irregularity, seed }) {
	const random = createRandom(`collarette:${seed}`)
	const count = Math.max(3, Math.round(teeth))
	const points = []
	for (let k = 0; k < count; k++) {
		const peak = ((k + 0.5 + irregularity * 0.35 * (random() - 0.5)) / count) * Math.PI * 2
		const valley = ((k + irregularity * 0.25 * (random() - 0.5)) / count) * Math.PI * 2
		const peakAmplitude = amplitude * (1 + irregularity * 1.2 * (random() - 0.5))
		const valleyAmplitude = amplitude * (0.55 + irregularity * 0.8 * (random() - 0.5))
		points.push([valley, position - valleyAmplitude], [peak, position + peakAmplitude])
	}
	points.sort((a, b) => a[0] - b[0])
	// A slow wobble of the whole ring.
	const wobblePhase = random() * Math.PI * 2
	const wobble = amplitude * 0.35 * irregularity

	const samples = new Float32Array(COLLARETTE_SAMPLES)
	const n = points.length
	for (let i = 0; i < COLLARETTE_SAMPLES; i++) {
		const theta = (i / COLLARETTE_SAMPLES) * Math.PI * 2
		let j = points.findIndex((point) => point[0] > theta)
		if (j < 0) j = n
		const a = points[(j - 1 + n) % n]
		const b = points[j % n]
		let span = b[0] - a[0]
		let offset = theta - a[0]
		if (span <= 0) span += Math.PI * 2
		if (offset < 0) offset += Math.PI * 2
		const t = clamp01(offset / span)
		samples[i] = a[1] + (b[1] - a[1]) * t + wobble * Math.sin(theta * 3 + wobblePhase)
	}
	// Box blur over ±3 samples: rounds the corners without losing the teeth.
	const smoothed = new Float32Array(COLLARETTE_SAMPLES)
	for (let i = 0; i < COLLARETTE_SAMPLES; i++) {
		let sum = 0
		for (let k = -3; k <= 3; k++) sum += samples[(i + k + COLLARETTE_SAMPLES) % COLLARETTE_SAMPLES]
		smoothed[i] = sum / 7
	}
	return smoothed
}

// Concentric contraction furrows in the outer ciliary zone: `count` arcs
// spread over ρ 0.58–0.93, each covering `extent` of the circle (Larsson's
// grades: <90° … >324°) from a seeded start angle, with seeded depth, width
// and wobble. Packed as two vec4 per furrow for the bake.
export function createFurrows({ count, extent, depth, width, seed }) {
	const random = createRandom(`furrows:${seed}`)
	const furrows = []
	const n = Math.min(Math.round(count), MAX_FURROWS)
	for (let k = 0; k < n; k++) {
		const rho = 0.58 + ((k + 0.5) / Math.max(n, 1)) * 0.35 + (random() - 0.5) * 0.04
		furrows.push({
			rho,
			start: random() * Math.PI * 2,
			extent: Math.min(1, extent * (0.75 + 0.5 * random())) * Math.PI * 2,
			depth: depth * (0.6 + 0.8 * random()),
			width: width * (0.7 + 0.6 * random()),
			wobble: 0.01 + 0.02 * random(),
			phase: random() * 100,
		})
	}
	return furrows
}

export function packFurrows(furrows, out = new Float32Array(MAX_FURROWS * 8)) {
	out.fill(0)
	furrows.forEach((f, k) => {
		out.set([f.rho, f.start, f.extent, f.depth, f.width, f.wobble, f.phase, 0], k * 8)
	})
	return out
}

// Iris freckles (pigment spots): seeded blobs on the ciliary zone, a share of
// them around the inferior-temporal direction, where most freckles are
// (Schwab 2017). `nasalSign` is +1 for a right eye (nasal is +X).
export function createFreckles({ count, size, inferotemporal, seed }, nasalSign = 1) {
	const random = createRandom(`freckles:${seed}`)
	// Inferior (−Y) and temporal (−X for a right eye) in eye-space angles.
	const center = Math.atan2(-1, -nasalSign)
	const freckles = []
	for (let k = 0; k < Math.min(Math.round(count), MAX_FRECKLES); k++) {
		const biased = random() < inferotemporal
		const theta = biased
			? center + (random() + random() + random() - 1.5) * 1.4
			: random() * Math.PI * 2
		freckles.push({
			theta,
			rho: 0.32 + 0.6 * random(),
			radius: size * (0.35 + 0.9 * random() ** 2),
			strength: 0.6 + 0.4 * random(),
			elongation: 1 + 1.2 * random(),
			angle: random() * Math.PI,
			phase: random() * 100,
		})
	}
	return freckles
}

export function packFreckles(freckles, out = new Float32Array(MAX_FRECKLES * 8)) {
	out.fill(0)
	freckles.forEach((f, k) => {
		out.set([f.theta, f.rho, f.radius, f.strength, f.elongation, f.angle, f.phase, 0], k * 8)
	})
	return out
}
