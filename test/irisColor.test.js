import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	buildIrisColorLut,
	colorMatching,
	IRIS_COLOR_LUT,
	irisColorRgb,
	irisLayerModel,
	irisReflectance,
	kubelkaMunkLayer,
	spectrumToLinearRgb,
	WAVELENGTHS,
} from '../src/iris/irisColor'

const model = irisLayerModel({
	ablThickness: 0.057,
	ablScattering: 3,
	melanosomeScattering: 0,
	stromaMelanin: 0.02,
	stromaScattering: 2.5,
	rayleighShare: 0.9,
	blood: 0.003,
})
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

test('Kubelka–Munk limits: no scattering is pure absorption, thick layers saturate', () => {
	const clear = kubelkaMunkLayer(1, 0, 0.5, 0.4)
	assert.ok(Math.abs(clear.T - Math.exp(-0.5)) < 1e-12)
	const thick = kubelkaMunkLayer(1, 4, 50, 0)
	const a = 1 + 1 / 4
	assert.ok(Math.abs(thick.R - (a - Math.sqrt(a * a - 1))) < 1e-6)
	assert.ok(thick.T < 1e-6)
})

test('a white spectrum maps to white and the CMF peaks where expected', () => {
	const white = spectrumToLinearRgb(WAVELENGTHS.map(() => 1))
	for (const c of white) assert.ok(Math.abs(c - 1) < 1e-9)
	assert.ok(colorMatching(555)[1] > colorMatching(450)[1])
})

test('reflectance stays in [0, 1]', () => {
	for (const lambda of [400, 500, 600, 700]) {
		for (const melanin of [0, 0.5, 1]) {
			for (const stroma of [0, 0.2, 0.8]) {
				const r = irisReflectance(lambda, melanin, 0.5, stroma, model)
				assert.ok(r >= 0 && r <= 1, `${lambda} ${melanin} ${stroma}: ${r}`)
			}
		}
	}
})

test('little melanin is blue: Rayleigh scattering over the dark epithelium', () => {
	const [r, g, b] = irisColorRgb(0, 0.9, 0.45, model)
	assert.ok(b > g && g > r, `${r} ${g} ${b}`)
})

test('eumelanin makes it brown and dark; pheomelanin yellower', () => {
	const brown = irisColorRgb(0.8, 0.9, 0.45, model)
	assert.ok(brown[0] > brown[1] && brown[1] > brown[2])
	assert.ok(luma(brown) < 0.12)
	const pheo = irisColorRgb(0.5, 0.1, 0.45, model)
	const eu = irisColorRgb(0.5, 0.9, 0.45, model)
	assert.ok(pheo[1] / pheo[0] > eu[1] / eu[0], 'pheomelanin shifts toward yellow')
})

test('less stroma above the epithelium (a crypt floor) is darker', () => {
	assert.ok(luma(irisColorRgb(0.1, 0.8, 0.08, model)) < luma(irisColorRgb(0.1, 0.8, 0.45, model)))
})

test('the lookup table has the documented layout', () => {
	const small = { melanin: 4, eumelanin: 2, stroma: 3, maxStroma: 0.8 }
	const data = buildIrisColorLut(model, small)
	assert.equal(data.length, 4 * 2 * 3 * 4)
	// Entry (melanin 1, eumelanin 0, stroma 0.4): index 1 + 0·4 + 1·8.
	const expected = irisColorRgb(1 / 3, 0, 0.4, model)
	const index = (1 + 0 * 4 + 1 * 8) * 4
	for (let c = 0; c < 3; c++) assert.ok(Math.abs(data[index + c] - expected[c]) < 1e-6)
	assert.equal(IRIS_COLOR_LUT.melanin, 32)
})

test('the lookup table is irisColorRgb() at every entry, to the bit', () => {
	const models = [
		model,
		irisLayerModel({
			ablThickness: 0.08,
			ablScattering: 5,
			melanosomeScattering: 12,
			stromaMelanin: 0.3,
			ablMelanin: 0.9,
			stromaScattering: 1.2,
			rayleighShare: 0,
			blood: 0.01,
		}),
		irisLayerModel({
			ablThickness: 0,
			ablScattering: 0,
			melanosomeScattering: 0,
			stromaMelanin: 0,
			stromaScattering: 0,
			rayleighShare: 1,
			blood: 0,
		}),
	]
	for (const layers of models) {
		const data = buildIrisColorLut(layers)
		const naive = new Float32Array(data.length)
		const size = IRIS_COLOR_LUT
		let offset = 0
		for (let k = 0; k < size.stroma; k++) {
			const stroma = (k / (size.stroma - 1)) * size.maxStroma
			for (let j = 0; j < size.eumelanin; j++) {
				for (let i = 0; i < size.melanin; i++) {
					const rgb = irisColorRgb(i / (size.melanin - 1), j / (size.eumelanin - 1), stroma, layers)
					naive.set([rgb[0], rgb[1], rgb[2], 1], offset)
					offset += 4
				}
			}
		}
		assert.deepEqual(new Uint32Array(data.buffer), new Uint32Array(naive.buffer))
	}
})
