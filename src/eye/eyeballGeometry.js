// The eyeball mesh in eye space: a surface of revolution of the profile in
// src/eye/eyeProfile.js. Group 0 is the cornea and limbus cap (the optics
// program), group 1 the sclera beyond it (the light program). The shaders
// recompute exact positions and normals from the analytic profile, so the
// tessellation only has to cover the surface tightly.
import { BufferAttribute, BufferGeometry } from 'three'
import { DEG } from '../math'

export const EYEBALL_SEGMENTS = Object.freeze({ angular: 256, cap: 120, sclera: 72 })

// Past the equator: with ±35° of gaze the lids still hide everything behind.
const MAX_POLAR_ANGLE = 125 * DEG

export function createEyeballGeometry(eye, segments = EYEBALL_SEGMENTS) {
	const { angular, cap, sclera } = segments
	const capEnd = eye.blendEnd + 0.25
	const capAngle = Math.asin(capEnd / eye.scleraRadius)
	const rings = cap + 1 + sclera
	const positions = new Float32Array(rings * angular * 3)
	let offset = 0
	const ring = (radius, z) => {
		for (let j = 0; j < angular; j++) {
			const phi = (j / angular) * Math.PI * 2
			positions[offset++] = radius * Math.cos(phi)
			positions[offset++] = radius * Math.sin(phi)
			positions[offset++] = z
		}
	}
	for (let i = 0; i <= cap; i++) {
		const r = (capEnd * i) / cap
		ring(r, eye.surfaceZ(r))
	}
	for (let i = 1; i <= sclera; i++) {
		const psi = capAngle + ((MAX_POLAR_ANGLE - capAngle) * i) / sclera
		ring(eye.scleraRadius * Math.sin(psi), eye.scleraRadius * Math.cos(psi))
	}

	const quads = (rings - 1) * angular
	const index = new Uint32Array(quads * 6)
	let k = 0
	for (let i = 0; i < rings - 1; i++) {
		for (let j = 0; j < angular; j++) {
			const a = i * angular + j
			const b = (i + 1) * angular + j
			const c = (i + 1) * angular + ((j + 1) % angular)
			const d = i * angular + ((j + 1) % angular)
			index.set([a, b, c, a, c, d], k)
			k += 6
		}
	}

	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(positions, 3))
	geometry.setIndex(new BufferAttribute(index, 1))
	const capCount = cap * angular * 6
	geometry.addGroup(0, capCount, 0)
	geometry.addGroup(capCount, index.length - capCount, 1)
	geometry.computeBoundingSphere()
	return geometry
}
