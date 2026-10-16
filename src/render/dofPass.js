// Depth of field for interactive frames (postprocessing Pass): a physical
// gather at half resolution (dof-gather-fragment.glsl) over the color and
// blur radius prepared at that resolution (dof-prepare-fragment.glsl),
// composited over the sharp accumulated mean with an opaque alpha for the
// effects. The largest blur radius per tile, spread over the neighboring
// tiles (dof-tiles-fragment.glsl, dof-dilate-fragment.glsl), bounds each
// pixel's spiral. Accumulated frames get their depth of field from the lens
// samples instead, so the gather fades out over the first samples. A split
// frame (src/render/scenePass.js) shaded part of the image at half resolution
// only: alpha −1 marks the pixels it left out of the full-resolution one.
import { Pass } from 'postprocessing'
import {
	HalfFloatType,
	LinearFilter,
	NearestFilter,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import compositeShader from '../shaders/dof-composite-fragment.glsl'
import dilateShader from '../shaders/dof-dilate-fragment.glsl'
import gatherShader from '../shaders/dof-gather-fragment.glsl'
import prepareShader from '../shaders/dof-prepare-fragment.glsl'
import tilesShader from '../shaders/dof-tiles-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import { FOCUS_AT_INFINITY } from '../renderSetup'

// Half-resolution texels per tile side: 20 full-resolution pixels, more than
// the gather's largest radius (MAX_RADIUS in dof-gather-fragment.glsl), so the
// tile and its neighbors hold every tap of its pixels. Even, so a 2×2 quad of
// fragments never straddles two tiles.
const TILE = 10

function createHalfTarget(filter) {
	return new WebGLRenderTarget(1, 1, {
		type: HalfFloatType,
		minFilter: filter,
		magFilter: filter,
		depthBuffer: false,
	})
}

export default class DofPass extends Pass {
	// `focus`: () => the accumulated mean (rgb; alpha: the focus distance);
	// `half`: the half-resolution share of split frames.
	constructor(focus, half) {
		super('DofPass')
		this.focus = focus
		// Whether `prepared` holds the last frame's radii at the current size.
		this.preparedLast = false
		// Half resolution: the color and signed blur radius, then the gather.
		this.prepared = createHalfTarget(NearestFilter)
		this.target = createHalfTarget(LinearFilter)
		// The largest blur radius per tile, then over its neighbors.
		this.tiles = createHalfTarget(NearestFilter)
		this.tileMax = createHalfTarget(NearestFilter)
		this.prepare = new ShaderMaterial({
			uniforms: {
				uSource: new Uniform(null),
				uHalf: new Uniform(half),
				uLens: new Uniform(new Vector4()),
			},
			vertexShader,
			fragmentShader: prepareShader,
			depthTest: false,
			depthWrite: false,
		})
		this.tileReduce = new ShaderMaterial({
			uniforms: {
				uZero: new Uniform(0),
				uPrepared: new Uniform(this.prepared.texture),
				uBackdropRadius: new Uniform(Infinity),
			},
			defines: { DOF_TILE: TILE },
			vertexShader,
			fragmentShader: tilesShader,
			depthTest: false,
			depthWrite: false,
		})
		this.dilate = new ShaderMaterial({
			uniforms: { uTiles: new Uniform(this.tiles.texture) },
			vertexShader,
			fragmentShader: dilateShader,
			depthTest: false,
			depthWrite: false,
		})
		this.gather = new ShaderMaterial({
			uniforms: {
				uPrepared: new Uniform(this.prepared.texture),
				uTileMax: new Uniform(this.tileMax.texture),
				uTexel: new Uniform(new Vector2()),
			},
			defines: { DOF_TILE: TILE },
			vertexShader,
			fragmentShader: gatherShader,
			depthTest: false,
			depthWrite: false,
		})
		this.composite = new ShaderMaterial({
			uniforms: {
				uSharp: new Uniform(null),
				uHalf: new Uniform(half),
				uBlurred: new Uniform(this.target.texture),
				uWeight: new Uniform(1),
			},
			vertexShader,
			fragmentShader: compositeShader,
			depthTest: false,
			depthWrite: false,
		})
		this.weight = 1
	}

	// Lens of the current frame: focal length, f-number, focus distance (mm),
	// sensor height (mm) and the drawing-buffer height (px).
	setLens({ focalLength, fNumber, focusDistance, sensorHeight, heightPx }) {
		const lens = this.prepare.uniforms.uLens.value.set(
			(focalLength * focalLength) / fNumber,
			focusDistance,
			focusDistance - focalLength,
			heightPx / sensorHeight,
		)
		// The radius dof-prepare-fragment.glsl gives a point halfway to the
		// backdrop's distance: only the backdrop lies farther.
		const distance = FOCUS_AT_INFINITY / 2
		this.tileReduce.uniforms.uBackdropRadius.value =
			(0.5 * lens.x * (distance - lens.y) * lens.w) / (distance * lens.z)
	}

	render(renderer, inputBuffer, outputBuffer) {
		const mean = this.focus()
		this.preparedLast = this.weight > 0
		if (this.weight <= 0) {
			this.composite.uniforms.uWeight.value = 0
		} else {
			this.prepare.uniforms.uSource.value = mean
			this.fullscreenMaterial = this.prepare
			renderer.setRenderTarget(this.prepared)
			renderer.render(this.scene, this.camera)
			this.fullscreenMaterial = this.tileReduce
			renderer.setRenderTarget(this.tiles)
			renderer.render(this.scene, this.camera)
			this.fullscreenMaterial = this.dilate
			renderer.setRenderTarget(this.tileMax)
			renderer.render(this.scene, this.camera)
			this.fullscreenMaterial = this.gather
			renderer.setRenderTarget(this.target)
			renderer.render(this.scene, this.camera)
		}
		this.composite.uniforms.uSharp.value = mean
		this.composite.uniforms.uWeight.value = this.weight
		this.fullscreenMaterial = this.composite
		renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
		renderer.render(this.scene, this.camera)
	}

	setSize(width, height) {
		const half = [Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2))]
		this.prepared.setSize(...half)
		this.target.setSize(...half)
		this.preparedLast = false
		const tiles = half.map((size) => Math.ceil(size / TILE))
		this.tiles.setSize(...tiles)
		this.tileMax.setSize(...tiles)
		this.gather.uniforms.uTexel.value.set(1 / width, 1 / height)
	}

	dispose() {
		super.dispose()
		this.prepared.dispose()
		this.target.dispose()
		this.tiles.dispose()
		this.tileMax.dispose()
		this.prepare.dispose()
		this.tileReduce.dispose()
		this.dilate.dispose()
		this.gather.dispose()
		this.composite.dispose()
	}
}
