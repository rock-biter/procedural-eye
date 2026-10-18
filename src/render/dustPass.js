// Dust in the air (postprocessing Pass): each mote, a fiber or a flake a few
// tenths of a millimeter long, is drawn as its own image blurred by the thin
// lens (dust-vertex.glsl, dust-fragment.glsl), added over the image the depth
// of field composited, before the effects. A mote in the scene would break
// the alpha contract (a transparent surface would take the focus distance of
// what lies behind it); drawn here, its blur follows the lens exactly, in
// fresh frames and in photo mode alike. The pinhole camera of the frame
// places it, so the accumulated lens samples do not blur it twice. The
// scene's focus distance in the accumulated mean hides the motes behind a
// surface; the key's coverage darkens the ones behind the lids and the face,
// as seen from the key, and the light shafts' cookie brightens the ones in a
// beam the casters do not hide. It renders into the input buffer without swapping, with additive
// blending that keeps the buffer's alpha.
import { Pass } from 'postprocessing'
import {
	AddEquation,
	CustomBlending,
	Float32BufferAttribute,
	InstancedBufferGeometry,
	InstancedInterleavedBuffer,
	InterleavedBufferAttribute,
	Matrix4,
	Mesh,
	OneFactor,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
	Vector4,
	ZeroFactor,
} from 'three'
import { createMotes, MAX_MOTES, MOTE_FLOATS } from '../atmosphere/dustField'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import fragmentShader from '../shaders/dust-fragment.glsl'
import vertexShader from '../shaders/dust-vertex.glsl'

// Largest blur radius drawn, in pixels of a 1440 px tall image: a mote
// blurred wider is too faint to see and would only cost fill.
const MAX_RADIUS = 60

export default class DustPass extends Pass {
	// `envUniforms`: the rig in world space (LightRig.worldUniforms); `focus`:
	// () => the accumulated mean (alpha: focus distance); `half`: the
	// half-resolution share of split frames; `keyUniforms`: the shadow
	// coverages' (src/lighting/shadowCoverage.js) and the light shafts' cookie
	// and light on the dust (src/lighting/shaftLight.js, `uniforms` and `dust`).
	constructor(envUniforms, focus, half, keyUniforms) {
		super('DustPass')
		this.focus = focus
		this.needsSwap = false
		this.seed = null
		this.uniforms = {
			...envUniforms,
			...keyUniforms,
			uZero: new Uniform(0),
			uView: new Uniform(new Matrix4()),
			uProjection: new Uniform(new Matrix4()),
			uViewport: new Uniform(new Vector2(1, 1)),
			uLens: new Uniform(new Vector4()),
			uVolume: new Uniform(new Vector4(0, 0, 0, 1)),
			uTime: new Uniform(0),
			uWind: new Uniform(new Vector3()),
			uTurbulence: new Uniform(0),
			uSize: new Uniform(0.3),
			uForward: new Uniform(0.65),
			uAmbient: new Uniform(new Vector3()),
			uBrightness: new Uniform(1),
			uMaxRadius: new Uniform(MAX_RADIUS),
			uDustShadow: new Uniform(0),
			uSharp: new Uniform(null),
			uHalf: new Uniform(half),
		}
		const geometry = new InstancedBufferGeometry()
		geometry.setAttribute(
			'position',
			new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
		)
		geometry.setIndex([0, 1, 2, 0, 2, 3])
		geometry.instanceCount = 0
		this.geometry = geometry
		this.setSeed(1)
		this.material = new ShaderMaterial({
			uniforms: this.uniforms,
			defines: { MAX_EMITTERS, EMITTER_VEC4S },
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
			blending: CustomBlending,
			blendEquation: AddEquation,
			blendSrc: OneFactor,
			blendDst: OneFactor,
			blendSrcAlpha: ZeroFactor,
			blendDstAlpha: OneFactor,
		})
		this.material.name = 'Dust'
		this.mesh = new Mesh(geometry, this.material)
		this.mesh.frustumCulled = false
		this.dustScene = new Scene()
		this.dustScene.add(this.mesh)
	}

	// The motes of `seed`, generated once per seed: `mote` (position, size),
	// `motion` (phases, rate) and `form` (angle, spin, bend, kind) interleaved
	// in one buffer.
	setSeed(seed) {
		if (seed === this.seed) return
		this.seed = seed
		const buffer = new InstancedInterleavedBuffer(createMotes(seed, MAX_MOTES), MOTE_FLOATS)
		this.geometry.setAttribute('mote', new InterleavedBufferAttribute(buffer, 4, 0))
		this.geometry.setAttribute('motion', new InterleavedBufferAttribute(buffer, 4, 4))
		this.geometry.setAttribute('form', new InterleavedBufferAttribute(buffer, 4, 8))
	}

	set count(value) {
		this.geometry.instanceCount = Math.max(0, Math.min(Math.round(value), MAX_MOTES))
	}

	render(renderer, inputBuffer) {
		if (this.geometry.instanceCount === 0 || this.uniforms.uBrightness.value <= 0) return
		this.uniforms.uSharp.value = this.focus()
		renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer)
		renderer.render(this.dustScene, this.camera)
	}

	setSize(width, height) {
		this.uniforms.uViewport.value.set(width, height)
		this.uniforms.uMaxRadius.value = (MAX_RADIUS * height) / 1440
	}

	dispose() {
		super.dispose()
		this.geometry.dispose()
		this.material.dispose()
	}
}
