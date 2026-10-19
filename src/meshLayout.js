// Mesh layout helpers (pure): vertices spaced by the bend of the surface, so
// a chord between two of them strays from it by at most a tolerance, and
// rings of different counts stitched together. A chord of length h across a
// bend of curvature k strays from the surface by its sagitta, k h² / 8. Used
// by the lids (src/adnexa/lidGeometry.js), the back shell
// (src/adnexa/backShell.js) and the eyeball (src/eye/eyeballGeometry.js).

const TAU = Math.PI * 2

// The longest chord (mm) across a bend of curvature `k` (per mm) whose
// sagitta stays under `tolerance` (mm).
export function chordStep(k, tolerance) {
	return Math.sqrt((8 * tolerance) / Math.max(k, 1e-9))
}

// The curvature (per mm) of the polyline a, b, c at b: its turning over the
// mean of its two segments. 0 where they are too short to tell.
export function bendAt(a, b, c) {
	const d0 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
	const d1 = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2])
	if (d0 < 1e-6 || d1 < 1e-6) return 0
	let turn = 0
	for (let i = 0; i < 3; i++) turn += ((c[i] - b[i]) / d1 - (b[i] - a[i]) / d0) ** 2
	return (2 * Math.sqrt(turn)) / (d0 + d1)
}

// The running integral of `density` sampled at `xs` (trapezoids).
export function runningIntegral(xs, density) {
	const cumulative = [0]
	for (let i = 1; i < xs.length; i++) {
		cumulative.push(cumulative[i - 1] + ((density[i - 1] + density[i]) / 2) * (xs[i] - xs[i - 1]))
	}
	return cumulative
}

// `count` + 1 points from the first of `xs` to the last, the integral of a
// density (`cumulative`, its running integral at `xs`) even between them:
// they lie closest where it is highest.
export function evenlyUnder(xs, cumulative, count) {
	const total = cumulative.at(-1)
	const points = [xs[0]]
	let k = 1
	for (let n = 1; n < count; n++) {
		const target = (n / count) * total
		while (k < xs.length - 1 && cumulative[k] < target) k++
		const span = cumulative[k] - cumulative[k - 1]
		const f = span > 0 ? (target - cumulative[k - 1]) / span : 0
		points.push(xs[k - 1] + (xs[k] - xs[k - 1]) * f)
	}
	points.push(xs.at(-1))
	return points
}

// `density` sampled at `xs`, each sample the highest within `reach` of it.
export function widen(xs, density, reach) {
	return xs.map((x, i) => {
		let highest = density[i]
		for (let k = i - 1; k >= 0 && x - xs[k] <= reach; k--) highest = Math.max(highest, density[k])
		for (let k = i + 1; k < xs.length && xs[k] - x <= reach; k++) {
			highest = Math.max(highest, density[k])
		}
		return highest
	})
}

// Triangles between an outer ring and an inner one, both counter-clockwise
// (seen from the front), their vertices at the given angles (radians): each
// triangle counter-clockwise, passed to `emit(a, b, c)`.
export function zipRings(outer, outerAngles, inner, innerAngles, emit) {
	const start = outerAngles[0]
	const relative = (angle) => (((angle - start) % TAU) + TAU) % TAU
	const a = [...outerAngles.map(relative), TAU]
	const outerSequence = [...outer, outer[0]]
	// The inner ring from its column at or just before the outer ring's first.
	const order = inner
		.map((_, j) => j)
		.sort((i, j) => relative(innerAngles[i]) - relative(innerAngles[j]))
	const lastInner = order[order.length - 1]
	const b = [relative(innerAngles[lastInner]) - TAU, ...order.map((j) => relative(innerAngles[j]))]
	const innerSequence = [inner[lastInner], ...order.map((j) => inner[j])]
	const n = outer.length
	const m = inner.length
	let i = 0
	let j = 0
	while (i < n || j < m) {
		if (j >= m || (i < n && a[i + 1] < b[j + 1])) {
			emit(outerSequence[i], outerSequence[i + 1], innerSequence[j])
			i++
		} else {
			emit(outerSequence[i], innerSequence[j + 1], innerSequence[j])
			j++
		}
	}
}
