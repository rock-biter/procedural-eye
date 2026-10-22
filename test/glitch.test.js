import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	CHARGE,
	GLITCH,
	GLITCH_JUMPS,
	chargeReach,
	chargeStep,
	glitchClock,
	glitchEnvelope,
	glitchJumps,
	glitchPeakTime,
} from '../src/eye/glitch'

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

test('the pattern ticks on `speed` times a second', () => {
	assert.equal(glitchClock(0, 24), 0)
	assert.equal(glitchClock(-1, 24), 0)
	assert.equal(glitchClock(0.5, 24), 12)
	assert.ok(Math.floor(glitchClock(1 / 24 - 1e-9, 24)) === 0)
})

test('the settings jump apart, within their ranges, holding a few ticks', () => {
	const seed = 12345
	for (const factor of Object.values(glitchJumps(7.3, seed, 0))) assert.equal(factor, 1)
	assert.deepEqual(glitchJumps(5.5, seed, 1), glitchJumps(5.5, seed, 1))
	const names = Object.keys(GLITCH_JUMPS)
	const changes = Object.fromEntries(names.map((name) => [name, []]))
	let last = glitchJumps(0, seed, 1)
	for (let tick = 0.05; tick < 64; tick += 0.05) {
		const now = glitchJumps(tick, seed, 1)
		for (const name of names) {
			const [low, high] = GLITCH_JUMPS[name]
			assert.ok(now[name] >= low - 1e-12 && now[name] <= high + 1e-12, name)
			if (now[name] !== last[name]) changes[name].push(tick)
		}
		last = now
	}
	for (const name of names) {
		// 64 ticks, each value held 1 to 8 of them.
		assert.ok(changes[name].length >= 7 && changes[name].length <= 64, name)
		const holds = changes[name].slice(1).map((t, i) => t - changes[name][i])
		assert.ok(Math.min(...holds) > 1 - 0.1 && Math.max(...holds) < 8 + 0.1, name)
	}
	// Not in step with one another.
	assert.notDeepEqual(changes.tear, changes.split)
})

test('armed, a hint of the glitch rises to its level, and sinks back once let off', () => {
	let progress = 0
	let last = 0
	for (let t = 0; t < CHARGE.rise; t += 0.01) {
		progress = chargeStep(progress, true, 0.01)
		const reach = chargeReach(progress, 0.07)
		assert.ok(reach >= last && reach <= 0.07)
		last = reach
	}
	progress = chargeStep(progress, true, 0.05)
	assert.equal(chargeReach(progress, 0.07), 0.07)
	assert.equal(chargeStep(progress, false, CHARGE.fall), 0)
	assert.ok(chargeStep(progress, false, CHARGE.fall / 2) > 0)
	assert.equal(chargeReach(0, 0.07), 0)
})
