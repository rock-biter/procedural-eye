// Low-discrepancy samples for progressive accumulation: pixel jitter uses the
// Halton bases 2 and 3, the lens 5 and 7, the area lights 11 and 13, so the
// dimensions stay decorrelated.

export function halton(index, base) {
	let result = 0
	let fraction = 1 / base
	let i = index
	while (i > 0) {
		result += fraction * (i % base)
		i = Math.floor(i / base)
		fraction /= base
	}
	return result
}

// Shirley–Chiu concentric map of [0, 1)² onto the unit disk.
export function concentricDisk(u, v) {
	const a = 2 * u - 1
	const b = 2 * v - 1
	if (a === 0 && b === 0) return [0, 0]
	let r
	let phi
	if (Math.abs(a) > Math.abs(b)) {
		r = a
		phi = (Math.PI / 4) * (b / a)
	} else {
		r = b
		phi = Math.PI / 2 - (Math.PI / 4) * (a / b)
	}
	return [r * Math.cos(phi), r * Math.sin(phi)]
}

// The sample of accumulation frame `index` (1-based): pixel jitter in
// [-0.5, 0.5]², a point on the unit lens disk, and two area-light numbers.
export function accumulationSample(index) {
	const i = index + 1
	const [lensX, lensY] = concentricDisk(halton(i, 5), halton(i, 7))
	return {
		jitterX: halton(i, 2) - 0.5,
		jitterY: halton(i, 3) - 0.5,
		lensX,
		lensY,
		light: [halton(i, 11), halton(i, 13)],
	}
}
