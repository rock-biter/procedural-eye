// The visible tear film beyond the cornea: the meniscus along both lid
// margins (src/adnexa/lidGeometry.js createMeniscusMesh) and a few tiny
// bubbles caught in the lower one, all water (tear-fragment.glsl).
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	IcosahedronGeometry,
	InstancedMesh,
	Matrix4,
	Mesh,
	ShaderMaterial,
	Uniform,
} from 'three'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import { createRandom } from '../random'
import fragmentShader from '../shaders/tear-fragment.glsl'
import vertexShader from '../shaders/tear-vertex.glsl'
import { createFissure } from './fissure'
import { setBlinkFrames, setBlinkPlaceholders } from './lidBlink'
import { createMeniscusMesh } from './lidGeometry'
import { supportAt } from './periocular'

const MAX_BUBBLES = 60

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
		// Bubbles sit in the lower meniscus: they follow the lower lid.
		const bubble = new IcosahedronGeometry(1, 2)
		bubble.setAttribute(
			'follow',
			new BufferAttribute(
				new Float32Array(bubble.attributes.position.count * 2).map((_, i) => (i % 2 === 1 ? 1 : 0)),
				2,
			),
		)
		this.bubbles = new InstancedMesh(bubble, this.material, MAX_BUBBLES)
		this.bubbles.name = 'TearBubbles'
		this.bubbles.count = 0
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

		// Bubbles in the lower meniscus, more toward the canthi.
		const random = createRandom(`bubbles:${params.lashes.seed}`)
		const fissure = createFissure(params.lids, eye.nasalSign)
		const matrix = new Matrix4()
		const count = Math.min(Math.round(params.lids.bubbles), MAX_BUBBLES)
		for (let i = 0; i < count; i++) {
			const t = 0.52 + 0.46 * random()
			const [mx, my] = fissure.loop(t)
			const [nx, ny] = fissure.normal(t)
			const radius = 0.015 + 0.06 * random() ** 3
			const inset = params.lids.meniscusLower * (0.2 + 0.5 * random())
			const x = mx - nx * inset
			const y = my - ny * inset
			const surface = supportAt(eye, params.lids, fissure, x, y)
			matrix.makeScale(radius, radius, radius)
			matrix.setPosition(
				surface.point[0] + surface.normal[0] * (0.05 + radius),
				surface.point[1] + surface.normal[1] * (0.05 + radius),
				surface.point[2] + surface.normal[2] * (0.05 + radius),
			)
			this.bubbles.setMatrixAt(i, matrix)
		}
		this.bubbles.count = count
		this.bubbles.instanceMatrix.needsUpdate = true
		this.bubbles.computeBoundingSphere()
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
		this.bubbles.geometry.dispose()
		this.material.dispose()
	}
}
