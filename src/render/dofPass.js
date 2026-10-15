// Depth of field for interactive frames (postprocessing Pass): a physical
// gather at half resolution (dof-gather-fragment.glsl) over the color and
// blur radius prepared at that resolution (dof-prepare-fragment.glsl),
// composited over the sharp accumulated mean with an opaque alpha for the
// effects. Accumulated frames get their depth of field from the lens samples
// instead, so the gather fades out over the first samples.
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
import gatherShader from '../shaders/dof-gather-fragment.glsl'
import prepareShader from '../shaders/dof-prepare-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'

function createHalfTarget(filter) {
	return new WebGLRenderTarget(1, 1, {
		type: HalfFloatType,
		minFilter: filter,
		magFilter: filter,
		depthBuffer: false,
	})
}

export default class DofPass extends Pass {
	// `focus`: () => the accumulated mean (rgb; alpha: the focus distance).
	constructor(focus) {
		super('DofPass')
		this.focus = focus
		// Half resolution: the color and signed blur radius, then the gather.
		this.prepared = createHalfTarget(NearestFilter)
		this.target = createHalfTarget(LinearFilter)
		this.prepare = new ShaderMaterial({
			uniforms: {
				uSource: new Uniform(null),
				uLens: new Uniform(new Vector4()),
			},
			vertexShader,
			fragmentShader: prepareShader,
			depthTest: false,
			depthWrite: false,
		})
		this.gather = new ShaderMaterial({
			uniforms: {
				uPrepared: new Uniform(this.prepared.texture),
				uTexel: new Uniform(new Vector2()),
			},
			vertexShader,
			fragmentShader: gatherShader,
			depthTest: false,
			depthWrite: false,
		})
		this.composite = new ShaderMaterial({
			uniforms: {
				uSharp: new Uniform(null),
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
		this.prepare.uniforms.uLens.value.set(
			(focalLength * focalLength) / fNumber,
			focusDistance,
			focusDistance - focalLength,
			heightPx / sensorHeight,
		)
	}

	render(renderer, inputBuffer, outputBuffer) {
		const mean = this.focus()
		if (this.weight <= 0) {
			this.composite.uniforms.uWeight.value = 0
		} else {
			this.prepare.uniforms.uSource.value = mean
			this.fullscreenMaterial = this.prepare
			renderer.setRenderTarget(this.prepared)
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
		this.gather.uniforms.uTexel.value.set(1 / width, 1 / height)
	}

	dispose() {
		super.dispose()
		this.prepared.dispose()
		this.target.dispose()
		this.prepare.dispose()
		this.gather.dispose()
		this.composite.dispose()
	}
}
