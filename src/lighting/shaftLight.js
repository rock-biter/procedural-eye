// The light shafts' light (src/atmosphere/lightShafts.js): a few blades of
// the key light (emitter 0) from a source `shafts.distance` from the globe,
// in the key's direction turned by shafts.azimuth and shafts.elevation, so
// they can come from higher up than the key. From a finite distance they
// spread, so in perspective they fan out from it. Their own shadow: the
// casters drawn from the source in perspective, reduced into the shafts'
// coverage (src/lighting/shadowCoverage.js), which shadows the beams on the
// surfaces, in the air and on the dust, and the floor below the face
// (src/render/backdrop.js), larger than the patch as a near light makes it.
// Drawing the casters costs about a millisecond, so it is kept, like the
// key's coverage, until the source, the softness or the lids change.
// Three sets of uniforms, rebuilt every frame:
// - `uniforms`, shared with the surfaces near the eye and the dust
//   (shaft-light.glsl): the cookie, baked over the beams' cross-section, its
//   frame, the source and the beams' light on the surfaces relative to the key's;
// - `dust`: the beams' light on the motes (src/render/dustPass.js);
// - `air`: the beams themselves and the light the air scatters from them
//   (light-shafts.glsl, in src/render/dofPass.js).
// The cookie bakes again on the GPU when the beams move or their layout
// changes (shaft-cookie-fragment.glsl, the twin of bakeShaftCookie()).
import {
	HalfFloatType,
	LinearFilter,
	Matrix3,
	Mesh,
	OrthographicCamera,
	PerspectiveCamera,
	PlaneGeometry,
	RedFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import { emitterIrradiance } from '../atmosphere/dustField'
import {
	animateShafts,
	beamGeometry,
	COOKIE_SIZE,
	cookieBlades,
	cookieExtent,
	createShafts,
	MAX_SHAFTS,
	SHAFT_FLOATS,
	shaftFrame,
} from '../atmosphere/lightShafts'
import { clamp, DEG, vec3 } from '../math'
import cookieShader from '../shaders/shaft-cookie-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import { hexToLinearRgb } from './colorTemperature'
import { sphericalDirection } from './envRig'
import { coverageKey, createShadowTarget, SHADOW_EXTENT, SHADOW_LAYER } from './keyShadow'
import ShadowCoverage from './shadowCoverage'

// The beams' shadow map: only blurred into the coverage.
const SHADOW_SIZE = 512
// The isotropic phase: the air shows the beams alike from every side.
const ISOTROPIC = 1 / (4 * Math.PI)

const vectors = () => Array.from({ length: MAX_SHAFTS }, () => new Vector4())

export default class ShaftLight {
	constructor() {
		this.cookie = new WebGLRenderTarget(COOKIE_SIZE, COOKIE_SIZE, {
			type: HalfFloatType,
			format: RedFormat,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			depthBuffer: false,
			generateMipmaps: false,
		})
		this.cookie.texture.name = 'ShaftCookie'
		this.cookieMaterial = new ShaderMaterial({
			uniforms: {
				uZero: new Uniform(0),
				uBlades: new Uniform(Array.from({ length: MAX_SHAFTS * 3 }, () => new Vector4())),
				uBladeCount: new Uniform(0),
				uCookie: new Uniform(new Vector2()),
			},
			defines: { MAX_SHAFTS },
			vertexShader,
			fragmentShader: cookieShader,
			depthTest: false,
			depthWrite: false,
		})
		this.cookieMaterial.name = 'ShaftCookie'
		this.cookieScene = new Scene()
		this.cookieScene.add(new Mesh(new PlaneGeometry(2, 2), this.cookieMaterial))
		this.cookieCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		this.uniforms = {
			uShaftCookie: new Uniform(this.cookie.texture),
			// Columns: the cross-section's axes u and v, the beams' direction (world).
			uShaftFrame: new Uniform(new Matrix3()),
			// The source (world) and its distance to the globe's center (mm).
			uShaftSource: new Uniform(new Vector4(0, 0, 1, 1)),
			uShaftCookieExtent: new Uniform(1),
			// The beams' σ along their axis (mm).
			uShaftReach: new Uniform(100),
			// The beams' light on the surfaces, per channel, as a share of the key's
			// (the iris), and as their irradiance facing the source.
			uShaftLight: new Uniform(new Vector3()),
			uShaftIrradiance: new Uniform(new Vector3()),
		}
		// The beams' light on the motes (rgb, the key's irradiance times its share).
		this.dust = { uShaftDust: new Uniform(new Vector3()) }
		this.air = {
			// Per beam: its center (world) and intensity; its axis from the source
			// and the source's distance (mm); its thin side and σ across (mm).
			uShaftCenters: new Uniform(vectors()),
			uShaftAxes: new Uniform(vectors()),
			uShaftSides: new Uniform(vectors()),
			uShaftCount: new Uniform(0),
			// The light the air scatters per mm of beam (rgb).
			uShaftAir: new Uniform(new Vector3()),
			// The beams' elongation, how much the casters cut them, unused, unused.
			uShaftAirParams: new Uniform(new Vector4()),
			// The camera (world): set with the haze (src/render/postProcessing.js).
			uShaftOrigin: new Uniform(new Vector3()),
		}
		this.layout = null
		// The beams of the layout, and as they move (animateShafts()).
		this.shafts = new Float32Array(0)
		this.beams = this.shafts
		// The cookie's half side (mm) and the time it was baked for.
		this.extent = 1
		this.bakedAt = null
		// The source (world) and toward it (unit), or null without a key.
		this.source = null
		this.direction = null
		// Whether anything reads the beams' shadow this frame.
		this.shadowed = false
		this.camera = new PerspectiveCamera(30, 1, 1, 1000)
		this.camera.layers.set(SHADOW_LAYER)
		this.map = createShadowTarget(SHADOW_SIZE)
		this.target = new Vector3()
		this.coverage = new ShadowCoverage('Shaft')
	}

	// `emitter`: emitter 0 when it casts the key's shadow, or null; `active`:
	// whether the image shows the shafts (the beauty view); `time`: their
	// clock (s, the dust's). The beams' cookie bakes only while they show.
	update(renderer, params, emitter, active, time) {
		const shafts = params.shafts
		this.direction = emitter ? shaftDirection(emitter, shafts) : null
		this.source = this.direction ? vec3.scale(this.direction, shafts.distance) : null
		const on = active && emitter !== null && shafts.enabled && shafts.intensity > 0
		this.shadowed = active && emitter !== null && (on || params.backdrop.shadow > 0)
		const irradiance = on ? emitterIrradiance(emitter, [0, 0, 0])?.irradiance : null
		if (irradiance) this.bake(renderer, shafts, time)
		if (!irradiance) {
			this.uniforms.uShaftLight.value.set(0, 0, 0)
			this.uniforms.uShaftIrradiance.value.set(0, 0, 0)
			this.dust.uShaftDust.value.set(0, 0, 0)
			this.air.uShaftCount.value = 0
			return
		}
		const frame = shaftFrame(this.direction)
		this.uniforms.uShaftFrame.value.set(...frame.u, ...frame.v, ...frame.direction).transpose()
		this.uniforms.uShaftSource.value.set(...this.source, shafts.distance)
		this.uniforms.uShaftReach.value = shafts.length
		const tint = hexToLinearRgb(shafts.color).map((c) => c * shafts.intensity)
		this.uniforms.uShaftLight.value.fromArray(tint).multiplyScalar(shafts.light)
		const light = tint.map((c, i) => c * irradiance[i])
		this.uniforms.uShaftIrradiance.value.fromArray(light).multiplyScalar(shafts.light)
		this.dust.uShaftDust.value.fromArray(light).multiplyScalar(shafts.dust)
		const air = this.air
		const count = this.shafts.length / SHAFT_FLOATS
		air.uShaftCount.value = count
		for (let i = 0; i < count; i++) {
			const o = i * SHAFT_FLOATS
			const beam = beamGeometry(this.beams.subarray(o, o + SHAFT_FLOATS), frame, shafts.distance)
			air.uShaftCenters.value[i].set(...beam.center, beam.intensity)
			air.uShaftAxes.value[i].set(...beam.axis, beam.distance)
			air.uShaftSides.value[i].set(...beam.side, beam.sigma)
		}
		air.uShaftAir.value.fromArray(light).multiplyScalar((shafts.air / 1000) * ISOTROPIC)
		air.uShaftAirParams.value.set(shafts.elongation, shafts.shadow, 0, 0)
	}

	// The beams' shadow on fresh frames: the casters seen from the source in
	// perspective, aimed at `target` like the key's shadow
	// (src/lighting/keyShadow.js), reduced into the coverage. `coverage`:
	// { globeRadius, softness, lids } of KeyShadow.render().
	renderShadow(renderer, scene, keyShadow, target, coverage) {
		if (!this.source || !this.shadowed) {
			this.coverage.disable()
			return
		}
		const key = coverageKey(this.source, target, coverage)
		if (key === this.coverage.key) return
		const camera = this.camera
		this.target.fromArray(target)
		camera.position.fromArray(this.source)
		const distance = camera.position.distanceTo(this.target)
		camera.fov = (2 * Math.atan((1.15 * SHADOW_EXTENT) / distance)) / DEG
		camera.near = Math.max(distance - 70, 1)
		camera.far = distance + 70
		camera.lookAt(this.target)
		camera.updateProjectionMatrix()
		camera.updateMatrixWorld()
		const previousTarget = renderer.getRenderTarget()
		keyShadow.renderCasters(renderer, scene, camera, this.map)
		this.coverage.render(renderer, this.map.texture, camera, coverage, key)
		renderer.setRenderTarget(previousTarget)
	}

	// The beams of the layout, again only when it changes, then swaying and
	// flickering at `time` (animateShafts()); the cookie bakes again on the
	// GPU when they move (a few hundredths of a millisecond).
	bake(renderer, shafts, time) {
		const { count, seed, width, widthVariation, spread, offsetX, offsetY, angle, alignment } =
			shafts
		// Compared every frame as they are, without building a key.
		const layout = [seed, shafts.elongation, shafts.sway, count, width, widthVariation]
		layout.push(spread, offsetX, offsetY, angle, alignment)
		const moving = (shafts.sway > 0 || shafts.flicker > 0) && shafts.speed > 0
		if (!this.layout?.every((value, i) => value === layout[i])) {
			this.layout = layout
			const options = { count, width, widthVariation, spread, offsetX, offsetY, angle, alignment }
			this.shafts = createShafts(seed, options)
			this.beams = this.shafts.slice()
			// Room for the sway, so the cookie's texels stay put as the beams move.
			this.extent = cookieExtent(this.shafts, shafts.elongation) + shafts.sway
			this.uniforms.uShaftCookieExtent.value = this.extent
			this.bakedAt = null
		}
		const at = moving ? time : 0
		if (at === this.bakedAt) return
		this.bakedAt = at
		animateShafts(this.shafts, seed, shafts, at, this.beams)
		const blades = cookieBlades(this.beams, shafts.elongation, COOKIE_SIZE, this.extent)
		const u = this.cookieMaterial.uniforms
		blades.forEach((blade, k) => {
			u.uBlades.value[3 * k].set(blade.u, blade.v, blade.across, blade.along)
			u.uBlades.value[3 * k + 1].set(blade.intensity, blade.cos, blade.sin, 0)
			u.uBlades.value[3 * k + 2].set(...blade.box)
		})
		u.uBladeCount.value = blades.length
		u.uCookie.value.set(this.extent, (2 * this.extent) / COOKIE_SIZE)
		const previous = renderer.getRenderTarget()
		renderer.setRenderTarget(this.cookie)
		renderer.render(this.cookieScene, this.cookieCamera)
		renderer.setRenderTarget(previous)
	}

	dispose() {
		this.cookie.dispose()
		this.cookieMaterial.dispose()
		this.map.dispose()
		this.coverage.dispose()
	}
}

// Toward the beams' source from the eye (unit): the key's direction turned
// by `azimuth` and `elevation` (degrees), short of the zenith.
function shaftDirection(emitter, { azimuth, elevation }) {
	const [x, y, z] = vec3.normalize(emitter.center)
	const keyAzimuth = Math.atan2(x, z) / DEG
	const keyElevation = Math.asin(clamp(y, -1, 1)) / DEG
	return sphericalDirection(keyAzimuth + azimuth, clamp(keyElevation + elevation, -89, 89))
}
