// The skin's pigment patterns (melanin and blood mottling, veins, oily
// patches), baked on the GPU (skin-pattern-fragment.glsl) over the front-plane
// box of the lid mesh at rest whenever the lids are rebuilt: they depend only
// on the rest position and lids.seed. Mipmapped, so the far skin is filtered.
import {
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	UnsignedByteType,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import fragmentShader from '../shaders/skin-pattern-fragment.glsl'

// About 0.03 mm per texel over the lid mesh (some 65 mm across): the finest
// veins are a few texels wide.
export const SKIN_PATTERN_SIZE = 2048

export default class SkinPattern {
	constructor() {
		this.target = new WebGLRenderTarget(SKIN_PATTERN_SIZE, SKIN_PATTERN_SIZE, {
			type: UnsignedByteType,
			format: RGBAFormat,
			minFilter: LinearMipmapLinearFilter,
			magFilter: LinearFilter,
			generateMipmaps: true,
			depthBuffer: false,
		})
		this.target.texture.name = 'SkinPattern'
		this.material = new ShaderMaterial({
			uniforms: { uBox: new Uniform(new Vector4()), uSeed: new Uniform(1) },
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.material.name = 'SkinPatternBake'
		this.scene = new Scene()
		this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material))
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		// The box the texture covers: min x, min y, 1 / width, 1 / height (mm).
		this.box = new Vector4(0, 0, 1, 1)
	}

	get texture() {
		return this.target.texture
	}

	// `box`: { min: [x, y], max: [x, y] } in the front plane (mm).
	bake(renderer, box, seed) {
		const width = box.max[0] - box.min[0]
		const height = box.max[1] - box.min[1]
		this.material.uniforms.uBox.value.set(box.min[0], box.min[1], width, height)
		this.material.uniforms.uSeed.value = seed
		this.box.set(box.min[0], box.min[1], 1 / width, 1 / height)
		const previous = renderer.getRenderTarget()
		renderer.setRenderTarget(this.target)
		renderer.render(this.scene, this.camera)
		renderer.setRenderTarget(previous)
	}

	dispose() {
		this.target.dispose()
		this.material.dispose()
	}
}
