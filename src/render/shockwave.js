// The Sharingan's awakening shockwave (docs/RENDERING.md): an effect of its
// own pass after the dust (src/render/postProcessing.js), enabled only while
// a wave runs, so it costs nothing otherwise. Its clock is its own (the
// frame's time, as the glitch's): it runs in photo mode too, the canvas
// showing the image again every frame meanwhile (src/app.js).
import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector3, Vector4 } from 'three'
import fragmentShader from '../shaders/shockwave-fragment.glsl'
import { shockwaveAt } from './shockwaveFront'

export default class ShockwaveEffect extends Effect {
	constructor() {
		super('ShockwaveEffect', fragmentShader, {
			attributes: EffectAttribute.CONVOLUTION,
			uniforms: new Map([
				['shockFront', new Uniform(new Vector4())],
				['shockLook', new Uniform(new Vector3())],
			]),
		})
		// The wave's clock (s), null when none runs.
		this.time = null
	}

	get running() {
		return this.time !== null
	}

	// A wave from now.
	trigger() {
		this.time = 0
	}

	// Moves the wave on and sets its uniforms; true while the image must show
	// again (a wave runs, or has just ended).
	step(dt, params) {
		if (this.time === null) return false
		this.time += dt
		const { shockwave } = params
		const wave = shockwaveAt(this.time, shockwave.duration)
		if (!wave) {
			this.time = null
			return true
		}
		this.uniforms
			.get('shockFront')
			.value.set(
				wave.front,
				shockwave.width * wave.width,
				shockwave.push * wave.strength,
				shockwave.split,
			)
		this.uniforms
			.get('shockLook')
			.value.set(shockwave.fray, 3 * this.time, shockwave.glow * wave.strength)
		return true
	}
}
