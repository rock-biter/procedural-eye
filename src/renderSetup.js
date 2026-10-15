// The renderer and its window: canvas, scene, drawing-buffer size, frame
// telemetry and the adaptive pixel ratio. Everything renders through the
// offscreen post-processing chain (src/render/postProcessing.js), so the
// canvas needs neither depth nor alpha nor MSAA.
import { NoToneMapping, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three'
import {
	AdaptivePixelRatio,
	createAdaptivePixelRatioSettings,
	getMaxPixelRatio,
	parsePixelRatio,
} from './adaptivePixelRatio'
import FrameStats from './frameStats'

// The focus distance (mm) of background pixels: far enough to count as
// infinity, and finite in the half-float scene buffer (at most 65504), where
// an infinite alpha would make the accumulation drop every background sample.
export const FOCUS_AT_INFINITY = 6e4

export default class RenderSetup {
	constructor({ params, urlParams }) {
		// No premultiplied alpha: the clear alpha is the focus distance, which
		// three would otherwise multiply into the clear color.
		this.renderer = new WebGLRenderer({
			antialias: false,
			depth: false,
			alpha: false,
			premultipliedAlpha: false,
			powerPreference: 'high-performance',
		})
		this.renderer.outputColorSpace = SRGBColorSpace
		this.renderer.toneMapping = NoToneMapping
		// Background pixels: the backdrop color (set every frame by the app),
		// focused at infinity.
		this.renderer.setClearColor(0x000000, FOCUS_AT_INFINITY)
		document.body.appendChild(this.renderer.domElement)

		this.scene = new Scene()
		this.sizes = { width: window.innerWidth, height: window.innerHeight }
		this.frameStats = new FrameStats(this.renderer)
		this.pinnedPixelRatio = parsePixelRatio(urlParams)
		this.pixelRatioSettings = createAdaptivePixelRatioSettings({
			enabled: params.quality.adaptiveResolution && this.pinnedPixelRatio === null,
			min: params.quality.minPixelRatio,
		})
		this.adaptivePixelRatio = new AdaptivePixelRatio(
			this.pixelRatioSettings,
			this.getMaxPixelRatio(),
		)
		this.onResize = null
		this.drawingBufferSize = new Vector2()

		this.handleResize = this.handleResize.bind(this)
		window.addEventListener('resize', this.handleResize)
		this.applyPixelRatio()
	}

	getMaxPixelRatio() {
		return this.pinnedPixelRatio ?? getMaxPixelRatio(window.devicePixelRatio)
	}

	syncQuality(params) {
		this.pixelRatioSettings.enabled =
			params.quality.adaptiveResolution && this.pinnedPixelRatio === null
		this.pixelRatioSettings.min = params.quality.minPixelRatio
	}

	handleResize() {
		this.sizes.width = window.innerWidth
		this.sizes.height = window.innerHeight
		this.adaptivePixelRatio.setMax(this.getMaxPixelRatio())
		this.applyPixelRatio()
	}

	// Feeds an interactive frame's duration to the adaptive ratio.
	adaptPixelRatio(deltaMs) {
		if (this.adaptivePixelRatio.update(deltaMs) !== null) this.applyPixelRatio()
	}

	applyPixelRatio() {
		this.renderer.setPixelRatio(this.adaptivePixelRatio.ratio)
		this.renderer.setSize(this.sizes.width, this.sizes.height)
		this.onResize?.()
	}

	getDrawingBufferSize() {
		const size = this.renderer.getDrawingBufferSize(this.drawingBufferSize)
		return { width: size.x, height: size.y }
	}

	getStats() {
		return { ...this.frameStats.getStats(), adaptivePixelRatio: this.adaptivePixelRatio.getStats() }
	}
}
