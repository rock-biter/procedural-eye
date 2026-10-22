// The geometry of the intro (src/ui/intro.js): the black mask's diagonal cut,
// the frame's sides drawn clockwise, the clip that makes a sliding line read
// as rising out of a mask, the camera's glide between two framings and the
// order the HUD's layers and buttons come in.

const DEGREE = Math.PI / 180
// A share as a CSS percentage, to a hundredth.
const percent = (share) => `${Math.round(share * 10000) / 100}%`
const clamp01 = (value) => Math.min(Math.max(value, 0), 1)

// The polygon (points in px) the black mask still covers on a `width` ×
// `height` page once its cut has travelled `progress` (0 to 1) across it: the
// part of the page ahead of a straight cut that moves along `angle` (degrees
// counterclockwise from the right: 45 from the bottom left corner toward the
// top right), from the first corner it reaches to the last. The cut runs
// square to its travel. Empty once it has passed.
export function revealPolygon(width, height, angle, progress) {
	const ux = Math.cos(angle * DEGREE)
	const uy = -Math.sin(angle * DEGREE)
	const corners = [
		[0, 0],
		[width, 0],
		[width, height],
		[0, height],
	]
	const along = ([x, y]) => x * ux + y * uy
	const reach = corners.map(along)
	const first = Math.min(...reach)
	const cut = first + (Math.max(...reach) - first) * clamp01(progress)
	// The rectangle clipped by the half-plane ahead of the cut.
	const points = []
	corners.forEach((a, i) => {
		const b = corners[(i + 1) % corners.length]
		const da = reach[i] - cut
		const db = reach[(i + 1) % corners.length] - cut
		if (da > 0) points.push(a)
		if (da > 0 !== db > 0) {
			const t = da / (da - db)
			points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
		}
	})
	return points.length >= 3 ? points : []
}

// The frame's sides are drawn clockwise, each from one end to the other: the
// top from the left, the right side from the top, the bottom from the right,
// the left side from the bottom. Each side is two halves, each from a window
// edge to the middle, the end one mirrored (main.js), so both run from their
// edge (their left or top) in their own coordinates. The half each side
// starts with:
const FIRST_HALF = { top: 'start', right: 'start', bottom: 'end', left: 'end' }

// The clip path of the half `end` ('start' or 'end') of the frame's side
// `side`, the side drawn `progress` (0 to 1) of its length: the first half
// from its edge to the middle, then the second from the middle to its edge.
export function frameLineClip(side, end, progress) {
	const first = FIRST_HALF[side] === end
	const shown = clamp01(first ? 2 * progress : 2 * progress - 1)
	const hidden = percent(1 - shown)
	// Drawn from its edge (the first half), the clip hides its far end; drawn
	// toward it (the second), its near end.
	if (side === 'top' || side === 'bottom')
		return first ? `inset(0% ${hidden} 0% 0%)` : `inset(0% 0% 0% ${hidden})`
	return first ? `inset(0% 0% ${hidden} 0%)` : `inset(${hidden} 0% 0% 0%)`
}

// The clip path of the bracket at the middle of the `side` ('left' or
// 'right') shown `progress` (0 to 1) of its height, the way its side is
// drawn: the right one from the top down, the left one from the bottom up.
export function frameBracketClip(side, progress) {
	const hidden = percent(1 - clamp01(progress))
	return side === 'right' ? `inset(0% 0% ${hidden} 0%)` : `inset(${hidden} 0% 0% 0%)`
}

// A line rising out of a mask: an element `width` × `height` px slides its
// own size into the box it ends in, from `from` ('above', 'below', 'left' or
// 'right'), while a clip path keeps it inside that box, and `margin` px past
// its other sides for the ink and shadows past the line's box. The two move
// together under one ease, so the box reads as a mask. Its start and end as
// GSAP vars, { from, to }, each { x | y, clipPath }.
export function maskedLine(from, width, height, margin = 0) {
	const m = `${-margin}px`
	const inset = (top, right, bottom, left) => `inset(${top} ${right} ${bottom} ${left})`
	switch (from) {
		case 'above':
			return {
				from: { y: -height, clipPath: inset(`${height}px`, m, m, m) },
				to: { y: 0, clipPath: inset('0px', m, m, m) },
			}
		case 'below':
			return {
				from: { y: height, clipPath: inset(m, m, `${height}px`, m) },
				to: { y: 0, clipPath: inset(m, m, '0px', m) },
			}
		case 'left':
			return {
				from: { x: -width, clipPath: inset(m, m, m, `${width}px`) },
				to: { x: 0, clipPath: inset(m, m, m, '0px') },
			}
		case 'right':
			return {
				from: { x: width, clipPath: inset(m, `${width}px`, m, m) },
				to: { x: 0, clipPath: inset(m, '0px', m, m) },
			}
	}
	throw new Error(`Unknown side ${from}`)
}

// The camera `t` (0 to 1) of the way from the framing `from` to `to` (each
// { distance, sensor }, mm), both geometric, as the zoom's log scale runs;
// `to` itself at the end.
export function framingBetween(from, to, t) {
	if (t >= 1) return { ...to }
	return {
		distance: from.distance * (to.distance / from.distance) ** t,
		sensor: from.sensor * (to.sensor / from.sensor) ** t,
	}
}

// The ease of a reel that slows down steadily (the intro's shuffle of
// irises): its speed falls `slowdown` times from the start to the end, each
// step taking a little longer than the one before (a geometric series), where
// an ease out would crawl to a halt over its last step. t ↦ ln(1 + (s − 1)t) /
// ln s; linear for a slowdown of 1 or less.
export function reelEase(slowdown) {
	if (!(slowdown > 1)) return (t) => t
	const log = Math.log(slowdown)
	return (t) => Math.log(1 + (slowdown - 1) * t) / log
}

// Layers ({ radius }, px) in the order they come in, from the center
// outward, each as { layer, rank }: the rank counts the radii inside it,
// layers less than `tie` px apart sharing one (the zoom's circle is the
// central one but on a split HUD).
export function outwardRanks(layers, tie = 1) {
	const sorted = [...layers].sort((a, b) => a.radius - b.radius)
	let rank = -1
	let last = -Infinity
	return sorted.map((layer) => {
		if (layer.radius - last >= tie) rank++
		last = layer.radius
		return { layer, rank }
	})
}

// Points ({ x, y } px about a center, screen y down) in clockwise order from
// the angle `start` (degrees clockwise from the right: −90 is the top).
export function clockwise(points, start = -90) {
	const turn = ({ x, y }) => {
		const angle = Math.atan2(y, x) / DEGREE - start
		return ((angle % 360) + 360) % 360
	}
	return [...points].sort((a, b) => turn(a) - turn(b))
}
