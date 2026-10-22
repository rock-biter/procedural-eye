// The iris color lookup on the GPU: buildIrisColorLut() (src/iris/irisColor.js)
// as a half-float RGBA Data3DTexture (ABL melanin × eumelanin share × stroma
// thickness), rebuilt when the layer model changes. Building it takes tens of
// milliseconds, so a parameter transition crossfades from the current table
// to the new one instead of rebuilding it every frame, and the tables of
// models known ahead (the intro's shuffle of irises) can be built off the
// main thread beforehand (prepare()); the last ones built are kept by their
// model, so switching back to one takes no rebuild either.
import {
	ClampToEdgeWrapping,
	Data3DTexture,
	DataUtils,
	HalfFloatType,
	LinearFilter,
	RGBAFormat,
} from 'three'
import { buildIrisColorLut, IRIS_COLOR_LUT, irisLayerModel } from './irisColor'

// How many tables are kept by their model (64 KB each), the oldest dropped
// first, and how many workers prepare() builds them in at most.
const KEPT_TABLES = 32
const MAX_WORKERS = 4

const modelKey = (model) => JSON.stringify(model)

export default class IrisColorLut {
	constructor() {
		const { melanin, eumelanin, stroma } = IRIS_COLOR_LUT
		this.data = new Uint16Array(melanin * eumelanin * stroma * 4)
		const texture = new Data3DTexture(this.data, melanin, eumelanin, stroma)
		texture.format = RGBAFormat
		texture.type = HalfFloatType
		texture.minFilter = LinearFilter
		texture.magFilter = LinearFilter
		texture.wrapS = ClampToEdgeWrapping
		texture.wrapT = ClampToEdgeWrapping
		texture.wrapR = ClampToEdgeWrapping
		texture.unpackAlignment = 1
		texture.name = 'IrisColorLut'
		this.texture = texture
		// The table on the GPU as floats, its model's key, and a crossfade.
		this.floats = null
		this.key = null
		this.blend = null
		// The tables kept, by their model's key (never changed in place).
		this.tables = new Map()
	}

	// Builds the lookup of `colorParams`, unless its layer model is unchanged.
	update(colorParams) {
		const model = irisLayerModel(colorParams)
		const key = modelKey(model)
		this.blend = null
		if (key === this.key) return
		this.key = key
		this.upload((this.floats = this.table(model, key)))
	}

	// The table of `model`: kept, or built now and kept.
	table(model, key) {
		const kept = this.tables.get(key)
		if (kept) return kept
		const floats = buildIrisColorLut(model)
		this.keep(key, floats)
		return floats
	}

	keep(key, floats) {
		this.tables.delete(key)
		this.tables.set(key, floats)
		if (this.tables.size > KEPT_TABLES) this.tables.delete(this.tables.keys().next().value)
	}

	// Whether switching to `colorParams` needs no rebuild (its table is kept).
	has(colorParams) {
		return this.tables.has(modelKey(irisLayerModel(colorParams)))
	}

	// Builds the tables of a list of `colorParams` ahead of time, in workers
	// (src/iris/irisColorLut.worker.js), and keeps them; resolves once they
	// are all kept (at once for those already kept), and rejects if a worker
	// fails.
	prepare(colorParamsList) {
		const jobs = new Map()
		for (const colorParams of colorParamsList) {
			const model = irisLayerModel(colorParams)
			const key = modelKey(model)
			if (!this.tables.has(key)) jobs.set(key, { key, model })
		}
		if (jobs.size === 0) return Promise.resolve()
		const cores = globalThis.navigator?.hardwareConcurrency ?? 2
		const count = Math.min(MAX_WORKERS, Math.max(1, cores - 1), jobs.size)
		const shares = Array.from({ length: count }, () => [])
		;[...jobs.values()].forEach((job, i) => shares[i % count].push(job))
		return Promise.all(
			shares.map(
				(share) =>
					new Promise((resolve, reject) => {
						const worker = new Worker(new URL('./irisColorLut.worker.js', import.meta.url), {
							type: 'module',
						})
						let left = share.length
						worker.onmessage = ({ data }) => {
							this.keep(data.key, data.floats)
							if (--left > 0) return
							worker.terminate()
							resolve()
						}
						worker.onerror = (event) => {
							worker.terminate()
							reject(new Error(`Iris color tables: ${event.message}`))
						}
						worker.postMessage(share)
					}),
			),
		).then(() => {})
	}

	get blending() {
		return this.blend !== null
	}

	// Starts a crossfade from the current table to the lookup of `colorParams`;
	// returns false when the layer model does not change.
	beginBlend(colorParams) {
		const model = irisLayerModel(colorParams)
		const key = modelKey(model)
		if (key === this.key) {
			this.blend = null
			return false
		}
		this.blend = {
			from: this.floats.slice(),
			to: this.table(model, key),
			key,
			mixed: new Float32Array(this.floats.length),
		}
		// Mixed tables match no model.
		this.key = null
		return true
	}

	// The crossfade at `weight` (0: the old table, 1: the new one, which ends it).
	setBlend(weight) {
		const { from, to, key, mixed } = this.blend
		if (weight >= 1) {
			this.blend = null
			this.key = key
			this.upload((this.floats = to))
			return
		}
		for (let i = 0; i < mixed.length; i++) mixed[i] = from[i] + (to[i] - from[i]) * weight
		this.upload((this.floats = mixed))
	}

	upload(floats) {
		for (let i = 0; i < floats.length; i++) this.data[i] = DataUtils.toHalfFloat(floats[i])
		this.texture.needsUpdate = true
	}

	dispose() {
		this.texture.dispose()
	}
}
