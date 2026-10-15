// Parameter transitions (pure): carry a params object to a target over time,
// so a preset or a random eye shows the eye transforming. Numbers and colors
// glide along a minimum-jerk curve (colors in linear sRGB). Everything that
// cannot pass through in-between values changes at once, at the start:
// toggles, choices, `discrete` numbers (seeds, counts), and the leaves that
// rebuild geometry or recompile programs. A toggle that `fades` a sibling (a
// light's `enabled` and its `intensity`) fades it instead: it turns on at the
// start from zero, and off at the end after fading to zero.
import { hexToLinearRgb, linearRgbToHex } from '../lighting/colorTemperature'
import { lerp, smootherstep } from '../math'
import { forEachLeaf, getValue, leafType } from './params'

export const TRANSITION = Object.freeze({ duration: 1 })

// 'glide' or 'switch': how a leaf reaches a new value in a transition.
export function transitionMode(leaf) {
	if (leaf.discrete || leaf.kind === 'rebuild' || leaf.kind === 'define') return 'switch'
	const type = leafType(leaf)
	return type === 'number' || type === 'color' ? 'glide' : 'switch'
}

// Writes a value at a dotted path as is: gliding numbers take in-between
// values that a slider step would round.
function assign(params, path, value) {
	const keys = path.split('.')
	let node = params
	for (const key of keys.slice(0, -1)) node = node[key]
	node[keys.at(-1)] = value
}

const under = (path, prefix) => prefix === '' || path === prefix || path.startsWith(`${prefix}.`)

export class ParamTransition {
	// Moves `params` (in place) toward `target` (a full params object) over
	// `duration` seconds. The switches apply now; `switched` lists their paths.
	constructor(schema, params, target, duration = TRANSITION.duration) {
		this.params = params
		// The values at the end, kept up to date when a glide is cancelled.
		this.target = structuredClone(target)
		this.duration = Math.max(duration, 0)
		this.elapsed = 0
		// { path, from, to, rgb: [from, to] for colors }
		this.glides = []
		// { path, value }, written at the end.
		this.deferred = []
		this.switched = []

		// Lights turning on or off fade their intensity.
		const fades = new Map()
		forEachLeaf(schema, (leaf, path) => {
			if (!leaf.fades) return
			const on = getValue(target, path)
			if (getValue(params, path) === on) return
			fades.set(path.slice(0, path.lastIndexOf('.') + 1) + leaf.fades, on ? 'in' : 'out')
			if (on) this.switch(path, true)
			else this.deferred.push({ path, value: false })
		})
		forEachLeaf(schema, (leaf, path) => {
			if (leaf.fades) return
			let from = getValue(params, path)
			let to = getValue(target, path)
			const fade = fades.get(path)
			if (fade === 'in') {
				from = 0
				assign(params, path, 0)
			} else if (fade === 'out') {
				this.deferred.push({ path, value: to })
				to = 0
			}
			if (from === to) return
			if (transitionMode(leaf) === 'switch') this.switch(path, to)
			else if (leafType(leaf) === 'color')
				this.glides.push({ path, from, to, rgb: [hexToLinearRgb(from), hexToLinearRgb(to)] })
			else this.glides.push({ path, from, to })
		})
	}

	switch(path, value) {
		assign(this.params, path, value)
		this.switched.push(path)
	}

	// Eased progress, 0 to 1.
	get progress() {
		return this.duration > 0 ? smootherstep(0, this.duration, this.elapsed) : 1
	}

	get done() {
		return this.elapsed >= this.duration
	}

	// Advances by `dt` seconds and writes the gliding values; returns the paths
	// written (the deferred ones too, at the end).
	step(dt) {
		this.elapsed = Math.min(this.elapsed + dt, this.duration)
		if (this.done) return this.finish()
		const k = this.progress
		for (const glide of this.glides) {
			const value = glide.rgb
				? linearRgbToHex(glide.rgb[0].map((c, i) => lerp(c, glide.rgb[1][i], k)))
				: lerp(glide.from, glide.to, k)
			assign(this.params, glide.path, value)
		}
		return this.glides.map((glide) => glide.path)
	}

	// Writes every final value and ends the transition; returns the paths.
	finish() {
		this.elapsed = this.duration
		const writes = [...this.glides.map(({ path, to }) => ({ path, value: to })), ...this.deferred]
		for (const { path, value } of writes) assign(this.params, path, value)
		this.glides = []
		this.deferred = []
		return writes.map(({ path }) => path)
	}

	// Stops the glides and deferred writes under `prefix` ('' for all): their
	// values stay as they are now (someone else is setting them).
	cancel(prefix) {
		const keep = (item) => {
			if (!under(item.path, prefix)) return true
			assign(this.target, item.path, getValue(this.params, item.path))
			return false
		}
		this.glides = this.glides.filter(keep)
		this.deferred = this.deferred.filter(keep)
	}
}
