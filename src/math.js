// Three-free scalar and vector helpers for the pure modules, with the formulas
// of three's MathUtils and of GLSL, so CPU twins match the shaders.

export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max)
}

export function clamp01(value) {
	return Math.min(Math.max(value, 0), 1)
}

export function lerp(x, y, t) {
	return (1 - t) * x + t * y
}

// Hermite step of `x` from `edge0` to `edge1`, like GLSL smoothstep().
export function smoothstep(edge0, edge1, x) {
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

// C2 step (Perlin's smootherstep) and its derivative with respect to x.
export function smootherstep(edge0, edge1, x) {
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * t * (t * (6 * t - 15) + 10)
}

export function smootherstepDerivative(edge0, edge1, x) {
	const t = (x - edge0) / (edge1 - edge0)
	if (t <= 0 || t >= 1) return 0
	return (30 * t * t * (t - 1) * (t - 1)) / (edge1 - edge0)
}

export const DEG = Math.PI / 180

// Minimal 3-vectors as [x, y, z] arrays.
export const vec3 = {
	add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
	sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
	scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
	dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
	cross: (a, b) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	],
	length: (a) => Math.hypot(a[0], a[1], a[2]),
	normalize: (a) => {
		const l = Math.hypot(a[0], a[1], a[2])
		return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
	},
	madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
}
