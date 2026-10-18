// The key light's shadow map: an orthographic camera at the key emitter
// (emitter 0) looking at the eye renders the casters (objects on layer
// SHADOW_LAYER: lids and lashes) into a float depth map. For accumulation
// samples the camera moves to a point on the emitter's area, so the averaged
// hard shadows form the real penumbra; interactive frames estimate it
// (percentage-closer soft shadows, key-shadow.glsl) on a map of half the
// resolution: their filters are wider than its texels, and its taps stay in
// the texture cache. Fresh frames also reduce their map into the key's soft
// coverage (src/lighting/shadowCoverage.js), which shadows the dust's key
// light; the accumulation samples, whose light moves across the emitter, keep
// it, so the dust does not flicker. It is kept until the light, the softness
// or the lids change: the gaze follow and the blink move the lids inside the
// patch's outline, and the globe fills the fissure in the coverage anyway. The light shafts draw the same casters
// from their own direction (renderCasters(), src/lighting/shaftLight.js).
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
import ShadowCoverage from './shadowCoverage'

export const SHADOW_LAYER = 1
// Map sizes of accumulation samples and of interactive frames.
const SIZE = 2048
const INTERACTIVE_SIZE = 1024
// Half extent of the shadowed region around the eye (mm): the whole skin
// patch (the lookup fades out toward the border).
export const SHADOW_EXTENT = 40

// An orthographic camera over the shadowed region, for the casters.
function createShadowCamera() {
	const camera = new OrthographicCamera(
		-SHADOW_EXTENT,
		SHADOW_EXTENT,
		SHADOW_EXTENT,
		-SHADOW_EXTENT,
		40,
		200,
	)
	camera.layers.set(SHADOW_LAYER)
	return camera
}

// Places a shadow camera 120 mm from `center` toward the light (`direction`,
// unit): close, because the region is small and depth precision matters.
// Sets `matrix` to world → its clip.
function aimShadowCamera(camera, center, direction, matrix) {
	camera.position.copy(center).addScaledVector(direction, 120)
	camera.lookAt(center)
	camera.updateProjectionMatrix()
	camera.updateMatrixWorld()
	matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
}

// What a coverage from `direction` around `target` is made for.
export function coverageKey(direction, target, { globeRadius, softness, lids }) {
	return `${direction}|${target}|${globeRadius}|${softness}|${lids}`
}

export function createShadowTarget(size) {
	const target = new WebGLRenderTarget(size, size, {
		type: FloatType,
		format: RedFormat,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
	})
	target.texture.name = 'KeyShadowMap'
	return target
}

export default class KeyShadow {
	constructor() {
		this.target = createShadowTarget(SIZE)
		this.interactiveTarget = createShadowTarget(INTERACTIVE_SIZE)
		this.camera = createShadowCamera()
		this.matrix = new Matrix4()
		// The renderer's clear state, restored after the shadow pass.
		this.clearColor = new Color()
		// Shared with every material near the lids: the shadow map, the lids'
		// gaze follow (lid-follow.glsl), which the casters need too, and the
		// blink's closure (the eye's shaders: sclera.glsl; the casters morph by
		// their own weights, lid-morph.glsl).
		this.uniforms = {
			uKeyShadowMap: new Uniform(this.target.texture),
			uKeyShadowMatrix: new Uniform(this.matrix),
			uKeyShadowParams: new Uniform(new Vector4(0, 0, 0, 0)),
			uLidFollow: new Uniform(new Vector2()),
			uLidBlink: new Uniform(0),
		}
		this.material = new ShaderMaterial({
			uniforms: { uZero: new Uniform(0), uLidFollow: this.uniforms.uLidFollow },
			vertexShader,
			fragmentShader,
			side: DoubleSide,
		})
		this.center = new Vector3()
		this.light = new Vector3()
		this.direction = new Vector3()
		this.coverage = new ShadowCoverage('Key')
	}

	// `emitter`: the key emitter of buildEmitters() or null; `sample`: an
	// accumulation sample (its `light` pair picks the point on the emitter);
	// `coverage`: { globeRadius, softness } of ShadowCoverage.render() and
	// `lids`, what the lid mesh was built for (EyeApp.lidKey).
	render(renderer, scene, emitter, target, sample, coverage) {
		const params = this.uniforms.uKeyShadowParams.value
		if (!emitter) {
			params.z = 0
			this.coverage.disable()
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
		this.direction.copy(this.light).sub(this.center).normalize()
		aimShadowCamera(this.camera, this.center, this.direction, this.matrix)
		const map = sample ? this.target : this.interactiveTarget
		this.uniforms.uKeyShadowMap.value = map.texture
		this.renderCasters(renderer, scene, this.camera, map)
		if (!sample) {
			const previousTarget = renderer.getRenderTarget()
			const key = coverageKey(this.direction.toArray(), target, coverage)
			this.coverage.render(renderer, map.texture, this.camera, coverage, key)
			renderer.setRenderTarget(previousTarget)
		}

		// Interactive frames: a penumbra of at least a third of a millimeter,
		// wider with the occluder's distance times the light's apparent size
		// (key-shadow.glsl); accumulation samples compare hard.
		const size = 2 * Math.sqrt(emitter.halfWidth * emitter.halfHeight)
		const apparent = size / Math.hypot(...emitter.center)
		params.set(sample ? 0 : 0.35 / (2 * SHADOW_EXTENT), 0.0004, 1, sample ? 0 : apparent)
	}

	// The casters' depth (1 where nothing casts) seen by `camera` into `map`,
	// with the lid follow and the blink, in one material.
	renderCasters(renderer, scene, camera, map) {
		const previousTarget = renderer.getRenderTarget()
		const previousOverride = scene.overrideMaterial
		const previousBackground = scene.background
		scene.overrideMaterial = this.material
		scene.background = null
		renderer.setRenderTarget(map)
		const clearColor = renderer.getClearColor(this.clearColor)
		const clearAlpha = renderer.getClearAlpha()
		renderer.setClearColor(0xffffff, 1)
		renderer.clear(true, true, false)
		renderer.render(scene, camera)
		renderer.setClearColor(clearColor, clearAlpha)
		scene.overrideMaterial = previousOverride
		scene.background = previousBackground
		renderer.setRenderTarget(previousTarget)
	}

	dispose() {
		this.target.dispose()
		this.interactiveTarget.dispose()
		this.material.dispose()
		this.coverage.dispose()
	}
}
