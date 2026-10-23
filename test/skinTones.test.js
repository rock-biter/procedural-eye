import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hexToLinearRgb } from '../src/lighting/colorTemperature'
import { getLeaf, sanitizeValue } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'
import { SECRET_TONE, SKIN_TONES } from '../src/params/skinTones'

test('the skin tones are skin colors, named once, from light to deep', () => {
	const leaf = getLeaf(BASE_PARAM_SCHEMA, 'skin.color')
	const luminance = (hex) => {
		const [r, g, b] = hexToLinearRgb(hex)
		return 0.2126 * r + 0.7152 * g + 0.0722 * b
	}
	assert.equal(new Set(SKIN_TONES.map((tone) => tone.name)).size, SKIN_TONES.length)
	for (const [i, tone] of SKIN_TONES.entries()) {
		assert.equal(sanitizeValue(leaf, tone.color), tone.color, tone.name)
		if (i > 0) assert.ok(luminance(tone.color) < luminance(SKIN_TONES[i - 1].color), tone.name)
	}
})

test('the hidden tone is a color of its own, red above all', () => {
	const leaf = getLeaf(BASE_PARAM_SCHEMA, 'skin.color')
	assert.equal(sanitizeValue(leaf, SECRET_TONE.color), SECRET_TONE.color)
	assert.ok(SKIN_TONES.every((tone) => tone.name !== SECRET_TONE.name))
	assert.ok(SKIN_TONES.every((tone) => tone.color !== SECRET_TONE.color))
	const [r, g, b] = hexToLinearRgb(SECRET_TONE.color)
	assert.ok(r > 4 * g && r > 4 * b)
})
