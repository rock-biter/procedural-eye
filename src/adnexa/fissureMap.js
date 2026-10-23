// Signed distance to the palpebral fissure in the front plane (pure): > 0
// inside the opening, < 0 under the lids (mm). Baked into a texture over
// FISSURE_MAP.extent for the eye occlusion near the margins, the wet look and
// the tear meniscus.
import { createFissure } from './fissure'

export const FISSURE_MAP = Object.freeze({
	size: 256,
	halfWidth: 20,
	halfHeight: 16,
	segments: 160,
})

export function fissurePolygon(lids, nasalSign, segments = FISSURE_MAP.segments) {
	const fissure = createFissure(lids, nasalSign)
	return Array.from({ length: segments }, (_, i) => fissure.loop(i / segments))
}

export function signedFissureDistance(polygon, x, y) {
	let inside = false
	let best = Infinity
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i]
		const [xj, yj] = polygon[j]
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
		const ex = xj - xi
		const ey = yj - yi
		const t = Math.min(Math.max(((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey), 0), 1)
		best = Math.min(best, Math.hypot(x - xi - ex * t, y - yi - ey * t))
	}
	return inside ? best : -best
}

// Float data, row-major from the bottom-left (texture layout): the values of
// signedFissureDistance() at the texel centers, to the bit, faster. The
// segments' differences and squared lengths are computed once, and a texel
// takes Math.hypot() only for the segments whose squared distance comes
// within a hair (NEAR, far above its rounding) of the nearest one so far:
// only those can give the smallest hypot().
const NEAR = 1 + 1e-9
export function bakeFissureMap(lids, nasalSign, map = FISSURE_MAP) {
	const polygon = fissurePolygon(lids, nasalSign, map.segments)
	const count = polygon.length
	const xs = new Float64Array(count)
	const ys = new Float64Array(count)
	const exs = new Float64Array(count)
	const eys = new Float64Array(count)
	const lengths = new Float64Array(count)
	for (let i = 0, j = count - 1; i < count; j = i++) {
		const [xi, yi] = polygon[i]
		const [xj, yj] = polygon[j]
		xs[i] = xi
		ys[i] = yi
		exs[i] = xj - xi
		eys[i] = yj - yi
		lengths[i] = exs[i] * exs[i] + eys[i] * eys[i]
	}
	const data = new Float32Array(map.size * map.size)
	for (let row = 0; row < map.size; row++) {
		const y = ((row + 0.5) / map.size - 0.5) * 2 * map.halfHeight
		for (let column = 0; column < map.size; column++) {
			const x = ((column + 0.5) / map.size - 0.5) * 2 * map.halfWidth
			let inside = false
			let best = Infinity
			let nearest = Infinity
			for (let i = 0, j = count - 1; i < count; j = i++) {
				const xi = xs[i]
				const yi = ys[i]
				const ex = exs[i]
				const ey = eys[i]
				if (yi > y !== ys[j] > y && x < (ex * (y - yi)) / ey + xi) inside = !inside
				const t = Math.min(Math.max(((x - xi) * ex + (y - yi) * ey) / lengths[i], 0), 1)
				const dx = x - xi - ex * t
				const dy = y - yi - ey * t
				const squared = dx * dx + dy * dy
				if (squared > nearest * NEAR) continue
				nearest = Math.min(nearest, squared)
				best = Math.min(best, Math.hypot(dx, dy))
			}
			data[row * map.size + column] = inside ? best : -best
		}
	}
	return data
}
