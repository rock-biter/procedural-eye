// The Sharingan easter egg (docs/IRIS.md#sharingan): once the checklist is
// done (main.js), the HUD's tomoe button puts one of the Uchiha's eyes on the
// iris, as pigment over the tissue, or now and then the Rinnegan, which turns
// the sclera lavender too (sharingan.glsl, src/eye/sharinganPatterns.js).
// The pattern spins into place as it fades in, the pupil narrowing to
// sharingan.pupil; a new one spins while the two crossfade; Random eye hides
// it. Its motion has its own clock (step()), which runs in photo mode too.
// Each pattern shown is baked on the GPU into a map of its palette's weights
// (sharingan-bake-fragment.glsl), two of them taking turns for the
// crossfade, made at the first; the iris reads them at its footprint's mip
// level. sharingan.preview shows a pattern still, for tuning. The eyeball's
// two programs share its uniforms.
import {
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	FloatType,
	LinearFilter,
	LinearMipmapLinearFilter,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Uniform,
	UnsignedByteType,
	Vector2,
	Vector4,
	WebGLRenderTarget,
} from 'three'
import fragmentShader from '../shaders/sharingan-bake-fragment.glsl'
import vertexShader from '../shaders/fullscreen-vertex.glsl'
import {
	PATTERNS,
	PATTERN_TEXELS,
	SHARINGAN_DEFINES,
	SHARINGAN_MAP,
	SHOW,
	glide,
	glideDone,
	glideValue,
	packPatterns,
	patternIndex,
} from './sharinganPatterns'

const TAU = 2 * Math.PI

function createMapTarget() {
	const target = new WebGLRenderTarget(SHARINGAN_MAP.size, SHARINGAN_MAP.size, {
		type: UnsignedByteType,
		format: RGBAFormat,
		wrapS: ClampToEdgeWrapping,
		wrapT: ClampToEdgeWrapping,
		minFilter: LinearMipmapLinearFilter,
		magFilter: LinearFilter,
		generateMipmaps: true,
		depthBuffer: false,
	})
	target.texture.name = 'SharinganMap'
	return target
}

export default class Sharingan {
	constructor() {
		const shapes = new DataTexture(
			packPatterns(),
			PATTERN_TEXELS,
			PATTERNS.length,
			RGBAFormat,
			FloatType,
		)
		shapes.needsUpdate = true
		this.material = new ShaderMaterial({
			defines: { ...SHARINGAN_DEFINES },
			uniforms: {
				uZero: new Uniform(0),
				uSharinganShapes: new Uniform(shapes),
				uSharinganRow: new Uniform(0),
			},
			vertexShader,
			fragmentShader,
			depthTest: false,
			depthWrite: false,
		})
		this.material.name = 'SharinganBake'
		this.scene = new Scene()
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
		this.scene.add(this.quad)
		// The two maps, made at the first bake, and the pattern each holds.
		this.targets = null
		this.baked = [-1, -1]
		this.uniforms = {
			uSharinganMap: new Uniform(null),
			uSharinganPrevious: new Uniform(null),
			// amount, blend, turn (radians), the Rinnegan's reach
			uSharingan: new Uniform(new Vector4()),
			// tissue, glow radiance
			uSharinganLook: new Uniform(new Vector2()),
			// ink, red, lavender, violet
			uSharinganPalette: new Uniform([new Color(), new Color(), new Color(), new Color()]),
			// ring spacing, ring half-width (mm)
			uRinnegan: new Uniform(new Vector2(1, 0.05)),
		}
		// The pattern shown (an index of PATTERNS, -1 before the first) and the
		// one it crossfades from, and the glides of the amount, the crossfade,
		// the turn and the Rinnegan's reach.
		this.pattern = -1
		this.previous = -1
		this.amount = glide(0, 0, 0)
		this.blend = glide(1, 1, 0)
		this.turn = glide(0, 0, 0)
		this.reach = glide(0, 0, 0)
	}

	// Whether a pattern shows or is coming in.
	get shown() {
		return this.amount.to > 0
	}

	// The name of the pattern shown or coming in, or null.
	get name() {
		return this.shown && this.pattern >= 0 ? PATTERNS[this.pattern].name : null
	}

	// Puts the pattern `name` on the eye. `still` (reduced motion): it fades
	// without spinning.
	show(name, params, still = false) {
		const index = patternIndex(name)
		if (index < 0) return
		const { duration, turns, spread } = params.sharingan
		const time = still ? SHOW.still : duration
		if (this.shown && this.pattern >= 0) {
			this.previous = glideValue(this.blend) < 0.5 ? this.previous : this.pattern
			this.blend = glide(0, 1, time, 'middle')
			this.turn = glide(glideValue(this.turn) - (still ? 0 : TAU), 0, time, 'out')
		} else {
			this.previous = index
			this.blend = glide(1, 1, 0)
			this.turn = glide(still ? 0 : -turns * TAU, 0, time, 'out')
		}
		this.pattern = index
		this.amount = glide(glideValue(this.amount), 1, still ? time : SHOW.fade * duration)
		this.reach = glide(
			glideValue(this.reach),
			PATTERNS[index].rinnegan ? 1 : 0,
			still ? time : spread,
		)
	}

	// Takes the pattern off the eye.
	hide(params, still = false) {
		if (!this.shown) return
		const { duration, spread } = params.sharingan
		this.amount = glide(glideValue(this.amount), 0, still ? SHOW.still : SHOW.hide * duration)
		this.reach = glide(glideValue(this.reach), 0, still ? SHOW.still : SHOW.hide * spread)
	}

	// Whether it moves: a glide runs.
	moving() {
		return [this.amount, this.blend, this.turn, this.reach].some((g) => !glideDone(g))
	}

	// Moves the glides on; true while the image must restart (one moves, or
	// has just ended).
	step(dt) {
		if (!this.moving()) return false
		for (const g of [this.amount, this.blend, this.turn, this.reach]) g.time += dt
		return true
	}

	// The pattern of sharingan.preview, or -1.
	preview(params) {
		const { preview } = params.sharingan
		return preview === 'off' ? -1 : patternIndex(preview)
	}

	// The pupil's diameter (mm) under the pattern: narrowing to
	// sharingan.pupil as it comes in.
	pupil(diameter, params) {
		const amount = this.preview(params) >= 0 ? 1 : glideValue(this.amount)
		return diameter + (params.sharingan.pupil - diameter) * amount
	}

	// Bakes the maps of the patterns on show that no map holds yet, each into
	// a map holding neither, before a frame is drawn.
	prepare(renderer, params) {
		const preview = this.preview(params)
		const visible = preview >= 0 || glideValue(this.amount) > 0 || this.shown
		const wanted = preview >= 0 ? [preview] : visible ? [this.pattern, this.previous] : []
		const missing = [...new Set(wanted)].filter((id) => id >= 0 && !this.baked.includes(id))
		if (missing.length === 0) return
		this.targets ??= [createMapTarget(), createMapTarget()]
		const previous = renderer.getRenderTarget()
		for (const id of missing) {
			const slot = this.baked.findIndex((held) => !wanted.includes(held))
			this.material.uniforms.uSharinganRow.value = id
			renderer.setRenderTarget(this.targets[slot])
			renderer.render(this.scene, this.camera)
			this.baked[slot] = id
		}
		renderer.setRenderTarget(previous)
	}

	// Per-sample uniforms; `white`: the radiance of a white diffuse surface
	// under the rig (the glow's scale).
	update(params, white) {
		const { sharingan } = params
		const preview = this.preview(params)
		const u = this.uniforms
		const map = (id) => this.targets?.[this.baked.indexOf(id)]?.texture ?? null
		if (preview >= 0) {
			u.uSharinganMap.value = u.uSharinganPrevious.value = map(preview)
			u.uSharingan.value.set(1, 1, 0, PATTERNS[preview].rinnegan ? 1 : 0)
		} else {
			u.uSharinganMap.value = map(this.pattern)
			u.uSharinganPrevious.value = map(this.previous)
			u.uSharingan.value.set(
				glideValue(this.amount),
				glideValue(this.blend),
				glideValue(this.turn),
				glideValue(this.reach),
			)
		}
		// Nothing to read before the first bake.
		if (!u.uSharinganMap.value) u.uSharingan.value.x = 0
		u.uSharinganLook.value.set(sharingan.tissue, sharingan.glow * white)
		const palette = u.uSharinganPalette.value
		palette[0].set(sharingan.ink)
		palette[1].set(sharingan.red)
		palette[2].set(sharingan.lavender)
		palette[3].set(sharingan.violet)
		u.uRinnegan.value.set(sharingan.ringSpacing, sharingan.ringWidth)
	}
}
