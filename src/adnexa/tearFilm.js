// The visible tear film beyond the cornea: the meniscus along both lid
// margins (src/adnexa/lidGeometry.js createMeniscusMesh), water
// (tear-fragment.glsl).
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Uniform } from 'three'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import { DRAW_ORDER } from '../render/drawOrder'
import fragmentShader from '../shaders/tear-fragment.glsl'
import vertexShader from '../shaders/tear-vertex.glsl'
import { setBlinkFrames, setBlinkPlaceholders } from './lidBlink'
import { createMeniscusMesh } from './lidGeometry'

export default class TearFilm {
	constructor(envUniforms, shadowUniforms) {
		this.uniforms = {
			uZero: new Uniform(0),
			uTearTint: new Uniform(new Color(0.75, 0.55, 0.52)),
			...envUniforms,
			...shadowUniforms,
		}
		this.material = new ShaderMaterial({
			uniforms: this.uniforms,
			defines: { MAX_EMITTERS, EMITTER_VEC4S },
			vertexShader,
			fragmentShader,
		})
		this.material.name = 'TearFilm'
		this.meniscus = new Mesh(new BufferGeometry(), this.material)
		this.meniscus.name = 'TearMeniscus'
		this.meniscus.renderOrder = DRAW_ORDER.meniscus
	}

	rebuild(params, eye) {
		const data = createMeniscusMesh(params.lids, eye, eye.nasalSign)
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
		geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
		geometry.setAttribute('follow', new BufferAttribute(data.follow, 2))
		geometry.setIndex(new BufferAttribute(data.indices, 1))
		// The blink's frames (src/adnexa/lidBlink.js).
		setBlinkPlaceholders(geometry, ['position', 'normal'])
		geometry.computeBoundingSphere()
		this.meniscus.geometry.dispose()
		this.meniscus.geometry = geometry
		this.meniscus.updateMorphTargets()
	}

	// The meniscus' blink frames: positions and normals per frame
	// (src/adnexa/blinkFrames.js).
	setBlinkFrames(frames) {
		const attributes = (name) => frames.map((frame) => new BufferAttribute(frame[name], 3))
		setBlinkFrames(this.meniscus.geometry, {
			position: attributes('positions'),
			normal: attributes('normals'),
		})
	}

	dispose() {
		this.meniscus.geometry.dispose()
		this.material.dispose()
	}
}
