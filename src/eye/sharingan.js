// The Sharingan easter egg (docs/IRIS.md#sharingan): once the checklist is
// done (main.js), the HUD's tomoe button puts one of the Uchiha's eyes on the
// iris, as pigment over the tissue, or now and then the Rinnegan, which turns
// the sclera lavender too (sharingan.glsl, src/eye/sharinganPatterns.js).
// The pattern spins into place as it fades in, the pupil narrowing to
// sharingan.pupil; a new one spins while the two crossfade; Random eye hides
// it. Its motion has its own clock (step()), which runs in photo mode too.
// sharingan.preview shows a pattern still, for tuning. The eyeball's two
// programs share its uniforms.
import { Color, DataTexture, FloatType, RGBAFormat, Uniform, Vector2, Vector4 } from 'three'
import {
	PATTERNS,
	PATTERN_TEXELS,
	SHOW,
	glide,
	glideDone,
	glideValue,
	packPatterns,
	patternIndex,
} from './sharinganPatterns'

const TAU = 2 * Math.PI

export default class Sharingan {
	constructor() {
		this.texture = new DataTexture(
			packPatterns(),
			PATTERN_TEXELS,
			PATTERNS.length,
			RGBAFormat,
			FloatType,
		)
		this.texture.needsUpdate = true
		this.uniforms = {
			uSharinganShapes: new Uniform(this.texture),
			// pattern, previous pattern, blend, turn (radians)
			uSharingan: new Uniform(new Vector4(0, 0, 1, 0)),
			// amount, the Rinnegan's reach, tissue, glow radiance
			uSharinganLevel: new Uniform(new Vector4()),
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

	// The name of the pattern shown or coming in, or null.
	get name() {
		return this.shown && this.pattern >= 0 ? PATTERNS[this.pattern].name : null
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

	// The pupil's diameter (mm) under the pattern: narrowing to
	// sharingan.pupil as it comes in.
	pupil(diameter, params) {
		const amount = params.sharingan.preview === 'off' ? glideValue(this.amount) : 1
		return diameter + (params.sharingan.pupil - diameter) * amount
	}

	// Per-sample uniforms; `white`: the radiance of a white diffuse surface
	// under the rig (the glow's scale).
	update(params, white) {
		const { sharingan } = params
		const preview = sharingan.preview === 'off' ? -1 : patternIndex(sharingan.preview)
		const u = this.uniforms
		if (preview >= 0) {
			u.uSharingan.value.set(preview, preview, 1, 0)
			u.uSharinganLevel.value.set(1, PATTERNS[preview].rinnegan ? 1 : 0, 0, 0)
		} else {
			const pattern = Math.max(this.pattern, 0)
			u.uSharingan.value.set(
				pattern,
				Math.max(this.previous, 0),
				glideValue(this.blend),
				glideValue(this.turn),
			)
			u.uSharinganLevel.value.set(glideValue(this.amount), glideValue(this.reach), 0, 0)
		}
		u.uSharinganLevel.value.z = sharingan.tissue
		u.uSharinganLevel.value.w = sharingan.glow * white
		const palette = u.uSharinganPalette.value
		palette[0].set(sharingan.ink)
		palette[1].set(sharingan.red)
		palette[2].set(sharingan.lavender)
		palette[3].set(sharingan.violet)
		u.uRinnegan.value.set(sharingan.ringSpacing, sharingan.ringWidth)
	}
}
