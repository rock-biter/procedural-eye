// Depth of field for interactive frames (postprocessing Pass): a physical
// gather at half resolution (dof-gather-fragment.glsl), composited over the
// sharp frame. Accumulated frames get their depth of field from the lens
// samples instead, so the pass fades out over the first samples.
import { Pass } from 'postprocessing'
import {
	HalfFloatType,
	LinearFilter,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import compositeShader from '../shaders/dof-composite-fragment.glsl'
import gatherShader from '../shaders/dof-gather-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'

export default class DofPass extends Pass {
	// `focus`: () => the texture whose alpha holds the focus distance.
	constructor(focus) {
		super('DofPass')
		this.focus = focus
		this.target = new WebGLRenderTarget(1, 1, {
			type: HalfFloatType,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false,
		})
		this.gather = new ShaderMaterial({
			uniforms: {
				uColor: new Uniform(null),
				uFocus: new Uniform(null),
				uLens: new Uniform(new Vector4()),
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
		this.gather.uniforms.uLens.value.set(
			(focalLength * focalLength) / fNumber,
			focusDistance,
			focusDistance - focalLength,
			heightPx / sensorHeight,
		)
	}

	render(renderer, inputBuffer, outputBuffer) {
		if (this.weight <= 0) {
			this.composite.uniforms.uWeight.value = 0
		} else {
			this.gather.uniforms.uColor.value = inputBuffer.texture
			this.gather.uniforms.uFocus.value = this.focus()
			this.fullscreenMaterial = this.gather
			renderer.setRenderTarget(this.target)
			renderer.render(this.scene, this.camera)
		}
		this.composite.uniforms.uSharp.value = inputBuffer.texture
		this.composite.uniforms.uWeight.value = this.weight
		this.fullscreenMaterial = this.composite
		renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
		renderer.render(this.scene, this.camera)
	}

	setSize(width, height) {
		this.target.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)))
		this.gather.uniforms.uTexel.value.set(1 / width, 1 / height)
	}

	dispose() {
		super.dispose()
		this.target.dispose()
		this.gather.dispose()
		this.composite.dispose()
	}
}
