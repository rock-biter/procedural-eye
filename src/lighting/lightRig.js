// Feeds the analytic rig (src/lighting/envRig.js) to the materials: one set of
// env uniforms per space (eye space for the eyeball, world space for what does
// not turn with the gaze), rebuilt every frame because the camera-mounted
// emitters follow the camera.
import { Uniform, Vector3, Vector4 } from 'three'
import {
	buildEmitters,
	EMITTER_VEC4S,
	flashRig,
	MAX_EMITTERS,
	packBackground,
	packEmitters,
	sceneLuminance,
} from './envRig'

function createEnvUniforms() {
	return {
		uEmitters: new Uniform(new Float32Array(MAX_EMITTERS * EMITTER_VEC4S * 4)),
		uEmitterCount: new Uniform(0),
		uRoom: new Uniform(new Vector4()),
		uSkyZenith: new Uniform(new Vector4()),
		uSkyHorizon: new Uniform(new Vector4()),
		uSkyGround: new Uniform(new Vector4()),
		uEnvUp: new Uniform(new Vector3(0, 1, 0)),
	}
}

export default class LightRig {
	constructor() {
		this.eyeUniforms = createEnvUniforms()
		this.worldUniforms = createEnvUniforms()
		this.emitters = []
		this.luminance = 0
	}

	// `camera`: the three camera; `worldToEye`: Matrix4 of the eye rig;
	// `flash`: { color (linear), gain, amount } of the Terminator glitch's
	// red flash, or null. The luminance (the pupil's, the exposure's) is the
	// rig's own: the flash does not move them.
	update(lighting, camera, worldToEye, flash = null) {
		const e = camera.matrixWorld.elements
		const pose = {
			position: [e[12], e[13], e[14]],
			right: [e[0], e[1], e[2]],
			up: [e[4], e[5], e[6]],
		}
		this.emitters = buildEmitters(lighting, pose)
		this.luminance = sceneLuminance(lighting, this.emitters)
		const background = packBackground(lighting)
		if (flash) flashRig(this.emitters, background, flash.color, flash.gain, flash.amount)
		this.apply(this.worldUniforms, null, background)
		this.apply(this.eyeUniforms, worldToEye.elements, background)
		this.eyeUniforms.uEnvUp.value.set(0, 1, 0).transformDirection(worldToEye)
	}

	apply(uniforms, matrix, background) {
		const { count } = packEmitters(this.emitters, matrix, uniforms.uEmitters.value)
		uniforms.uEmitterCount.value = count
		uniforms.uRoom.value.fromArray(background.uRoom)
		uniforms.uSkyZenith.value.fromArray(background.uSkyZenith)
		uniforms.uSkyHorizon.value.fromArray(background.uSkyHorizon)
		uniforms.uSkyGround.value.fromArray(background.uSkyGround)
	}
}
