import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { crossings, overshoot, stops, strainDrive } from '../src/audio/foley'
import { impulseResponse } from '../src/audio/impulse'
import { SOUNDS, SOUND_FILES, takesOf } from '../src/audio/soundBank'
import {
	KEYS,
	consonance,
	fadeCurve,
	frequency,
	glassNotes,
	glassVoice,
	nextLoudGlass,
	nextQuietGlass,
	pickNote,
} from '../src/audio/soundscape'
import { beep, fineTick, noise, tick } from '../src/audio/synth'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'
import { createRandom } from '../src/random'

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
	for (const samples of [
		tick(rate),
		beep(rate),
		fineTick(rate),
		fineTick(rate, 3),
		noise(rate, 0.2),
	]) {
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

test('the glasses are tuned to a pentatonic around the fifth octave', () => {
	const notes = glassNotes('D')
	// A4 to F#6: A B D E F# A B D E F#.
	assert.deepEqual(notes, [69, 71, 74, 76, 78, 81, 83, 86, 88, 90])
	for (const key of Object.keys(KEYS)) {
		const tuned = glassNotes(key)
		assert.ok(tuned.length >= 9 && tuned.length <= 10, key)
		assert.ok(frequency(tuned[0]) > 290 && frequency(tuned.at(-1)) < 1800, key)
	}
	close(frequency(69), 440, 1e-9)
})

test('a new glass sounds well with those singing, never on the same note', () => {
	assert.equal(consonance(74, 74), -Infinity)
	assert.equal(consonance(74, 81), 1)
	assert.equal(consonance(74, 76), -1)
	const notes = glassNotes('D')
	const random = createRandom('glasses test')
	const counts = new Map()
	for (let i = 0; i < 2000; i++) {
		const midi = pickNote(random, notes, [74, 81])
		assert.ok(notes.includes(midi) && midi !== 74 && midi !== 81)
		counts.set(midi, (counts.get(midi) ?? 0) + 1)
	}
	// Over D and A, F# (a third and a sixth) beats E (a second and a fifth).
	assert.ok(counts.get(78) > counts.get(76))
	// The louder glasses keep to the upper half; no room, no note.
	for (let i = 0; i < 50; i++) assert.ok(pickNote(random, notes, [], true) >= notes[5])
	assert.equal(pickNote(random, [74], [74]), null)
})

test('a glass rises, holds and rings on; louder ones rise faster, nearer the middle', () => {
	const random = createRandom('voices test')
	for (let i = 0; i < 200; i++) {
		const quiet = glassVoice(random)
		const loud = glassVoice(random, true)
		for (const voice of [quiet, loud]) {
			assert.ok(voice.attack >= 1.5 && voice.hold >= 3 && voice.release > 1)
			assert.ok(voice.twin > 0 && voice.twin < 0.5 && voice.beat > 0)
			assert.ok(voice.level > 0 && voice.level <= 1)
		}
		assert.ok(quiet.attack >= 2.5 && Math.abs(loud.pan) <= 0.3 && loud.brightness > 1)
		assert.ok(nextQuietGlass(random) >= 1.5 && nextLoudGlass(random, 2) >= 8)
	}
})

test('the fade in rises smoothly from 0 to 1', () => {
	const curve = fadeCurve(32)
	assert.equal(curve[0], 0)
	close(curve[31], 1, 1e-9)
	for (let i = 1; i < 32; i++) assert.ok(curve[i] >= curve[i - 1])
})

test('the reverb decays 60 dB over rt60, the same for the same seed', () => {
	const rate = 8000
	const [left, right] = impulseResponse(rate, { rt60: 2, predelay: 0.01 })
	assert.equal(left.length, Math.round(2.01 * rate))
	assert.notDeepEqual(left, right)
	assert.deepEqual(impulseResponse(rate, { rt60: 2 })[0], impulseResponse(rate, { rt60: 2 })[0])
	// Silent before the predelay; unit energy.
	assert.equal(left[Math.round(0.005 * rate)], 0)
	close(
		left.reduce((sum, v) => sum + v * v, 0),
		1,
		1e-6,
	)
	const energy = (from, to) => {
		let sum = 0
		for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) sum += left[i] ** 2
		return sum
	}
	// The second half carries far less than the first.
	assert.ok(energy(1.01, 2.01) < energy(0.01, 1.01) * 0.01)
})
