// The Sharingan's awakening shockwave over time (pure; src/render/shockwave.js,
// docs/RENDERING.md): `t` s into a wave of `duration` s, its front runs from
// the middle of the frame past its corners (1), fast at first and slowing,
// widening as it goes; its strength rises at once and fades to nothing as
// it leaves. null outside the wave.
import { smoothstep } from '../math'

export const SHOCKWAVE = Object.freeze({ reach: 1.2, rise: 0.08, widen: 2.5 })

export function shockwaveAt(t, duration) {
	if (!(duration > 0) || t < 0 || t >= duration) return null
	const s = t / duration
	return {
		front: SHOCKWAVE.reach * (1 - (1 - s) ** 2.2),
		width: 1 + SHOCKWAVE.widen * s,
		strength: smoothstep(0, SHOCKWAVE.rise, s) * (1 - s) ** 1.5,
	}
}
