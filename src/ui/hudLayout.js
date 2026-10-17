// The layout of the HUD (src/ui/hud.js): its buttons sit on a circle around
// the eye, at angles in radians clockwise from the right (screen y points
// down, so π/2 is the bottom). The skin tones keep their spacing in pixels
// along the circle, so on a small circle (a phone) they spread over a wider
// angle about their center; the zoom keeps its angle, and a length in pixels
// at least, for its knob to slide; Random eye moves down, clear of the zoom.
// A portrait box (a phone held upright) splits the HUD over two circles
// about the same center (HUD.split).

const DEGREE = Math.PI / 180

export const HUD = Object.freeze({
	// The circle's size: `scale` times the circle inscribed in the box, its
	// line past the box at the top and bottom, as long as the buttons fit.
	scale: 1.06,
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
	// The skin tones around `center`, at the left on the horizontal, the
	// first (fair) highest, `spacing` px apart. At rest the middle tone sits
	// there; the group turns along the circle to bring the pressed one there
	// (turnTones()).
	tones: Object.freeze({ center: 180 * DEGREE, spacing: 60 }),
	// Zoom in and zoom out around `center`, zoom in higher, `span` apart, or
	// `minArc` px on a small circle. The knob slides from under one to under
	// the other; releasing a drag within `snap` px of an end or past it
	// snaps there. During the drag the track can stretch past either end:
	// the camera by zoom.elasticity, the knob `stretch` times as far
	// (knobLevel()).
	zoom: Object.freeze({ center: 0, span: 32 * DEGREE, minArc: 160, snap: 20, stretch: 5 }),
	// Random eye below the zoom: at `angle`, or at least `spacing` px past zoom out.
	random: Object.freeze({ angle: 50 * DEGREE, spacing: 60 }),
	// A portrait box splits the HUD. The circle keeps the skin tones, the
	// pressed one at `tones.center` (the middle of the bottom left quarter),
	// and Random eye at `random.angle` (the right, on the horizontal); their
	// hit areas may reach `overhang` px past the box, into the gap inside the
	// frame. A wider circle, `zoom.radiusRatio` times as large, takes the
	// zoom: its track's middle (where the mobile start, zoom.mobileStart,
	// sits) at `zoom.center`, the bottom on the vertical, zoom out at its
	// left, zoom in at its right, at least `zoom.minArc` px apart; it keeps
	// `zoom.clearance` px above the bottom the HUD reserves (the footer,
	// hud.js reserveBottom()). The tones' three arcs (HUD.arcs) lie on a
	// smaller circle, `arcs.radiusRatio` of the central radius, the spinning
	// circle (HUD.spin) on a wider one, `spin.radiusRatio` of it, its teeth
	// `spin.tooth` px long. The readouts sit at `readouts.radiusRatio` of it,
	// the zoom's value `readouts.drop` px further out (lower, at the bottom).
	split: Object.freeze({
		overhang: 10,
		arcs: Object.freeze({ radiusRatio: 0.69 }),
		spin: Object.freeze({ radiusRatio: 1.185, tooth: 9 }),
		readouts: Object.freeze({ radiusRatio: 1.28, drop: 4 }),
		tones: Object.freeze({ center: 135 * DEGREE }),
		random: Object.freeze({ angle: 0 }),
		zoom: Object.freeze({ center: 90 * DEGREE, radiusRatio: 1.45, minArc: 208, clearance: 12 }),
	}),
	// Ratios of the central radius keep the inner arcs inside and the outer
	// arcs outside even on phones, fixed throughout the zoom. The four inner
	// circles, the tones' arcs, the inner zoom ring, the central circle and
	// the spinning circle, are evenly spaced, 0.11 apart; the outer ring
	// stays 0.29 out from the spinning circle. Level
	// with the horizontal at the middle of the zoom, they turn `turn` by
	// either end, the inner one clockwise as the zoom goes in, the outer one
	// the other way.
	inner: Object.freeze({ radiusRatio: 0.89, turn: 45 * DEGREE }),
	outer: Object.freeze({ radiusRatio: 1.4, turn: -30 * DEGREE }),
	// The circle between the central ring and the outer zoom ring
	// (`radiusRatio` of the central radius): `dash` px every about
	// `dash` + `gap` px, and `teeth` solid ticks `tooth` px out from it, evenly
	// spaced from `toothStart`; each click on Random eye turns it `step`
	// further, clockwise.
	spin: Object.freeze({
		radiusRatio: 1.11,
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
		radiusRatio: 0.78,
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
	// How far each layer but the central circle turns with the mouse (radians
	// with the mouse at the window's edge; alternating ways, the inner layers
	// the most) and how slowly it follows (a time constant, s): each arc of
	// the tones, the inner zoom ring, the spinning circle, the outer zoom ring.
	sway: Object.freeze({
		arcs: Object.freeze([
			Object.freeze({ turn: 7 * DEGREE, lag: 0.5 }),
			Object.freeze({ turn: -5.5 * DEGREE, lag: 0.65 }),
			Object.freeze({ turn: 4 * DEGREE, lag: 0.8 }),
		]),
		inner: Object.freeze({ turn: -4 * DEGREE, lag: 0.45 }),
		spin: Object.freeze({ turn: 3 * DEGREE, lag: 0.6 }),
		outer: Object.freeze({ turn: -2 * DEGREE, lag: 0.9 }),
	}),
})

// The radius (px) of the zoom's circle about a HUD circle of `radius` px:
// the same circle, or the wider one of a split HUD.
export function zoomRadius(radius, split, hud = HUD) {
	return split ? radius * hud.split.zoom.radiusRatio : radius
}

// The angle of every button on a circle of `radius` px, with `toneCount`
// skin tones, and the knob's track: [the angle at zoom in, at zoom out],
// those of the two buttons. `split`: the zoom on its own, wider circle
// (zoomRadius()), the tones and Random eye placed as HUD.split says.
export function hudAngles(radius, toneCount, hud = HUD, split = false) {
	const arc = (length) => length / radius
	const minArc = split ? hud.split.zoom.minArc : hud.zoom.minArc
	const span = Math.max(hud.zoom.span, minArc / zoomRadius(radius, split, hud))
	const zoomCenter = split ? hud.split.zoom.center : hud.zoom.center
	const zoomIn = zoomCenter - span / 2
	const zoomOut = zoomCenter + span / 2
	const random = split
		? hud.split.random.angle
		: Math.max(hud.random.angle, zoomOut + arc(hud.random.spacing))
	const toneCenter = split ? hud.split.tones.center : hud.tones.center
	const tones = Array.from(
		{ length: toneCount },
		(_, i) => toneCenter + ((toneCount - 1) / 2 - i) * arc(hud.tones.spacing),
	)
	return { tones, zoomIn, zoomOut, track: [zoomIn, zoomOut], random }
}

// How many spacings the tone group turns (clockwise) to bring the tone at
// `pressed` (its index, fair first) of `count` to the group's center.
export function toneSteps(pressed, count) {
	return pressed - (count - 1) / 2
}

// The tones' angles on a circle of `radius` px, turned `steps` spacings
// clockwise (fractional while they glide).
export function turnTones(tones, radius, steps, hud = HUD) {
	const turn = (steps * hud.tones.spacing) / radius
	return tones.map((angle) => angle + turn)
}

// Every angle a tone can take, turned to bring any tone to the center, and a
// quarter spacing past either end for the glide's overshoot, every quarter
// spacing.
export function toneReach(angles, radius, hud = HUD) {
	const count = angles.tones.length
	const steps = []
	for (let k = -4 * (count - 1) - 1; k <= 4 * (count - 1) + 1; k++) steps.push(k / 4)
	const step = hud.tones.spacing / radius
	const middle = angles.tones.reduce((sum, angle) => sum + angle, 0) / count
	return steps.map((k) => middle + k * step)
}

// Whether every button, and the knob anywhere along its track, lies inside a
// box of `width` × `height` px centered on the circle; the tones anywhere
// their group turns, their hit areas up to `overhang` px past it. The
// zoom's buttons and knob lie on a circle of `zoom` px, above `floor` px
// from the box's top.
function fits(radius, zoom, angles, width, height, floor, overhang, hud) {
	const inside = (angle, half, ring = radius, bottom = height) => {
		const x = width / 2 + ring * Math.cos(angle)
		const y = height / 2 + ring * Math.sin(angle)
		return x >= half && x <= width - half && y >= half && y <= bottom - half
	}
	const buttons = [...toneReach(angles, radius, hud), angles.random]
	if (!buttons.every((angle) => inside(angle, hud.button / 2 - overhang))) return false
	const ends = [angles.zoomIn, angles.zoomOut]
	if (!ends.every((angle) => inside(angle, hud.button / 2, zoom, floor))) return false
	const [from, to] = angles.track
	const steps = Math.max(1, Math.ceil(((to - from) * zoom) / 4))
	for (let i = 0; i <= steps; i++) {
		if (!inside(from + ((to - from) * i) / steps, hud.knob / 2, zoom, floor)) return false
	}
	return true
}

// The circle in a box of `width` × `height` px: `scale` times the circle
// inscribed in it (a whole number of px), or smaller until its buttons fit
// inside it. A portrait box splits the HUD (HUD.split): the zoom's wider
// circle keeps `bottom` px at the box's bottom free, and HUD.split's
// clearance above them. `{ radius, zoomRadius, split, angles }`, or null for
// a box too small.
export function hudLayout(width, height, toneCount, hud = HUD, { bottom = 0 } = {}) {
	const split = height > width
	const floor = split && bottom > 0 ? height - bottom - hud.split.zoom.clearance : height
	const overhang = split ? hud.split.overhang : 0
	for (let radius = Math.floor((Math.min(width, height) / 2) * hud.scale); radius > 0; radius--) {
		const angles = hudAngles(radius, toneCount, hud, split)
		const zoom = zoomRadius(radius, split, hud)
		if (fits(radius, zoom, angles, width, height, floor, overhang, hud))
			return { radius, zoomRadius: zoom, split, angles }
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
// `split`: on the wider circle of a split HUD (HUD.split.spin).
export function spinRing(radius, turns, hud = HUD, split = false) {
	const { dash, gap, teeth, toothStart, step } = hud.spin
	const tooth = (split ? hud.split.spin : hud.spin).tooth
	const ring = radius * spinRatio(split, hud)
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
// `split`: on the smaller circle of a split HUD (HUD.split.arcs).
export function toneArcs(radius, tone, hud = HUD, split = false) {
	const { span, tones } = hud.arcs
	const ring = radius * (split ? hud.split.arcs : hud.arcs).radiusRatio
	const length = span * ring
	const centers = tones[((tone % tones.length) + tones.length) % tones.length]
	return centers.map((center) => ({
		radius: ring,
		dashArray: [length, 2 * Math.PI * ring - length],
		dashOffset: -(center - span / 2) * ring,
	}))
}

// The turn (radians, clockwise) a swaying layer (`HUD.sway`) heads for with
// the mouse at `mouse` ([-1, 1] across the window, x right, y up): its
// horizontal place and, half as much, its vertical one, as far as the layer's
// `turn` at a corner.
export function swayTurn(layer, mouse) {
	return (layer.turn * (mouse.x + mouse.y / 2)) / 1.5
}

// The spinning circle's ratio of the central radius, on a split HUD or not.
function spinRatio(split, hud) {
	return (split ? hud.split.spin : hud.spin).radiusRatio
}

// Where the zoom's value reads, as a radius about the HUD's circle of
// `radius` px: halfway between the spinning circle and the outer zoom ring
// (on the middle of the knob's track, hud.js); on a split HUD (`split`) at
// HUD.split.readouts' ratio, and `drop` px further out. The camera angles
// read opposite at the same radius, less the drop.
export function zoomValueRadius(radius, hud = HUD, split = false) {
	if (split) return radius * hud.split.readouts.radiusRatio + hud.split.readouts.drop
	return (radius * (hud.spin.radiusRatio + hud.outer.radiusRatio)) / 2
}

// The camera distance of a zoom level: the inverse of zoomLevel().
export function zoomDistance(level, [near, far]) {
	return far * (near / far) ** level
}
