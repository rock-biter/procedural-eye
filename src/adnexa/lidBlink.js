// The blink on the GPU. The lid meshes (lids, lashes, tear meniscus) carry
// BLINK_FRAMES closing frames as three.js morph targets, absolute positions
// (src/adnexa/blinkFrames.js), and lid-morph.glsl blends them by the weights
// of the blink's closure; the fissure map's second channel holds the fissure
// closed, which the eye's shaders blend toward by uLidBlink.
//
// A worker builds the frames after every rebuild, when the living eye first
// needs them. Until they arrive the meshes carry placeholders (their own
// positions, so the programs keep their variant) and the lids stay open.
import { DataUtils } from 'three'
import { BLINK_FRAMES, blinkWeights } from './blinkFrames'

// The morph slot of each attribute: three.js packs positions, normals and
// colors in that order (lid-morph.glsl); the colors carry the lashes'
// tangents and the lids' occlusion (its x).
const SLOTS = { position: 'position', normal: 'normal', tangent3: 'color', ao: 'color' }

// Placeholder frames on a new geometry: its own attributes `names`, so its
// programs are compiled with the morph targets from the start and keep their
// variant when the frames arrive. Absolute frames: the open mesh weighs
// 1 − the frames' weights.
export function setBlinkPlaceholders(geometry, names) {
	geometry.morphTargetsRelative = false
	for (const name of names) {
		geometry.morphAttributes[SLOTS[name]] = new Array(BLINK_FRAMES).fill(
			geometry.getAttribute(name),
		)
	}
}

// The frames `attributes` ({ position, normal, color }: BufferAttribute per
// frame) in place of the placeholders. The renderer keeps the morph texture it
// built for a geometry: dispose() lets the next frame upload the geometry
// anew, with its frames.
export function setBlinkFrames(geometry, attributes) {
	Object.assign(geometry.morphAttributes, attributes)
	geometry.dispose()
	geometry.computeBoundingSphere()
}

export default class LidBlink {
	// `fissureMap`: the RG half-float texture whose G channel takes the closed
	// fissure; `uniform`: uLidBlink (src/lighting/keyShadow.js).
	constructor({ lids, lashes, tearFilm, fissureMap, uniform }) {
		this.lids = lids
		this.lashes = lashes
		this.tearFilm = tearFilm
		this.fissureMap = fissureMap
		this.uniform = uniform
		this.worker = null
		this.failed = false
		// Whether a job is in flight, the rebuilds so far, and whether the
		// frames fit the meshes (the lids' own, which take most of the work,
		// apart).
		this.pending = false
		this.version = 0
		this.ready = false
		this.lidsReady = false
	}

	// After a rebuild (`lids`: the lid mesh too), the frames no longer fit.
	invalidate(lids) {
		this.version++
		this.ready = false
		if (lids) this.lidsReady = false
		this.set(0)
	}

	// Asks for the frames of `params` unless they are built or on their way.
	prepare(params) {
		if (this.ready || this.pending || this.failed) return
		this.worker ??= this.createWorker()
		this.pending = true
		this.worker.postMessage({ id: this.version, params, lids: !this.lidsReady })
	}

	createWorker() {
		const worker = new Worker(new URL('./blinkFrames.worker.js', import.meta.url), {
			type: 'module',
		})
		worker.onmessage = ({ data }) => this.receive(data)
		worker.onerror = (event) => {
			console.error(`Blink frames: ${event.message}`)
			this.failed = true
			this.pending = false
		}
		return worker
	}

	receive(frames) {
		this.pending = false
		// A rebuild came in between: prepare() asks again.
		if (frames.id !== this.version) return
		if (frames.lids) {
			this.lids.setBlinkFrames(frames.lids)
			const data = this.fissureMap.image.data
			for (let i = 0; i < frames.fissure.length; i++) {
				data[i * 2 + 1] = DataUtils.toHalfFloat(frames.fissure[i])
			}
			this.fissureMap.needsUpdate = true
			this.lidsReady = true
		}
		this.lashes.setBlinkFrames(frames.lashes)
		this.tearFilm.setBlinkFrames(frames.meniscus)
		this.ready = true
	}

	// The blink's closure this frame: 0 open, 1 closed; open until the frames
	// are built.
	set(blink) {
		const value = this.ready ? blink : 0
		const weights = blinkWeights(value)
		for (const mesh of [this.lids.mesh, this.lashes.mesh, this.tearFilm.meniscus]) {
			const influences = mesh.morphTargetInfluences
			if (influences) for (let k = 0; k < weights.length; k++) influences[k] = weights[k]
		}
		this.uniform.value = value
	}

	dispose() {
		this.worker?.terminate()
	}
}
