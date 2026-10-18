// Depth of field for interactive frames (postprocessing Pass): a physical
// gather at half resolution (dof-gather-fragment.glsl) over the color and
// blur radius prepared at that resolution (dof-prepare-fragment.glsl),
// composited over the sharp accumulated mean with an opaque alpha for the
// effects. The largest blur radius per tile, spread over the neighboring
// tiles (dof-tiles-fragment.glsl, dof-dilate-fragment.glsl), bounds each
// pixel's spiral. Accumulated frames get their depth of field from the lens
// samples instead, so the gather fades out over the first samples. A split
// frame (src/render/scenePass.js) shaded part of the image at half resolution
// only: alpha −1 marks the pixels it left out of the full-resolution one.
// The haze (veil.glsl) and the light shafts (light-shafts.glsl) join the
// color in the prepare pass and the sharp mean in the composite.
import { Pass } from 'postprocessing'
import {
	HalfFloatType,
	LinearFilter,
	Matrix3,
	NearestFilter,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import { VEIL_LIGHTS } from '../atmosphere/dustField'
import { MAX_SHAFTS } from '../atmosphere/lightShafts'
import compositeShader from '../shaders/dof-composite-fragment.glsl'
import dilateShader from '../shaders/dof-dilate-fragment.glsl'
import gatherShader from '../shaders/dof-gather-fragment.glsl'
import prepareShader from '../shaders/dof-prepare-fragment.glsl'
import tilesShader from '../shaders/dof-tiles-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import { FOCUS_AT_INFINITY } from '../renderSetup'

// Half-resolution texels per tile side: 20 full-resolution pixels, more than
// the gather's largest radius (MAX_RADIUS in dof-gather-fragment.glsl), so the
// tile and its neighbors hold every tap of its pixels. Even, so a 2×2 quad of
// fragments never straddles two tiles.
const TILE = 10

function createHalfTarget(filter) {
	return new WebGLRenderTarget(1, 1, {
		type: HalfFloatType,
		minFilter: filter,
		magFilter: filter,
		depthBuffer: false,
	})
}

export default class DofPass extends Pass {
	// `focus`: () => the accumulated mean (rgb; alpha: the focus distance);
	// `half`: the half-resolution share of split frames; `shafts`: the light
	// shafts' uniforms (src/lighting/shaftLight.js, its `uniforms` and `air`)
	// and the shadow coverages' (src/lighting/shadowCoverage.js).
	constructor(focus, half, shafts) {
		super('DofPass')
		this.focus = focus
		// Whether `prepared` holds the last frame's radii at the current size.
		this.preparedLast = false
		// Half resolution: the color and signed blur radius, then the gather.
		this.prepared = createHalfTarget(NearestFilter)
		this.target = createHalfTarget(LinearFilter)
		// The largest blur radius per tile, then over its neighbors.
		this.tiles = createHalfTarget(NearestFilter)
		this.tileMax = createHalfTarget(NearestFilter)
		// The haze, shared by the prepare and composite programs (setVeil()).
		this.veil = {
			uZero: new Uniform(0),
			uVeil: new Uniform(new Vector4()),
			uVeilAmbient: new Uniform(new Vector3()),
			uVeilLightDirection: new Uniform(Array.from({ length: VEIL_LIGHTS }, () => new Vector3())),
			uVeilLightIrradiance: new Uniform(Array.from({ length: VEIL_LIGHTS }, () => new Vector3())),
			uVeilLightCount: new Uniform(0),
			uVeilBasis: new Uniform(new Matrix3()),
			uVeilTan: new Uniform(new Vector2(1, 1)),
		}
		this.prepare = new ShaderMaterial({
			uniforms: {
				...this.veil,
				...shafts,
				uSource: new Uniform(null),
				uHalf: new Uniform(half),
				uLens: new Uniform(new Vector4()),
			},
			defines: { MAX_SHAFTS },
			vertexShader,
			fragmentShader: prepareShader,
			depthTest: false,
			depthWrite: false,
		})
		this.tileReduce = new ShaderMaterial({
			uniforms: {
				uZero: new Uniform(0),
				uPrepared: new Uniform(this.prepared.texture),
				uBackdropRadius: new Uniform(Infinity),
			},
			defines: { DOF_TILE: TILE },
			vertexShader,
			fragmentShader: tilesShader,
			depthTest: false,
			depthWrite: false,
		})
		this.dilate = new ShaderMaterial({
			uniforms: { uTiles: new Uniform(this.tiles.texture) },
			vertexShader,
			fragmentShader: dilateShader,
			depthTest: false,
			depthWrite: false,
		})
		this.gather = new ShaderMaterial({
			uniforms: {
				uPrepared: new Uniform(this.prepared.texture),
				uTileMax: new Uniform(this.tileMax.texture),
				uTexel: new Uniform(new Vector2()),
			},
			defines: { DOF_TILE: TILE },
			vertexShader,
			fragmentShader: gatherShader,
			depthTest: false,
			depthWrite: false,
		})
		this.composite = new ShaderMaterial({
			uniforms: {
				...this.veil,
				...shafts,
				uSharp: new Uniform(null),
				uHalf: new Uniform(half),
				uBlurred: new Uniform(this.target.texture),
				uWeight: new Uniform(1),
			},
			defines: { MAX_SHAFTS },
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
		const lens = this.prepare.uniforms.uLens.value.set(
			(focalLength * focalLength) / fNumber,
			focusDistance,
			focusDistance - focalLength,
			heightPx / sensorHeight,
		)
		// The radius dof-prepare-fragment.glsl gives a point halfway to the
		// backdrop's distance: only the backdrop lies farther.
		const distance = FOCUS_AT_INFINITY / 2
		this.tileReduce.uniforms.uBackdropRadius.value =
			(0.5 * lens.x * (distance - lens.y) * lens.w) / (distance * lens.z)
	}

	// The haze: `density` (1/mm, 0 for none), the distance it stops growing at
	// (`far`, mm), the phase's `g`, `lights` and `ambient` (veilLights() in
	// src/atmosphere/dustField.js) and the camera (its world matrix and the
	// tangents of its half fields of view).
	setVeil({ density, far, g, lights, ambient, cameraMatrix, tanX, tanY }) {
		const u = this.veil
		u.uVeil.value.set(density, far, g, 0)
		u.uVeilAmbient.value.fromArray(ambient)
		u.uVeilLightCount.value = lights.length
		lights.forEach((light, i) => {
			u.uVeilLightDirection.value[i].fromArray(light.direction)
			u.uVeilLightIrradiance.value[i].fromArray(light.irradiance)
		})
		u.uVeilBasis.value.setFromMatrix4(cameraMatrix)
		u.uVeilTan.value.set(tanX, tanY)
	}

	render(renderer, inputBuffer, outputBuffer) {
		const mean = this.focus()
		this.preparedLast = this.weight > 0
		if (this.weight <= 0) {
			this.composite.uniforms.uWeight.value = 0
		} else {
			this.prepare.uniforms.uSource.value = mean
			this.fullscreenMaterial = this.prepare
			renderer.setRenderTarget(this.prepared)
			renderer.render(this.scene, this.camera)
			this.fullscreenMaterial = this.tileReduce
			renderer.setRenderTarget(this.tiles)
			renderer.render(this.scene, this.camera)
			this.fullscreenMaterial = this.dilate
			renderer.setRenderTarget(this.tileMax)
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
		this.preparedLast = false
		const tiles = half.map((size) => Math.ceil(size / TILE))
		this.tiles.setSize(...tiles)
		this.tileMax.setSize(...tiles)
		this.gather.uniforms.uTexel.value.set(1 / width, 1 / height)
	}

	dispose() {
		super.dispose()
		this.prepared.dispose()
		this.target.dispose()
		this.tiles.dispose()
		this.tileMax.dispose()
		this.prepare.dispose()
		this.tileReduce.dispose()
		this.dilate.dispose()
		this.gather.dispose()
		this.composite.dispose()
	}
}
