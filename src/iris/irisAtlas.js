// The iris structure atlas: everything that depends only on the rest (θ, ρ)
// position, baked on the GPU (iris-bake-fragment.glsl) when the structure
// parameters change, into a mipmapped RGBA16F polar texture that repeats in
// θ. The trace samples it at the mip level of its ray footprint.
import {
	ClampToEdgeWrapping,
	DataTexture,
	FloatType,
	HalfFloatType,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	NearestFilter,
	OrthographicCamera,
	PlaneGeometry,
	RedFormat,
	RepeatWrapping,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import fragmentShader from '../shaders/iris-bake-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import {
	COLLARETTE_SAMPLES,
	MAX_FRECKLES,
	MAX_FURROWS,
	createCollaretteCurve,
	createFreckles,
	createFurrows,
	packFreckles,
	packFurrows,
} from './irisFeatures'

export const IRIS_ATLAS_SIZE = Object.freeze({ width: 2048, height: 256 })

function createAtlasTarget(name) {
	const target = new WebGLRenderTarget(IRIS_ATLAS_SIZE.width, IRIS_ATLAS_SIZE.height, {
		type: HalfFloatType,
		format: RGBAFormat,
		wrapS: RepeatWrapping,
		wrapT: ClampToEdgeWrapping,
		minFilter: LinearMipmapLinearFilter,
		magFilter: LinearFilter,
		generateMipmaps: true,
		depthBuffer: false,
	})
	target.texture.name = name
	return target
}

// Two atlases share one bake shader: the structure atlas (height, crypts,
// collarette distance) and, with PIGMENT_PASS, the pigment atlas (ABL
// melanin, eumelanin share, freckle and nodule masks).
export default class IrisAtlas {
	constructor() {
		this.target = createAtlasTarget('IrisAtlas')
		this.pigmentTarget = createAtlasTarget('IrisPigment')
		this.collarette = new DataTexture(
			new Float32Array(COLLARETTE_SAMPLES),
			COLLARETTE_SAMPLES,
			1,
			RedFormat,
			FloatType,
		)
		this.collarette.minFilter = NearestFilter
		this.collarette.magFilter = NearestFilter
		this.furrows = []
		this.material = new ShaderMaterial({
			defines: { COLLARETTE_SAMPLES, MAX_FURROWS },
			uniforms: {
				uZero: new Uniform(0),
				uRest: new Uniform(new Vector4()),
				uThickness: new Uniform(new Vector4()),
				uRidge: new Uniform(new Vector2()),
				uSurface: new Uniform(new Vector3()),
				uCollarette: new Uniform(this.collarette),
				uFurrows: new Uniform(new Float32Array(MAX_FURROWS * 8)),
				uFurrowCount: new Uniform(0),
				uCrypts: new Uniform(new Vector4()),
				uCryptsShape: new Uniform(new Vector4()),
				uNodules: new Uniform(new Vector4()),
				uSeed: new Uniform(1),
			},
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.material.name = 'IrisAtlasBake'
		this.pigmentMaterial = new ShaderMaterial({
			defines: { COLLARETTE_SAMPLES, MAX_FURROWS, MAX_FRECKLES, PIGMENT_PASS: '' },
			uniforms: {
				...this.material.uniforms,
				uPigment: new Uniform(new Vector4()),
				uHeterochromia: new Uniform(new Vector4()),
				uPigmentMisc: new Uniform(new Vector4()),
				uFreckles: new Uniform(new Float32Array(MAX_FRECKLES * 8)),
				uFreckleCount: new Uniform(0),
				uFreckleColor: new Uniform(new Vector2()),
			},
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.pigmentMaterial.name = 'IrisPigmentBake'
		this.scene = new Scene()
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
		this.scene.add(this.quad)
		this.freckles = []
	}

	get texture() {
		return this.target.texture
	}

	get pigmentTexture() {
		return this.pigmentTarget.texture
	}

	// `space`: createIrisSpace() of the current params; `nasalSign`: +1 for a
	// right eye. The structure bakes again only when its inputs changed, so a
	// glide of the color alone leaves it as it is; the pigment, which reads the
	// structure's uniforms too, when either changed.
	bake(renderer, params, space, nasalSign = 1) {
		const s = params.irisStructure
		const color = params.irisColor
		const structureKey = JSON.stringify([s, space.rp0, space.R, space.rc0])
		const pigmentKey = JSON.stringify([color, nasalSign])
		const structure = structureKey !== this.structureKey
		const pigment = structure || pigmentKey !== this.pigmentKey
		this.structureKey = structureKey
		this.pigmentKey = pigmentKey
		const previous = renderer.getRenderTarget()
		if (structure) this.bakeStructure(renderer, s, space)
		if (pigment) this.bakePigment(renderer, color, s.seed, nasalSign)
		renderer.setRenderTarget(previous)
	}

	bakeStructure(renderer, s, space) {
		this.collarette.image.data.set(
			createCollaretteCurve({
				position: s.collarette.position,
				amplitude: s.collarette.amplitude,
				teeth: s.collarette.teeth,
				irregularity: s.collarette.irregularity,
				seed: s.seed,
			}),
		)
		this.collarette.needsUpdate = true
		this.furrows = createFurrows({ ...s.furrows, seed: s.seed })
		const u = this.material.uniforms
		packFurrows(this.furrows, u.uFurrows.value)
		u.uFurrowCount.value = this.furrows.length
		u.uRest.value.set(space.rp0, space.R, space.rc0, 0)
		u.uThickness.value.set(
			s.marginThickness,
			s.collaretteThickness,
			s.rootThickness,
			s.collarette.position,
		)
		u.uRidge.value.set(s.collarette.height, s.collarette.width)
		u.uSurface.value.set(
			s.surface.radialNoise,
			Math.round(s.surface.radialFrequency),
			s.surface.undulation,
		)
		const c = s.crypts
		u.uCrypts.value.set(c.grade, c.size, c.band, c.elongation)
		u.uCryptsShape.value.set(c.peripheral, c.depth, c.wall, c.roundness)
		u.uNodules.value.set(s.nodules.count, s.nodules.size, s.nodules.ring, 0)
		u.uSeed.value = s.seed >>> 0
		this.quad.material = this.material
		renderer.setRenderTarget(this.target)
		renderer.render(this.scene, this.camera)
	}

	bakePigment(renderer, color, seed, nasalSign) {
		const p = this.pigmentMaterial.uniforms
		p.uPigment.value.set(color.ablMelanin, color.eumelanin, color.variation, 0)
		const h = color.heterochromia
		p.uHeterochromia.value.set(h.amount, h.melanin, h.eumelanin, h.extent)
		p.uPigmentMisc.value.set(h.softness, color.periphery.amount, color.periphery.width, 0)
		this.freckles = createFreckles({ ...color.freckles, seed }, nasalSign)
		packFreckles(this.freckles, p.uFreckles.value)
		p.uFreckleCount.value = this.freckles.length
		p.uFreckleColor.value.set(color.freckles.melanin, color.freckles.eumelanin)
		this.quad.material = this.pigmentMaterial
		renderer.setRenderTarget(this.pigmentTarget)
		renderer.render(this.scene, this.camera)
	}

	dispose() {
		this.target.dispose()
		this.pigmentTarget.dispose()
		this.collarette.dispose()
		this.material.dispose()
		this.pigmentMaterial.dispose()
	}
}
