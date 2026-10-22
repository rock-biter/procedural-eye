// Biophysical iris color: the spectral reflectance of the iris layers by
// Kubelka–Munk theory, integrated into linear sRGB. Pure; the lookup table
// it builds (buildIrisColorLut) is what the shaders sample, through
// src/iris/irisColorLut.js.
//
// Layers, top to bottom: the anterior border layer (ABL: melanocytes and
// fibroblasts, its melanin varies across the iris), the stroma (loose
// collagen that scatters blue light like the sky, a little melanin, blood),
// and the pigment epithelium, an almost black background. With little
// melanin the stroma's Rayleigh scattering over the dark epithelium makes the
// iris blue; pheomelanin turns it green or amber, eumelanin brown.
// Data: docs/RESEARCH.md (Donner & Jensen 2006 melanin absorption, Prahl's
// hemoglobin extinction, ILIT layer thicknesses).

export const WAVELENGTHS = Array.from({ length: 31 }, (_, i) => 400 + i * 10)

// Pure-pigment absorption (mm⁻¹), λ in nm (Donner & Jensen 2006).
export const eumelaninAbsorption = (lambda) => 6.6e10 * lambda ** -3.33
export const pheomelaninAbsorption = (lambda) => 2.9e14 * lambda ** -4.75
export const baselineAbsorption = (lambda) => 0.0244 + 8.53 * Math.exp(-(lambda - 154) / 66.2)

// Molar extinction of oxyhemoglobin (cm⁻¹/M) every 10 nm from 400 nm (Prahl).
const OXYHEMOGLOBIN = [
	266232, 466816, 480360, 246072, 102580, 62816, 44480, 33209, 26629, 23684, 20932, 20035, 24202,
	39956, 53236, 43016, 32613, 44496, 50104, 14400, 3200, 1506, 942, 610, 442, 368, 320, 294, 277,
	276, 290,
]

// Whole-blood absorption (mm⁻¹) at 150 g/L hemoglobin (64 500 g/mol).
export function bloodAbsorption(lambda) {
	const index = Math.min(Math.max(Math.round((lambda - 400) / 10), 0), OXYHEMOGLOBIN.length - 1)
	return (2.303 * OXYHEMOGLOBIN[index] * (150 / 64500)) / 10
}

// Kubelka–Munk layer of thickness d (mm) with absorption K and scattering S
// (mm⁻¹) over a background of reflectance Rg: { R, T } (T on a black background).
export function kubelkaMunkLayer(K, S, d, Rg = 0) {
	if (S < 1e-9) {
		const T = Math.exp(-K * d)
		return { R: Rg * T * T, T }
	}
	const a = 1 + K / S
	const b = Math.sqrt(a * a - 1)
	const bSd = b * S * d
	// A vanishing layer leaves the background as it is.
	if (bSd < 1e-9) return { R: Rg, T: 1 }
	const coth = bSd > 20 ? 1 : 1 / Math.tanh(bSd)
	const R = (1 - Rg * (a - b * coth)) / (a - Rg + b * coth)
	const T = bSd > 20 ? 0 : b / (a * Math.sinh(bSd) + b * Math.cosh(bSd))
	return { R, T }
}

// The global layer properties (params.irisColor) with defaults.
export function irisLayerModel(color) {
	return {
		ablThickness: color.ablThickness, // mm (ILIT: 0.057)
		ablScattering: color.ablScattering, // reduced, mm⁻¹ at 500 nm
		melanosomeScattering: color.melanosomeScattering, // added per unit of ABL melanin
		ablMelaninMax: 0.25, // melanin volume share of a fully pigmented ABL
		// Volume share. Darker irides carry far more stromal melanin too (ILIT:
		// about 28× from light to dark), so it rises with the ABL's.
		stromaMelanin: (color.stromaMelanin + 0.6 * (color.ablMelanin ?? 0)) * 0.04,
		stromaScattering: color.stromaScattering, // reduced, mm⁻¹ at 500 nm
		rayleighShare: color.rayleighShare,
		blood: color.blood, // volume share
		epithelium: 0.03, // background reflectance
	}
}

// Reflectance at wavelength λ of the iris with ABL melanin `melanin` (0–1 of
// the maximum), eumelanin share `eumelanin` (0–1) and `stromaThickness` mm of
// stroma between the surface and the pigment epithelium.
export function irisReflectance(lambda, melanin, eumelanin, stromaThickness, model) {
	const pigment =
		eumelanin * eumelaninAbsorption(lambda) + (1 - eumelanin) * pheomelaninAbsorption(lambda)
	const base = baselineAbsorption(lambda)
	const relative = lambda / 500
	const stromaS =
		0.75 *
		model.stromaScattering *
		(model.rayleighShare * relative ** -4 + (1 - model.rayleighShare) * relative ** -1)
	const stromaK = 2 * (model.stromaMelanin * pigment + model.blood * bloodAbsorption(lambda) + base)
	const stroma = kubelkaMunkLayer(stromaK, stromaS, Math.max(stromaThickness, 0), model.epithelium)
	// Melanosomes scatter too: a pigmented ABL shows its pigment like paint on white.
	const ablS =
		0.75 * (model.ablScattering + model.melanosomeScattering * melanin) * relative ** -0.5
	const ablK = 2 * (melanin * model.ablMelaninMax * pigment + base)
	const abl = kubelkaMunkLayer(ablK, ablS, model.ablThickness, 0)
	return abl.R + (abl.T * abl.T * stroma.R) / (1 - abl.R * stroma.R)
}

// CIE 1931 2° color matching functions, multi-lobe fit (Wyman, Sloan, Shirley 2013).
function lobe(lambda, mean, below, above) {
	const t = (lambda - mean) / (lambda < mean ? below : above)
	return Math.exp(-0.5 * t * t)
}

export function colorMatching(lambda) {
	return [
		1.056 * lobe(lambda, 599.8, 37.9, 31.0) +
			0.362 * lobe(lambda, 442.0, 16.0, 26.7) -
			0.065 * lobe(lambda, 501.1, 20.4, 26.2),
		0.821 * lobe(lambda, 568.8, 46.9, 40.5) + 0.286 * lobe(lambda, 530.9, 16.3, 31.1),
		1.217 * lobe(lambda, 437.0, 11.8, 36.0) + 0.681 * lobe(lambda, 459.0, 26.0, 13.8),
	]
}

function xyzToLinearSrgb([X, Y, Z]) {
	return [
		3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
		-0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
		0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
	]
}

// Linear sRGB of a reflectance spectrum under an equal-energy white, scaled
// so that a perfect white reflector is (1, 1, 1).
const WHITE = (() => {
	const xyz = [0, 0, 0]
	for (const lambda of WAVELENGTHS) {
		const cmf = colorMatching(lambda)
		for (let c = 0; c < 3; c++) xyz[c] += cmf[c]
	}
	return xyzToLinearSrgb(xyz)
})()

export function spectrumToLinearRgb(reflectance) {
	const xyz = [0, 0, 0]
	WAVELENGTHS.forEach((lambda, i) => {
		const cmf = colorMatching(lambda)
		for (let c = 0; c < 3; c++) xyz[c] += reflectance[i] * cmf[c]
	})
	return xyzToLinearSrgb(xyz).map((v, c) => Math.max(v / WHITE[c], 0))
}

export function irisColorRgb(melanin, eumelanin, stromaThickness, model) {
	return spectrumToLinearRgb(
		WAVELENGTHS.map((lambda) =>
			irisReflectance(lambda, melanin, eumelanin, stromaThickness, model),
		),
	)
}

// Lookup axes: ABL melanin 0–1, eumelanin share 0–1, stroma thickness 0–0.8 mm.
export const IRIS_COLOR_LUT = Object.freeze({
	melanin: 32,
	eumelanin: 8,
	stroma: 16,
	maxStroma: 0.8,
})

const CMF = WAVELENGTHS.map(colorMatching)

// RGBA float data (A = 1) of the lookup, melanin fastest, then eumelanin,
// then stroma thickness: the layout of a three Data3DTexture. The same values
// as irisColorRgb() at each entry, to the bit: each term of irisReflectance()
// is computed once at the loop level where its inputs are fixed (the
// wavelength's, then per eumelanin share, per melanin, per stroma thickness)
// with the same operations in the same order, so the stroma's and the ABL's
// Kubelka–Munk layers are a few thousand instead of a hundred thousand.
export function buildIrisColorLut(model, size = IRIS_COLOR_LUT) {
	const count = WAVELENGTHS.length
	const base = []
	const bloodTerm = []
	const stromaS = []
	const ablSpread = []
	for (const lambda of WAVELENGTHS) {
		const relative = lambda / 500
		base.push(baselineAbsorption(lambda))
		bloodTerm.push(model.blood * bloodAbsorption(lambda))
		stromaS.push(
			0.75 *
				model.stromaScattering *
				(model.rayleighShare * relative ** -4 + (1 - model.rayleighShare) * relative ** -1),
		)
		ablSpread.push(relative ** -0.5)
	}
	const melanins = Array.from({ length: size.melanin }, (_, i) => i / (size.melanin - 1))
	// Per eumelanin share and wavelength: the pigment's absorption and the
	// stroma's.
	const pigments = []
	const stromaK = []
	for (let j = 0; j < size.eumelanin; j++) {
		const eumelanin = j / (size.eumelanin - 1)
		const pigment = WAVELENGTHS.map(
			(lambda) =>
				eumelanin * eumelaninAbsorption(lambda) + (1 - eumelanin) * pheomelaninAbsorption(lambda),
		)
		pigments.push(pigment)
		stromaK.push(pigment.map((p, l) => 2 * (model.stromaMelanin * p + bloodTerm[l] + base[l])))
	}
	// The ABL per melanin, eumelanin share and wavelength: { R, T }.
	const abl = melanins.map((melanin) => {
		const scattering = 0.75 * (model.ablScattering + model.melanosomeScattering * melanin)
		const pigmented = melanin * model.ablMelaninMax
		return pigments.map((pigment) =>
			pigment.map((p, l) =>
				kubelkaMunkLayer(
					2 * (pigmented * p + base[l]),
					scattering * ablSpread[l],
					model.ablThickness,
					0,
				),
			),
		)
	})
	const data = new Float32Array(size.melanin * size.eumelanin * size.stroma * 4)
	let offset = 0
	for (let k = 0; k < size.stroma; k++) {
		const stroma = (k / (size.stroma - 1)) * size.maxStroma
		const thickness = Math.max(stroma, 0)
		for (let j = 0; j < size.eumelanin; j++) {
			const stromaR = stromaK[j].map(
				(K, l) => kubelkaMunkLayer(K, stromaS[l], thickness, model.epithelium).R,
			)
			for (let i = 0; i < size.melanin; i++) {
				const layers = abl[i][j]
				const xyz = [0, 0, 0]
				for (let l = 0; l < count; l++) {
					const { R, T } = layers[l]
					const r = stromaR[l]
					const reflectance = R + (T * T * r) / (1 - R * r)
					const cmf = CMF[l]
					for (let c = 0; c < 3; c++) xyz[c] += reflectance * cmf[c]
				}
				const rgb = xyzToLinearSrgb(xyz)
				for (let c = 0; c < 3; c++) data[offset + c] = Math.max(rgb[c] / WHITE[c], 0)
				data[offset + 3] = 1
				offset += 4
			}
		}
	}
	return data
}
