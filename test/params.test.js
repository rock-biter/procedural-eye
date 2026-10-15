import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	applyOverrides,
	createDefaults,
	decodeState,
	diffParams,
	encodeState,
	forEachLeaf,
	getValue,
	leafType,
	sanitizeValue,
	setValue,
} from '../src/params/params'
import { PARAM_SCHEMA } from '../src/params/paramSchema'

test('every default is valid for its own leaf', () => {
	forEachLeaf(PARAM_SCHEMA, (leaf, path) => {
		leafType(leaf)
		assert.equal(sanitizeValue(leaf, leaf.default), leaf.default, path)
		assert.ok(['uniform', 'bake', 'rebuild', 'capture', 'define'].includes(leaf.kind), path)
		if (leafType(leaf) === 'number')
			assert.ok(leaf.min <= leaf.default && leaf.default <= leaf.max, path)
	})
})

test('setValue clamps numbers, rejects unknown choices and paths', () => {
	const params = createDefaults(PARAM_SCHEMA)
	assert.equal(setValue(PARAM_SCHEMA, params, 'cornea.radius', 99), 8.6)
	assert.equal(setValue(PARAM_SCHEMA, params, 'post.toneMapping', 'filmic'), 'agx')
	assert.equal(setValue(PARAM_SCHEMA, params, 'irisColor.tint', '#ABCDEF'), '#abcdef')
	assert.throws(() => setValue(PARAM_SCHEMA, params, 'cornea.nope', 1))
})

test('overrides report unknown paths and keep the rest', () => {
	const params = createDefaults(PARAM_SCHEMA)
	const unknown = applyOverrides(PARAM_SCHEMA, params, {
		cornea: { radius: 7.5, removed: 1 },
		lighting: { key: { azimuth: -20 } },
	})
	assert.deepEqual(unknown, ['cornea.removed'])
	assert.equal(params.cornea.radius, 7.5)
	assert.equal(getValue(params, 'lighting.key.azimuth'), -20)
	assert.deepEqual(diffParams(PARAM_SCHEMA, createDefaults(PARAM_SCHEMA), params), [
		'cornea.radius',
		'lighting.key.azimuth',
	])
})

test('state strings round-trip the non-default values', () => {
	const params = createDefaults(PARAM_SCHEMA)
	applyOverrides(PARAM_SCHEMA, params, {
		cornea: { radius: 7.55 },
		lighting: { ring: { enabled: true } },
	})
	const decoded = decodeState(encodeState(PARAM_SCHEMA, params))
	assert.deepEqual(decoded, { cornea: { radius: 7.55 }, lighting: { ring: { enabled: true } } })
	const restored = createDefaults(PARAM_SCHEMA)
	applyOverrides(PARAM_SCHEMA, restored, decoded)
	assert.deepEqual(diffParams(PARAM_SCHEMA, params, restored), [])
	assert.equal(decodeState('%%%'), null)
})

test('every preset names only existing parameters', async () => {
	const { PRESETS } = await import('../src/params/presets')
	for (const [name, preset] of Object.entries(PRESETS)) {
		const params = createDefaults(PARAM_SCHEMA)
		assert.deepEqual(applyOverrides(PARAM_SCHEMA, params, preset.params), [], name)
	}
})

test('random eyes: valid overrides and the measured marginals (±2% over 10k)', async () => {
	const { PRIORS, randomEye, sampleFeatures } = await import('../src/params/populationPriors')
	const { createRandom } = await import('../src/random')
	const eye = randomEye('european', 42)
	assert.deepEqual(applyOverrides(PARAM_SCHEMA, createDefaults(PARAM_SCHEMA), eye.params), [])
	const random = createRandom('marginals')
	const counts = [0, 0, 0, 0]
	const furrows = [0, 0, 0]
	for (let i = 0; i < 10000; i++) {
		const f = sampleFeatures('european', random)
		counts[f.cryptGrade]++
		furrows[f.furrowGrade]++
	}
	PRIORS.crypts.european.forEach((p, i) =>
		assert.ok(Math.abs(counts[i] / 10000 - p) < 0.02, `crypts ${i}`),
	)
	PRIORS.furrows.european.forEach((p, i) =>
		assert.ok(Math.abs(furrows[i] / 10000 - p) < 0.02, `furrows ${i}`),
	)
})

test('random eyes: shades within the ranges, with vivid blues and ambers', async () => {
	const { SHADE_COLORS, SHADES, randomEye } = await import('../src/params/populationPriors')
	const { irisColorRgb, irisLayerModel } = await import('../src/iris/irisColor')
	SHADES.forEach((shades, colorClass) => {
		const total = shades.reduce((sum, [, share]) => sum + share, 0)
		assert.ok(Math.abs(total - 1) < 1e-9, `class ${colorClass}`)
		for (const [shade] of shades) {
			for (const [leaf, [min, max]] of Object.entries(SHADE_COLORS[shade].color)) {
				const range = PARAM_SCHEMA.irisColor[leaf]
				assert.ok(range.min <= min && min <= max && max <= range.max, `${shade} ${leaf}`)
			}
		}
	})
	// The albedo at a typical stroma thickness, with its saturation.
	let blue = 0
	let amber = 0
	for (let seed = 0; seed < 1000; seed++) {
		const params = createDefaults(PARAM_SCHEMA)
		applyOverrides(PARAM_SCHEMA, params, randomEye('european', seed).params)
		const color = params.irisColor
		const rgb = irisColorRgb(color.ablMelanin, color.eumelanin, 0.45, irisLayerModel(color))
		const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
		const [r, g, b] = rgb.map((v) => Math.max(luma + (v - luma) * color.saturation, 0))
		if (b > 3 * r) blue++
		if (r > 2 * g && g > b) amber++
	}
	assert.ok(blue > 100, `vivid blue ${blue}/1000`)
	assert.ok(amber > 50, `amber ${amber}/1000`)
})

test('PNG text metadata round-trips and keeps the chunk CRC valid', async () => {
	const { crc32, insertPngText, readPngText } = await import('../src/render/pngMetadata')
	assert.equal(crc32(new TextEncoder().encode('IEND')), 0xae426082)
	// A minimal 1×1 PNG.
	const png = Uint8Array.from(
		atob(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
		),
		(c) => c.charCodeAt(0),
	)
	const tagged = insertPngText(png, 'eye-state', 'abc123')
	assert.deepEqual(readPngText(tagged), { 'eye-state': 'abc123' })
	assert.equal(tagged.length, png.length + 12 + 'eye-state'.length + 1 + 6)
})
