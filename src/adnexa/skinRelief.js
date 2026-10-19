// The skin's micro-relief, fine wrinkles and freckles, baked on the GPU
// (skin-relief-bake-fragment.glsl) over the front-plane box of the skin
// patterns (src/adnexa/skinPattern.js), so that outside #debug the skin
// program reads them (SKIN_BAKED) instead of hashing some hundred cells per
// pixel. They depend only on the lid mesh at rest, lids.seed and the
// structural skin params (pores, wrinkles, freckles): the lids bake them
// again when those change. Mipmapped; the skin reads them at the mip level of
// its footprint.
//   lids: the lid mesh laid onto the box, nearest the viewer in front, over
//     an underlay of the shell's relief for the texels it leaves uncovered
//     (two renders, the underlay first);
//   shell: the back shell's relief (its coordinates lie inside the box);
//   freckles: their coverage.
import {
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RedFormat,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	UnsignedByteType,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import fragmentShader from '../shaders/skin-relief-bake-fragment.glsl'
import vertexShader from '../shaders/skin-relief-bake-vertex.glsl'

// About 0.016 mm per texel over the lid mesh (some 65 mm across): the
// furrows, 0.016 mm wide, keep their sharpness up to the closest zoom. The
// shell is seen from afar, the freckles are 0.16 mm across at least.
export const SKIN_RELIEF_SIZE = Object.freeze({ lids: 4096, shell: 2048, freckles: 2048 })

function createTarget(size, { format = RGBAFormat, depthBuffer = false } = {}) {
	const target = new WebGLRenderTarget(size, size, {
		type: UnsignedByteType,
		format,
		minFilter: LinearMipmapLinearFilter,
		magFilter: LinearFilter,
		generateMipmaps: true,
		depthBuffer,
	})
	return target
}

export default class SkinRelief {
	// `uniforms`: the skin program's (uSkin, uSkin2, uSkin3, uCanthi,
	// uMarginLength), shared by the bake.
	constructor(uniforms) {
		this.targets = {
			lids: createTarget(SKIN_RELIEF_SIZE.lids, { depthBuffer: true }),
			shell: createTarget(SKIN_RELIEF_SIZE.shell),
			freckles: createTarget(SKIN_RELIEF_SIZE.freckles, { format: RedFormat }),
		}
		for (const [name, target] of Object.entries(this.targets)) {
			target.texture.name = `SkinRelief.${name}`
		}
		this.uniforms = {
			uZero: new Uniform(0),
			uBox: new Uniform(new Vector4()),
			uFootprint: new Uniform(0.016),
			uSkin: uniforms.uSkin,
			uSkin2: uniforms.uSkin2,
			uSkin3: uniforms.uSkin3,
			uCanthi: uniforms.uCanthi,
			uMarginLength: uniforms.uMarginLength,
		}
		const material = (name, defines = {}) => {
			const result = new ShaderMaterial({
				uniforms: this.uniforms,
				defines,
				vertexShader,
				fragmentShader,
			})
			result.name = name
			return result
		}
		this.lidMaterial = material('SkinReliefBake')
		this.underlayMaterial = material('SkinReliefShellBake', { RELIEF_UNDERLAY: '', SKIN_SHELL: '' })
		this.underlayMaterial.depthTest = false
		this.underlayMaterial.depthWrite = false
		this.frecklesMaterial = material('SkinFrecklesBake', { RELIEF_UNDERLAY: '', FRECKLES: '' })
		this.frecklesMaterial.depthTest = false
		this.frecklesMaterial.depthWrite = false
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.underlayMaterial)
		this.quad.frustumCulled = false
		// The lid ring's geometry, the lids' (src/adnexa/lids.js), set by bake().
		this.lidMesh = new Mesh(undefined, this.lidMaterial)
		this.lidMesh.frustumCulled = false
		this.scene = new Scene()
		this.scene.add(this.quad, this.lidMesh)
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		// The texel sizes (mm), for the mip level the skin reads them at.
		this.texel = { lids: 1, shell: 1, freckles: 1 }
		// The inputs of the textures (null: never baked).
		this.key = null
		// How long the last bake took (ms, CPU side).
		this.bakeMs = null
	}

	textures() {
		return {
			lids: this.targets.lids.texture,
			shell: this.targets.shell.texture,
			freckles: this.targets.freckles.texture,
		}
	}

	// Bakes over `box` (min x, min y, 1 / width, 1 / height, mm, as
	// SkinPattern.box) the lid ring `geometry` (positions at rest, `lid`,
	// `relief`), with the skin uniforms as they are, unless `key` says nothing
	// changed.
	bake(renderer, box, geometry, key) {
		if (key === this.key) return false
		const started = performance.now()
		const width = 1 / box.z
		const height = 1 / box.w
		this.uniforms.uBox.value.set(box.x, box.y, width, height)
		const previous = renderer.getRenderTarget()
		const autoClear = renderer.autoClear
		renderer.autoClear = false
		// One mesh per render: the underlay first, then the lid ring over it.
		// Drawn together, the renderer's sort would pick their order (WebGL's
		// by material, which drew the underlay last, over the whole ring).
		const render = (mesh) => {
			this.quad.visible = mesh === this.quad
			this.lidMesh.visible = mesh === this.lidMesh
			renderer.render(this.scene, this.camera)
		}
		const draw = (name, { quad, lids = false }) => {
			const size = SKIN_RELIEF_SIZE[name]
			this.texel[name] = Math.max(width, height) / size
			this.uniforms.uFootprint.value = this.texel[name]
			this.quad.material = quad
			// The quad covers every texel; the clear resets the depth.
			renderer.setRenderTarget(this.targets[name])
			renderer.clear()
			render(this.quad)
			if (lids) render(this.lidMesh)
		}
		this.lidMesh.geometry = geometry
		draw('lids', { quad: this.underlayMaterial, lids: true })
		draw('shell', { quad: this.underlayMaterial })
		draw('freckles', { quad: this.frecklesMaterial })
		renderer.setRenderTarget(previous)
		renderer.autoClear = autoClear
		this.key = key
		this.bakeMs = performance.now() - started
		return true
	}

	dispose() {
		for (const target of Object.values(this.targets)) target.dispose()
		this.lidMaterial.dispose()
		this.underlayMaterial.dispose()
		this.frecklesMaterial.dispose()
		this.quad.geometry.dispose()
	}
}
