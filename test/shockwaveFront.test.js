import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHOCKWAVE, shockwaveAt } from '../src/render/shockwaveFront'

test('the shockwave runs from the middle past the corners, widening, and fades out', () => {
	const duration = 1.6
	assert.equal(shockwaveAt(-0.1, duration), null)
	assert.equal(shockwaveAt(duration, duration), null)
	assert.equal(shockwaveAt(0.5, 0), null)
	const start = shockwaveAt(0, duration)
	assert.equal(start.front, 0)
	assert.equal(start.strength, 0)
	let last = start
	for (let i = 1; i < 160; i++) {
		const wave = shockwaveAt((i / 160) * duration, duration)
		assert.ok(wave.front > last.front && wave.front < SHOCKWAVE.reach)
		assert.ok(wave.width > last.width)
		assert.ok(wave.strength >= 0 && wave.strength <= 1)
		last = wave
	}
	// Past the corners by the end, and nearly gone.
	assert.ok(last.front > 1)
	assert.ok(last.strength < 0.01)
	// At full strength early on.
	assert.ok(shockwaveAt(0.1 * duration, duration).strength > 0.8)
})
