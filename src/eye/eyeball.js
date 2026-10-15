// The eyeball: one mesh in eye space with two programs (src/eye/eyeballGeometry.js
// groups) sharing one set of uniforms: the optics of the cornea and limbus,
// and the light sclera program.
import { Color, Matrix4, Mesh, ShaderMaterial, Uniform, Vector2, Vector3, Vector4 } from 'three'
import { apertureRadius } from '../camera/cameraOptics'
import { debugViewDefine } from '../debug/debugViews'
import { IRIS_ATLAS_SIZE } from '../iris/irisAtlas'
import { IRIS_COLOR_LUT } from '../iris/irisColor'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import capFragmentShader from '../shaders/eyeball-cap-fragment.glsl'
import scleraFragmentShader from '../shaders/eyeball-sclera-fragment.glsl'
import vertexShader from '../shaders/eyeball-vertex.glsl'
import { createEyeballGeometry } from './eyeballGeometry'

export default class Eyeball {
	// `envUniforms`: the rig uniforms in eye space (src/lighting/lightRig.js);
	// `iris`: { atlas, pigment, colorLut } textures; `shadowUniforms`: the key
	// light's shadow map; `fissure`: { texture, extent } of the fissure map.
	constructor(envUniforms, iris, shadowUniforms, fissure, vessels, debugView) {
		this.uniforms = {
			uZero: new Uniform(0),
			uGlobe: new Uniform(new Vector4()),
			uCornea: new Uniform(new Vector4()),
			uIor: new Uniform(new Vector4()),
			uLens: new Uniform(new Vector4()),
			uIrisShape: new Uniform(new Vector4()),
			uPupil: new Uniform(new Vector4()),
			uCameraEye: new Uniform(new Vector3()),
			uLimbus: new Uniform(new Vector4()),
			uLimbusOverlap: new Uniform(0),
			uScleraColor: new Uniform(new Color()),
			uPixelAngle: new Uniform(0.001),
			uIrisAtlas: new Uniform(iris.atlas),
			uIrisPigment: new Uniform(iris.pigment),
			uIrisColorLut: new Uniform(iris.colorLut),
			uIrisColorMisc: new Uniform(new Vector4()),
			uIrisTint: new Uniform(new Color()),
			uIrisRest: new Uniform(new Vector4()),
			uIrisThicknessResponse: new Uniform(0.6),
			uIrisSteps: new Uniform(64),
			uIrisShadowSteps: new Uniform(10),
			uIrisAoSteps: new Uniform(5),
			uIrisMicroBlur: new Uniform(1e6),
			uDefocus: new Uniform(new Vector2(0, 1)),
			uFiberRadial: new Uniform(new Vector4()),
			uFiberArc: new Uniform(new Vector4()),
			uFiberMisc: new Uniform(new Vector4()),
			uRuff: new Uniform(new Vector4()),
			uIrisSeed: new Uniform(1),
			uEyeToWorld: new Uniform(new Matrix4()),
			uFissureMap: new Uniform(fissure.texture),
			uSclera: new Uniform(new Vector4()),
			uLidReflection: new Uniform(new Vector4()),
			uLidRadiance: new Uniform(new Vector3()),
			uLashRadiance: new Uniform(new Vector3()),
			uScleraVessels: new Uniform(vessels.texture),
			uScleraPsi: new Uniform(new Vector2(vessels.psi.min, vessels.psi.max)),
			uFissureExtent: new Uniform(new Vector2(fissure.extent[0], fissure.extent[1])),
			...envUniforms,
			...shadowUniforms,
		}
		this.defines = {
			MAX_EMITTERS,
			EMITTER_VEC4S,
			IRIS_ATLAS_HEIGHT: IRIS_ATLAS_SIZE.height,
			IRIS_LUT_MELANIN: `${IRIS_COLOR_LUT.melanin}.0`,
			IRIS_LUT_EUMELANIN: `${IRIS_COLOR_LUT.eumelanin}.0`,
			IRIS_LUT_STROMA: `${IRIS_COLOR_LUT.stroma}.0`,
			DEBUG_VIEW: debugViewDefine(debugView),
		}
		const material = (fragmentShader) =>
			new ShaderMaterial({
				uniforms: this.uniforms,
				defines: { ...this.defines },
				vertexShader,
				fragmentShader,
			})
		this.capMaterial = material(capFragmentShader)
		this.capMaterial.name = 'EyeballCap'
		this.scleraMaterial = material(scleraFragmentShader)
		this.scleraMaterial.name = 'EyeballSclera'
		this.mesh = new Mesh(undefined, [this.capMaterial, this.scleraMaterial])
		this.mesh.name = 'Eyeball'
		// Drawn after the lids and lashes: the depth test then skips the costly
		// optics wherever they cover the eye.
		this.mesh.renderOrder = 1
	}

	// New profile (any 'rebuild' parameter): new tessellation.
	rebuild(eye) {
		this.mesh.geometry.dispose()
		this.mesh.geometry = createEyeballGeometry(eye)
	}

	setDebugView(view) {
		const value = debugViewDefine(view)
		for (const material of [this.capMaterial, this.scleraMaterial]) {
			if (material.defines.DEBUG_VIEW === value) continue
			material.defines.DEBUG_VIEW = value
			material.needsUpdate = true
		}
	}

	// Per-frame uniforms from the params, the derived eye geometry, the iris
	// rest space, the camera position in eye space and its pixel angle.
	// `interactive`: a fresh frame while something changes (cheaper shading).
	// `lidRadiance`, `lashRadiance`: linear colors of the skin and the lashes as
	// seen in the reflections; `whiteRadiance`: a white diffuse surface lit by
	// the rig (the scale of the iris glow).
	update(
		params,
		pupilDiameter,
		eye,
		irisSpace,
		cameraEye,
		pixelAngle,
		interactive,
		eyeToWorld,
		lidRadiance,
		lashRadiance,
		whiteRadiance,
	) {
		const u = this.uniforms
		const packed = eye.pack()
		u.uGlobe.value.fromArray(packed.uGlobe)
		u.uCornea.value.fromArray(packed.uCornea)
		u.uIor.value.fromArray(packed.uIor)
		u.uLens.value.fromArray(packed.uLens)
		u.uIrisShape.value.fromArray(packed.uIrisShape)
		u.uPupil.value.set(eye.nasalSign * params.iris.pupilDecentration, 0, pupilDiameter / 2, 0)
		u.uCameraEye.value.copy(cameraEye)
		u.uEyeToWorld.value.copy(eyeToWorld)
		u.uLidRadiance.value.fromArray(lidRadiance)
		u.uLashRadiance.value.fromArray(lashRadiance)
		const limbus = params.limbus
		u.uLimbus.value.set(
			limbus.opacityInner,
			limbus.opacityOuter,
			limbus.ringWidth,
			limbus.ringStrength,
		)
		u.uLimbusOverlap.value = limbus.verticalOverlap
		u.uScleraColor.value.set(params.sclera.color)
		u.uSclera.value.set(
			params.sclera.redness,
			params.sclera.yellowing,
			params.sclera.irregularity,
			0,
		)
		u.uLidReflection.value.set(
			eye.scleraRadius + params.lids.lidThickness * 0.6,
			4.5,
			params.lashes.upperLength * 0.7,
			0,
		)
		u.uPixelAngle.value = pixelAngle
		u.uIrisRest.value.set(irisSpace.rp0, irisSpace.R, irisSpace.rc0, irisSpace.zoneArea)
		u.uIrisThicknessResponse.value = params.irisStructure.thicknessResponse
		u.uIrisSteps.value = params.quality.irisSteps
		const quality = params.quality
		u.uIrisShadowSteps.value = interactive
			? quality.interactiveShadowSteps
			: quality.irisShadowSteps
		u.uIrisAoSteps.value = interactive ? quality.interactiveAoSteps : quality.irisAoSteps
		// Interactive frames leave out the micro striations that the depth of
		// field's gather blurs over two of their widths.
		u.uIrisMicroBlur.value = interactive ? 2 : 1e6
		const lens = params.camera
		u.uDefocus.value.set(2 * apertureRadius(lens.focalLength, lens.fNumber), lens.distance)
		const color = params.irisColor
		u.uIrisColorMisc.value.set(
			color.fiberAbl,
			color.saturation,
			IRIS_COLOR_LUT.maxStroma,
			color.glow * whiteRadiance,
		)
		u.uIrisTint.value.set(color.tint)
		const structure = params.irisStructure
		const f = structure.fibers
		u.uFiberRadial.value.set(f.radialCount, f.radialThickness, f.radialWaviness, f.radialHeight)
		u.uFiberArc.value.set(f.arcCount, f.arcThickness, (f.arcSpan * Math.PI) / 180, f.arcHeight)
		u.uFiberMisc.value.set(f.radialCoverage, f.arcCoverage, f.blend, structure.crypts.undercut)
		u.uRuff.value.set(
			structure.ruff.width,
			structure.ruff.crenations,
			structure.micro.amplitude,
			Math.round(structure.micro.frequency),
		)
		u.uIrisSeed.value = structure.seed >>> 0
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.capMaterial.dispose()
		this.scleraMaterial.dispose()
	}
}
