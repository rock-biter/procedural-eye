// The layout of the HUD (src/ui/hud.js): its buttons sit on a circle around
// the eye, at angles in radians clockwise from the right (screen y points
// down, so π/2 is the bottom). Each group is centered at its angle and keeps
// its spacing in pixels along the circle, so on a small circle (a phone) it
// spreads over a wider angle; Random eye then moves down, clear of the zoom.

const DEGREE = Math.PI / 180

export const HUD = Object.freeze({
	// Every button's size (px); the skin tones that are not pressed shrink to
	// toneScale of it.
	button: 44,
	toneScale: 0.75,
	// The circle stays `margin` px inside the HUD's box, beyond its buttons,
	// and its line stops `gap` px from each button. Its dashes are those of the
	// frame around the page: `dash` px every `dashPeriod` px.
	margin: 8,
	gap: 6,
	dash: 3,
	dashPeriod: 8,
	// The skin tones in the bottom-left quadrant, the first (fair) highest.
	tones: Object.freeze({ center: 135 * DEGREE, spacing: 48 }),
	// Zoom in, the zoom level and zoom out in the bottom-right quadrant, zoom
	// in highest, spaced to hold the level between the two buttons.
	zoom: Object.freeze({ center: 25 * DEGREE, spacing: 56 }),
	// Random eye below the zoom: at `angle`, or `spacing` px past zoom out.
	random: Object.freeze({ angle: 50 * DEGREE, spacing: 60 }),
	// The drag (px) across the zoom level that covers its whole range.
	zoomTravel: 160,
})

// The circle's radius in a box of `width` × `height` px.
export function hudRadius(width, height, hud = HUD) {
	return Math.max(0, Math.min(width, height) / 2 - hud.button / 2 - hud.margin)
}

// The angle of every button on a circle of `radius` px, with `toneCount`
// skin tones.
export function hudAngles(radius, toneCount, hud = HUD) {
	const arc = (length) => length / radius
	const [zoomIn, zoomLevel, zoomOut] = [-1, 0, 1].map(
		(i) => hud.zoom.center + i * arc(hud.zoom.spacing),
	)
	const random = Math.max(hud.random.angle, zoomOut + arc(hud.random.spacing))
	const tones = Array.from(
		{ length: toneCount },
		(_, i) => hud.tones.center + ((toneCount - 1) / 2 - i) * arc(hud.tones.spacing),
	)
	return { tones, zoomIn, zoomLevel, zoomOut, random }
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
