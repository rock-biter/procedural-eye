import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GLITCH, glitchEnvelope, glitchPeakTime, glitchStep } from '../src/eye/glitch'

test('the front runs out to its peak, holds, and draws back to the axis', () => {
	const duration = 0.6
	const peak = 0.85
	assert.equal(glitchEnvelope(-0.1, duration, peak), 0)
	assert.equal(glitchEnvelope(0, duration, peak), 0)
	assert.equal(glitchEnvelope(duration, duration, peak), 0)
	assert.equal(glitchEnvelope(duration + 1, duration, peak), 0)
	assert.equal(glitchEnvelope(1, 0, peak), 0)
	assert.equal(glitchEnvelope(GLITCH.rise * duration, duration, peak), peak)
	assert.equal(glitchEnvelope(GLITCH.fall * duration, duration, peak), peak)
	let last = 0
	for (let i = 1; i <= 100; i++) {
		const value = glitchEnvelope((i / 100) * GLITCH.rise * duration, duration, peak)
		assert.ok(value >= last && value <= peak)
		last = value
	}
	for (let i = 0; i < 100; i++) {
		const t = (GLITCH.fall + (i / 100) * (1 - GLITCH.fall)) * duration
		const value = glitchEnvelope(t, duration, peak)
		assert.ok(value <= last + 1e-12 && value >= 0)
		last = value
	}
})

test('the glitch shows from the shot to its end', () => {
	for (let i = 1; i < 200; i++) assert.ok(glitchEnvelope((i / 200) * 0.8, 0.8, 0.65) > 0)
})

test('the photo is taken in the middle of the hold', () => {
	const duration = 0.6
	const t = glitchPeakTime(duration)
	assert.ok(t > GLITCH.rise * duration && t < GLITCH.fall * duration)
	assert.equal(glitchEnvelope(t, duration, 0.85), 0.85)
})

test('the pattern changes `speed` times a second', () => {
	assert.equal(glitchStep(0, 24), 0)
	assert.equal(glitchStep(-1, 24), 0)
	assert.equal(glitchStep(0.5, 24), 12)
	assert.equal(glitchStep(1 / 24 - 1e-9, 24), 0)
	assert.ok(Number.isInteger(glitchStep(0.37, 30)))
})
