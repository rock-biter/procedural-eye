// The scleral vessel map: the generated network (src/sclera/vesselGenerator.js)
// rasterized into a polar texture around the optical axis, u = φ / 2π
// (repeating), v over SCLERA_PSI. Red: superficial (conjunctival) vessels,
// sharp; green: deep (episcleral) vessels, blurred as seen through the
// conjunctiva and Tenon's capsule.
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import { generateVessels, SCLERA_PSI } from './vesselGenerator'

const WIDTH = 2048
const HEIGHT = 512

function createCanvas() {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(WIDTH, HEIGHT)
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	return canvas
}

export default class ScleraMaps {
	constructor() {
		this.canvas = createCanvas()
		this.layer = createCanvas()
		this.texture = new CanvasTexture(this.canvas)
		this.texture.wrapS = RepeatWrapping
		this.texture.minFilter = LinearMipmapLinearFilter
		this.texture.magFilter = LinearFilter
		this.texture.name = 'ScleraVessels'
	}

	bake(params, scleraRadius) {
		const segments = generateVessels(params.sclera.vessels, scleraRadius)
		const pixelsPerMm = HEIGHT / ((SCLERA_PSI.max - SCLERA_PSI.min) * scleraRadius)
		const context = this.canvas.getContext('2d')
		context.globalCompositeOperation = 'source-over'
		context.fillStyle = '#000'
		context.fillRect(0, 0, WIDTH, HEIGHT)
		const layer = this.layer.getContext('2d')
		for (const depth of [1, 0]) {
			layer.clearRect(0, 0, WIDTH, HEIGHT)
			layer.lineCap = 'round'
			layer.strokeStyle = depth === 1 ? 'rgba(0, 255, 0, 0.75)' : 'rgba(255, 0, 0, 0.9)'
			for (const segment of segments) {
				if (segment.depth !== depth) continue
				const x0 = (segment.phi0 / (Math.PI * 2)) * WIDTH
				const x1 = (segment.phi1 / (Math.PI * 2)) * WIDTH
				const y0 = ((segment.psi0 - SCLERA_PSI.min) / (SCLERA_PSI.max - SCLERA_PSI.min)) * HEIGHT
				const y1 = ((segment.psi1 - SCLERA_PSI.min) / (SCLERA_PSI.max - SCLERA_PSI.min)) * HEIGHT
				layer.lineWidth = Math.max(0.6, segment.width * pixelsPerMm)
				// Wrapped copies so the seam at φ = 0 stays continuous.
				for (const shift of [-WIDTH, 0, WIDTH]) {
					const offset = Math.floor(x0 / WIDTH) * -WIDTH + shift
					layer.beginPath()
					layer.moveTo(x0 + offset, y0)
					layer.lineTo(x1 + offset, y1)
					layer.stroke()
				}
			}
			context.globalCompositeOperation = 'lighter'
			context.filter = depth === 1 ? 'blur(2.5px)' : 'blur(0.4px)'
			context.drawImage(this.layer, 0, 0)
			context.filter = 'none'
		}
		this.texture.needsUpdate = true
		return segments.length
	}

	dispose() {
		this.texture.dispose()
	}
}
