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
	// the other; releasing a drag within `snap` px of an end or past it
	// snaps there. During the drag the track can stretch past either end:
	// the camera by zoom.elasticity, the knob `stretch` times as far
	// (knobLevel()).
	zoom: Object.freeze({ center: 0, span: 32 * DEGREE, minArc: 160, snap: 20, stretch: 5 }),
	// Random eye below the zoom: at `angle`, or at least `spacing` px past zoom out.
	random: Object.freeze({ angle: 50 * DEGREE, spacing: 60 }),
	// Ratios keep the inner arcs inside and the outer arcs outside even on
	// phones, fixed at the former zoom-out sizes throughout the zoom. Level
	// with the horizontal at the middle of the zoom, they turn `turn` by
	// either end, the inner one clockwise as the zoom goes in, the outer one
	// the other way.
	inner: Object.freeze({ radiusRatio: 0.88, turn: 45 * DEGREE }),
	outer: Object.freeze({ radiusRatio: 1.42, turn: -30 * DEGREE }),
	// The circle between the central ring and the outer zoom ring
	// (`radiusRatio` of the central radius): `dash` px every about
	// `dash` + `gap` px, and `teeth` solid ticks `tooth` px out from it, evenly
	// spaced from `toothStart`; each click on Random eye turns it `step`
	// further, clockwise.
	spin: Object.freeze({
		radiusRatio: 1.13,
		dash: 40,
		gap: 22.5,
		teeth: 4,
		tooth: 18,
		toothStart: 45 * DEGREE,
		step: 10 * DEGREE,
	}),
	// Three arcs `span` long on a circle inside the inner zoom ring
	// (`radiusRatio` of the central radius), 120° apart at rest. Each skin
	// tone, fair to deep, turns each arc to its own place: `tones` holds their
	// centers per tone (radians clockwise from the right; −90° is the top).
	arcs: Object.freeze({
		radiusRatio: 0.8,
		span: 36 * DEGREE,
		tones: Object.freeze(
			[
				[-90, 30, 150],
				[-45, 75, 195],
				[-120, -20, 140],
				[-30, 60, 240],
				[-150, 0, 90],
			].map((centers) => Object.freeze(centers.map((center) => center * DEGREE))),
		),
	}),
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

// The knob's angle on its track at a zoom level, including elastic overshoot.
export function knobAngle(level, [zoomIn, zoomOut]) {
	return zoomOut + (zoomIn - zoomOut) * level
}

// A bounded spring-like extension: continuous with unit slope at either
// endpoint, then progressively harder to pull, approaching `elasticity`.
export function elasticZoomLevel(level, elasticity = 0) {
	const end = Math.min(Math.max(level, 0), 1)
	const excess = level - end
	if (excess === 0 || elasticity <= 0) return end
	return end + (elasticity * excess) / (elasticity + Math.abs(excess))
}

// The pull that elasticZoomLevel() resists to `level`, its inverse: past an
// end, the pull grows without bound as the resisted overshoot nears
// `elasticity`.
export function pullLevel(level, elasticity = 0) {
	const end = Math.min(Math.max(level, 0), 1)
	const excess = level - end
	if (excess === 0 || elasticity <= 0) return end
	const resisted = Math.min(Math.abs(excess), elasticity * (1 - 1e-9))
	return end + (Math.sign(excess) * elasticity * resisted) / (elasticity - resisted)
}

// The knob's level for the camera's zoom progress: the same along the track;
// past an end, the camera's resisted overshoot is traced back to the pull and
// resisted again with `stretch` times the elasticity, so the knob runs much
// further past the end than the camera zooms.
export function knobLevel(progress, elasticity = 0, stretch = HUD.zoom.stretch) {
	return elasticZoomLevel(pullLevel(progress, elasticity), elasticity * stretch)
}

// With no elasticity this clamps to the track; a drag can opt into overshoot.
export function trackLevel(angle, [zoomIn, zoomOut], elasticity = 0) {
	if (zoomIn === zoomOut) return 1
	return elasticZoomLevel((zoomOut - angle) / (zoomOut - zoomIn), elasticity)
}

// The end a released knob at `angle` snaps to on a circle of `radius` px: 1
// (zoom in) or 0 (zoom out) within `snap` px of it or past it, else null.
export function knobSnap(angle, [zoomIn, zoomOut], radius, hud = HUD) {
	const snap = hud.zoom.snap / radius
	if (angle <= zoomIn + snap) return 1
	if (angle >= zoomOut - snap) return 0
	return null
}

// Unclamped camera progress lets the HUD follow the physical overshoot
// during a drag and its return. Ordinary consumers keep the bounded level.
export function zoomProgress(distance, [near, far]) {
	if (!(far > near)) return 1
	return Math.log(far / distance) / Math.log(far / near)
}

// Zoomed out is 0, zoomed in 1, on the wheel's logarithmic distance scale.
export function zoomLevel(distance, limits) {
	return Math.min(Math.max(zoomProgress(distance, limits), 0), 1)
}

// The segmented rings keep their zoom-out size and counter-rotate: level
// with the horizontal at the middle of the zoom (where the desktop start
// framing and the knob sit), turned `turn` (radians, clockwise) zoomed in and
// as much the other way zoomed out. Past an end (`stretch`: an elastic drag,
// up to zoom.elasticity) they turn on; otherwise they stop at the end. Their
// ratios preserve strict separation from the central ring at any size.
export function orbitRing(radius, level, kind, stretch = false, hud = HUD) {
	const orbit = hud[kind]
	const zoom = stretch ? level : Math.min(Math.max(level, 0), 1)
	return {
		radius: radius * orbit.radiusRatio,
		turn: orbit.turn * (2 * zoom - 1),
	}
}

// The circle between the HUD's circle of `radius` px and the outer zoom
// ring, after `turns` clicks on Random eye: its radius, its dashes
// (`spin.dash` px; their count a multiple of `spin.teeth`, so every tooth
// falls at the same place in the pattern, and a whole number around, so it
// has no seam) and the SVG dash offset that centers a dash on each tooth and
// turns them all `turns` × `spin.step` clockwise (a circle's dashes start at
// its right and run clockwise; a negative offset carries them forward).
// `teeth`: a circle `spin.tooth` / 2 px further out, stroked `spin.tooth` px
// wide with `spin.teeth` 1 px dashes around: solid ticks out from the line,
// the first at `spin.toothStart`, which their own dash offset turns with the
// dashes.
export function spinRing(radius, turns, hud = HUD) {
	const { radiusRatio, dash, gap, teeth, tooth, toothStart, step } = hud.spin
	const ring = radius * radiusRatio
	const perTooth = Math.max(1, Math.round((2 * Math.PI * ring) / (dash + gap) / teeth))
	const period = (2 * Math.PI * ring) / (perTooth * teeth)
	const turn = turns * step
	const toothRing = ring + tooth / 2
	return {
		radius: ring,
		dashArray: [dash, period - dash],
		dashOffset: dash / 2 - (toothStart + turn) * ring,
		teeth: {
			radius: toothRing,
			width: tooth,
			dashArray: [1, (2 * Math.PI * toothRing) / teeth - 1],
			dashOffset: 0.5 - (toothStart + turn) * toothRing,
		},
	}
}

// The three arcs for the skin tone at `tone` (its index, fair first) about
// the HUD's circle of `radius` px: each a circle of the arcs' radius with a
// single dash `arcs.span` long, which its SVG dash offset centers on the
// arc's place (a circle's dashes start at its right and run clockwise; a
// negative offset carries them forward). Tones past the list wrap round.
export function toneArcs(radius, tone, hud = HUD) {
	const { radiusRatio, span, tones } = hud.arcs
	const ring = radius * radiusRatio
	const length = span * ring
	const centers = tones[((tone % tones.length) + tones.length) % tones.length]
	return centers.map((center) => ({
		radius: ring,
		dashArray: [length, 2 * Math.PI * ring - length],
		dashOffset: -(center - span / 2) * ring,
	}))
}

// The camera distance of a zoom level: the inverse of zoomLevel().
export function zoomDistance(level, [near, far]) {
	return far * (near / far) ** level
}
