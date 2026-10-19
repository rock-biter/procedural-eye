// The eyeball mesh in eye space: a surface of revolution of the profile in
// src/eye/eyeProfile.js. Group 0 is the cornea and limbus cap (the optics
// program), group 1 the sclera beyond it (the light program). The shaders
// recompute exact positions and normals from the analytic profile, so the
// tessellation only has to cover the surface tightly: its chords stray inside
// it by at most a tolerance (src/meshLayout.js), tight where the globe can
// show, loose where the lids always cover it. The depth test reads the mesh,
// so where the globe meets the conjunctiva (which dips 0.06 mm under it) the
// chords stay well inside that.
import { BufferAttribute, BufferGeometry } from 'three'
import { DEG, smoothstep } from '../math'
import { bendAt, chordStep, evenlyUnder, runningIntegral, zipRings } from '../meshLayout'

// The tolerances (mm) of the chords. On the cap, the cornea and the limbus,
// `cap`; on the sclera where it can show, `shown`; a triangle's middle and its
// diagonals stray about twice as far, under a pixel zoomed in, and only at
// the silhouette (the rest is refined). Where the lids always cover it, `hidden`:
// the upper and lower parts past `elevation` (degrees above or below the
// horizontal plane through the axis: the fissure's half height and the gaze's
// travel, the tolerance blended across the range), and everything past
// `behind` (degrees from the axis). Each ring has at least `minColumns`
// columns, and the pole is one vertex: small triangles cost the optics
// program dearly, the GPU shading the 2×2 quads straddling their edges.
export const EYEBALL_LAYOUT = Object.freeze({
	cap: 0.004,
	shown: 0.007,
	hidden: 0.04,
	elevation: [45, 60],
	behind: [100, 115],
	minColumns: 8,
})

// Past the equator: with ±35° of gaze the lids still hide everything behind.
const MAX_POLAR_ANGLE = 125 * DEG
// Samples of the meridian (on the cap, on the sclera) and around a ring.
const MERIDIAN_SAMPLES = [400, 400]
const AROUND_SAMPLES = 720
const TAU = Math.PI * 2

// The tolerance at polar angle `psi` from the axis and angle `phi` around it,
// on the cap or the sclera.
function tolerance(psi, phi, onCap) {
	const { cap, shown, hidden, elevation, behind } = EYEBALL_LAYOUT
	if (onCap) return cap
	const height = Math.asin(Math.min(1, Math.sin(psi) * Math.abs(Math.sin(phi)))) / DEG
	const covered = Math.max(
		smoothstep(elevation[0], elevation[1], height),
		smoothstep(behind[0], behind[1], psi / DEG),
	)
	return shown + (hidden - shown) * covered
}

// The meridian from the pole to MAX_POLAR_ANGLE: the cap (r, surfaceZ(r)) to
// `capEnd`, then the sclera. Returns points [r, z] with their arc length and
// the index of the cap's end.
function meridian(eye, capEnd, capAngle) {
	const points = []
	for (let i = 0; i <= MERIDIAN_SAMPLES[0]; i++) {
		const r = (capEnd * i) / MERIDIAN_SAMPLES[0]
		points.push([r, eye.surfaceZ(r)])
	}
	const capIndex = points.length - 1
	for (let i = 1; i <= MERIDIAN_SAMPLES[1]; i++) {
		const psi = capAngle + ((MAX_POLAR_ANGLE - capAngle) * i) / MERIDIAN_SAMPLES[1]
		points.push([eye.scleraRadius * Math.sin(psi), eye.scleraRadius * Math.cos(psi)])
	}
	const lengths = [0]
	for (let i = 1; i < points.length; i++) {
		const [r0, z0] = points[i - 1]
		const [r1, z1] = points[i]
		lengths.push(lengths[i - 1] + Math.hypot(r1 - r0, z1 - z0))
	}
	return { points, lengths, capIndex }
}

export function createEyeballGeometry(eye) {
	const capEnd = eye.blendEnd + 0.25
	const capAngle = Math.asin(capEnd / eye.scleraRadius)
	const { points, lengths, capIndex } = meridian(eye, capEnd, capAngle)
	const polar = ([r, z]) => Math.atan2(r, z)
	// The rings: along the meridian by its bend, at the tightest tolerance any
	// of the ring's columns asks for (the sides show at any polar angle short
	// of `behind`), the cap's end a ring of its own.
	const density = points.map((point, i) => {
		const previous = points[Math.max(i - 1, 0)]
		const next = points[Math.min(i + 1, points.length - 1)]
		const bend =
			i === 0 || i === points.length - 1 ? 0 : bendAt([...previous, 0], [...point, 0], [...next, 0])
		return 1 / chordStep(bend, tolerance(polar(point), 0, i < capIndex))
	})
	const ringsOf = (from, to) => {
		const xs = lengths.slice(from, to + 1)
		const cumulative = runningIntegral(xs, density.slice(from, to + 1))
		return evenlyUnder(xs, cumulative, Math.max(2, Math.ceil(cumulative.at(-1))))
	}
	const ringLengths = [...ringsOf(0, capIndex), ...ringsOf(capIndex, points.length - 1).slice(1)]
	const capRing = ringLengths.indexOf(lengths[capIndex])
	// A ring's radius and height at an arc length along the meridian.
	const along = (length) => {
		let k = 1
		while (k < lengths.length - 1 && lengths[k] < length) k++
		const f = (length - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1)
		const [r0, z0] = points[k - 1]
		const [r1, z1] = points[k]
		return { r: r0 + (r1 - r0) * f, z: z0 + (z1 - z0) * f, tangent: [r1 - r0, z1 - z0] }
	}

	const positions = [0, 0, eye.surfaceZ(0)]
	const rings = [{ indices: [0], angles: [0] }]
	for (let k = 1; k < ringLengths.length; k++) {
		const { r, z, tangent } = along(ringLengths[k])
		const onCap = k <= capRing
		// The bend along the ring: the share of the normal toward the axis over
		// the radius (1 / R on the sphere).
		const outward = Math.abs(tangent[1]) / Math.hypot(tangent[0], tangent[1])
		const bend = outward / r
		const psi = Math.atan2(r, z)
		const angles = []
		const columnDensity = []
		for (let n = 0; n <= AROUND_SAMPLES; n++) {
			const phi = (n / AROUND_SAMPLES) * TAU
			angles.push(phi)
			columnDensity.push(r / chordStep(bend, tolerance(psi, phi, onCap)))
		}
		const cumulative = runningIntegral(angles, columnDensity)
		const count = Math.max(EYEBALL_LAYOUT.minColumns, Math.ceil(cumulative.at(-1)))
		const ring = { indices: [], angles: evenlyUnder(angles, cumulative, count).slice(0, count) }
		for (const phi of ring.angles) {
			ring.indices.push(positions.length / 3)
			positions.push(r * Math.cos(phi), r * Math.sin(phi), z)
		}
		rings.push(ring)
	}

	// The pole's fan, then each ring onto the next, outward faces
	// counter-clockwise; the cap's triangles first.
	const index = []
	const emit = (a, b, c) => index.push(a, b, c)
	let capCount = 0
	for (let k = 1; k < rings.length; k++) {
		const inner = rings[k - 1]
		const outer = rings[k]
		if (k === 1) {
			for (let j = 0; j < outer.indices.length; j++) {
				emit(0, outer.indices[j], outer.indices[(j + 1) % outer.indices.length])
			}
		} else zipRings(outer.indices, outer.angles, inner.indices, inner.angles, emit)
		if (k === capRing) capCount = index.length
	}

	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
	geometry.setIndex(new BufferAttribute(new Uint32Array(index), 1))
	geometry.addGroup(0, capCount, 0)
	geometry.addGroup(capCount, index.length - capCount, 1)
	geometry.computeBoundingSphere()
	return geometry
}
