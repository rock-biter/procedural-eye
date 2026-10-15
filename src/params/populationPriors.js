// A random but plausible eye (pure): iris features sampled from their measured
// frequencies by ancestry (Edwards et al. 2016: crypts, contraction furrows,
// pigment spots, Wölfflin nodules; European color classes), with the measured
// correlations (crypts–furrows −0.47, darker color–furrows +0.46, …) through
// a Gaussian copula, then mapped onto the parameters. Returns a deep partial
// override of the params. Color classes outside Europe are approximate
// (mostly brown); docs/RESEARCH.md.
import { createRandom, gaussian } from '../random'

export const ANCESTRIES = ['european', 'east-asian', 'south-asian']

export const PRIORS = Object.freeze({
	// none / small around the collarette / ≥1 large in <3 quadrants / ≥3 large in ≥3 quadrants
	crypts: {
		european: [0.09, 0.38, 0.31, 0.22],
		'east-asian': [0.2, 0.5, 0.2, 0.1],
		'south-asian': [0.15, 0.42, 0.25, 0.18],
	},
	// none / <180° / >180°
	furrows: {
		european: [0.07, 0.11, 0.82],
		'east-asian': [0.15, 0.38, 0.47],
		'south-asian': [0.04, 0.15, 0.81],
	},
	// 0 / 1–2 / >2
	spots: {
		european: [0.42, 0.38, 0.2],
		'east-asian': [0.78, 0.21, 0.01],
		'south-asian': [0.83, 0.15, 0.02],
	},
	// none / <180° / >180°
	nodules: {
		european: [0.63, 0.12, 0.25],
		'east-asian': [1, 0, 0],
		'south-asian': [0.99, 0.005, 0.005],
	},
	// light blue/green/grey, blue/green/grey, hazel/light brown, dark brown, brownish-black
	colors: {
		european: [0.12, 0.45, 0.23, 0.19, 0.01],
		'east-asian': [0, 0.005, 0.06, 0.84, 0.095],
		'south-asian': [0.005, 0.03, 0.15, 0.72, 0.095],
	},
})

// Standard normal CDF (Abramowitz–Stegun 7.1.26 erf).
export function normalCdf(z) {
	const x = Math.abs(z) / Math.SQRT2
	const t = 1 / (1 + 0.3275911 * x)
	const erf =
		1 -
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
			t *
			Math.exp(-x * x)
	return 0.5 * (1 + Math.sign(z) * erf)
}

// Index of the category of `probabilities` that uniform `u` falls in.
export function categorical(probabilities, u) {
	let sum = 0
	for (let i = 0; i < probabilities.length; i++) {
		sum += probabilities[i]
		if (u < sum) return i
	}
	return probabilities.length - 1
}

// Correlated categories: latent standard normals mixed to the measured signs.
export function sampleFeatures(ancestry, random) {
	const z = () => gaussian(random(), random())
	const color = z()
	const crypts = -0.3 * color + Math.sqrt(1 - 0.09) * z()
	const furrows = -0.45 * crypts + 0.4 * color + Math.sqrt(1 - 0.45 ** 2 - 0.4 ** 2) * z()
	const spots = 0.25 * furrows - 0.2 * crypts + Math.sqrt(1 - 0.25 ** 2 - 0.2 ** 2) * z()
	const nodules = -0.4 * color + Math.sqrt(1 - 0.16) * z()
	const pick = (table, latent) => categorical(PRIORS[table][ancestry], normalCdf(latent))
	return {
		colorClass: pick('colors', color),
		cryptGrade: pick('crypts', crypts),
		furrowGrade: pick('furrows', furrows),
		spotGrade: pick('spots', spots),
		noduleGrade: pick('nodules', nodules),
	}
}

const between = (random, a, b) => a + (b - a) * random()

export function randomEye(ancestry = 'european', seed = Math.floor(Math.random() * 1e9)) {
	const random = createRandom(`eye:${ancestry}:${seed}`)
	const f = sampleFeatures(ancestry, random)
	const green = random() < 0.35
	const color = [
		{
			ablMelanin: between(random, 0, 0.05),
			eumelanin: green ? 0.15 : 0.88,
			rayleighShare: between(random, 0.5, 0.95),
		},
		{
			ablMelanin: between(random, 0.04, 0.18),
			eumelanin: green ? 0.12 : 0.85,
			rayleighShare: between(random, 0.55, 0.95),
		},
		{
			ablMelanin: between(random, 0.25, 0.5),
			eumelanin: between(random, 0.3, 0.6),
			rayleighShare: 0.8,
		},
		{
			ablMelanin: between(random, 0.6, 0.85),
			eumelanin: between(random, 0.7, 0.9),
			rayleighShare: 0.8,
		},
		{ ablMelanin: between(random, 0.9, 1), eumelanin: 0.95, rayleighShare: 0.8 },
	][f.colorClass]
	// The peripupillary ring: 91% of green or hazel eyes (Larsson 2011).
	const ringChance = green || f.colorClass === 2 ? 0.91 : f.colorClass <= 1 ? 0.35 : 0.15
	const ring = random() < ringChance
	const spots = [0, 1 + Math.floor(random() * 2), 3 + Math.floor(random() * 6)][f.spotGrade]
	const furrowCount = [0, 1 + Math.floor(random() * 2), 2 + Math.floor(random() * 3)][f.furrowGrade]
	const age = Math.round(between(random, 18, 72))
	const skin = { european: '#d39b7c', 'east-asian': '#c9966f', 'south-asian': '#9c6a4a' }[ancestry]
	return {
		features: f,
		params: {
			eye: { age },
			iris: { pupilDiameter: between(random, 2.6, 4.6) },
			irisColor: {
				...color,
				fiberAbl: f.colorClass <= 1 ? between(random, 0, 0.35) : between(random, 0.7, 1),
				heterochromia: {
					amount: ring ? between(random, 0.55, 0.95) : 0,
					melanin: Math.min(1, color.ablMelanin + between(random, 0.25, 0.5)),
					eumelanin: between(random, 0.08, 0.35),
					extent: between(random, -0.02, 0.12),
				},
				freckles: {
					count: spots,
					size: between(random, 0.12, 0.4),
					eumelanin: between(random, 0.2, 0.7),
				},
			},
			irisStructure: {
				seed: 1 + Math.floor(random() * 9998),
				crypts: {
					grade: f.cryptGrade === 0 ? 0 : f.cryptGrade + between(random, -0.4, 0.8),
					band: f.cryptGrade >= 2 ? between(random, 0.3, 0.5) : between(random, 0.15, 0.25),
					roundness: between(random, 0.1, 0.9),
					size: between(random, 0.6, 1.2),
				},
				furrows: {
					count: furrowCount,
					extent: f.furrowGrade === 1 ? between(random, 0.2, 0.45) : between(random, 0.55, 1),
				},
				nodules: {
					count: [0, 10 + Math.floor(random() * 6), 22 + Math.floor(random() * 18)][f.noduleGrade],
				},
				collarette: {
					amplitude: between(random, 0.03, 0.08),
					teeth: 12 + Math.floor(random() * 14),
				},
			},
			sclera: {
				vessels: { seed: 1 + Math.floor(random() * 9998) },
				yellowing: Math.min(1, (age - 18) / 70),
			},
			lashes: { seed: 1 + Math.floor(random() * 9998) },
			skin: { color: skin },
		},
	}
}
