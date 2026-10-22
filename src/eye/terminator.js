// The easter egg (docs/RENDERING.md): shot by the volume cannon (main.js),
// a shockwave runs over the eye from its axis and the T-800's shows behind
// it, a red lens glowing where the iris was, in a chrome socket; on the
// front the two glitch into each other (terminator.glsl). The front's reach
// follows the shot (src/eye/glitch.js), or glitch.amount for a still
// preview, whichever is more. The eyeball's two programs share its uniforms.
import { Color, Uniform, Vector2, Vector4 } from 'three'
import { glitchClock, glitchEnvelope, glitchPeakTime } from './glitch'

export default class Terminator {
	constructor() {
		this.uniforms = {
			// the front's reach (0–1 of the globe's radius), its band's half-width
			// and the rows' height (mm), the pattern's clock
			uGlitch: new Uniform(new Vector4(0, 1, 0.3, 0)),
			// tears, color split, ripple (mm), blockiness
			uGlitchShape: new Uniform(new Vector4()),
			// jumps (mm), flicker
			uGlitchMotion: new Uniform(new Vector2()),
			uTerminatorLens: new Uniform(new Color()),
			uTerminatorCore: new Uniform(new Color()),
			// the chrome's tint (linear), its roughness
			uTerminatorChrome: new Uniform(new Vector4()),
		}
		// The shot's clock (s), null when none runs, whether its blocks hold
		// still, and who waits for its peak.
		this.time = null
		this.still = false
		this.waiting = []
		this.chrome = new Color()
	}

	get active() {
		return this.time !== null
	}

	// Glitches the eye now; resolves when the front holds, for the photo.
	// `still` (reduced motion): the pattern does not flicker.
	trigger(still = false) {
		this.time = 0
		this.still = still
		return new Promise((resolve) => this.waiting.push(resolve))
	}

	// Moves the shot's clock on; true while the image must restart (the
	// shot runs, or has just ended).
	step(dt, params) {
		if (this.time === null) return false
		this.time += dt
		const { duration } = params.glitch
		if (this.waiting.length > 0 && this.time >= glitchPeakTime(duration)) {
			for (const resolve of this.waiting) resolve()
			this.waiting = []
		}
		if (this.time >= duration) this.time = null
		return true
	}

	// Per-sample uniforms; `white`: the radiance of a white diffuse surface
	// under the rig (the lens' scale).
	update(params, white) {
		const { glitch, terminator } = params
		const shot = this.time === null ? 0 : glitchEnvelope(this.time, glitch.duration, glitch.peak)
		this.uniforms.uGlitch.value.set(
			Math.max(glitch.amount, shot),
			glitch.band,
			glitch.cell,
			glitchClock(this.still ? 0 : (this.time ?? 0), glitch.speed),
		)
		this.uniforms.uGlitchShape.value.set(glitch.tear, glitch.split, glitch.ripple, glitch.blocks)
		this.uniforms.uGlitchMotion.value.set(glitch.jump, glitch.flicker)
		const glow = terminator.glow * white
		this.uniforms.uTerminatorLens.value.set(terminator.lensColor).multiplyScalar(glow)
		this.uniforms.uTerminatorCore.value.set(terminator.coreColor).multiplyScalar(glow)
		const chrome = this.chrome.set(terminator.chrome)
		this.uniforms.uTerminatorChrome.value.set(chrome.r, chrome.g, chrome.b, terminator.roughness)
	}
}
