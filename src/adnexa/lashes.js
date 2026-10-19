// The eyelashes: tubes along the generated centerlines (src/adnexa/lashGenerator.js),
// tapered to the tip, in world space, with the lash program.
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Uniform } from 'three'
import { debugViewDefine } from '../debug/debugViews'
import { EMITTER_VEC4S, MAX_EMITTERS } from '../lighting/envRig'
import { DRAW_ORDER } from '../render/drawOrder'
import fragmentShader from '../shaders/lash-fragment.glsl'
import vertexShader from '../shaders/lash-vertex.glsl'
import { generateLashes, LASH_SIDES, lashTubes } from './lashGenerator'
import { setBlinkFrames, setBlinkPlaceholders } from './lidBlink'
import ShadowCaster from './shadowCaster'
import { lashShadowProxy } from './shadowProxy'

// Tube geometry along every lash (lashTubes(), src/adnexa/lashGenerator.js).
export function createLashGeometry(lashes) {
	const tubes = lashTubes(lashes)
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(tubes.positions, 3))
	geometry.setAttribute('normal', new BufferAttribute(tubes.normals, 3))
	geometry.setAttribute('tangent3', new BufferAttribute(tubes.tangents, 3))
	geometry.setAttribute('lash', new BufferAttribute(tubes.lash, 2))
	geometry.setAttribute('lashRadius', new BufferAttribute(tubes.radii, 1))
	geometry.setAttribute('follow', new BufferAttribute(tubes.follow, 2))
	geometry.setIndex(new BufferAttribute(tubes.indices, 1))
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
			uLashWiden: new Uniform(0),
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
		this.mesh.renderOrder = DRAW_ORDER.lashes
		// Their lighter stand-in casts the key light's shadow
		// (src/adnexa/shadowProxy.js).
		this.shadow = new ShadowCaster('LashesShadow')
		this.lashes = []
	}

	rebuild(params, eye) {
		this.lashes = generateLashes(params, eye)
		this.mesh.geometry.dispose()
		const geometry = createLashGeometry(this.lashes)
		// The blink's frames (src/adnexa/lidBlink.js); the tangents ride in the
		// morph colors.
		setBlinkPlaceholders(geometry, ['position', 'normal', 'tangent3'])
		this.mesh.geometry = geometry
		this.mesh.updateMorphTargets()
		this.shadow.rebuild(
			geometry,
			lashShadowProxy(
				this.lashes.map((lash) => lash.points.length),
				LASH_SIDES,
			),
		)
	}

	// The blink's frames: positions, normals and tangents per frame
	// (src/adnexa/blinkFrames.js).
	setBlinkFrames(frames) {
		const attributes = (name) => frames.map((frame) => new BufferAttribute(frame[name], 3))
		setBlinkFrames(this.mesh.geometry, {
			position: attributes('positions'),
			normal: attributes('normals'),
			color: attributes('tangents'),
		})
		this.shadow.setBlinkFrames(frames.map((frame) => frame.positions))
	}

	setDebugView(view) {
		const value = debugViewDefine(view)
		if (this.material.defines.DEBUG_VIEW === value) return
		this.material.defines.DEBUG_VIEW = value
		this.material.needsUpdate = true
	}

	// `widen`: how much thicker the lashes are, a share of their radius
	// (lashWidening(), src/adnexa/lashGenerator.js).
	update(params, widen = 0) {
		this.uniforms.uLashColor.value.set(params.lashes.color)
		this.uniforms.uLashShine.value = params.lashes.shine
		this.uniforms.uLashWiden.value = widen
	}

	dispose() {
		this.mesh.geometry.dispose()
		this.material.dispose()
		this.shadow.dispose()
	}
}
