import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { crossings, overshoot, stops, strainDrive } from '../src/audio/foley'
import { SOUNDS, SOUND_FILES, takesOf } from '../src/audio/soundBank'
import { beep, fineTick, tick } from '../src/audio/synth'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('detents count when reached, signed with the move, not again when left', () => {
	assert.equal(crossings(0.95, 1.05, 1), 1)
	assert.equal(crossings(1.05, 0.95, 1), -1)
	// Arriving on a detent counts it; leaving it does not.
	assert.equal(crossings(0.95, 1, 1), 1)
	assert.equal(crossings(1.05, 1, 1), -1)
	assert.equal(crossings(1, 0.98, 1), 0)
	assert.equal(crossings(1, 1.02, 1), 0)
	// A large jump counts every detent on the way, also between thirds.
	assert.equal(crossings(-2, 2, 1), 4)
	assert.equal(crossings(0, 1, 1 / 3), 3)
	assert.equal(crossings(1, 0, 1 / 3), -3)
	assert.equal(crossings(0.3, 0.3, 0.1), 0)
	// The zoom's track, end to end, past its 16 detents' last one.
	assert.equal(crossings(0, 1, 1 / 16), 16)
})

test('the aperture knob crosses seven third-stop detents from f/10 to f/22.5, 14 sixths', () => {
	close(stops(2) - stops(Math.SQRT2), 1, 1e-12)
	assert.equal(crossings(stops(10), stops(22.5), 1 / 3), 7)
	assert.equal(crossings(stops(22.5), stops(10), 1 / 3), -7)
	assert.equal(crossings(stops(10), stops(22.5), 1 / 6), 14)
})

test('a track pulled past its end creaks higher the further it goes', () => {
	assert.equal(overshoot(0.5, 0.1), 0)
	close(overshoot(1.05, 0.1), 0.5, 1e-9)
	assert.equal(overshoot(-0.2, 0.1), 1)
	assert.equal(overshoot(1.05, 0), 0)
	assert.equal(strainDrive(0, 1).gain, 0)
	assert.ok(strainDrive(1, 0).resonance > strainDrive(0.2, 0).resonance)
	// Louder moving than held still.
	assert.ok(strainDrive(0.5, 1).gain > strainDrive(0.5, 0).gain)
})

test('synthesized buffers: seeded, within ±1', () => {
	const rate = 8000
	for (const samples of [tick(rate), beep(rate), fineTick(rate), fineTick(rate, 3)]) {
		assert.ok(samples.length > 0)
		assert.ok(samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1 + 1e-6))
	}
	assert.deepEqual(tick(rate), tick(rate))
	assert.deepEqual(fineTick(rate, 2), fineTick(rate, 2))
	// The fine ticks: short, each take tuned differently.
	close(fineTick(44100).length / 44100, 0.006, 1e-4)
	assert.notDeepEqual(fineTick(rate, 0), fineTick(rate, 1))
	close(beep(rate).length / rate, 0.155, 1e-3)
})

test('every sound has its takes or its synth, and a level in the params', () => {
	for (const file of SOUND_FILES) assert.ok(existsSync(file), file)
	const sound = BASE_PARAM_SCHEMA.sound
	for (const [name, entry] of Object.entries(SOUNDS)) {
		assert.ok(takesOf(entry).length > 0, name)
		if (entry.synthTakes) assert.equal(takesOf(entry).length, entry.synthTakes, name)
		assert.ok(sound.volumes[entry.gain], `${name}: sound.volumes.${entry.gain}`)
		assert.ok(entry.voices >= 1 && entry.gap >= 0 && entry.vary >= 0 && entry.vary <= 1, name)
	}
})
