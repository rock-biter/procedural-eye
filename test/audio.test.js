import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { RANGE, VOICES, droneHarmony, frequency, voiceLead } from '../src/audio/droneHarmony'
import {
	crossings,
	endEvent,
	motorDrive,
	orbitDrive,
	overshoot,
	ringDrive,
	stops,
	strainDrive,
} from '../src/audio/foley'
import { impulseResponse } from '../src/audio/impulse'
import { SOUNDS, SOUND_FILES } from '../src/audio/soundBank'
import { beep, grit, noise, pinkNoise, tick } from '../src/audio/synth'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('detents count when reached, signed with the move, not again when left', () => {
	assert.equal(crossings(0.95, 1.05, 1), 1)
	assert.equal(crossings(1.05, 0.95, 1), -1)
	// Arriving on a detent counts it; leaving it does not.
	assert.equal(crossings(0.95, 1, 1), 1)
	assert.equal(crossings(1, 0.98, 1), 0)
	assert.equal(crossings(1, 1.02, 1), 0)
	assert.equal(crossings(1.05, 1, 1), -1)
	// A large jump counts every detent on the way, also between thirds.
	assert.equal(crossings(-2, 2, 1), 4)
	assert.equal(crossings(0, 1, 1 / 3), 3)
	assert.equal(crossings(1, 0, 1 / 3), -3)
	assert.equal(crossings(0.3, 0.3, 0.1), 0)
})

test('the aperture knob crosses seven third-stop detents from f/10 to f/22.5', () => {
	close(stops(2) - stops(Math.SQRT2), 1, 1e-12)
	assert.equal(crossings(stops(10), stops(22.5), 1 / 3), 7)
	assert.equal(crossings(stops(22.5), stops(10), 1 / 3), -7)
})

test('the voices rise with speed, from silence at rest', () => {
	for (const drive of [motorDrive, ringDrive, orbitDrive]) {
		assert.equal(drive(0).gain, 0)
		let last = -1
		for (const speed of [0.01, 0.1, 0.5, 1, 3, 100]) {
			const { gain } = drive(speed)
			assert.ok(gain > last && gain <= 1, `${drive.name} at ${speed}`)
			last = gain
		}
	}
	// The motor spins up, a little higher zooming in than out.
	assert.ok(motorDrive(2).rate > motorDrive(0.1).rate)
	assert.ok(motorDrive(1).rate > motorDrive(-1).rate)
	assert.ok(ringDrive(2).cutoff > ringDrive(0.1).cutoff)
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

test('the end stops: reached from inside, settled back from past an end', () => {
	assert.equal(endEvent(null, 1), null)
	assert.equal(endEvent(0.9, 1), 'stop')
	assert.equal(endEvent(0.9, 1.04), 'stop')
	assert.equal(endEvent(0.1, 0), 'stop')
	assert.equal(endEvent(1, 1.04), null)
	assert.equal(endEvent(1.04, 1.02), null)
	assert.equal(endEvent(1.02, 1), 'settle')
	assert.equal(endEvent(-0.02, 0.0001), 'settle')
	assert.equal(endEvent(1, 0.9), null)
	assert.equal(endEvent(0.4, 0.5), null)
})

test('drone harmony: the same seed, the same cycle; voices in range', () => {
	assert.deepEqual(droneHarmony(42), droneHarmony(42))
	const roots = new Set()
	for (let seed = 1; seed < 60; seed++) {
		const { root, chords } = droneHarmony(seed)
		roots.add(root)
		assert.equal(chords.length, 4)
		for (const chord of chords) {
			assert.equal(chord.length, VOICES)
			assert.ok(chord[0] >= root && chord[0] < root + 12, `bass ${chord[0]} of root ${root}`)
			for (const n of chord.slice(1)) assert.ok(n >= RANGE[0] && n <= RANGE[1], `${n}`)
		}
	}
	assert.ok(roots.size > 2, 'seeds spread over the roots')
	close(frequency(69), 440, 1e-9)
	close(frequency(57), 220, 1e-9)
})

test('voice leading moves the upper voices by small steps, onto the chord', () => {
	for (let seed = 1; seed < 40; seed++) {
		const a = droneHarmony(seed).chords
		const b = droneHarmony(seed + 1000).chords
		for (const [from, to] of [
			[a[0], a[1]],
			[a[3], b[0]],
		]) {
			const moved = voiceLead(from, to)
			assert.equal(moved[0], to[0])
			// Every upper note of the target chord's pitch classes...
			const classes = new Set(to.slice(1).map((n) => n % 12))
			for (const n of moved.slice(1)) assert.ok(classes.has(n % 12))
			// ...reached within an octave, a few semitones on average (a voice
			// near an end of RANGE may have to go the long way).
			const steps = moved.slice(1).map((n, i) => Math.abs(n - from[i + 1]))
			assert.ok(Math.max(...steps) <= 12, `${from} → ${moved}`)
			assert.ok(steps.reduce((a, b) => a + b) / steps.length <= 5, `${from} → ${moved}`)
		}
	}
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

test('synthesized buffers: seeded, within ±1', () => {
	const rate = 8000
	for (const samples of [
		noise(rate, 0.5),
		pinkNoise(rate, 0.5),
		grit(rate, 0.5),
		tick(rate),
		beep(rate),
	]) {
		assert.ok(samples.length > 0)
		assert.ok(samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1 + 1e-6))
	}
	assert.deepEqual(noise(rate, 0.1, 'a'), noise(rate, 0.1, 'a'))
	assert.notDeepEqual(noise(rate, 0.1, 'a'), noise(rate, 0.1, 'b'))
	close(beep(rate).length / rate, 0.155, 1e-3)
})

test('every sound has its takes or its synth, and a level in the params', () => {
	for (const file of SOUND_FILES) assert.ok(existsSync(file), file)
	const sound = BASE_PARAM_SCHEMA.sound
	for (const [name, entry] of Object.entries(SOUNDS)) {
		assert.ok(entry.synth || entry.takes.length > 0, name)
		assert.ok(sound[entry.gain], `${name}: sound.${entry.gain}`)
		assert.ok(entry.voices >= 1 && entry.gap >= 0 && entry.vary >= 0 && entry.vary <= 1, name)
	}
})
