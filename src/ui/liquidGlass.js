// Liquid-glass refraction for the HUD's buttons. Each button is a convex slab
// of glass whose rim is a rounded bevel: an SVG filter, used as the button's
// `backdrop-filter` (style.css), blurs the scene behind it lightly and bends
// it near the rim as the bevel would. Only Chromium applies SVG filters in
// backdrop-filter, and it drops the CSS functions that follow one, so the
// blur lives in the filter; elsewhere the buttons keep the CSS glass.

const SVG_NS = 'http://www.w3.org/2000/svg'

// The glass: refractive index, bevel width (px), offset at the rim (px), and
// the blur of the scene (standard deviation, px; the CSS glass's blur(2px)).
export const GLASS = { ior: 1.5, bezel: 14, maxOffset: 10, blur: 2 }

// The bevel's height across its width, t from 0 at the rim to 1 inside: a
// convex squircle, vertical at the rim and flat where the bevel ends.
const bevelSlope = (t) => (1 - t) ** 3 * (1 - (1 - t) ** 4) ** -0.75

// The lateral shift of a vertical view ray refracted by the bevel at t,
// relative to the shift at the rim (1 at the rim, 0 inside).
function refraction(t, ior) {
	const shift = (incidence) => Math.tan(incidence - Math.asin(Math.sin(incidence) / ior))
	if (t <= 0) return 1
	if (t >= 1) return 0
	return shift(Math.atan(bevelSlope(t))) / shift(Math.PI / 2)
}

// The displacement map of a pill (a circle when width equals height), at
// `density` texels per pixel, as RGBA bytes. R and G hold the x and y offset
// toward the pill's axis, so the rim shows the scene from farther inside:
// 128 is none, 0 and 255 are ∓maxOffset (the filter's scale is 2·maxOffset).
export function glassDisplacement(width, height, { ior, bezel }, density = 1) {
	const columns = Math.max(1, Math.round(width * density))
	const rows = Math.max(1, Math.round(height * density))
	const data = new Uint8ClampedArray(columns * rows * 4)
	const radius = height / 2
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const x = (column + 0.5) / density
			const y = (row + 0.5) / density
			// The nearest point of the pill's axis, a segment between the caps.
			const dx = Math.min(Math.max(x, radius), Math.max(width - radius, radius)) - x
			const dy = radius - y
			const distance = Math.hypot(dx, dy)
			const strength = distance > 0 ? refraction((radius - distance) / bezel, ior) : 0
			const inside = distance <= radius
			const i = (row * columns + column) * 4
			data[i] = inside ? 128 + Math.round((127 * strength * dx) / distance) : 128
			data[i + 1] = inside ? 128 + Math.round((127 * strength * dy) / distance) : 128
			data[i + 2] = 128
			data[i + 3] = 255
		}
	}
	return { data, columns, rows }
}

export function supportsRefraction() {
	return Boolean(navigator.userAgentData?.brands?.some(({ brand }) => brand === 'Chromium'))
}

function svgElement(name, attributes) {
	const element = document.createElementNS(SVG_NS, name)
	for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
	return element
}

// The filters made so far, so every call gives its elements new ids.
let filters = 0

// Gives each element a glass filter of its own size, rebuilt when it resizes,
// through the --glass-refraction custom property.
export function liquidGlass(elements, glass = GLASS) {
	if (!supportsRefraction()) return
	const svg = svgElement('svg', { 'aria-hidden': 'true', width: 0, height: 0 })
	svg.style.position = 'absolute'
	document.body.appendChild(svg)
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	const density = Math.min(window.devicePixelRatio || 1, 2)

	const update = (element, id) => {
		const { offsetWidth: width, offsetHeight: height } = element
		if (!width || !height) return
		const { data, columns, rows } = glassDisplacement(width, height, glass, density)
		canvas.width = columns
		canvas.height = rows
		context.putImageData(new ImageData(data, columns, rows), 0, 0)
		const size = { x: 0, y: 0, width, height }
		const filter = svgElement('filter', {
			id,
			...size,
			filterUnits: 'userSpaceOnUse',
			'color-interpolation-filters': 'sRGB',
		})
		filter.append(
			svgElement('feImage', {
				href: canvas.toDataURL(),
				...size,
				preserveAspectRatio: 'none',
				result: 'map',
			}),
			// The backdrop ends at the button's edge: duplicate it outward.
			svgElement('feGaussianBlur', {
				in: 'SourceGraphic',
				stdDeviation: glass.blur,
				edgeMode: 'duplicate',
				result: 'blurred',
			}),
			svgElement('feDisplacementMap', {
				in: 'blurred',
				in2: 'map',
				scale: 2 * glass.maxOffset,
				xChannelSelector: 'R',
				yChannelSelector: 'G',
			}),
		)
		svg.querySelector(`#${id}`)?.remove()
		svg.appendChild(filter)
		element.style.setProperty('--glass-refraction', `url(#${id})`)
	}

	const ids = new Map([...elements].map((element) => [element, `glass-${filters++}`]))
	const observer = new ResizeObserver((entries) => {
		for (const { target } of entries) update(target, ids.get(target))
	})
	for (const element of ids.keys()) observer.observe(element)
}
