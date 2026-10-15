// The eyelashes: tubes along the generated centerlines (src/adnexa/lashGenerator.js),
// tapered to the tip, in world space, with the lash program.
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Uniform } from 'three'
import { debugViewDefine } from '../debug/debugViews'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import { SHADOW_LAYER } from '../lighting/keyShadow'
import { vec3 } from '../math'
import fragmentShader from '../shaders/lash-fragment.glsl'
import vertexShader from '../shaders/lash-vertex.glsl'
import { generateLashes } from './lashGenerator'

const SIDES = 6

// Tube geometry along every lash: parallel-transported rings, radius tapering
// over the last third.
export function createLashGeometry(lashes) {
	const ringCount = lashes.reduce((sum, lash) => sum + lash.points.length, 0)
	const positions = new Float32Array(ringCount * SIDES * 3)
	const normals = new Float32Array(ringCount * SIDES * 3)
	const tangents = new Float32Array(ringCount * SIDES * 3)
	const attributes = new Float32Array(ringCount * SIDES * 2)
	const follow = new Float32Array(ringCount * SIDES * 2)
	const indices = []
	let vertex = 0
	for (const [index, lash] of lashes.entries()) {
		const points = lash.points
		const random = ((index * 2654435761) % 1000) / 1000
		let reference =
			Math.abs(vec3.normalize(vec3.sub(points[1], points[0]))[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
		const start = vertex
		for (let k = 0; k < points.length; k++) {
			const previous = points[Math.max(k - 1, 0)]
			const next = points[Math.min(k + 1, points.length - 1)]
			const tangent = vec3.normalize(vec3.sub(next, previous))
			const side = vec3.normalize(vec3.cross(tangent, reference))
			const up = vec3.cross(side, tangent)
			reference = up
			const u = k / (points.length - 1)
			const radius = lash.radius * (1 - 0.85 * Math.max(0, (u - 0.6) / 0.4) ** 1.5)
			for (let j = 0; j < SIDES; j++) {
				const angle = (j / SIDES) * Math.PI * 2
				const normal = vec3.add(vec3.scale(side, Math.cos(angle)), vec3.scale(up, Math.sin(angle)))
				positions.set(vec3.madd(points[k], normal, radius), vertex * 3)
				normals.set(normal, vertex * 3)
				tangents.set(tangent, vertex * 3)
				attributes.set([u, random], vertex * 2)
				follow.set([lash.side === 'upper' ? 1 : 0, 1], vertex * 2)
				vertex++
			}
		}
		for (let k = 0; k < points.length - 1; k++) {
			for (let j = 0; j < SIDES; j++) {
				const a = start + k * SIDES + j
				const b = start + k * SIDES + ((j + 1) % SIDES)
				const c = a + SIDES
				const d = b + SIDES
				indices.push(a, c, b, b, c, d)
			}
		}
	}
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(positions, 3))
	geometry.setAttribute('normal', new BufferAttribute(normals, 3))
	geometry.setAttribute('tangent3', new BufferAttribute(tangents, 3))
	geometry.setAttribute('lash', new BufferAttribute(attributes, 2))
	geometry.setAttribute('follow', new BufferAttribute(follow, 2))
	geometry.setIndex(indices)
	geometry.computeBoundingSphere()
	return geometry
}

export default class Lashes {
	// `shadowUniforms`: the key light's shadow map (src/lighting/keyShadow.js).
	constructor(envUniforms, shadowUniforms, debugView) {
		this.uniforms = {
			uZero: new Uniform(0),
			uLashColor: new Uniform(new Color()),
			uLashShine: new Uniform(0.5),
			...envUniforms,
			...shadowUniforms,
		}
		this.material = new ShaderMaterial({
			uniforms: this.uniforms,
			defines: { MAX_EMITTERS, EMITTER_VEC4S, DEBUG_VIEW: debugViewDefine(debugView) },
			vertexShader,
			fragmentShader,
		})
		this.material.name = 'Lashes'
		this.mesh = new Mesh(new BufferGeometry(), this.material)
		this.mesh.name = 'Lashes'
		// Drawn first: the skin and the eye behind them are not shaded.
		this.mesh.renderOrder = -1
		// Casters of the key light's shadow.
		this.mesh.layers.enable(SHADOW_LAYER)
		this.lashes = []
	}

	rebuild(params, eye) {
		this.lashes = generateLashes(params, eye)
		this.mesh.geometry.dispose()
		this.mesh.geometry = createLashGeometry(this.lashes)
	}

	setDebugView(view) {
		const value = debugViewDefine(view)
		if (this.material.defines.DEBUG_VIEW === value) return
		this.material.defines.DEBUG_VIEW = value
		this.material.needsUpdate = true
	}

	update(params) {
		this.uniforms.uLashColor.value.set(params.lashes.color)
		this.uniforms.uLashShine.value = params.lashes.shine
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.material.dispose()
	}
}
