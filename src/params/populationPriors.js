// A random but plausible eye (pure): iris features sampled from their measured
// frequencies by ancestry (Edwards et al. 2016: crypts, contraction furrows,
// pigment spots, Wölfflin nodules; European color classes), with the measured
// correlations (crypts–furrows −0.47, darker color–furrows +0.46, …) through
// a Gaussian copula, then mapped onto the parameters. Returns a deep partial
// override of the params. Color classes outside Europe are approximate
// (mostly brown). Within a class, a shade (deep blue, green, amber, …) sets
// the whole layer model of the color, not only its melanin; the shades and
// their shares are approximations, not measurements; docs/RESEARCH.md. A
// share of the eyes (MAKO_SHARE) take the fantasy mako shade instead.
import { hexToLinearRgb, linearRgbToHex } from '../lighting/colorTemperature'
import { createRandom, gaussian, pickWeighted } from '../random'

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

// The shades of each color class above, with their share of the class.
export const SHADES = Object.freeze([
	[
		['pale-blue', 0.55],
		['pale-green', 0.3],
		['grey', 0.15],
	],
	[
		['blue', 0.55],
		['green', 0.3],
		['grey', 0.15],
	],
	[
		['hazel', 0.45],
		['light-brown', 0.3],
		['amber', 0.25],
	],
	[
		['brown', 0.65],
		['chestnut', 0.35],
	],
	[['black', 1]],
])

// The irisColor leaves of each shade, as [min, max], and its chance of a
// peripupillary ring (91% of green or hazel eyes, Larsson 2011).
// - Blue: a clear ABL (little scattering, a mere trace of melanin, which
//   greys it) over a Rayleigh stroma without melanin; the less the stroma
//   scatters, the deeper the blue over the black epithelium.
// - Grey: a hazy ABL over a stroma of larger scatterers.
// - Green: some pheomelanin in the ABL over the blue stroma.
// - Amber, chestnut: dense pheomelanin over a stroma of large scatterers,
//   which keeps the reds that a Rayleigh stroma would lose.
// The `saturation` (artistic) makes up for the tone mapping and the corneal
// reflections, which wash the chromatic shades out: up to 2.6 for blue.
export const SHADE_COLORS = Object.freeze({
	'pale-blue': {
		ring: 0.35,
		color: {
			ablMelanin: [0, 0.03],
			eumelanin: [0.75, 0.95],
			stromaMelanin: [0, 0.015],
			stromaScattering: [2, 3.5],
			rayleighShare: [0.85, 1],
			blood: [0.0005, 0.003],
			ablScattering: [0.6, 2.5],
			saturation: [1.4, 2],
			fiberAbl: [0, 0.35],
		},
	},
	blue: {
		ring: 0.35,
		color: {
			ablMelanin: [0, 0.025],
			eumelanin: [0.75, 0.95],
			stromaMelanin: [0, 0.01],
			stromaScattering: [0.7, 2.5],
			rayleighShare: [0.9, 1],
			blood: [0.0005, 0.002],
			ablScattering: [0.3, 1.5],
			saturation: [1.8, 2.6],
			fiberAbl: [0, 0.35],
		},
	},
	'pale-green': {
		ring: 0.91,
		color: {
			ablMelanin: [0.12, 0.2],
			eumelanin: [0, 0.12],
			stromaMelanin: [0, 0.015],
			stromaScattering: [2.5, 4],
			rayleighShare: [0.85, 1],
			blood: [0.001, 0.003],
			ablScattering: [0.6, 2],
			saturation: [1.5, 2],
			fiberAbl: [0.1, 0.5],
		},
	},
	green: {
		ring: 0.91,
		color: {
			ablMelanin: [0.16, 0.28],
			eumelanin: [0, 0.15],
			stromaMelanin: [0, 0.02],
			stromaScattering: [2, 3.5],
			rayleighShare: [0.85, 1],
			blood: [0.001, 0.004],
			ablScattering: [0.6, 2],
			saturation: [1.6, 2.2],
			fiberAbl: [0.1, 0.5],
		},
	},
	grey: {
		ring: 0.35,
		color: {
			ablMelanin: [0.02, 0.08],
			eumelanin: [0.8, 0.95],
			stromaMelanin: [0.01, 0.04],
			stromaScattering: [2.5, 4.5],
			rayleighShare: [0.35, 0.65],
			blood: [0.002, 0.004],
			ablScattering: [2, 4.5],
			saturation: [0.95, 1.2],
			fiberAbl: [0, 0.35],
		},
	},
	hazel: {
		ring: 0.91,
		color: {
			ablMelanin: [0.25, 0.45],
			eumelanin: [0.15, 0.5],
			stromaMelanin: [0, 0.03],
			stromaScattering: [2, 4],
			rayleighShare: [0.6, 0.95],
			blood: [0.002, 0.005],
			ablScattering: [1, 3],
			saturation: [1.35, 1.8],
			fiberAbl: [0.5, 0.9],
		},
	},
	'light-brown': {
		ring: 0.91,
		color: {
			ablMelanin: [0.45, 0.65],
			eumelanin: [0.35, 0.7],
			stromaMelanin: [0.02, 0.15],
			stromaScattering: [3, 5],
			rayleighShare: [0.3, 0.6],
			blood: [0.002, 0.006],
			ablScattering: [2, 4],
			saturation: [1.2, 1.5],
			fiberAbl: [0.7, 1],
		},
	},
	amber: {
		ring: 0.35,
		color: {
			ablMelanin: [0.6, 0.95],
			eumelanin: [0, 0.15],
			stromaMelanin: [0.1, 0.4],
			stromaScattering: [4.5, 7],
			rayleighShare: [0.05, 0.3],
			blood: [0.003, 0.012],
			ablScattering: [1, 3],
			saturation: [1.4, 1.8],
			fiberAbl: [0.8, 1],
		},
	},
	brown: {
		ring: 0.15,
		color: {
			ablMelanin: [0.6, 0.88],
			eumelanin: [0.6, 0.9],
			stromaMelanin: [0.05, 0.3],
			stromaScattering: [3, 5],
			rayleighShare: [0.2, 0.5],
			blood: [0.003, 0.007],
			ablScattering: [2, 4],
			saturation: [1.1, 1.4],
			fiberAbl: [0.8, 1],
		},
	},
	chestnut: {
		ring: 0.15,
		color: {
			ablMelanin: [0.65, 0.9],
			eumelanin: [0.3, 0.55],
			stromaMelanin: [0.1, 0.35],
			stromaScattering: [4, 6],
			rayleighShare: [0.1, 0.35],
			blood: [0.004, 0.01],
			ablScattering: [2, 4],
			saturation: [1.3, 1.6],
			fiberAbl: [0.8, 1],
		},
	},
	black: {
		ring: 0.15,
		color: {
			ablMelanin: [0.9, 1],
			eumelanin: [0.85, 0.95],
			stromaMelanin: [0.2, 0.5],
			stromaScattering: [3, 5],
			rayleighShare: [0.2, 0.5],
			blood: [0.003, 0.006],
			ablScattering: [2, 4],
			saturation: [1, 1.2],
			fiberAbl: [0.85, 1],
		},
	},
	// Fantasy: the glowing green-blue of the mako eyes of Final Fantasy VII. A
	// clear, deep blue stroma with a trace of pheomelanin, tinted between green
	// and cyan (`tint`, mixed in linear sRGB), at full saturation, with a light
	// of its own; no ring and no pigment spots (randomEye()).
	mako: {
		ring: 0,
		tint: ['#1affb8', '#33ffe0'],
		color: {
			ablMelanin: [0.04, 0.07],
			eumelanin: [0, 0.03],
			stromaMelanin: [0, 0.005],
			stromaScattering: [1.5, 2.5],
			rayleighShare: [0.95, 1],
			blood: [0.0001, 0.0005],
			ablScattering: [0.2, 0.4],
			saturation: [2.8, 3],
			fiberAbl: [0.55, 0.7],
			glow: [0.5, 0.8],
		},
	},
})

// The share of random eyes of any ancestry that take the mako shade.
export const MAKO_SHARE = 0.1

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

// The irisColor values of `shade`.
export function shadeColor(shade, random) {
	const { color: ranges, tint } = SHADE_COLORS[shade]
	const color = {}
	for (const [leaf, [min, max]] of Object.entries(ranges)) color[leaf] = between(random, min, max)
	if (tint) {
		const [a, b] = tint.map(hexToLinearRgb)
		const k = random()
		color.tint = linearRgbToHex(a.map((value, i) => value + (b[i] - value) * k))
	}
	return color
}

// A shade of color class `colorClass` and its irisColor values.
export function sampleIrisColor(colorClass, random) {
	const shade = pickWeighted(SHADES[colorClass], random())
	return { shade, color: shadeColor(shade, random) }
}

export function randomEye(ancestry = 'european', seed = Math.floor(Math.random() * 1e9)) {
	const random = createRandom(`eye:${ancestry}:${seed}`)
	const f = sampleFeatures(ancestry, random)
	const { shade, color } = sampleIrisColor(f.colorClass, random)
	const ring = random() < SHADE_COLORS[shade].ring
	const spots = [0, 1 + Math.floor(random() * 2), 3 + Math.floor(random() * 6)][f.spotGrade]
	const furrowCount = [0, 1 + Math.floor(random() * 2), 2 + Math.floor(random() * 3)][f.furrowGrade]
	const age = Math.round(between(random, 18, 72))
	const skin = { european: '#d39b7c', 'east-asian': '#c9966f', 'south-asian': '#9c6a4a' }[ancestry]
	const eye = {
		features: { ...f, shade },
		params: {
			eye: { age },
			iris: { pupilDiameter: between(random, 2.6, 4.6) },
			irisColor: {
				...color,
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
			skin: { color: skin },
		},
	}
	// Drawn last, so every other eye of a seed stays as it was.
	if (random() < MAKO_SHARE) {
		Object.assign(eye.params.irisColor, shadeColor('mako', random))
		// Even: pigment spots would turn bright green under the tint.
		eye.params.irisColor.heterochromia.amount = 0
		eye.params.irisColor.freckles.count = 0
		eye.features.shade = 'mako'
	}
	return eye
}
