// The layout of the HUD (src/ui/hud.js): its buttons sit on a circle around
// the eye, at angles in radians clockwise from the right (screen y points
// down, so π/2 is the bottom). The skin tones keep their spacing in pixels
// along the circle, so on a small circle (a phone) they spread over a wider
// angle; the zoom keeps its angle, and a length in pixels at least, for its
// knob to slide; Random eye moves down, clear of the zoom.

const DEGREE = Math.PI / 180

export const HUD = Object.freeze({
	// Every button's size (px) and the zoom knob's; the skin tones that are
	// not pressed shrink to toneScale of it.
	button: 44,
	knob: 22,
	toneScale: 0.75,
	// The circle's line stops `gap` px from each button. Its dashes are those
	// of the frame around the page: `dash` px every `dashPeriod` px.
	gap: 6,
	dash: 3,
	dashPeriod: 8,
	// The skin tones in the bottom-left quadrant, the first (fair) highest.
	tones: Object.freeze({ center: 135 * DEGREE, spacing: 48 }),
	// Zoom in and zoom out around `center`, zoom in higher, `span` apart, or
	// `minArc` px on a small circle. The knob slides from under one to under
	// the other, and a drag snaps it to either end within `snap` px of it
	// (overlapping the button a little).
	zoom: Object.freeze({ center: 5 * DEGREE, span: 30 * DEGREE, minArc: 160, snap: 28 }),
	// Random eye below the zoom: at `angle`, or `spacing` px past zoom out.
	random: Object.freeze({ angle: 50 * DEGREE, spacing: 60 }),
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
	const tones = Array.from(
		{ length: toneCount },
		(_, i) => hud.tones.center + ((toneCount - 1) / 2 - i) * arc(hud.tones.spacing),
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

// The camera distance of a zoom level: the inverse of zoomLevel().
export function zoomDistance(level, [near, far]) {
	return far * (near / far) ** level
}
