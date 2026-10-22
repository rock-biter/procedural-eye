// The easter egg (docs/RENDERING.md): shot by the volume cannon (main.js),
// a shockwave runs over the eye from its axis and the T-800's shows behind
// it, a red lens glowing where the iris was, in a chrome socket; on the
// front the two glitch into each other (terminator.glsl). The front's reach
// follows the shot (src/eye/glitch.js), or glitch.amount for a preview,
// whichever is more, or a hint of it while the cannon is armed. The glitch
// has its own time, which runs while it shows (outside photo mode, the
// preview's too): its pattern and its jumping settings follow it. The
// eyeball's two programs share its uniforms.
import { Color, Uniform, Vector2, Vector4 } from 'three'
import {
	GLITCH_JUMPS,
	chargeReach,
	chargeStep,
	flashEnvelope,
	glitchClock,
	glitchEnvelope,
	glitchJumps,
	glitchPeakTime,
} from './glitch'

// The jumping settings held still: the glitch's time stands, in photo mode or
// with reduced motion.
const STEADY = Object.fromEntries(Object.keys(GLITCH_JUMPS).map((name) => [name, 1]))

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
		// The shot's clock (s), null when none runs, whether its pattern holds
		// still, its seed, and who waits for its peak.
		this.time = null
		this.still = false
		this.seed = 0
		// The red flash's clock (s), null when none runs: it outlives the
		// glitch by its fade.
		this.flashTime = null
		// Whether the cannon is armed, and the progress of the hint.
		this.charged = false
		this.charge = 0
		// The glitch's time (s), and whether it runs.
		this.elapsed = 0
		this.running = false
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
		this.flashTime = 0
		this.still = still
		this.seed = Math.floor(Math.random() * 2 ** 32)
		return new Promise((resolve) => this.waiting.push(resolve))
	}

	// The volume cannon armed or not (main.js): the hint of the glitch rises
	// or sinks. `still` (reduced motion): its pattern does not flicker.
	setCharged(charged, still = false) {
		this.charged = charged
		if (charged) this.still = still
	}

	// Whether the glitch moves: a shot runs, the hint shows, or the preview
	// shows outside photo mode (`frozen`).
	moving(params, frozen) {
		const { amount, charge } = params.glitch
		return (
			this.time !== null ||
			this.flashTime !== null ||
			(charge > 0 && (this.charged || this.charge > 0)) ||
			(amount > 0 && !frozen)
		)
	}

	// Moves the glitch's time, the shot's and the flash's clocks and the hint
	// on; true while the image must restart (the glitch moves, or a shot, its
	// flash or the hint has just ended).
	step(dt, params, frozen) {
		const ending = this.charge > 0 || this.flashTime !== null
		if (this.flashTime !== null) {
			this.flashTime += dt
			const { duration, flashOut } = params.glitch
			if (this.flashTime >= duration + flashOut) this.flashTime = null
		}
		this.charge = chargeStep(this.charge, this.charged, dt)
		const moving = this.moving(params, frozen)
		this.running = moving && !(this.still && (this.time !== null || this.charge > 0))
		if (this.running) this.elapsed += dt
		if (this.time === null) return moving || ending
		this.time += dt
		const { duration } = params.glitch
		if (this.waiting.length > 0 && this.time >= glitchPeakTime(duration)) {
			for (const resolve of this.waiting) resolve()
			this.waiting = []
		}
		if (this.time >= duration) this.time = null
		return true
	}

	// How far the lights and the backdrop have turned red (0–1): only a shot
	// flashes them.
	flash(params) {
		if (this.flashTime === null) return 0
		const { duration, flashIn, flashOut } = params.glitch
		return flashEnvelope(this.flashTime, duration, flashIn, flashOut)
	}

	// Per-sample uniforms; `white`: the radiance of a white diffuse surface
	// under the rig (the lens' scale).
	update(params, white) {
		const { glitch, terminator } = params
		const shot = this.time === null ? 0 : glitchEnvelope(this.time, glitch.duration, glitch.peak)
		const clock = glitchClock(this.elapsed, glitch.speed)
		const jumps = this.running ? glitchJumps(clock, this.seed, glitch.chaos) : STEADY
		this.uniforms.uGlitch.value.set(
			Math.max(glitch.amount, shot, chargeReach(this.charge, glitch.charge)),
			glitch.band * jumps.band,
			glitch.cell * jumps.cell,
			// Each shot its own pattern.
			clock + (this.seed % 4096),
		)
		this.uniforms.uGlitchShape.value.set(
			glitch.tear * jumps.tear,
			glitch.split * jumps.split,
			glitch.ripple * jumps.ripple,
			glitch.blocks,
		)
		this.uniforms.uGlitchMotion.value.set(
			glitch.jump * jumps.jump,
			Math.min(glitch.flicker * jumps.flicker, 1),
		)
		const glow = terminator.glow * white
		this.uniforms.uTerminatorLens.value.set(terminator.lensColor).multiplyScalar(glow)
		this.uniforms.uTerminatorCore.value.set(terminator.coreColor).multiplyScalar(glow)
		const chrome = this.chrome.set(terminator.chrome)
		this.uniforms.uTerminatorChrome.value.set(chrome.r, chrome.g, chrome.b, terminator.roughness)
	}
}
