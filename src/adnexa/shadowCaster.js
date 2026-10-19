// A caster of the key light's shadow: the shadow proxy of a mesh
// (src/adnexa/shadowProxy.js) on SHADOW_LAYER only, so the shadow passes draw
// it in place of the mesh and the camera never sees it. It takes the mesh's
// positions and follow (the gaze follow), and its blink: the frames of the
// mesh on its vertices (lid-morph.glsl, position slot only, which the shadow
// program reads).
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three'
import { SHADOW_LAYER } from '../lighting/keyShadow'
import { setBlinkFrames, setBlinkPlaceholders } from './lidBlink'
import { proxyAttribute } from './shadowProxy'

export default class ShadowCaster {
	constructor(name) {
		// The shadow passes draw it with their own material (overrideMaterial).
		this.mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
		this.mesh.name = name
		this.mesh.layers.set(SHADOW_LAYER)
		this.proxy = null
	}

	// The proxy `proxy` of `geometry` (its position and follow attributes).
	rebuild(geometry, proxy) {
		this.proxy = proxy
		const shadow = new BufferGeometry()
		for (const [name, size] of [
			['position', 3],
			['follow', 2],
		]) {
			const source = geometry.getAttribute(name)
			shadow.setAttribute(
				name,
				new BufferAttribute(proxyAttribute(proxy, source.array, size), size),
			)
		}
		shadow.setIndex(new BufferAttribute(proxy.indices, 1))
		setBlinkPlaceholders(shadow, ['position'])
		shadow.computeBoundingSphere()
		this.mesh.geometry.dispose()
		this.mesh.geometry = shadow
		this.mesh.updateMorphTargets()
	}

	// The blink's frames: the mesh's positions per frame.
	setBlinkFrames(positions) {
		setBlinkFrames(this.mesh.geometry, {
			position: positions.map(
				(frame) => new BufferAttribute(proxyAttribute(this.proxy, frame, 3), 3),
			),
		})
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.mesh.material.dispose()
	}
}
