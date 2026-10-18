// The post-processing chain: the scene renders offscreen into an RGBA16F
// buffer (alpha holds the apparent focus distance, written by the materials),
// the accumulation pass averages still frames, the depth of field blurs fresh
// ones, then one effect pass applies the lens and color effects in linear
// light, tone mapping and film grain. A frame that passes through the
// accumulation is split: what the depth of field blurs is shaded at half
// resolution (src/render/scenePass.js).
import {
	ChromaticAberrationEffect,
	Effect,
	EffectComposer,
	EffectPass,
	ToneMappingEffect,
	ToneMappingMode,
	VignetteEffect,
} from 'postprocessing'
import { HalfFloatType, SRGBColorSpace, Uniform, Vector2, Vector3 } from 'three'
import { veilLights } from '../atmosphere/dustField'
import { kelvinToLinearRgb, luminance } from '../lighting/colorTemperature'
import colorGradeFragmentShader from '../shaders/color-grade-fragment.glsl'
import filmGrainFragmentShader from '../shaders/film-grain-fragment.glsl'
import AccumulationPass from './accumulationPass'
import DofPass from './dofPass'
import DustPass from './dustPass'
import ScenePass from './scenePass'

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

// The air current the dust drifts on (world space, unit): across the face,
// a little backward and settling.
const WIND = new Vector3(1, -0.3, -0.45).normalize()

export default class PostProcessing {
	// `envUniforms`: the light rig in world space, which lights the dust;
	// `keyCoverage`: the key's shadow coverage (src/lighting/shadowCoverage.js),
	// which shadows the dust's key light; `shafts`: the light shafts
	// (src/lighting/shaftLight.js) with their own coverage.
	constructor(renderer, scene, camera, envUniforms, { keyCoverage, shafts }) {
		this.renderer = renderer
		this.composer = new EffectComposer(renderer, {
			frameBufferType: HalfFloatType,
			multisampling: 0,
		})
		this.renderPass = new ScenePass(scene, camera, () =>
			this.dof.preparedLast ? this.dof.prepared.texture : null,
		)
		this.accumulation = new AccumulationPass()
		this.shafts = shafts
		const coverage = { ...keyCoverage.uniforms, ...shafts.coverage.uniforms }
		this.dof = new DofPass(() => this.accumulation.history, this.renderPass.half.texture, {
			...coverage,
			...shafts.uniforms,
			...shafts.air,
		})
		this.dust = new DustPass(
			envUniforms,
			() => this.accumulation.history,
			this.renderPass.half.texture,
			{ ...coverage, ...shafts.uniforms, ...shafts.dust },
		)
		// Split the frames that pass through (params.quality.splitShading).
		this.splitShading = true
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
		this.composer.addPass(this.dust)
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

	// The dust, the haze and the light shafts' origin of this frame. `pinhole`:
	// the camera before the sample's jitter (src/camera/physicalCamera.js);
	// `emitters`: the light rig's; `time`: the dust's clock (s); `beauty`:
	// whether the debug view is the image, the only one with dust and haze (the
	// shafts' light follows it on its own, src/lighting/shaftLight.js).
	updateAtmosphere({ params, pinhole, emitters, time, beauty }) {
		const dust = params.dust
		const { lights, ambient } = veilLights(params.lighting, emitters)
		const projection = pinhole.projection.elements
		this.dof.setVeil({
			density: beauty ? dust.haze / 1000 : 0,
			far: params.camera.distance + dust.extent / 2,
			g: dust.forward,
			lights,
			ambient,
			cameraMatrix: pinhole.matrixWorld,
			tanX: 1 / projection[0],
			tanY: 1 / projection[5],
		})
		this.shafts.air.uShaftOrigin.value.setFromMatrixPosition(pinhole.matrixWorld)
		const pass = this.dust
		pass.setSeed(dust.seed)
		pass.count = dust.enabled && beauty ? dust.count : 0
		const u = pass.uniforms
		u.uView.value.copy(pinhole.view)
		u.uProjection.value.copy(pinhole.projection)
		u.uLens.value.copy(this.dof.prepare.uniforms.uLens.value)
		// The cube is centered on the globe (the world origin), not on the
		// target, which moves with the living eye's framing.
		u.uVolume.value.set(0, 0, 0, dust.extent)
		u.uTime.value = time
		u.uWind.value.copy(WIND).multiplyScalar(dust.drift)
		u.uTurbulence.value = dust.turbulence
		u.uSize.value = dust.size / 1000
		u.uForward.value = dust.forward
		u.uAmbient.value.fromArray(ambient)
		u.uBrightness.value = dust.brightness
		u.uDustShadow.value = dust.shadow
	}

	render() {
		this.renderPass.split = this.splitShading && this.accumulation.passthrough
		this.composer.render()
	}

	setSize(width, height) {
		this.composer.setSize(width, height)
	}
}
