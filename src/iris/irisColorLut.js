// The iris color lookup on the GPU: buildIrisColorLut() (src/iris/irisColor.js)
// as a half-float RGBA Data3DTexture (ABL melanin × eumelanin share × stroma
// thickness), rebuilt when the layer model changes. Building it takes tens of
// milliseconds, so a parameter transition crossfades from the current table
// to the new one instead of rebuilding it every frame.
import {
	ClampToEdgeWrapping,
	Data3DTexture,
	DataUtils,
	HalfFloatType,
	LinearFilter,
	RGBAFormat,
} from 'three'
import { buildIrisColorLut, IRIS_COLOR_LUT, irisLayerModel } from './irisColor'

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
	}

	// Builds the lookup of `colorParams`, unless its layer model is unchanged.
	update(colorParams) {
		const model = irisLayerModel(colorParams)
		const key = JSON.stringify(model)
		this.blend = null
		if (key === this.key) return
		this.key = key
		this.upload((this.floats = buildIrisColorLut(model)))
	}

	get blending() {
		return this.blend !== null
	}

	// Starts a crossfade from the current table to the lookup of `colorParams`;
	// returns false when the layer model does not change.
	beginBlend(colorParams) {
		const model = irisLayerModel(colorParams)
		const key = JSON.stringify(model)
		if (key === this.key) {
			this.blend = null
			return false
		}
		this.blend = {
			from: this.floats.slice(),
			to: buildIrisColorLut(model),
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
