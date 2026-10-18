// The scene pass (postprocessing Pass, in place of its RenderPass): renders the
// scene into the composer's input buffer. A `split` frame, shown once and not
// kept (a living eye), shades at full resolution only where the depth of field
// keeps the image sharp, and the rest at half resolution into `half`: there
// the composite shows the half-resolution gather anyway (src/render/dofPass.js).
// The last frame's blur radii, spread over the neighboring texels
// (shading-spread-fragment.glsl), decide where each pixel goes. A full-screen
// triangle, the first thing the scene draws in a split frame, marks the pixels
// a pass leaves out with alpha −1 and covers them at the near plane, so the
// depth test skips their shading (shading-block-fragment.glsl). It belongs to
// the scene because three invalidates a multisampled target after each render.
// `half` takes 4 samples per pixel: lashes thinner than its pixels would
// otherwise break into dots, where the full-resolution frame averages four
// pixels per texel.
import { Pass } from 'postprocessing'
import {
	AlwaysDepth,
	BufferGeometry,
	Float32BufferAttribute,
	HalfFloatType,
	Mesh,
	NearestFilter,
	ShaderMaterial,
	Uniform,
	WebGLRenderTarget,
} from 'three'
import { DRAW_ORDER } from './drawOrder'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import blockShader from '../shaders/shading-block-fragment.glsl'
import spreadShader from '../shaders/shading-spread-fragment.glsl'

// Blur radius (full-resolution pixels) under which a pixel is shaded at full
// resolution: the composite shows the gather in full from 2.5 px on
// (dof-composite-fragment.glsl), and the margin absorbs a little change.
export const SHARP_RADIUS = 3

function createHalfTarget(options) {
	return new WebGLRenderTarget(1, 1, {
		type: HalfFloatType,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: false,
		...options,
	})
}

export default class ScenePass extends Pass {
	// `radii`: () => the last frame's prepared depth of field (alpha: signed
	// blur radius), or null when it is missing or stale.
	constructor(scene, camera, radii) {
		super('ScenePass')
		this.main = { scene, camera }
		this.radii = radii
		this.needsSwap = false
		// Set per frame by the owner.
		this.split = false
		// (scale) => scales the pixel footprint of the materials (2: half resolution).
		this.setPixelScale = () => {}
		this.half = createHalfTarget({ depthBuffer: true, samples: 4 })
		this.spread = createHalfTarget()
		this.spreadMaterial = new ShaderMaterial({
			uniforms: { uPrepared: new Uniform(null) },
			vertexShader,
			fragmentShader: spreadShader,
			depthTest: false,
			depthWrite: false,
		})
		const triangle = new BufferGeometry()
		triangle.setAttribute(
			'position',
			new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
		)
		this.block = new Mesh(
			triangle,
			new ShaderMaterial({
				uniforms: {
					uSpread: new Uniform(this.spread.texture),
					uSharpShare: new Uniform(true),
				},
				defines: { NEAR_PLANE: '', SHARP_RADIUS: SHARP_RADIUS.toFixed(1) },
				vertexShader,
				fragmentShader: blockShader,
				depthFunc: AlwaysDepth,
			}),
		)
		this.block.name = 'SplitShadingBlock'
		this.block.frustumCulled = false
		this.block.renderOrder = DRAW_ORDER.shadingBlock
		this.block.visible = false
		scene.add(this.block)
	}

	// The composer's setters (Pass declares them without getters).
	set mainScene(value) {
		this.main.scene = value
	}

	set mainCamera(value) {
		this.main.camera = value
	}

	render(renderer, inputBuffer) {
		const prepared = this.split ? this.radii() : null
		if (prepared === null) {
			this.renderTo(renderer, inputBuffer)
			return
		}
		this.spreadMaterial.uniforms.uPrepared.value = prepared
		this.fullscreenMaterial = this.spreadMaterial
		renderer.setRenderTarget(this.spread)
		renderer.render(this.scene, this.camera)
		this.block.visible = true
		this.block.material.uniforms.uSharpShare.value = true
		this.renderTo(renderer, inputBuffer)
		this.block.material.uniforms.uSharpShare.value = false
		this.setPixelScale(2)
		this.renderTo(renderer, this.half)
		this.setPixelScale(1)
		this.block.visible = false
	}

	renderTo(renderer, target) {
		renderer.setRenderTarget(target)
		renderer.clear()
		renderer.render(this.main.scene, this.main.camera)
	}

	setSize(width, height) {
		const half = [Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2))]
		this.half.setSize(...half)
		this.spread.setSize(...half)
	}

	dispose() {
		super.dispose()
		this.block.removeFromParent()
		this.block.geometry.dispose()
		this.block.material.dispose()
		this.half.dispose()
		this.spread.dispose()
		this.spreadMaterial.dispose()
	}
}
