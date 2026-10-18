// What blocks a light, soft (shadow-coverage.glsl): a shadow map of the
// casters (the lids and lashes) reduced into a small filterable map over a
// wider field of the same camera (orthographic for the key, perspective from
// the light shafts' source), then blurred. Its channels: r the share of the
// light the casters block, g that times their depth (mm from the light along
// its view), both blurred a little; b and a the same, blurred over
// `softness`. What lies behind the casters, as seen from the light, is
// shadowed, more softly the farther behind, up to `softness` at
// SOFT_DISTANCE. Two of them: the key's (src/lighting/keyShadow.js), which
// shadows the dust's key light, and the light shafts' (src/lighting/shaftLight.js),
// which shadows the beams on the surfaces, in the air and on the dust, and
// the floor below the face (src/render/backdrop.js).
//
// Only the lids and lashes cast into the shadow map, so the globe inside the
// fissure is added here as a disc: without it the eye opening would let the
// light through the shadow.
import {
	HalfFloatType,
	LinearFilter,
	Matrix4,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import blurShader from '../shaders/shadow-coverage-blur-fragment.glsl'
import reduceShader from '../shaders/shadow-coverage-reduce-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'

// Texels per side.
const SIZE = 128
// The coverage's field over the shadow map's (per side): room for the softest
// blur around the casters.
const SCALE = 3
// The light blur (mm), on r and g.
const LIGHT_SIGMA = 1.5
// How far behind the casters (mm) the shadow is as soft as the heavy blur.
const SOFT_DISTANCE = 60

function createTarget(name) {
	const target = new WebGLRenderTarget(SIZE, SIZE, {
		type: HalfFloatType,
		format: RGBAFormat,
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		depthBuffer: false,
	})
	target.texture.name = `${name}Coverage`
	return target
}

export default class ShadowCoverage {
	// `name`: the light, which names the uniforms (`Key`: uKeyCoverage…,
	// `Shaft`: uShaftCoverage…).
	constructor(name) {
		this.targets = [createTarget(name), createTarget(name)]
		this.matrix = new Matrix4()
		this.scale = new Matrix4().makeScale(1 / SCALE, 1 / SCALE, 1)
		// Shared with the consumers: the map, world → its clip, (enabled,
		// unused, SOFT_DISTANCE, unused), the light's position and view
		// direction, which give a point's depth.
		this.params = new Vector4(0, 0, SOFT_DISTANCE, 0)
		this.eye = new Vector3()
		this.forward = new Vector3()
		this.uniforms = {
			[`u${name}Coverage`]: new Uniform(this.targets[0].texture),
			[`u${name}CoverageMatrix`]: new Uniform(this.matrix),
			[`u${name}CoverageParams`]: new Uniform(this.params),
			[`u${name}CoverageEye`]: new Uniform(this.eye),
			[`u${name}CoverageForward`]: new Uniform(this.forward),
		}
		this.reduce = new ShaderMaterial({
			uniforms: {
				uZero: new Uniform(0),
				uShadowMap: new Uniform(null),
				uScale: new Uniform(1 / SCALE),
				uTexel: new Uniform(1 / SIZE),
				uDepthRange: new Uniform(new Vector3()),
				uGlobe: new Uniform(new Vector4()),
				uGlobeRadius: new Uniform(0),
			},
			vertexShader,
			fragmentShader: reduceShader,
			depthTest: false,
			depthWrite: false,
		})
		this.reduce.name = `${name}CoverageReduce`
		this.blur = new ShaderMaterial({
			uniforms: {
				uZero: new Uniform(0),
				uSource: new Uniform(null),
				uStep: new Uniform(new Vector2()),
				uSigma: new Uniform(new Vector2(1, 1)),
			},
			vertexShader,
			fragmentShader: blurShader,
			depthTest: false,
			depthWrite: false,
		})
		this.blur.name = `${name}CoverageBlur`
		this.mesh = new Mesh(new PlaneGeometry(2, 2), this.reduce)
		this.scene = new Scene()
		this.scene.add(this.mesh)
		this.quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		this.origin = new Vector3()
		// What the coverage was made for: the passes cost about a millisecond,
		// so the caller keeps it while that holds.
		this.key = null
	}

	// No caster: the consumers see the light unblocked.
	disable() {
		this.params.x = 0
		this.key = null
	}

	// `map`: the shadow map `camera` rendered (float depth, 1 where nothing
	// casts; an orthographic or a perspective camera, aimed and updated);
	// `globeRadius` (mm); `softness`: the heavy blur's σ (mm) at the globe's
	// depth. `key`: what it is made for; the same key as the last one keeps it
	// (null redraws).
	render(renderer, map, camera, { globeRadius, softness }, key = null) {
		if (key !== null && key === this.key) return
		this.key = key
		const perspective = camera.isPerspectiveCamera === true
		this.matrix
			.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
			.premultiply(this.scale)
		this.eye.setFromMatrixPosition(camera.matrixWorld)
		camera.getWorldDirection(this.forward)
		this.params.x = 1
		// The globe: its center's uv and depth (mm), its radius in uv.
		const depth = this.origin.set(0, 0, 0).sub(this.eye).dot(this.forward)
		this.origin.set(0, 0, 0).applyMatrix4(this.matrix)
		// Millimeters per unit of the shadow map's clip space at the globe.
		const mm = (perspective ? depth : 1) / camera.projectionMatrix.elements[0]
		const reduce = this.reduce.uniforms
		reduce.uShadowMap.value = map
		reduce.uDepthRange.value.set(camera.near, camera.far, perspective ? 1 : 0)
		reduce.uGlobe.value.set(
			this.origin.x * 0.5 + 0.5,
			this.origin.y * 0.5 + 0.5,
			depth,
			(0.5 * globeRadius) / (SCALE * mm),
		)
		reduce.uGlobeRadius.value = globeRadius

		const [a, b] = this.targets
		const texel = (2 * SCALE * mm) / SIZE
		const blur = this.blur.uniforms
		blur.uSigma.value.set(LIGHT_SIGMA / texel, softness / texel)
		this.mesh.material = this.reduce
		renderer.setRenderTarget(a)
		renderer.render(this.scene, this.quadCamera)
		this.mesh.material = this.blur
		blur.uSource.value = a.texture
		blur.uStep.value.set(1 / SIZE, 0)
		renderer.setRenderTarget(b)
		renderer.render(this.scene, this.quadCamera)
		blur.uSource.value = b.texture
		blur.uStep.value.set(0, 1 / SIZE)
		renderer.setRenderTarget(a)
		renderer.render(this.scene, this.quadCamera)
	}

	dispose() {
		for (const target of this.targets) target.dispose()
		this.reduce.dispose()
		this.blur.dispose()
		this.mesh.geometry.dispose()
	}
}
