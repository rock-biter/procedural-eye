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
// The cookie bakes again only when the layout changes.
import {
	DataTexture,
	DataUtils,
	HalfFloatType,
	LinearFilter,
	Matrix3,
	PerspectiveCamera,
	RedFormat,
	Uniform,
	Vector3,
	Vector4,
} from 'three'
import { emitterIrradiance } from '../atmosphere/dustField'
import {
	animateShafts,
	bakeShaftCookie,
	beamGeometry,
	COOKIE_SIZE,
	cookieExtent,
	createShafts,
	MAX_SHAFTS,
	SHAFT_FLOATS,
	shaftFrame,
} from '../atmosphere/lightShafts'
import { clamp, DEG, vec3 } from '../math'
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
		this.cookie = new DataTexture(
			new Uint16Array(COOKIE_SIZE * COOKIE_SIZE),
			COOKIE_SIZE,
			COOKIE_SIZE,
			RedFormat,
			HalfFloatType,
		)
		this.cookie.minFilter = LinearFilter
		this.cookie.magFilter = LinearFilter
		this.cookie.name = 'ShaftCookie'
		this.cookie.needsUpdate = true
		this.uniforms = {
			uShaftCookie: new Uniform(this.cookie),
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
		// The cookie's values (float), its half side (mm), the texel boxes the
		// beams fill and the time it was baked for.
		this.values = new Float32Array(COOKIE_SIZE * COOKIE_SIZE)
		this.extent = 1
		this.boxes = []
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
	// clock (s, the dust's).
	update(params, emitter, active, time) {
		const shafts = params.shafts
		this.bake(shafts, time)
		this.direction = emitter ? shaftDirection(emitter, shafts) : null
		this.source = this.direction ? vec3.scale(this.direction, shafts.distance) : null
		const on = active && emitter !== null && shafts.enabled && shafts.intensity > 0
		this.shadowed = active && emitter !== null && (on || params.backdrop.shadow > 0)
		const irradiance = on ? emitterIrradiance(emitter, [0, 0, 0])?.irradiance : null
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
	// flickering at `time` (animateShafts()); the cookie bakes again when they
	// move, clearing and converting only the texels the beams cover (a few
	// tenths of a millisecond).
	bake(shafts, time) {
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
			this.values.fill(0)
			this.cookie.image.data.fill(0)
			this.boxes = []
			this.bakedAt = null
		}
		const at = moving ? time : 0
		if (at === this.bakedAt) return
		this.bakedAt = at
		animateShafts(this.shafts, seed, shafts, at, this.beams)
		const { values, boxes } = this
		const size = COOKIE_SIZE
		for (const [i0, i1, j0, j1] of boxes) {
			for (let j = j0; j <= j1; j++) values.fill(0, j * size + i0, j * size + i1 + 1)
		}
		this.boxes = []
		bakeShaftCookie(this.beams, shafts.elongation, size, this.extent, values, this.boxes)
		// The texels cleared or baked, each converted once: per row, the union
		// of the old and the new boxes' spans.
		const data = this.cookie.image.data
		const spans = [...boxes, ...this.boxes]
		let first = size
		let last = -1
		for (const [, , j0, j1] of spans) {
			first = Math.min(first, j0)
			last = Math.max(last, j1)
		}
		for (let j = first; j <= last; j++) {
			const row = []
			for (const [i0, i1, j0, j1] of spans) if (j >= j0 && j <= j1) row.push([i0, i1])
			row.sort((a, b) => a[0] - b[0])
			let next = 0
			for (const [i0, i1] of row) {
				for (let i = Math.max(i0, next); i <= i1; i++) {
					const index = j * size + i
					data[index] = DataUtils.toHalfFloat(values[index])
				}
				next = Math.max(next, i1 + 1)
			}
		}
		this.cookie.needsUpdate = true
	}

	dispose() {
		this.cookie.dispose()
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
