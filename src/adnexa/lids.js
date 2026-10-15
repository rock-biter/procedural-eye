// The eyelids: the ring mesh of src/adnexa/lidGeometry.js around the
// fissure, in world space (it does not turn with the gaze), with the skin
// program.
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	Mesh,
	ShaderMaterial,
	Uniform,
	Vector2,
	Vector4,
} from 'three'
import { apertureRadius } from '../camera/cameraOptics'
import { debugViewDefine } from '../debug/debugViews'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import { SHADOW_LAYER } from '../lighting/keyShadow'
import fragmentShader from '../shaders/skin-fragment.glsl'
import vertexShader from '../shaders/skin-vertex.glsl'
import { createConjunctivaMesh, createLidMesh, LID_PROFILE } from './lidGeometry'
import { bakeLidOcclusion } from './lidOcclusion'

export default class Lids {
	// `shadowUniforms`: the key light's shadow map (src/lighting/keyShadow.js).
	constructor(envUniforms, shadowUniforms, debugView) {
		this.uniforms = {
			uZero: new Uniform(0),
			uSkinColor: new Uniform(new Color()),
			uSkin: new Uniform(new Vector4()),
			uSkin2: new Uniform(new Vector4()),
			uSkin3: new Uniform(new Vector4()),
			uCanthi: new Uniform(new Vector4()),
			uMarginLength: new Uniform(new Vector2(28, 28)),
			uPixelAngle: new Uniform(0.001),
			uDefocus: new Uniform(new Vector2(0, 1)),
			uOcclusion: new Uniform(1),
			...envUniforms,
			...shadowUniforms,
		}
		this.material = new ShaderMaterial({
			uniforms: this.uniforms,
			defines: { MAX_EMITTERS, EMITTER_VEC4S, DEBUG_VIEW: debugViewDefine(debugView) },
			vertexShader,
			fragmentShader,
		})
		this.material.name = 'Skin'
		this.mesh = new Mesh(new BufferGeometry(), this.material)
		this.mesh.name = 'Lids'
		// Casters of the key light's shadow.
		this.mesh.layers.enable(SHADOW_LAYER)
		this.fissure = null
	}

	rebuild(params, eye) {
		const data = createLidMesh(params.lids, eye, eye.nasalSign)
		// The conjunctiva fills the canthi beyond the globe's outline (same program).
		const fornix = createConjunctivaMesh(params.lids, eye, eye.nasalSign)
		const join = (a, b) => {
			const out = new a.constructor(a.length + b.length)
			out.set(a)
			out.set(b, a.length)
			return out
		}
		const offset = data.positions.length / 3
		const geometry = new BufferGeometry()
		geometry.setAttribute(
			'position',
			new BufferAttribute(join(data.positions, fornix.positions), 3),
		)
		geometry.setAttribute('lid', new BufferAttribute(join(data.lid, fornix.lid), 4))
		geometry.setAttribute('relief', new BufferAttribute(join(data.relief, fornix.relief), 4))
		geometry.setAttribute('follow', new BufferAttribute(join(data.follow, fornix.follow), 2))
		// Ambient occlusion, baked at rest over the lid band and the conjunctiva.
		const [lidOcclusion, fornixOcclusion] = bakeLidOcclusion(
			[{ ...data, bakes: (v) => data.lid[v * 4 + 2] < 10 }, fornix],
			eye,
		)
		geometry.setAttribute('ao', new BufferAttribute(join(lidOcclusion, fornixOcclusion), 1))
		geometry.setIndex(
			new BufferAttribute(
				join(
					data.indices,
					fornix.indices.map((index) => index + offset),
				),
				1,
			),
		)
		geometry.computeVertexNormals()
		geometry.computeBoundingSphere()
		this.mesh.geometry.dispose()
		this.mesh.geometry = geometry
		this.fissure = data.fissure
		const { medial, lateral, lengths } = data.fissure
		this.uniforms.uCanthi.value.set(medial[0], medial[1], lateral[0], lateral[1])
		this.uniforms.uMarginLength.value.fromArray(lengths)
	}

	setDebugView(view) {
		const value = debugViewDefine(view)
		if (this.material.defines.DEBUG_VIEW === value) return
		this.material.defines.DEBUG_VIEW = value
		this.material.needsUpdate = true
	}

	update(params, pixelAngle) {
		const skin = params.skin
		const u = this.uniforms
		u.uPixelAngle.value = pixelAngle
		// The camera's aperture diameter and focus distance (src/camera/): the
		// fine relief fades where the depth of field blurs it.
		const lens = params.camera
		u.uDefocus.value.set(2 * apertureRadius(lens.focalLength, lens.fNumber), lens.distance)
		u.uSkinColor.value.set(skin.color)
		u.uSkin.value.set(skin.redness, skin.roughness, skin.wetness, skin.pores)
		u.uSkin2.value.set(skin.wrinkles, skin.translucency, LID_PROFILE.wall, LID_PROFILE.edge)
		u.uSkin3.value.set(skin.freckles, skin.veins, skin.pigmentation, params.lids.seed)
		u.uOcclusion.value = skin.occlusion
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.material.dispose()
	}
}
