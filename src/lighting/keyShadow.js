// The key light's shadow map: an orthographic camera at the key emitter
// (emitter 0) looking at the eye renders the casters (objects on layer
// SHADOW_LAYER: lids and lashes) into a float depth map. For accumulation
// samples the camera moves to a point on the emitter's area, so the averaged
// hard shadows form the real penumbra; interactive frames estimate it
// (percentage-closer soft shadows, key-shadow.glsl).
import {
	Color,
	DoubleSide,
	Vector2,
	FloatType,
	Matrix4,
	NearestFilter,
	OrthographicCamera,
	RedFormat,
	ShaderMaterial,
	Uniform,
	Vector3,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import fragmentShader from '../shaders/shadow-depth-fragment.glsl'
import vertexShader from '../shaders/shadow-depth-vertex.glsl'

export const SHADOW_LAYER = 1
const SIZE = 2048
// Half extent of the shadowed region around the eye (mm): the whole skin
// patch (the lookup fades out toward the border).
const EXTENT = 40

export default class KeyShadow {
	constructor() {
		this.target = new WebGLRenderTarget(SIZE, SIZE, {
			type: FloatType,
			format: RedFormat,
			minFilter: NearestFilter,
			magFilter: NearestFilter,
		})
		this.target.texture.name = 'KeyShadowMap'
		this.camera = new OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 1, 400)
		this.camera.layers.set(SHADOW_LAYER)
		this.matrix = new Matrix4()
		// The renderer's clear state, restored after the shadow pass.
		this.clearColor = new Color()
		// Shared with every material near the lids: the shadow map, and the
		// lids' gaze follow (lid-follow.glsl), which the casters need too.
		this.uniforms = {
			uKeyShadowMap: new Uniform(this.target.texture),
			uKeyShadowMatrix: new Uniform(this.matrix),
			uKeyShadowParams: new Uniform(new Vector4(0, 0, 0, 0)),
			uLidFollow: new Uniform(new Vector2()),
		}
		this.material = new ShaderMaterial({
			uniforms: { uLidFollow: this.uniforms.uLidFollow },
			vertexShader,
			fragmentShader,
			side: DoubleSide,
		})
		this.center = new Vector3()
		this.light = new Vector3()
	}

	// `emitter`: the key emitter of buildEmitters() or null; `sample`: an
	// accumulation sample (its `light` pair picks the point on the emitter).
	render(renderer, scene, emitter, target, sample) {
		const params = this.uniforms.uKeyShadowParams.value
		if (!emitter) {
			params.z = 0
			return
		}
		this.center.fromArray(target)
		this.light.fromArray(emitter.center)
		if (sample) {
			const [a, b] = sample.light
			const u = (a * 2 - 1) * emitter.halfWidth
			const v = (b * 2 - 1) * emitter.halfHeight
			this.light.x += emitter.u[0] * u + emitter.v[0] * v
			this.light.y += emitter.u[1] * u + emitter.v[1] * v
			this.light.z += emitter.u[2] * u + emitter.v[2] * v
		}
		// Keep the camera close: the region is small and depth precision matters.
		const direction = this.light.clone().sub(this.center).normalize()
		this.camera.position.copy(this.center).addScaledVector(direction, 120)
		this.camera.lookAt(this.center)
		this.camera.near = 40
		this.camera.far = 200
		this.camera.updateProjectionMatrix()
		this.camera.updateMatrixWorld()
		this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)

		const previousTarget = renderer.getRenderTarget()
		const previousOverride = scene.overrideMaterial
		const previousBackground = scene.background
		scene.overrideMaterial = this.material
		scene.background = null
		renderer.setRenderTarget(this.target)
		const clearColor = renderer.getClearColor(this.clearColor)
		const clearAlpha = renderer.getClearAlpha()
		renderer.setClearColor(0xffffff, 1)
		renderer.clear(true, true, false)
		renderer.render(scene, this.camera)
		renderer.setClearColor(clearColor, clearAlpha)
		scene.overrideMaterial = previousOverride
		scene.background = previousBackground
		renderer.setRenderTarget(previousTarget)

		// Interactive frames: a penumbra of at least a third of a millimeter,
		// wider with the occluder's distance times the light's apparent size
		// (key-shadow.glsl); accumulation samples compare hard.
		const size = 2 * Math.sqrt(emitter.halfWidth * emitter.halfHeight)
		const apparent = size / Math.hypot(...emitter.center)
		params.set(sample ? 0 : 0.35 / (2 * EXTENT), 0.0004, 1, sample ? 0 : apparent)
	}

	dispose() {
		this.target.dispose()
		this.material.dispose()
	}
}
