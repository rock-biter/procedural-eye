// The layout of the HUD (src/ui/hud.js): its buttons sit on a circle around
// the eye, at angles in radians clockwise from the right (screen y points
// down, so π/2 is the bottom). The skin tones keep their spacing in pixels
// along the circle, so on a small circle (a phone) they spread over a wider
// angle, moving toward the quadrant's middle to stay in it; the zoom keeps
// its angle, and a length in pixels at least, for its
// knob to slide; Random eye moves down, clear of the zoom.

const DEGREE = Math.PI / 180

export const HUD = Object.freeze({
	// Hit areas and visible reticle/marker sizes (px). Only the glyph of an
	// unselected skin tone shrinks; its pointer target stays full size.
	button: 44,
	knob: 44,
	reticle: 32,
	marker: 8,
	toneScale: 0.75,
	// The circle's line stops `gap` px from each button. Its dashes are those
	// of the frame around the page: `dash` px every `dashPeriod` px.
	gap: 6,
	dash: 3,
	dashPeriod: 8,
	// The skin tones in the bottom-left quadrant, the first (fair) highest,
	// around `center` or nearer the quadrant's middle where they would leave it.
	tones: Object.freeze({ center: 140 * DEGREE, spacing: 60 }),
	// Zoom in and zoom out around `center`, zoom in higher, `span` apart, or
	// `minArc` px on a small circle. The knob slides from under one to under
	// the other, and a drag snaps it to either end within `snap` px of it
	// (overlapping the button a little).
	zoom: Object.freeze({ center: 0, span: 32 * DEGREE, minArc: 160, snap: 20 }),
	// Random eye below the zoom: at `angle`, or at least `spacing` px past zoom out.
	random: Object.freeze({ angle: 50 * DEGREE, spacing: 60 }),
	// Ratios keep the inner arcs inside and the outer arcs outside even on
	// phones, fixed at the former zoom-out sizes throughout the zoom.
	inner: Object.freeze({ radiusRatio: 0.88, turn: 22.5 * DEGREE, start: -20 * DEGREE }),
	outer: Object.freeze({ radiusRatio: 1.42, turn: -45 * DEGREE, start: 9.37 * DEGREE }),
})

// The angle of every button on a circle of `radius` px, with `toneCount`
// skin tones, and the knob's track: [the angle at zoom in, at zoom out],
// those of the two buttons.
export function hudAngles(radius, toneCount, hud = HUD) {
	const arc = (length) => length / radius
	const span = Math.max(hud.zoom.span, arc(hud.zoom.minArc))
	const zoomIn = hud.zoom.center - span / 2
	const zoomOut = hud.zoom.center + span / 2
	const random = Math.max(hud.random.angle, zoomOut + arc(hud.random.spacing))
	const half = ((toneCount - 1) / 2) * arc(hud.tones.spacing)
	const middle = 0.75 * Math.PI
	const room = Math.max(Math.PI / 4 - half, 0)
	const center = Math.min(Math.max(hud.tones.center, middle - room), middle + room)
	const tones = Array.from(
		{ length: toneCount },
		(_, i) => center + ((toneCount - 1) / 2 - i) * arc(hud.tones.spacing),
	)
	return { tones, zoomIn, zoomOut, track: [zoomIn, zoomOut], random }
}

// Whether every button, and the knob anywhere along its track, lies inside a
// box of `width` × `height` px centered on the circle.
function fits(radius, angles, width, height, hud) {
	const inside = (angle, half) => {
		const x = width / 2 + radius * Math.cos(angle)
		const y = height / 2 + radius * Math.sin(angle)
		return x >= half && x <= width - half && y >= half && y <= height - half
	}
	const buttons = [...angles.tones, angles.zoomIn, angles.zoomOut, angles.random]
	if (!buttons.every((angle) => inside(angle, hud.button / 2))) return false
	const [from, to] = angles.track
	const steps = Math.max(1, Math.ceil(((to - from) * radius) / 4))
	for (let i = 0; i <= steps; i++) {
		if (!inside(from + ((to - from) * i) / steps, hud.knob / 2)) return false
	}
	return true
}

// The circle in a box of `width` × `height` px: inscribed in it (a whole
// number of px), or smaller until its buttons fit inside it. `{ radius,
// angles }`, or null for a box too small.
export function hudLayout(width, height, toneCount, hud = HUD) {
	for (let radius = Math.floor(Math.min(width, height) / 2); radius > 0; radius--) {
		const angles = hudAngles(radius, toneCount, hud)
		if (fits(radius, angles, width, height, hud)) return { radius, angles }
	}
	return null
}

// The knob's angle on its track at a zoom level, and the level at an angle
// (clamped to the track).
export function knobAngle(level, [zoomIn, zoomOut]) {
	return zoomOut + (zoomIn - zoomOut) * level
}

export function trackLevel(angle, [zoomIn, zoomOut]) {
	return Math.min(Math.max((zoomOut - angle) / (zoomOut - zoomIn), 0), 1)
}

// The end a dragged knob at `angle` snaps to on a circle of `radius` px: 1
// (zoom in) or 0 (zoom out) within `snap` px of it or past it, else null.
export function knobSnap(angle, [zoomIn, zoomOut], radius, hud = HUD) {
	const snap = hud.zoom.snap / radius
	if (angle <= zoomIn + snap) return 1
	if (angle >= zoomOut - snap) return 0
	return null
}

// The zoom level of a camera distance between the zoom-in and zoom-out
// distances `[near, far]`: 0 zoomed out, 1 zoomed in, on a log scale (each
// wheel step multiplies the distance), clamped to [0, 1].
export function zoomLevel(distance, [near, far]) {
	if (!(far > near)) return 1
	const level = Math.log(far / distance) / Math.log(far / near)
	return Math.min(Math.max(level, 0), 1)
}

// The segmented rings keep their zoom-out size and counter-rotate.
// Their ratios preserve strict separation from the central ring at any size.
export function orbitRing(radius, level, kind, hud = HUD) {
	const orbit = hud[kind]
	const zoom = Math.min(Math.max(level, 0), 1)
	return {
		radius: radius * orbit.radiusRatio,
		turn: orbit.start + orbit.turn * (zoom - 0.65),
	}
}

// The camera distance of a zoom level: the inverse of zoomLevel().
export function zoomDistance(level, [near, far]) {
	return far * (near / far) ** level
}
