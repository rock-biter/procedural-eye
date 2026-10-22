// The Terminator glitch's timing (pure; src/eye/terminator.js, docs/RENDERING.md).
// Shot by the volume cannon, a shockwave runs out from the eye's axis for
// `duration` seconds: its front reaches `peak` (1: the globe's edge) by
// RISE of it, fast at first and slowing, holds there until FALL, and draws
// back to the axis by the end. The photo is taken in the middle of the hold.
// The glitch's pattern ticks on `speed` times a second (unevenly, in the
// shader: terminator.glsl).
import { smoothstep } from '../math'

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

// The pattern's clock `t` seconds after the shot: its ticks so far.
export const glitchClock = (t, speed) => Math.max(t, 0) * speed
