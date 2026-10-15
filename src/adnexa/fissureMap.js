// Signed distance to the palpebral fissure in the front plane (pure): > 0
// inside the opening, < 0 under the lids (mm). Baked into a texture over
// FISSURE_MAP.extent for the eye occlusion near the margins, the wet look and
// the tear meniscus.
import { createFissure } from './lidGeometry'

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

// Float data, row-major from the bottom-left (texture layout).
export function bakeFissureMap(lids, nasalSign, map = FISSURE_MAP) {
	const polygon = fissurePolygon(lids, nasalSign, map.segments)
	const data = new Float32Array(map.size * map.size)
	for (let j = 0; j < map.size; j++) {
		const y = ((j + 0.5) / map.size - 0.5) * 2 * map.halfHeight
		for (let i = 0; i < map.size; i++) {
			const x = ((i + 0.5) / map.size - 0.5) * 2 * map.halfWidth
			data[j * map.size + i] = signedFissureDistance(polygon, x, y)
		}
	}
	return data
}
