// The backdrop beyond the skin (backdrop-vertex.glsl, backdrop-fragment.glsl):
// a full-screen triangle at the far plane, drawn last in the scene where
// nothing else was, in the clear color, with the soft shadow the skin patch
// casts from the light shafts' direction (the key's light, turned by
// shafts.azimuth and shafts.elevation) onto a floor below the face (world y =
// −backdrop.distance), or, as backdrop.tilt goes to 90°, onto a plane tilted up
// about the world x axis toward a wall behind the face (z = −distance). The
// plane shows nothing else, and keeps the background's focus distance, so the
// depth of field and the dust treat it as the backdrop. Part of the scene, it accumulates and blurs with the rest; on
// layer 0 only, the key's shadow pass never draws it.
import {
	BufferGeometry,
	Float32BufferAttribute,
	Mesh,
	NoBlending,
	ShaderMaterial,
	Uniform,
	Vector3,
	Vector4,
} from 'three'
import { DEG, smoothstep, vec3 } from '../math'
import { FOCUS_AT_INFINITY } from '../renderSetup'
import fragmentShader from '../shaders/backdrop-fragment.glsl'
import vertexShader from '../shaders/backdrop-vertex.glsl'

export default class Backdrop {
	// `coverageUniforms`: the shadow coverages' (src/lighting/shadowCoverage.js).
	constructor(coverageUniforms) {
		this.uniforms = {
			...coverageUniforms,
			uZero: new Uniform(0),
			uBackdropColor: new Uniform(new Vector3()),
			// The plane's unit normal (world) and offset (dot(normal, p) on it).
			uShadowPlane: new Uniform(new Vector4(0, 1, 0, 0)),
			uShadowStrength: new Uniform(0),
		}
		const triangle = new BufferGeometry()
		triangle.setAttribute(
			'position',
			new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
		)
		this.mesh = new Mesh(
			triangle,
			new ShaderMaterial({
				uniforms: this.uniforms,
				defines: { FOCUS_AT_INFINITY: FOCUS_AT_INFINITY.toFixed(1) },
				vertexShader,
				fragmentShader,
				blending: NoBlending,
				depthWrite: false,
			}),
		)
		this.mesh.name = 'Backdrop'
		this.mesh.material.name = 'Backdrop'
		this.mesh.frustumCulled = false
		// After the eyeball (1): the depth test then leaves it the backdrop only.
		this.mesh.renderOrder = 2
		this.mesh.visible = false
	}

	// `color`: the backdrop's radiance (the clear color, a Color); `toLight`:
	// toward the light shafts' source (ShaftLight.direction), or null without a
	// key; `beauty`: whether the debug view is the image.
	update(params, color, toLight, beauty) {
		const { shadow, distance, tilt } = params.backdrop
		const normal = [0, Math.cos(tilt * DEG), Math.sin(tilt * DEG)]
		// How squarely the light faces the plane: the shadow fades out as it turns away.
		const facing = toLight ? vec3.dot(normal, toLight) : 0
		const strength = shadow * smoothstep(0, 0.15, facing)
		this.mesh.visible = beauty && strength > 0
		this.uniforms.uBackdropColor.value.set(color.r, color.g, color.b)
		this.uniforms.uShadowPlane.value.set(...normal, -distance)
		this.uniforms.uShadowStrength.value = strength
	}

	dispose() {
		this.mesh.removeFromParent()
		this.mesh.geometry.dispose()
		this.mesh.material.dispose()
	}
}
