// Ray optics of the anterior eye, the CPU twin of src/shaders/cornea-optics.glsl
// (same formulas, same conventions as GLSL's refract() and reflect()). Vectors
// are [x, y, z] arrays in eye space (src/eye/eyeProfile.js).
import { vec3 } from '../math'

// GLSL refract(): `d` unit incident direction, `n` unit normal facing against
// it, `eta` = n1 / n2. Null on total internal reflection.
export function refract(d, n, eta) {
	const cosi = -vec3.dot(n, d)
	const k = 1 - eta * eta * (1 - cosi * cosi)
	if (k < 0) return null
	return vec3.add(vec3.scale(d, eta), vec3.scale(n, eta * cosi - Math.sqrt(k)))
}

export function reflect(d, n) {
	return vec3.sub(d, vec3.scale(n, 2 * vec3.dot(d, n)))
}

// Unpolarized Fresnel reflectance of a dielectric interface; `eta` = n2 / n1
// (transmitted side over incident side). 1 under total internal reflection.
export function fresnelDielectric(cosi, eta) {
	const c = Math.abs(cosi)
	const g2 = eta * eta - 1 + c * c
	if (g2 < 0) return 1
	const g = Math.sqrt(g2)
	const a = (g - c) / (g + c)
	const b = (c * (g + c) - 1) / (c * (g - c) + 1)
	return 0.5 * a * a * (1 + b * b)
}

// Both roots of a·t² + b·t + c = 0 in ascending order, or null.
function solveQuadratic(a, b, c) {
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) < 1e-12) return null
		const t = -c / b
		return [t, t]
	}
	const disc = b * b - 4 * a * c
	if (disc < 0) return null
	const sq = Math.sqrt(disc)
	// Numerically stable form.
	const q = -0.5 * (b + Math.sign(b || 1) * sq)
	const t0 = q / a
	const t1 = Math.abs(q) > 1e-12 ? c / q : t0
	return t0 < t1 ? [t0, t1] : [t1, t0]
}

// Distances along the ray to a sphere, [near, far], or null.
export function intersectSphere(o, d, center, radius) {
	const oc = vec3.sub(o, center)
	const b = vec3.dot(oc, d)
	const c = vec3.dot(oc, oc) - radius * radius
	const disc = b * b - c
	if (disc < 0) return null
	const sq = Math.sqrt(disc)
	return [-b - sq, -b + sq]
}

// Nearest positive distance to the front sheet of the conic of revolution
// x² + y² + (1+Q)w² - 2Rw = 0, w = apexZ - z (the face around the apex), or null.
export function intersectConic(o, d, apexZ, R, Q) {
	const k = 1 + Q
	const w0 = apexZ - o[2]
	const a = d[0] * d[0] + d[1] * d[1] + k * d[2] * d[2]
	const b = 2 * (o[0] * d[0] + o[1] * d[1] - k * w0 * d[2] + R * d[2])
	const c = o[0] * o[0] + o[1] * o[1] + k * w0 * w0 - 2 * R * w0
	const roots = solveQuadratic(a, b, c)
	if (!roots) return null
	for (const t of roots) {
		if (t <= 1e-9) continue
		const w = w0 - t * d[2]
		// The sheet through the apex: w >= 0, and in front of an ellipsoid's center.
		if (w >= -1e-9 && (k <= 0 || w <= R / k)) return t
	}
	return null
}

// Outward unit normal of the conic at a point on it.
export function conicNormal(p, apexZ, R, Q) {
	const w = apexZ - p[2]
	return vec3.normalize([p[0], p[1], R - (1 + Q) * w])
}

// Nearest positive distance to the paraboloid z = z0 - c·r², or null.
export function intersectParaboloid(o, d, z0, c) {
	const a = c * (d[0] * d[0] + d[1] * d[1])
	const b = 2 * c * (o[0] * d[0] + o[1] * d[1]) + d[2]
	const cc = c * (o[0] * o[0] + o[1] * o[1]) + o[2] - z0
	const roots = solveQuadratic(a, b, cc)
	if (!roots) return null
	for (const t of roots) if (t > 1e-9) return t
	return null
}

// Refraction of an outside ray `d` at the anterior surface point `p` (on the
// conic) into the aqueous: tear-film reflectance, the ray inside the stroma,
// the posterior-surface point, and the ray in the aqueous. Null when the ray
// misses the posterior surface or is totally reflected.
export function traceCornea(geometry, p, d) {
	const n1 = conicNormal(p, geometry.apexZ, geometry.corneaRadius, geometry.corneaQ)
	const reflectance = fresnelDielectric(-vec3.dot(d, n1), geometry.tearIor)
	const d1 = refract(d, n1, 1 / geometry.corneaIor)
	if (!d1) return null
	const center = [0, 0, geometry.posteriorCenterZ]
	const hits = intersectSphere(p, d1, center, geometry.posteriorRadius)
	if (!hits || hits[0] <= 0) return null
	const p2 = vec3.madd(p, d1, hits[0])
	const n2 = vec3.scale(vec3.sub(p2, center), 1 / geometry.posteriorRadius)
	const d2 = refract(d1, n2, geometry.corneaIor / geometry.aqueousIor)
	if (!d2) return null
	return { reflectance, d1, p2, d2 }
}

// Paraxial entrance pupil: the virtual image, formed by both corneal
// surfaces, of an axial point in the pupil plane (the anterior lens apex).
// Returns its depth behind the corneal apex and the lateral magnification.
export function entrancePupil(geometry, height = 0.01, slope = 0.01) {
	const origin = [height, 0, geometry.lensApexZ]
	const center = [0, 0, geometry.posteriorCenterZ]
	const outgoing = [-slope, slope].map((s) => {
		let d = vec3.normalize([s, 0, 1])
		const exits = intersectSphere(origin, d, center, geometry.posteriorRadius)
		const p2 = vec3.madd(origin, d, exits[1])
		const inward = vec3.scale(vec3.sub(center, p2), 1 / geometry.posteriorRadius)
		d = refract(d, inward, geometry.aqueousIor / geometry.corneaIor)
		const t = intersectConic(p2, d, geometry.apexZ, geometry.corneaRadius, geometry.corneaQ)
		const p1 = vec3.madd(p2, d, t)
		const outward = conicNormal(p1, geometry.apexZ, geometry.corneaRadius, geometry.corneaQ)
		d = refract(d, vec3.scale(outward, -1), geometry.corneaIor)
		return { p: p1, d }
	})
	// Intersection of the two outgoing lines in the x-z plane, extended backwards.
	const [a, b] = outgoing
	const det = a.d[0] * -b.d[2] - a.d[2] * -b.d[0]
	const dx = b.p[0] - a.p[0]
	const dz = b.p[2] - a.p[2]
	const s = (dx * -b.d[2] - dz * -b.d[0]) / det
	const image = vec3.madd(a.p, a.d, s)
	return { depth: geometry.apexZ - image[2], magnification: image[0] / height }
}
