// The post-processing chain: the scene renders offscreen into an RGBA16F
// buffer (alpha holds the apparent focus distance, written by the materials),
// the accumulation pass averages still frames, then one effect pass applies
// the lens and color effects in linear light, tone mapping and film grain.
import {
	ChromaticAberrationEffect,
	Effect,
	EffectComposer,
	EffectPass,
	RenderPass,
	ToneMappingEffect,
	ToneMappingMode,
	VignetteEffect,
} from 'postprocessing'
import { HalfFloatType, SRGBColorSpace, Uniform, Vector2, Vector3 } from 'three'
import { kelvinToLinearRgb, luminance } from '../lighting/colorTemperature'
import colorGradeFragmentShader from '../shaders/color-grade-fragment.glsl'
import filmGrainFragmentShader from '../shaders/film-grain-fragment.glsl'
import AccumulationPass from './accumulationPass'
import DofPass from './dofPass'

const TONE_MAPPING_MODES = {
	agx: ToneMappingMode.AGX,
	aces: ToneMappingMode.ACES_FILMIC,
	neutral: ToneMappingMode.NEUTRAL,
	reinhard: ToneMappingMode.REINHARD2,
	linear: ToneMappingMode.LINEAR,
}

class ColorGradeEffect extends Effect {
	constructor() {
		super('ColorGradeEffect', colorGradeFragmentShader, {
			uniforms: new Map([
				['whiteBalance', new Uniform(new Vector3(1, 1, 1))],
				['saturation', new Uniform(1)],
				['contrast', new Uniform(1)],
			]),
		})
	}

	// Not update(): postprocessing calls effect.update(renderer, inputBuffer, delta) every frame.
	setGrade(post, whiteBalanceKelvin) {
		// Neutralizes a light of `whiteBalanceKelvin` at unchanged luminance.
		const inverse = kelvinToLinearRgb(whiteBalanceKelvin).map((c) => 1 / Math.max(c, 1e-4))
		const scale = 1 / luminance(inverse)
		this.uniforms.get('whiteBalance').value.fromArray(inverse.map((c) => c * scale))
		this.uniforms.get('saturation').value = post.saturation
		this.uniforms.get('contrast').value = post.contrast
	}
}

// Static screen-space grain (film-grain-fragment.glsl), in display space.
class FilmGrainEffect extends Effect {
	constructor() {
		super('FilmGrainEffect', filmGrainFragmentShader, {
			uniforms: new Map([['intensity', new Uniform(0)]]),
		})
		this.inputColorSpace = SRGBColorSpace
	}

	set intensity(value) {
		this.uniforms.get('intensity').value = value
	}
}

export default class PostProcessing {
	constructor(renderer, scene, camera) {
		this.renderer = renderer
		this.composer = new EffectComposer(renderer, {
			frameBufferType: HalfFloatType,
			multisampling: 0,
		})
		this.renderPass = new RenderPass(scene, camera)
		this.accumulation = new AccumulationPass()
		this.dof = new DofPass(() => this.accumulation.history)
		this.colorGrade = new ColorGradeEffect()
		this.chromaticAberration = new ChromaticAberrationEffect({
			offset: new Vector2(),
			radialModulation: true,
			modulationOffset: 0.2,
		})
		this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.35 })
		this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX })
		this.grain = new FilmGrainEffect()
		this.effectPass = new EffectPass(
			camera,
			this.colorGrade,
			this.chromaticAberration,
			this.vignette,
			this.toneMapping,
			this.grain,
		)
		this.composer.addPass(this.renderPass)
		this.composer.addPass(this.accumulation)
		this.composer.addPass(this.dof)
		this.composer.addPass(this.effectPass)
	}

	setCamera(camera) {
		this.renderPass.mainCamera = camera
		this.effectPass.mainCamera = camera
	}

	// `camera`: { focalLength, fNumber, focusDistance, sensorHeight }; the
	// interactive depth of field fades out over the first 16 accumulated samples.
	update(params, size, camera) {
		const post = params.post
		this.dof.setLens({ ...camera, heightPx: size.height })
		const samples = this.accumulation.samples
		this.dof.weight = 1 - Math.min(1, Math.max(0, (samples - 1) / 15))
		this.toneMapping.mode = TONE_MAPPING_MODES[post.toneMapping] ?? ToneMappingMode.AGX
		this.renderer.toneMappingExposure = 2 ** params.camera.exposure
		this.colorGrade.setGrade(post, params.camera.whiteBalance)
		// Lateral aberration in pixels, as a fraction of the buffer size.
		this.chromaticAberration.offset.set(
			post.chromaticAberration / size.width,
			post.chromaticAberration / size.height,
		)
		this.vignette.darkness = post.vignette
		this.grain.intensity = post.grain
	}

	render() {
		this.composer.render()
	}

	setSize(width, height) {
		this.composer.setSize(width, height)
	}
}
