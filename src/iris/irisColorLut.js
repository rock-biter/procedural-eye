// The iris color lookup on the GPU: buildIrisColorLut() (src/iris/irisColor.js)
// as a half-float RGBA Data3DTexture (ABL melanin × eumelanin share × stroma
// thickness), rebuilt when a layer parameter changes.
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
	}

	update(colorParams) {
		const floats = buildIrisColorLut(irisLayerModel(colorParams))
		for (let i = 0; i < floats.length; i++) this.data[i] = DataUtils.toHalfFloat(floats[i])
		this.texture.needsUpdate = true
	}

	dispose() {
		this.texture.dispose()
	}
}
