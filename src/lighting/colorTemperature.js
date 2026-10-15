// Linear sRGB color of a Planckian (black-body) source, normalized to unit
// luminance. Planckian locus fit of Kim et al. (2002), 1667–25000 K.

export function kelvinToXy(kelvin) {
	const T = Math.min(Math.max(kelvin, 1667), 25000)
	const x =
		T <= 4000
			? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
			: -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039
	let y
	if (T <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
	else if (T <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
	else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483
	return [x, y]
}

export function xyToLinearSrgb(x, y) {
	const X = x / y
	const Z = (1 - x - y) / y
	const r = 3.2404542 * X - 1.5371385 - 0.4985314 * Z
	const g = -0.969266 * X + 1.8760108 + 0.041556 * Z
	const b = 0.0556434 * X - 0.2040259 + 1.0572252 * Z
	return [Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)]
}

export function luminance(rgb) {
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

export function kelvinToLinearRgb(kelvin) {
	const [x, y] = kelvinToXy(kelvin)
	const rgb = xyToLinearSrgb(x, y)
	const l = luminance(rgb)
	return rgb.map((c) => c / l)
}

// '#rrggbb' (sRGB) to linear sRGB components.
export function hexToLinearRgb(hex) {
	const value = parseInt(hex.slice(1), 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
		const s = c / 255
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	})
}

// Linear sRGB components (clamped to [0, 1]) to '#rrggbb' (sRGB).
export function linearRgbToHex(rgb) {
	const bytes = rgb.map((c) => {
		const l = Math.min(Math.max(c, 0), 1)
		const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
		return Math.round(s * 255)
	})
	return `#${((1 << 24) | (bytes[0] << 16) | (bytes[1] << 8) | bytes[2]).toString(16).slice(1)}`
}
