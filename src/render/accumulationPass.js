// Progressive accumulation (postprocessing Pass): blends each rendered frame
// into a float history at weight 1 / (n + 1), so n still frames give their
// mean. The next pass (src/render/dofPass.js) reads the mean from `history`,
// whose alpha keeps the focus distance, so this pass writes no output buffer.
// reset() restarts it; the app resets on any change and stops rendering once
// the target sample count is reached.
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
		this.fullscreenMaterial = this.blendMaterial
		this.targets = [createHistoryTarget(), createHistoryTarget()]
		this.index = 0
		this.samples = 0
		// Keeps the current mean without adding a frame (captures).
		this.displayOnly = false
		// The output buffer is left as it is: the next pass reads `history`.
		this.needsSwap = false
	}

	reset() {
		this.samples = 0
	}

	// The latest mean (alpha: focus distance).
	get history() {
		return this.targets[this.index].texture
	}

	render(renderer, inputBuffer) {
		if (this.displayOnly) return
		const read = this.targets[this.index]
		const write = this.targets[1 - this.index]
		const uniforms = this.blendMaterial.uniforms
		uniforms.uCurrent.value = inputBuffer.texture
		uniforms.uHistory.value = read.texture
		uniforms.uWeight.value = 1 / (this.samples + 1)
		renderer.setRenderTarget(write)
		renderer.render(this.scene, this.camera)
		this.index = 1 - this.index
		this.samples++
	}

	setSize(width, height) {
		for (const target of this.targets) target.setSize(width, height)
		this.reset()
	}

	dispose() {
		super.dispose()
		for (const target of this.targets) target.dispose()
		this.blendMaterial.dispose()
	}
}
