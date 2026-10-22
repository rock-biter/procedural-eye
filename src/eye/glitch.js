// The Terminator glitch's timing (pure; src/eye/terminator.js, docs/RENDERING.md).
// Shot by the volume cannon, the eye glitches for `duration` seconds: the
// mask's coverage rises to `peak` over the first RISE of it, holds until
// FALL, and sinks back to nothing at its end. The photo is taken in the
// middle of the hold. The blocks change `speed` times a second.
import { smoothstep } from '../math'

export const GLITCH = Object.freeze({ rise: 0.15, fall: 0.65 })

// The mask's coverage `t` seconds after the shot.
export function glitchEnvelope(t, duration, peak) {
	if (!(duration > 0) || t <= 0 || t >= duration) return 0
	const s = t / duration
	if (s < GLITCH.rise) return peak * smoothstep(0, GLITCH.rise, s)
	if (s <= GLITCH.fall) return peak
	return peak * (1 - smoothstep(GLITCH.fall, 1, s))
}

// When the photo is taken (s after the shot): the middle of the hold.
export const glitchPeakTime = (duration) => ((GLITCH.rise + GLITCH.fall) / 2) * duration

// Which pattern of blocks shows `t` seconds after the shot.
export const glitchStep = (t, speed) => Math.floor(Math.max(t, 0) * speed)
