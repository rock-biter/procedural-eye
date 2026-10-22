// The Terminator glitch's timing (pure; src/eye/terminator.js, docs/RENDERING.md).
// Shot by the volume cannon, a shockwave runs out from the eye's axis for
// `duration` seconds: its front reaches `peak` (1: the globe's edge) by
// RISE of it, fast at first and slowing, holds there until FALL, and draws
// back to the axis by the end. The photo is taken in the middle of the hold.
// The glitch's pattern ticks on `speed` times a second (unevenly, in the
// shader: terminator.glsl), and some of its settings jump all the while, so
// it stays wild while the front holds. Before the shot, while the cannon is
// armed, a hint of it rises at the axis, and the lights and the backdrop
// turn toward the shot's red flash (chargeReach()).
import { smoothstep } from '../math'
import { hash01 } from '../random'

export const GLITCH = Object.freeze({ rise: 0.4, fall: 0.6 })

// The front's reach `t` seconds after the shot: above 0 all the while, so
// the glitch shows from the shot to its end.
export function glitchEnvelope(t, duration, peak) {
	if (!(duration > 0) || t <= 0 || t >= duration) return 0
	const s = t / duration
	if (s < GLITCH.rise) return peak * (1 - (1 - s / GLITCH.rise) ** 2)
	if (s <= GLITCH.fall) return peak
	return peak * (1 - smoothstep(GLITCH.fall, 1, s))
}

// When the photo is taken (s after the shot): the middle of the hold.
export const glitchPeakTime = (duration) => ((GLITCH.rise + GLITCH.fall) / 2) * duration

// The pattern's clock after `t` seconds of the glitch's time: its ticks so far.
export const glitchClock = (t, speed) => Math.max(t, 0) * speed

// The settings that jump while a shot runs, and the range of the multiple
// of their value they jump to (not the front's reach, the duration, the
// pace or the blockiness).
export const GLITCH_JUMPS = Object.freeze({
	band: [0.5, 1.5],
	cell: [0.4, 3],
	tear: [0.1, 3],
	ripple: [0, 3],
	split: [0, 3],
	jump: [0, 3],
	flicker: [0.3, 1.7],
})

// The multiples of the jumping settings at `clock` (glitchClock()) drawn by
// `seed`: each holds for 1 to 8 ticks, then jumps, on its own steps so they
// jump apart, most often low with now and then a spike; all jump every 64
// ticks, so the walk to the clock stays short. `chaos` (0–1) scales how far
// they range from 1.
export function glitchJumps(clock, seed, chaos) {
	const factors = {}
	const epoch = Math.floor(Math.max(clock, 0) / 64)
	Object.entries(GLITCH_JUMPS).forEach(([name, [low, high]], i) => {
		let start = epoch * 64
		let step = epoch * 64
		for (;;) {
			const length = 1 + 7 * hash01(seed, 2 * i, step)
			if (start + length > clock) break
			start += length
			step++
		}
		const value = low + (high - low) * hash01(seed, 2 * i + 1, step) ** 1.5
		factors[name] = 1 + (value - 1) * chaos
	})
	return factors
}

// The hint of the glitch while the volume cannon is armed: its progress
// rises over CHARGE.rise seconds, and sinks back over CHARGE.fall once the
// cannon fires or is let off, the front reaching glitch.charge at the top
// and the red flash glitch.chargeFlash.
export const CHARGE = Object.freeze({ rise: 0.6, fall: 0.25 })

// The progress `dt` seconds on, armed (`charged`) or not.
export function chargeStep(progress, charged, dt) {
	return charged
		? Math.min(progress + dt / CHARGE.rise, 1)
		: Math.max(progress - dt / CHARGE.fall, 0)
}

// The front's reach, or the red flash, at `progress`, `level` at the top.
export const chargeReach = (progress, level) => level * smoothstep(0, 1, progress)

// The red flash of the lights and the backdrop `t` seconds after a shot:
// it rises over `rise` seconds, holds while the glitch lasts (`duration`),
// and fades over `fade` seconds after it.
export function flashEnvelope(t, duration, rise, fade) {
	if (t <= 0 || t >= duration + fade) return 0
	const up = rise > 0 ? smoothstep(0, rise, t) : 1
	const down = fade > 0 ? 1 - smoothstep(duration, duration + fade, t) : t < duration ? 1 : 0
	return Math.min(up, down)
}
