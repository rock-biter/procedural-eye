// The eyelids: the ring mesh of src/adnexa/lidGeometry.js around the
// fissure, in world space (it does not turn with the gaze), with the skin
// program and its baked pigment patterns (src/adnexa/skinPattern.js); and the
// back shell (src/adnexa/backShell.js) closing the skin patch behind, with the
// skin program's SKIN_SHELL variant. Outside #debug both read the relief and
// the freckles baked by src/adnexa/skinRelief.js (SKIN_BAKED); in #debug they
// evaluate them per pixel, so the panel's edits show at once.
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
import { backShellSurface, createBackShell, keepInside } from './backShell'
import {
	createConjunctivaMesh,
	createLidMesh,
	createPalpebralMesh,
	LID_PROFILE,
} from './lidGeometry'
import { setBlinkFrames, setBlinkPlaceholders } from './lidBlink'
import { bakeLidOcclusion } from './lidOcclusion'
import SkinPattern from './skinPattern'
import SkinRelief from './skinRelief'

export default class Lids {
	// `shadowUniforms`: the key light's shadow map (src/lighting/keyShadow.js).
	constructor(envUniforms, shadowUniforms, debugView) {
		this.pattern = new SkinPattern()
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
			uSkinPattern: new Uniform(this.pattern.texture),
			uSkinPatternBox: new Uniform(this.pattern.box),
			uSkinRelief: new Uniform(null),
			uSkinReliefTexel: new Uniform(1),
			uSkinFreckles: new Uniform(null),
			uSkinFrecklesTexel: new Uniform(1),
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
		// The back shell: the same skin uniforms, and its tone. It lies behind
		// the skin the key light falls on, so it casts no shadow.
		this.backUniforms = {
			...this.uniforms,
			uShellTone: new Uniform(1),
			uSkinRelief: new Uniform(null),
			uSkinReliefTexel: new Uniform(1),
		}
		this.backMaterial = new ShaderMaterial({
			uniforms: this.backUniforms,
			defines: { ...this.material.defines, SKIN_SHELL: '' },
			vertexShader,
			fragmentShader,
		})
		this.backMaterial.name = 'BackShell'
		this.back = new Mesh(new BufferGeometry(), this.backMaterial)
		this.back.name = 'BackShell'
		// The baked relief and freckles, read while `baked`; the lid ring they
		// are baked from, and its version (one per rebuild).
		this.relief = new SkinRelief(this.uniforms)
		const textures = this.relief.textures()
		this.uniforms.uSkinRelief.value = textures.lids
		this.uniforms.uSkinFreckles.value = textures.freckles
		this.backUniforms.uSkinRelief.value = textures.shell
		this.baked = false
		this.ring = new BufferGeometry()
		this.version = 0
	}

	// The lids and the back shell, for params.lids and params.shell.
	// `renderer` bakes the skin patterns over the new mesh.
	rebuild(params, eye, renderer) {
		const data = createLidMesh(params.lids, eye, eye.nasalSign)
		// The back shell closes the patch behind the lids.
		const back = backShellSurface(data, eye, params.shell)
		// The conjunctiva fills the canthi beyond the globe's outline, and the
		// palpebral conjunctiva hangs from the margins behind them (same
		// program); where they reach under the lids past the shell, they keep
		// inside it.
		const { clearance } = params.shell
		const fornix = keepInside(
			createConjunctivaMesh(params.lids, eye, eye.nasalSign),
			back,
			clearance,
		)
		const curtain = keepInside(
			createPalpebralMesh(params.lids, eye, eye.nasalSign),
			back,
			clearance,
		)
		const parts = [data, fornix, curtain]
		const join = (arrays) => {
			const out = new arrays[0].constructor(arrays.reduce((sum, a) => sum + a.length, 0))
			let offset = 0
			for (const a of arrays) {
				out.set(a, offset)
				offset += a.length
			}
			return out
		}
		const merged = (name) => join(parts.map((part) => part[name]))
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(merged('positions'), 3))
		geometry.setAttribute('lid', new BufferAttribute(merged('lid'), 4))
		geometry.setAttribute('relief', new BufferAttribute(merged('relief'), 4))
		geometry.setAttribute('follow', new BufferAttribute(merged('follow'), 2))
		// Ambient occlusion, baked at rest over the lid band, the conjunctiva and
		// the palpebral conjunctiva.
		const occlusion = bakeLidOcclusion(
			[{ ...data, bakes: (v) => data.lid[v * 4 + 2] < 10 }, fornix, curtain],
			eye,
		)
		geometry.setAttribute('ao', new BufferAttribute(join(occlusion), 1))
		let first = 0
		const indices = parts.map((part) => {
			const shifted = part.indices.map((index) => index + first)
			first += part.positions.length / 3
			return shifted
		})
		geometry.setIndex(new BufferAttribute(join(indices), 1))
		// The lid ring alone (the first part), for the relief bake: the same
		// arrays, drawn up to its last triangle. Its own attributes: the blink's
		// frames dispose of the merged geometry's buffers (setBlinkFrames()).
		this.ring.dispose()
		this.ring = new BufferGeometry()
		for (const name of ['position', 'lid', 'relief']) {
			const attribute = geometry.getAttribute(name)
			this.ring.setAttribute(name, new BufferAttribute(attribute.array, attribute.itemSize))
		}
		this.ring.setIndex(new BufferAttribute(geometry.getIndex().array, 1))
		this.ring.setDrawRange(0, data.indices.length)
		this.version++
		geometry.computeVertexNormals()
		// The blink's frames: placeholders until src/adnexa/lidBlink.js brings
		// them; the occlusion rides in the morph colors.
		setBlinkPlaceholders(geometry, ['position', 'normal', 'ao'])
		geometry.computeBoundingSphere()
		geometry.computeBoundingBox()
		this.mesh.geometry.dispose()
		this.mesh.geometry = geometry
		this.mesh.updateMorphTargets()
		// Where the parts lie in the merged mesh: the ring's columns and rows,
		// and the palpebral conjunctiva's first vertex and rows.
		const around = data.rim.length / 3
		this.layout = {
			around,
			across: data.positions.length / 3 / around,
			curtain: (data.positions.length + fornix.positions.length) / 3,
			rows: curtain.positions.length / 3 / around,
		}
		// The patterns cover the mesh at rest, with a texel or so to spare.
		const { min, max } = geometry.boundingBox
		this.pattern.bake(
			renderer,
			{ min: [min.x - 0.1, min.y - 0.1], max: [max.x + 0.1, max.y + 0.1] },
			params.lids.seed,
		)
		this.fissure = data.fissure
		const { medial, lateral, lengths } = data.fissure
		this.uniforms.uCanthi.value.set(medial[0], medial[1], lateral[0], lateral[1])
		this.uniforms.uMarginLength.value.fromArray(lengths)
		this.rebuildBack(createBackShell(data, back, params.shell))
	}

	// The blink's frames of the lid ring (positions, normals and occlusion per
	// frame, src/adnexa/blinkFrames.js) as the merged mesh's morph targets. The
	// conjunctiva stays; the palpebral conjunctiva hangs from the posterior
	// margin, so each of its columns moves with its margin's vertex (the ring's
	// first row), and keeps its occlusion.
	setBlinkFrames(frames) {
		const geometry = this.mesh.geometry
		const base = geometry.getAttribute('position').array
		const baseNormals = geometry.getAttribute('normal').array
		const baseAo = geometry.getAttribute('ao').array
		const { around, across, curtain, rows } = this.layout
		const positions = []
		const normals = []
		const occlusion = []
		for (const frame of frames) {
			const p = base.slice()
			p.set(frame.positions)
			for (let i = 0; i < around; i++) {
				const margin = i * across * 3
				for (let j = 0; j < rows; j++) {
					const v = (curtain + i * rows + j) * 3
					for (let c = 0; c < 3; c++) p[v + c] += frame.positions[margin + c] - base[margin + c]
				}
			}
			const n = baseNormals.slice()
			n.set(frame.normals)
			const ao = baseAo.slice()
			ao.set(frame.ao)
			positions.push(new BufferAttribute(p, 3))
			normals.push(new BufferAttribute(n, 3))
			occlusion.push(new BufferAttribute(ao, 1))
		}
		setBlinkFrames(geometry, { position: positions, normal: normals, color: occlusion })
	}

	// The back shell's mesh from its data (src/adnexa/backShell.js).
	rebuildBack(shell) {
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(shell.positions, 3))
		geometry.setAttribute('coords', new BufferAttribute(shell.coords, 2))
		geometry.setAttribute('lid', new BufferAttribute(shell.lid, 4))
		geometry.setAttribute('relief', new BufferAttribute(shell.relief, 4))
		geometry.setAttribute('follow', new BufferAttribute(shell.follow, 2))
		geometry.setAttribute('ao', new BufferAttribute(shell.ao, 1))
		geometry.setIndex(new BufferAttribute(shell.indices, 1))
		geometry.computeVertexNormals()
		geometry.computeBoundingSphere()
		this.back.geometry.dispose()
		this.back.geometry = geometry
	}

	// Whether the skin reads the baked relief and freckles (SKIN_BAKED) or
	// evaluates them per pixel (#debug). Bake with bakeRelief() before the
	// next frame.
	setBaked(baked) {
		if (baked === this.baked) return
		this.baked = baked
		for (const material of [this.material, this.backMaterial]) {
			if (baked) material.defines.SKIN_BAKED = ''
			else delete material.defines.SKIN_BAKED
			material.needsUpdate = true
		}
	}

	// Bakes the relief and freckles for `params` unless they are baked for
	// them already (or the skin evaluates them per pixel). Returns whether it
	// baked.
	bakeRelief(renderer, params) {
		if (!this.baked) return false
		const { pores, wrinkles, freckles } = params.skin
		const key = JSON.stringify([this.version, params.lids.seed, pores, wrinkles, freckles])
		if (key === this.relief.key) return false
		this.update(params, this.uniforms.uPixelAngle.value)
		this.relief.bake(renderer, this.pattern.box, this.ring, key)
		this.uniforms.uSkinReliefTexel.value = this.relief.texel.lids
		this.uniforms.uSkinFrecklesTexel.value = this.relief.texel.freckles
		this.backUniforms.uSkinReliefTexel.value = this.relief.texel.shell
		return true
	}

	setDebugView(view) {
		const value = debugViewDefine(view)
		for (const material of [this.material, this.backMaterial]) {
			if (material.defines.DEBUG_VIEW === value) continue
			material.defines.DEBUG_VIEW = value
			material.needsUpdate = true
		}
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
		this.backUniforms.uShellTone.value = params.shell.tone
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.material.dispose()
		this.back.geometry.dispose()
		this.backMaterial.dispose()
		this.pattern.dispose()
		this.ring.dispose()
		this.relief.dispose()
	}
}
