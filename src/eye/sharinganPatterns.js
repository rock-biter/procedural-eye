// The Sharingan easter egg's patterns (pure; src/eye/sharingan.js,
// docs/IRIS.md#sharingan): the Uchiha eyes of Naruto drawn as pigment on the
// iris, as compass constructions baked into the fields the shader reads
// (sharingan-paint.glsl, sharingan.glsl).
//
// A pattern lies in a disc of radius 1, its pupil SHARINGAN_PUPIL wide: the
// iris between the pupil's margin and SHARINGAN_EDGE of the way to the root
// (rest ρ 0 to SHARINGAN_EDGE, the edge the limbus leaves in view) maps onto
// the ring between the two linearly, so the drawing follows the tissue as
// the pupil moves and always hugs it; past the disc the pattern's base color
// goes on under the limbus. +x is the right of the picture, +y up, angles
// counterclockwise from +x.
//
// A pattern is its base color and shapes painted over it in order. A shape
// is the intersection of up to four terms (the maximum of their signed
// distances): a disc, its outside, a half-plane, or an Archimedean spiral
// (an unsigned distance); a term with a width is a stroke of that half-width
// along its edge, and a shape with one is its outline. It repeats `count`
// times around the center (the union of its turned copies) and is turned
// `turn` degrees. Its color is a palette index.
//
// What the iris reads of a pattern is its field (patternField()): the
// signed distance to its ink, and the color under the ink. Two patterns
// morph through their fields (morphField()): the new ink grows in while the
// old one is still there, the two melted together by a smooth minimum, then
// the old one thins away.
import { DEG, clamp01, smoothstep } from '../math'

// The pupil's radius in the pattern's disc: the Sharingan's pupil is small.
export const SHARINGAN_PUPIL = 0.17
// The rest ρ at the disc's edge.
export const SHARINGAN_EDGE = 0.88
// The map a pattern's field is baked into (src/eye/sharingan.js): `size`
// texels across, from −`extent` to `extent`, a little past the disc.
export const SHARINGAN_MAP = Object.freeze({ size: 1024, extent: 1.04 })
// The ink's distance in the field saturates softly at `reach` (C·tanh(d/C)),
// so a morph thins even a broad ink away steadily; a morph erodes the old
// ink and grows the new one by `erode` times it, so both are whole at its
// ends: the new one grows over the first `grow` of the morph, the old one
// thins over the part after `thin`.
export const FIELD = Object.freeze({ reach: 0.2, erode: 1.25, grow: 0.65, thin: 0.35 })
// Those constants for the shaders.
const glslFloat = (value) => (Number.isInteger(value) ? `${value}.0` : `${value}`)
export const SHARINGAN_DEFINES = Object.freeze({
	SHARINGAN_PUPIL: glslFloat(SHARINGAN_PUPIL),
	SHARINGAN_EDGE: glslFloat(SHARINGAN_EDGE),
	SHARINGAN_EXTENT: glslFloat(SHARINGAN_MAP.extent),
	SHARINGAN_MAP_SIZE: SHARINGAN_MAP.size,
	SHARINGAN_FIELD: glslFloat(FIELD.reach),
	SHARINGAN_ERODE: glslFloat(FIELD.erode * FIELD.reach),
	SHARINGAN_GROW: glslFloat(FIELD.grow),
	SHARINGAN_THIN: glslFloat(FIELD.thin),
})
// Shapes per pattern, and copies of a shape around the center, at most.
export const SHARINGAN_SHAPES = 24
export const SHARINGAN_COPIES = 6

// The palette (sharingan.* colors in the params).
export const PALETTE = Object.freeze({ ink: 0, red: 1, lavender: 2, violet: 3 })

const DISC = 1
const OUTSIDE = 2
const PLANE = 3
const SPIRAL = 4

const { ink, red, lavender, violet } = PALETTE

// A point `r` from the center at `angle` degrees.
const at = (r, angle) => [r * Math.cos(angle * DEG), r * Math.sin(angle * DEG)]

// Terms: a disc (or its outside, `out`), a half-plane holding the points
// whose projection on the direction at `angle` degrees is below `offset`,
// a spiral of radius `start` at angle 0 growing `pitch` per turn.
const disc = ([x, y], r, width = 0) => ({ kind: DISC, a: x, b: y, c: r, width })
const outside = ([x, y], r, width = 0) => ({ kind: OUTSIDE, a: x, b: y, c: r, width })
const plane = (angle, offset, width = 0) => ({
	kind: PLANE,
	a: Math.cos(angle * DEG),
	b: Math.sin(angle * DEG),
	c: offset,
	width,
})
const spiral = (start, pitch, width) => ({
	kind: SPIRAL,
	a: start,
	b: pitch / (2 * Math.PI),
	c: 0,
	width,
})
const shape = (color, terms, { count = 1, turn = 0, width = 0 } = {}) => ({
	color,
	terms,
	count,
	turn,
	width,
})

// The black rim at the disc's edge, on under the limbus.
const rim = (width = 0.03) => shape(ink, [outside([0, 0], 1 - 2 * width)])
// A ring of half-width `width` at radius `r`.
const ring = (r, width, color = ink) => shape(color, [disc([0, 0], r, width)])

// A tomoe (a comma) of head radius `size` at radius `r` and angle `angle`,
// its tail trailing clockwise and curling outward: the magatama of the
// yin-yang, in head radii a head (the disc at (0, 1)) and a tail (the half
// of the disc of radius 2 at the origin away from the center, less the disc
// at (0, −1)), the frame's −y along the clockwise tangent and +x outward.
function tomoe(r, angle, size, { count = 1, color = ink } = {}) {
	const head = at(r, angle)
	const out = at(1, angle)
	const along = at(1, angle - 90)
	const place = ([x, y]) => [
		head[0] + size * (x * out[0] - (y - 1) * along[0]),
		head[1] + size * (x * out[1] - (y - 1) * along[1]),
	]
	const middle = place([0, 0])
	return [
		shape(color, [disc(head, size * TOMOE.head)], { count }),
		shape(
			color,
			[
				disc(middle, 2 * size),
				plane(angle + 180, -(middle[0] * out[0] + middle[1] * out[1])),
				outside(place([0, -1]), size),
			],
			{ count },
		),
	]
}
const TOMOE = Object.freeze({ head: 1.08 })

// The circle through three points, as [center, radius].
function circleThrough([ax, ay], [bx, by], [cx, cy]) {
	const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
	const a2 = ax * ax + ay * ay
	const b2 = bx * bx + by * by
	const c2 = cx * cx + cy * cy
	const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
	const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
	return [[x, y], Math.hypot(ax - x, ay - y)]
}

// A curved blade from `base` through `middle` to a point at `tip`, `wide`
// and `narrow` half-widths at the first two: between two arcs meeting at the
// tip, within the wedge from the base to the tip about the center of the
// arc it lies inside. Points are [r, angle in degrees].
function blade(base, middle, tip, wide, narrow, { count = 1, color = ink } = {}) {
	const [b, m, t] = [at(...base), at(...middle), at(...tip)]
	const left = ([x, y], [x0, y0], [x1, y1], w) => {
		const length = Math.hypot(x1 - x0, y1 - y0)
		return [x - (w * (y1 - y0)) / length, y + (w * (x1 - x0)) / length]
	}
	const right = (point, from, to, w) => left(point, from, to, -w)
	const [leftCenter, leftRadius] = circleThrough(left(b, b, m, wide), left(m, b, t, narrow), t)
	const [rightCenter, rightRadius] = circleThrough(right(b, b, m, wide), right(m, b, t, narrow), t)
	// Bending left (counterclockwise), the blade lies inside its right edge's
	// circle and outside its left edge's; bending right, the other way.
	const bendsLeft = (m[0] - b[0]) * (t[1] - m[1]) - (m[1] - b[1]) * (t[0] - m[0]) > 0
	const [inner, innerRadius] = bendsLeft ? [rightCenter, rightRadius] : [leftCenter, leftRadius]
	const [outer, outerRadius] = bendsLeft ? [leftCenter, leftRadius] : [rightCenter, rightRadius]
	return shape(
		color,
		[disc(inner, innerRadius), outside(outer, outerRadius), ...wedge(inner, b, t)],
		{ count },
	)
}

// The two half-planes holding the wedge at `apex` from the ray through
// `from` to the ray through `to` (less than half a turn apart).
function wedge(apex, from, to) {
	const ray = ([x, y]) => [x - apex[0], y - apex[1]]
	// The half-plane bounded by the ray `u`, on the side of the ray `other`.
	const side = (u, other) => {
		const length = Math.hypot(...u)
		const sign = u[1] * other[0] - u[0] * other[1] > 0 ? -1 : 1
		const n = [(sign * u[1]) / length, (-sign * u[0]) / length]
		const angle = (Math.atan2(n[1], n[0]) * 180) / Math.PI
		return plane(angle, n[0] * apex[0] + n[1] * apex[1])
	}
	const [u, v] = [ray(from), ray(to)]
	return [side(u, v), side(v, u)]
}

// A straight spoke `width` either side of the ray at `angle` degrees, from
// `from` out.
const spoke = (angle, width, from = 0, { count = 1, color = ink } = {}) =>
	shape(color, [plane(angle + 90, width), plane(angle - 90, width), plane(angle + 180, -from)], {
		count,
	})

// A lens (a vesica) along the ray at `angle` degrees through the center,
// `length` from tip to tip, `width` across.
function vesica(angle, length, width, color, outline = 0) {
	const radius = (length * length + width * width) / (4 * width)
	const offset = radius - width / 2
	return shape(
		color,
		[disc(at(offset, angle - 90), radius), disc(at(offset, angle + 90), radius)],
		{
			count: 3,
			width: outline,
		},
	)
}

// Madara's tomoe: ringed heads at `r`, each with a tail sweeping round to
// the next one.
const madaraTomoe = (r) => [
	blade([r, 90], [r + 0.13, 150], [r - 0.02, 207], 0.14, 0.1, { count: 3 }),
	shape(ink, [disc(at(r, 90), 0.2)], { count: 3 }),
	shape(red, [disc(at(r, 90), 0.095)], { count: 3 }),
]

// The patterns, by the names of the reference (references/sharingan-hd.jpg).
// `owner`: the character whose eye it is, the name by default (none for the
// tomoe, every Sharingan's first stages).
const tomoeRing = (count, angle) => [
	ring(0.52, 0.006),
	...tomoe(0.52, angle, 0.12, { count }),
	rim(0.035),
]
const PATTERN_LIST = [
	{ name: 'tomoe-1', owner: null, base: red, shapes: tomoeRing(1, 60) },
	{ name: 'tomoe-2', owner: null, base: red, shapes: tomoeRing(2, 60) },
	{ name: 'tomoe-3', owner: null, base: red, shapes: tomoeRing(3, 90) },
	{
		name: 'baru',
		base: ink,
		shapes: [
			shape(red, [plane(270, 0.45), plane(30, 0.45), plane(150, 0.45)]),
			shape(red, [disc(at(0.52, 12), 0.44)], { count: 3 }),
			shape(ink, [plane(270, 0.45), plane(30, 0.45), plane(150, 0.45)], { width: 0.018 }),
		],
	},
	{
		name: 'fugaku',
		base: red,
		shapes: [
			ring(0.29, 0.03),
			blade([0.29, -8], [0.58, 2], [0.9, 32], 0.065, 0.06, { count: 3 }),
			shape(ink, [disc(at(0.5, 35), 0.085)], { count: 3 }),
			rim(),
		],
	},
	{
		name: 'indra',
		base: red,
		shapes: [shape(ink, [spiral(0, 0.26, 0.035), disc([0, 0], 0.96)], { turn: 180 }), rim()],
	},
	{
		name: 'izuna',
		base: ink,
		shapes: [
			shape(red, [disc([0, 0], 0.92), outside([0, 0], 0.55)]),
			spoke(90, 0.17, 0, { count: 3 }),
		],
	},
	{
		name: 'obito',
		base: red,
		shapes: [
			shape(ink, [disc([0, 0], 0.4)]),
			blade([0.25, 90], [0.6, 93], [0.97, 88], 0.2, 0.11, { count: 3 }),
			blade([0.8, 212], [0.74, 168], [0.55, 128], 0.1, 0.08, { count: 3 }),
			shape(red, [disc([0, 0], 0.22)]),
			rim(),
		],
	},
	{ name: 'madara', base: red, shapes: [...madaraTomoe(0.55), rim()] },
	{
		name: 'naka',
		base: ink,
		shapes: [
			shape(red, [disc([0, 0], 0.55)]),
			blade([0.2, 140], [0.65, 112], [0.95, 85], 0.3, 0.2, { count: 3, color: red }),
			ring(0.23, 0.02),
		],
	},
	{
		name: 'naori',
		base: ink,
		shapes: [
			shape(red, [disc(at(0.46, 90), 0.48)], { count: 3 }),
			spoke(30, 0.035, 0, { count: 3 }),
			shape(ink, [disc([0, 0], 0.22)]),
		],
	},
	{
		name: 'rai',
		base: red,
		shapes: [
			blade([0.97, 128], [0.62, 118], [0.29, 92], 0.12, 0.07, { count: 3 }),
			blade([0.97, 70], [0.62, 60], [0.29, 32], 0.014, 0.014, { count: 3 }),
			ring(0.3, 0.015),
			rim(),
		],
	},
	{
		name: 'sasuke',
		base: ink,
		shapes: [vesica(90, 1.84, 0.74, red), vesica(90, 1.84, 0.74, ink, 0.018)],
	},
	{
		name: 'shin',
		base: red,
		shapes: [
			shape(ink, [disc([0, 0], 0.5)]),
			shape(ink, [plane(270, -0.3), plane(-15, 0.2), plane(195, 0.2)], { count: 3 }),
			rim(),
		],
	},
	{
		name: 'itachi',
		base: red,
		shapes: [
			shape(ink, [disc([0, 0], 0.3)]),
			blade([0.2, 100], [0.55, 95], [0.95, 78], 0.2, 0.13, { count: 3 }),
			rim(),
		],
	},
	{
		name: 'madara-eternal',
		owner: 'madara',
		base: red,
		shapes: [
			spoke(90, 0.09, 0.6, { count: 3 }),
			spoke(30, 0.1, 0.5, { count: 3 }),
			...madaraTomoe(0.55),
			rim(),
		],
	},
	{
		name: 'sasuke-eternal',
		owner: 'sasuke',
		base: ink,
		shapes: [
			vesica(90, 1.84, 0.74, red),
			vesica(90, 1.84, 0.74, ink, 0.018),
			blade([0.1, 155], [0.4, 152], [0.66, 142], 0.24, 0.12, { count: 3 }),
			shape(red, [disc([0, 0], 0.22)]),
			ring(0.235, 0.015),
		],
	},
	{
		name: 'shisui',
		base: red,
		shapes: [
			shape(ink, [disc([0, 0], 0.42)]),
			blade([0.2, 120], [0.56, 92], [0.93, 80], 0.32, 0.17, { count: 4 }),
			shape(red, [disc([0, 0], 0.25)]),
			rim(),
		],
	},
	{
		name: 'rinnegan',
		owner: 'sasuke',
		base: lavender,
		rinnegan: true,
		shapes: [
			shape(violet, [disc([0, 0], 0.34)]),
			ring(0.34, 0.008),
			ring(0.54, 0.008),
			ring(0.74, 0.008),
			ring(0.94, 0.008),
			...tomoe(0.54, 90, 0.08, { count: 3 }),
			...tomoe(0.74, 30, 0.08, { count: 3 }),
		],
	},
]

// `under`: the color under the ink where nothing else is painted (a
// pattern on ink shows it as its ink thins in a morph).
export const PATTERNS = Object.freeze(
	PATTERN_LIST.map((pattern) =>
		Object.freeze({ rinnegan: false, under: red, owner: pattern.name, ...pattern }),
	),
)
export const PATTERN_NAMES = Object.freeze(PATTERNS.map((pattern) => pattern.name))
export const patternIndex = (name) => PATTERN_NAMES.indexOf(name)

// The words a photo of the pattern `name` is named with (main.js): its
// owner first (itachi, madara-eternal, sasuke-rinnegan), else its own name
// (tomoe-2).
export function photoWords(name) {
	const { owner } = PATTERNS[patternIndex(name)]
	return !owner || name.startsWith(owner) ? name : `${owner}-${name}`
}
// The Sharingan alone, without the Rinnegan.
export const SHARINGAN_NAMES = Object.freeze(
	PATTERNS.filter((pattern) => !pattern.rinnegan).map((pattern) => pattern.name),
)

// The radii (from the center) between which a shape lies, any copy:
// within each of its discs (its strokes along their edges), outside the
// discs it leaves out and beyond the half-planes that leave the center out,
// widened by its outline. The shader skips a shape away from them.
export function shapeBounds(item) {
	let low = 0
	let high = Infinity
	for (const term of item.terms) {
		const center = Math.hypot(term.a, term.b)
		if (term.kind === DISC) {
			low = Math.max(
				low,
				(term.width > 0 ? Math.abs(center - term.c) : center - term.c) - term.width,
			)
			high = Math.min(high, center + term.c + term.width)
		} else if (term.kind === OUTSIDE && term.width === 0) {
			low = Math.max(low, term.c - center)
		} else if (term.kind === PLANE && term.width === 0) {
			low = Math.max(low, -term.c)
		}
	}
	return [Math.max(low - item.width, 0), high + item.width]
}

// The texture of the patterns (a row each, RGBA floats): a header (shape
// count, base color, whether it is the Rinnegan, the color under its ink),
// then six texels a shape:
// (color + 8 × its terms' kinds, copies, turn in radians, outline
// half-width), its bounds (shapeBounds(), the outer one 1e3 for none), and
// a texel a term (a, b, c, half-width). Kinds are packed three bits each,
// the first lowest.
export const SHAPE_TERMS = 4
export const SHAPE_TEXELS = 2 + SHAPE_TERMS
export const PATTERN_TEXELS = 1 + SHAPE_TEXELS * SHARINGAN_SHAPES

export function packPatterns(patterns = PATTERNS) {
	const data = new Float32Array(patterns.length * PATTERN_TEXELS * 4)
	patterns.forEach((pattern, row) => {
		if (pattern.shapes.length > SHARINGAN_SHAPES)
			throw new Error(`${pattern.name}: more than ${SHARINGAN_SHAPES} shapes`)
		const base = row * PATTERN_TEXELS * 4
		data.set([pattern.shapes.length, pattern.base, pattern.rinnegan ? 1 : 0, pattern.under], base)
		pattern.shapes.forEach((item, i) => {
			if (item.terms.length > SHAPE_TERMS)
				throw new Error(`${pattern.name}: more than ${SHAPE_TERMS} terms`)
			if (item.count > SHARINGAN_COPIES)
				throw new Error(`${pattern.name}: more than ${SHARINGAN_COPIES} copies`)
			const kinds = item.terms.reduce((code, term, k) => code + term.kind * 8 ** k, 0)
			const offset = base + (1 + SHAPE_TEXELS * i) * 4
			const [low, high] = shapeBounds(item)
			data.set([item.color + 8 * kinds, item.count, item.turn * DEG, item.width], offset)
			data.set([low, Math.min(high, 1e3), 0, 0], offset + 4)
			item.terms.forEach((term, k) => {
				data.set([term.a, term.b, term.c, term.width], offset + 4 * (k + 2))
			})
		})
	})
	return data
}

// The signed distance of a term at (x, y).
function termDistance(term, x, y) {
	let d
	if (term.kind === DISC) d = Math.hypot(x - term.a, y - term.b) - term.c
	else if (term.kind === OUTSIDE) d = term.c - Math.hypot(x - term.a, y - term.b)
	else if (term.kind === PLANE) d = x * term.a + y * term.b - term.c
	else {
		// The radial distance to the nearest turn of the spiral r = a + b·φ.
		const pitch = 2 * Math.PI * term.b
		const t = (Math.hypot(x, y) - term.a - term.b * Math.atan2(y, x)) / pitch
		d = Math.abs(t - Math.floor(t + 0.5)) * Math.abs(pitch)
	}
	return term.width > 0 ? Math.abs(d) - term.width : d
}

// The signed distance of a shape at (x, y): the nearest of its copies.
export function shapeDistance(item, x, y) {
	let nearest = Infinity
	for (let k = 0; k < item.count; k++) {
		const angle = -(item.turn * DEG + (2 * Math.PI * k) / item.count)
		const c = Math.cos(angle)
		const s = Math.sin(angle)
		const qx = c * x - s * y
		const qy = s * x + c * y
		let d = -Infinity
		for (const term of item.terms) d = Math.max(d, termDistance(term, qx, qy))
		if (item.width > 0) d = Math.abs(d) - item.width
		nearest = Math.min(nearest, d)
	}
	return nearest
}

// How much darker the pattern is by the pupil and at the rim, as drawn.
export function patternShade(s) {
	return (0.55 + 0.45 * smoothstep(SHARINGAN_PUPIL, 0.6, s)) * (1 - 0.15 * smoothstep(0.8, 1, s))
}

// The ink's distance as the field holds it: saturating softly at FIELD.reach.
const saturated = (d) => FIELD.reach * Math.tanh(d / FIELD.reach)

// The field of `pattern` at (x, y) of its disc (twin of sharinganField() in
// sharingan-paint.glsl): [the signed distance to its ink, saturated, then
// the weights of red, lavender and violet under it, edges `aa` wide]. The
// ink is a union of the ink shapes, each other shape cutting itself out of
// it; the color under it is the base, or `under` on an ink base, with every
// other shape painted over it in order.
export function patternField(pattern, x, y, aa = 0.004) {
	let d = pattern.base === ink ? -Infinity : Infinity
	const under = [0, 0, 0]
	under[(pattern.base === ink ? pattern.under : pattern.base) - 1] = 1
	for (const item of pattern.shapes) {
		const distance = shapeDistance(item, x, y)
		if (item.color === ink) {
			d = Math.min(d, distance)
			continue
		}
		d = Math.max(d, -distance)
		const cover = clamp01(0.5 - distance / aa)
		for (let i = 0; i < 3; i++) under[i] *= 1 - cover
		under[item.color - 1] += cover
	}
	return [saturated(d), ...under]
}

// The weights of the palette (ink, red, lavender, violet) of a field's
// value, edges `aa` wide.
export function fieldColor([d, ...under], aa = 0.004) {
	const cover = clamp01(0.5 - d / aa)
	return [cover, ...under.map((weight) => weight * (1 - cover))]
}

// The color of `pattern` at (x, y) of its disc, as weights of the palette.
export const paintPattern = (pattern, x, y, aa = 0.004) =>
	fieldColor(patternField(pattern, x, y, aa), aa)

// GLSL's polynomial smooth minimum of radius `k` (common.glsl).
function smin(a, b, k) {
	const h = Math.max(k - Math.abs(a - b), 0) / k
	return Math.min(a, b) - h * h * k * 0.25
}

// Two fields `t` of the way from `from` to `to` (twin of the morph in
// sharinganIris()): the new ink grown in over the first FIELD.grow of the
// way, the old one thinned away after FIELD.thin, their union melted by a
// smooth minimum whose radius peaks at `melt` halfway; the colors under
// them crossfade.
export function morphField(from, to, t, melt) {
	const erode = FIELD.erode * FIELD.reach
	const k = Math.max(melt * Math.sin(Math.PI * t), 1e-4)
	const grown = 1 - smoothstep(0, FIELD.grow, t)
	const thinned = smoothstep(FIELD.thin, 1, t)
	const d = smin(from[0] + thinned * erode, to[0] + grown * erode, k)
	return [d, ...from.slice(1).map((weight, i) => weight + (to[i + 1] - weight) * t)]
}

// The pattern the HUD's button shows after `current` (a name, or null for
// none): with odds `rinnegan` the Rinnegan (never twice in a row), else any
// other Sharingan, at random.
export function pickPattern(current, random, rinnegan = 0) {
	if (current !== 'rinnegan' && random() < rinnegan) return 'rinnegan'
	const others = SHARINGAN_NAMES.filter((name) => name !== current)
	return others[Math.min(Math.floor(random() * others.length), others.length - 1)]
}

// The Sharingan's motion (src/eye/sharingan.js): each value glides to its
// target over its own time, by `ease` (0–1 of the time to 0–1 of the way).
export function glide(from, to, duration, ease = 'smooth') {
	return { from, to, duration, time: duration > 0 ? 0 : Infinity, ease }
}

const EASES = {
	smooth: (t) => smoothstep(0, 1, t),
	// Fast at first, slowing to a stop: the pattern spinning into place.
	out: (t) => 1 - (1 - t) ** 3,
	// The morph of two patterns, through most of the spin.
	morph: (t) => smoothstep(0.05, 0.9, t),
}

export const glideValue = (g) =>
	g.time >= g.duration
		? g.to
		: g.from + (g.to - g.from) * EASES[g.ease](clamp01(g.time / g.duration))

export const glideDone = (g) => g.time >= g.duration

// The activation: the pattern fades in over SHOW.fade of `duration` while
// it spins `turns` turns into place, slowing, its tomoe's heads leading
// (counterclockwise); a new pattern spins one turn while the two morph;
// hiding it takes SHOW.hide of `duration`, and the Rinnegan's lavender
// spreads over the sclera in `spread` and draws back in SHOW.hide of it.
// With reduced motion nothing spins and every change takes SHOW.still s.
export const SHOW = Object.freeze({ fade: 0.6, hide: 0.6, still: 0.3 })

// The Rinnegan's hint (src/eye/sharingan.js): once the Uchiha clan is
// complete, it shows through the eye for an instant, `peak` at most, over
// `duration` s: rising over HINT.rise of it, holding to HINT.hold, fading
// out by its end.
export const HINT = Object.freeze({ rise: 0.15, hold: 0.35 })

export function hintEnvelope(t, duration, peak) {
	if (!(duration > 0) || t <= 0 || t >= duration) return 0
	const s = t / duration
	if (s < HINT.rise) return peak * smoothstep(0, HINT.rise, s)
	if (s <= HINT.hold) return peak
	return peak * (1 - smoothstep(HINT.hold, 1, s))
}
