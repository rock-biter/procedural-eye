// Progressive accumulation (postprocessing Pass): blends each rendered frame
// into a float history at weight 1 / (n + 1), so n still frames give their
// mean, then passes the mean on with an opaque alpha (the history alpha keeps
// the focus distance for the passes that read `history`). reset() restarts
// it; the app resets on any change and stops rendering once the target sample
// count is reached.
import { Pass } from 'postprocessing'
import {
	FloatType,
	NearestFilter,
	RGBAFormat,
	ShaderMaterial,
	Uniform,
	WebGLRenderTarget,
} from 'three'
import fragmentShader from '../shaders/accumulate-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import presentFragmentShader from '../shaders/present-fragment.glsl'

function createHistoryTarget() {
	const target = new WebGLRenderTarget(1, 1, {
		type: FloatType,
		format: RGBAFormat,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: false,
	})
	target.texture.name = 'AccumulationPass.History'
	return target
}

export default class AccumulationPass extends Pass {
	constructor() {
		super('AccumulationPass')
		this.blendMaterial = new ShaderMaterial({
			uniforms: {
				uCurrent: new Uniform(null),
				uHistory: new Uniform(null),
				uWeight: new Uniform(1),
			},
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.presentMaterial = new ShaderMaterial({
			uniforms: { uSource: new Uniform(null) },
			vertexShader,
			fragmentShader: presentFragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.targets = [createHistoryTarget(), createHistoryTarget()]
		this.index = 0
		this.samples = 0
		// Re-presents the current mean without adding a frame (captures).
		this.displayOnly = false
	}

	reset() {
		this.samples = 0
	}

	// The latest mean (alpha: focus distance).
	get history() {
		return this.targets[this.index].texture
	}

	render(renderer, inputBuffer, outputBuffer) {
		if (this.displayOnly) {
			this.present(renderer, this.targets[this.index], outputBuffer)
			return
		}
		const read = this.targets[this.index]
		const write = this.targets[1 - this.index]
		const uniforms = this.blendMaterial.uniforms
		uniforms.uCurrent.value = inputBuffer.texture
		uniforms.uHistory.value = read.texture
		uniforms.uWeight.value = 1 / (this.samples + 1)
		this.fullscreenMaterial = this.blendMaterial
		renderer.setRenderTarget(write)
		renderer.render(this.scene, this.camera)

		this.present(renderer, write, outputBuffer)
		this.index = 1 - this.index
		this.samples++
	}

	present(renderer, source, outputBuffer) {
		this.presentMaterial.uniforms.uSource.value = source.texture
		this.fullscreenMaterial = this.presentMaterial
		renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
		renderer.render(this.scene, this.camera)
	}

	setSize(width, height) {
		for (const target of this.targets) target.setSize(width, height)
		this.reset()
	}

	dispose() {
		super.dispose()
		for (const target of this.targets) target.dispose()
		this.blendMaterial.dispose()
		this.presentMaterial.dispose()
	}
}
