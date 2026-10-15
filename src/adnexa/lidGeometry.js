// Eyelid geometry (pure): the two lids around the palpebral fissure
// (src/adnexa/fissure.js) as one ring of quads, the conjunctiva and caruncle
// in the canthi, and the tear meniscus along the margins. World millimeters at
// primary gaze (the globe center at the origin, +Z toward the viewer).
//
// The ring's columns leave the fissure loop: the upper lid from the medial to
// the lateral canthus, the lower lid back. They meet in a U at the medial
// canthus, around the caruncle (the margins' angle rounded by MEDIAL_ROUND),
// and in an acute angle at the lateral one (LATERAL_ROUND), where the columns
// fan out of the corner and the upper lid laps over the end of the lower one. Each column carries the
// lid's profile, drawn on the support (src/adnexa/periocular.js) at a
// front-plane distance `a` from the margin:
// - the intermarginal strip: the posterior margin rests on the support, the
//   strip rises `marginThickness` off it;
// - the anterior edge, rounded with `marginRadius`, where the lashes grow;
// - the lid: a shell over the support that thickens to the lid's thickness,
//   with the upper lid's crease under its fold and the lower lid's pretarsal
//   roll;
// - the face (createFace()), which the lid turns into away from the margin:
//   the brow above, the nose medially, the cheek below, the temple laterally.
//   The face passes through the lid's shell along a ring around the fissure,
//   so the lids flow into it.
// The columns are laid out on the open fissure. As the lids close
// (`lids.closure`), each column's margin slides to the closing margin and the
// lid stretches over the globe, while the face stays put: the mesh keeps its
// layout at any closure (a blink can morph between two of them).
import { smoothstep, smootherstep, vec3 } from '../math'
import { createFissure } from './fissure'
import {
	conjunctivaZ,
	createFace,
	FORNIX_START,
	smoothMax,
	supportAt,
	supportLift,
	supportZ,
} from './periocular'

// Profile partition: s in [0, WALL) the intermarginal strip, [WALL, EDGE) the
// rounded anterior edge, [EDGE, 1] the skin.
export const LID_PROFILE = Object.freeze({ wall: 0.07, edge: 0.14 })

// The posterior margin's clearance off the support (mm).
const GAP = 0.03
// Weight of the columns' turning against their spacing along the loop (mm per
// radian): the corners and the medial U get columns enough to fan out.
const TURN_WEIGHT = 3
// Radii (mm) of the canthi's corners, as the columns go round them: the
// medial one rounds into a U around the caruncle.
const LATERAL_ROUND = 0.5
const MEDIAL_ROUND = 1
// The rows' step (mm) when tracing a column outward, and the patch of face:
// an ellipse centered on the eye (on the pupil), its semi-axes.
const TRACE_STEP = 0.2
const PATCH = { width: 32.3, height: 34 }
// Far from the margin the rows turn from the margin's normal to rays from the
// fissure's center, which never cross.
const RADIAL = { start: 2, end: 16 }
// How far from the margin (mm) a closing lid stretches: past it the skin
// stays put.
const SLIDE = 12
// The lateral overlap: the upper lid laps over the lower one along a fold
// running out of the lateral canthus, this much below the chord (radians).
const LATERAL_FOLD = { slant: 0.35, length: 4.5, width: 1.2 }
// How much further from the margin (mm) the upper lid's fold lies when the lid
// is closed: open, the skin above the crease folds down over it (the pretarsal
// show, 2–3.5 mm, Price 2009); closed, the crease is 6–7.5 mm above the margin.
const CREASE_UNFOLD = 4
// Points of the lids' shell the face passes through, around the fissure.
const FACE_RING = 32
// Over how many millimeters past the margin's edge the margin's sideways
// shift off the support fades out (shellPoint()).
const SHIFT_FADE = 6
// The lower margin is thinner than the upper one (the intermarginal strip
// 1.0 against 1.36 mm, Zhu 2022).
const LOWER_MARGIN = 0.8
// The thinnest the lid gets off the globe (mm), in its crease.
const MIN_THICKNESS = 0.6

const bell = (value, width) => Math.exp(-((value / width) ** 2))
const angleOf = (v) => Math.atan2(v[1], v[0])

// The lid's thickness grows off the support along its normal, its tilt from
// the front eased toward MAX_TILT (the lids stay in front of the globe). The
// easing is smooth: a hard limit would leave a line on the skin where the
// support's tilt crosses it.
const MAX_TILT = (35 * Math.PI) / 180
function thicknessDirection(normal) {
	const [x, y, z] = normal
	const sideways = Math.hypot(x, y)
	if (sideways < 1e-9) return [0, 0, 1]
	const tilt = MAX_TILT * Math.tanh(Math.atan2(sideways, z) / MAX_TILT)
	const scale = Math.sin(tilt) / sideways
	return [x * scale, y * scale, Math.cos(tilt)]
}

// Upper-lid share of a direction leaving the margin: 1 on the upper lid, 0 on
// the lower one, blended across the canthi (by the direction against the
// chord's normal, so the fan of the lateral corner blends too).
export function upperShare(direction, up) {
	return smootherstep(-0.6, 0.6, direction[0] * up[0] + direction[1] * up[1])
}

// How much a lid vertex follows the gaze (lid-follow.glsl): fully over most of
// its lid band, not at all once past its edge (the brow and the cheek stay put).
export function followWeight(a, bandHeight = 8) {
	return 1 - smoothstep(0.5 * bandHeight, bandHeight + 3, a)
}

// What every lid point needs: the settings, the eye, the open and the current
// fissure, the face and the open fissure's center. Memoized per fissure (the
// lashes ask point by point).
const contexts = new WeakMap()
function lidContext(lids, eye, fissure) {
	let context = contexts.get(fissure)
	if (!context || context.lids !== lids || context.eye !== eye) {
		const nasalSign = Math.sign(fissure.medial[0] - fissure.lateral[0])
		const open = fissure.closure > 0 ? createFissure(lids, nasalSign, 0) : fissure
		context = { lids, eye, open, fissure, nasalSign, center: fissureCenter(open) }
		// The face passes through the lids' shell along a ring around the
		// fissure, so the lids turn into it smoothly.
		// The open lids' shell: the face stays put as they close.
		const openContext = { ...context, fissure: open }
		const ring = []
		for (let i = 0; i < FACE_RING; i++) {
			const t = (i + 0.5) / FACE_RING
			const column = { t, point: open.loop(t), direction: open.normal(t) }
			const { profile, trace } = columnAt(openContext, column)
			ring.push(shellPoint(openContext, profile, trace, profile.ring).position)
		}
		context.face = createFace(eye, lids, ring)
		contexts.set(fissure, context)
	}
	return context
}

// The fissure's center: the open loop is star-shaped around it.
function fissureCenter(fissure) {
	const { medial, lateral, chord } = fissure
	const mid = [(medial[0] + lateral[0]) / 2, (medial[1] + lateral[1]) / 2]
	const height = (p) => (p[0] - mid[0]) * chord.up[0] + (p[1] - mid[1]) * chord.up[1]
	const lift = (height(fissure.upper(0.5)) + height(fissure.lower(0.5))) / 2
	return [mid[0] + chord.up[0] * lift, mid[1] + chord.up[1] * lift]
}

// Replaces the stations within reach of a canthus by a rounded corner of
// `radius`: a cubic Bézier tangent to both margins.
function roundCorner(stations, corner, cornerT, toward, radius, nasalSign) {
	const [cx, cy] = corner
	const [up, down] = toward.map((p) => vec3.normalize([p[0] - cx, p[1] - cy, 0]))
	const half = Math.acos(Math.min(1, up[0] * down[0] + up[1] * down[1])) / 2
	const reach = radius / Math.tan(half)
	const near = (station) =>
		Math.hypot(station.point[0] - cx, station.point[1] - cy) < reach &&
		Math.abs(station.t - cornerT) < 0.25
	const first = stations.findIndex(near)
	let last = first
	while (last + 1 < stations.length && near(stations[last + 1])) last++
	const before = stations[first - 1]
	const after = stations[last + 1]
	// Travel directions along the loop at both ends of the rounding.
	const travel = (station) => [-nasalSign * station.normal[1], nasalSign * station.normal[0]]
	const d0 = travel(before)
	const d1 = travel(after)
	const handle =
		0.55 * Math.hypot(after.point[0] - before.point[0], after.point[1] - before.point[1])
	const b0 = before.point
	const b1 = [b0[0] + d0[0] * handle, b0[1] + d0[1] * handle]
	const b3 = after.point
	const b2 = [b3[0] - d1[0] * handle, b3[1] - d1[1] * handle]
	const rounded = []
	const count = last - first + 1
	for (let k = 1; k <= count; k++) {
		const u = k / (count + 1)
		const v = 1 - u
		const point = [0, 1].map(
			(c) => v * v * v * b0[c] + 3 * v * v * u * b1[c] + 3 * v * u * u * b2[c] + u * u * u * b3[c],
		)
		const tangent = [0, 1].map(
			(c) =>
				3 * v * v * (b1[c] - b0[c]) + 6 * v * u * (b2[c] - b1[c]) + 3 * u * u * (b3[c] - b2[c]),
		)
		const length = Math.hypot(tangent[0], tangent[1]) || 1
		rounded.push({
			t: before.t + (after.t - before.t) * u,
			point,
			normal: [(nasalSign * tangent[1]) / length, (-nasalSign * tangent[0]) / length],
		})
	}
	return [...stations.slice(0, first), ...rounded, ...stations.slice(last + 1)]
}

// Stations along the open loop, from the middle of the upper margin round
// (loop parameter t from 0.25 to 1.25): point and outward normal angle
// (unwrapped), the canthi rounded.
function loopStations(open, nasalSign, samples = 4096) {
	let stations = []
	for (let i = 0; i <= samples; i++) {
		const t = 0.25 + i / samples
		stations.push({ t, point: open.loop(t), normal: open.normal(t) })
	}
	stations = roundCorner(
		stations,
		open.lateral,
		0.5,
		[open.upper(1 - 1e-4), open.lower(1 - 1e-4)],
		LATERAL_ROUND,
		nasalSign,
	)
	stations = roundCorner(
		stations,
		open.medial,
		1,
		[open.upper(1e-4), open.lower(1e-4)],
		MEDIAL_ROUND,
		nasalSign,
	)
	let previous = null
	for (const station of stations) {
		let angle = angleOf(station.normal)
		if (previous) {
			while (angle - previous.angle > Math.PI) angle -= 2 * Math.PI
			while (angle - previous.angle < -Math.PI) angle += 2 * Math.PI
		}
		station.angle = angle
		previous = station
	}
	return stations
}

// Columns around the open loop, spaced by their length along it plus
// TURN_WEIGHT × their turning.
function loopColumns(open, nasalSign, count) {
	const stations = loopStations(open, nasalSign)
	let total = 0
	stations[0].weight = 0
	for (let i = 1; i < stations.length; i++) {
		const a = stations[i - 1]
		const b = stations[i]
		total +=
			Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]) +
			TURN_WEIGHT * Math.abs(b.angle - a.angle)
		b.weight = total
	}
	const columns = []
	let k = 1
	for (let j = 0; j < count; j++) {
		const target = (j / count) * total
		while (k < stations.length - 1 && stations[k].weight < target) k++
		const a = stations[k - 1]
		const b = stations[k]
		const f = b.weight > a.weight ? (target - a.weight) / (b.weight - a.weight) : 0
		const angle = a.angle + (b.angle - a.angle) * f
		columns.push({
			t: a.t + (b.t - a.t) * f,
			point: [
				a.point[0] + (b.point[0] - a.point[0]) * f,
				a.point[1] + (b.point[1] - a.point[1]) * f,
			],
			direction: [Math.cos(angle), Math.sin(angle)],
		})
	}
	return columns
}

// The lid's settings at a column: the margin's thickness and edge radius, the
// lid's thickness, the crease's distance from the margin and the band height.
function columnProfile(context, column) {
	const { lids, open, fissure } = context
	const t = ((column.t % 1) + 1) % 1
	const along = open.along(t)
	const share = upperShare(column.direction, open.chord.up)
	// The lids thin toward the canthi, where they meet: medially along the
	// lacrimal part of the margin, from the punctum on.
	// (Smootherstep tapers: a plain smoothstep's curvature jumps at its ends,
	// which shading shows as a line down the lid.)
	const canthi = smootherstep(0, 0.3, along) * smootherstep(0, 0.12, 1 - along)
	// The lid's volume (its thickness, where it turns into the face) tapers
	// over a third of the margin: quicker, neighboring columns would part.
	const volume = smootherstep(0, 0.35, along) * smootherstep(0, 0.3, 1 - along)
	const thickness =
		lids.marginThickness * (LOWER_MARGIN + (1 - LOWER_MARGIN) * share) * (0.6 + 0.4 * canthi)
	const radius = Math.min(lids.marginRadius, thickness * 0.45)
	const lidThickness = lids.lowerThickness + (lids.lidThickness - lids.lowerThickness) * share
	// The fold over the crease, a little lower toward the canthi, fading out
	// before them (it does not run into the corners); it unfolds as the lid
	// closes.
	const s = t < 0.5 ? t * 2 : 2 - t * 2
	const crease =
		(lids.creaseHeight + CREASE_UNFOLD * fissure.closure) *
		(0.6 + 0.4 * Math.sin(Math.PI * s) ** 0.6)
	const creaseFade = Math.sin(Math.PI * along) ** 1.5
	const band = share * (crease + 1) + (1 - share) * 7
	// Where the face meets the lid (lidContext()): above the fold, below the
	// pretarsal roll, closer to the margin toward the canthi.
	const ring = (share * (crease + 2.2) + (1 - share) * 3.5) * (0.5 + 0.5 * volume)
	// How far the closing margin has slid from the open one.
	const [ox, oy] = open.loop(t)
	const [cx, cy] = fissure.loop(t)
	return {
		t,
		along,
		share,
		canthi,
		volume,
		thickness,
		radius,
		lidThickness: thickness + (lidThickness - thickness) * volume,
		crease,
		creaseFade,
		band,
		ring,
		slide: [cx - ox, cy - oy],
	}
}

// Traces a column outward in the front plane: the polyline of its row, from
// the open margin to the edge of the patch, by arc length `a`.
function traceColumn(context, column, maxReach = 70) {
	const { center } = context
	const xs = [column.point[0]]
	const ys = [column.point[1]]
	let [x, y] = column.point
	const outside = (px, py) => (px / PATCH.width) ** 2 + (py / PATCH.height) ** 2 - 1
	let reach = maxReach
	for (let a = 0; a < maxReach; a += TRACE_STEP) {
		const rx = x - center[0]
		const ry = y - center[1]
		const r = Math.hypot(rx, ry) || 1
		const w = smootherstep(RADIAL.start, RADIAL.end, a)
		const dx = column.direction[0] * (1 - w) + (rx / r) * w
		const dy = column.direction[1] * (1 - w) + (ry / r) * w
		const length = Math.hypot(dx, dy) || 1
		x += (dx / length) * TRACE_STEP
		y += (dy / length) * TRACE_STEP
		xs.push(x)
		ys.push(y)
		const now = outside(x, y)
		if (now > 0) {
			// Where the step crossed the patch's edge, so neighboring columns end
			// smoothly.
			const before = outside(xs.at(-2), ys.at(-2))
			reach = a + (TRACE_STEP * -before) / (now - before)
			break
		}
	}
	return { xs, ys, reach }
}

// Front-plane point and row direction at distance `a` along a traced column,
// moved with the closing margin near it.
function alongTrace(trace, a, profile) {
	const f = Math.min(Math.max(a / TRACE_STEP, 0), trace.xs.length - 1.000001)
	const i = Math.floor(f)
	const k = f - i
	const stay = smootherstep(0, SLIDE, a)
	const x = trace.xs[i] + (trace.xs[i + 1] - trace.xs[i]) * k + profile.slide[0] * (1 - stay)
	const y = trace.ys[i] + (trace.ys[i + 1] - trace.ys[i]) * k + profile.slide[1] * (1 - stay)
	const dx = trace.xs[i + 1] - trace.xs[i]
	const dy = trace.ys[i + 1] - trace.ys[i]
	const length = Math.hypot(dx, dy) || 1
	return { point: [x, y], direction: [dx / length, dy / length] }
}

// Distance `a` (mm from the margin, in the front plane) and height `b` (off the
// support) of profile coordinate s on a column; skin rows reach `reach`.
function profileAt(s, profile, reach) {
	const { wall, edge } = LID_PROFILE
	const { thickness, radius } = profile
	if (s < wall) return { a: 0, b: GAP + (thickness - radius - GAP) * (s / wall) }
	if (s < edge) {
		const phi = Math.PI - (Math.PI / 2) * ((s - wall) / (edge - wall))
		return { a: radius + radius * Math.cos(phi), b: thickness - radius + radius * Math.sin(phi) }
	}
	const k = (s - edge) / (1 - edge)
	return { a: radius + (reach - radius) * k ** 1.8, b: null }
}

// The lateral overlap: a fold out of the lateral canthus, the upper lid's skin
// standing over the lower lid's. Returns the offset along the normal (mm) and
// the fold's groove depth (≤ 0).
function lateralFold(lids, fissure, x, y) {
	const { lateral, chord } = fissure
	const c = Math.cos(LATERAL_FOLD.slant)
	const s = Math.sin(LATERAL_FOLD.slant)
	// The fold runs on along the chord, turned down by the slant.
	const along = [chord.along[0] * c - chord.up[0] * s, chord.along[1] * c - chord.up[1] * s]
	const up = [chord.up[0] * c + chord.along[0] * s, chord.up[1] * c + chord.along[1] * s]
	const u = (x - lateral[0]) * along[0] + (y - lateral[1]) * along[1]
	const v = (x - lateral[0]) * up[0] + (y - lateral[1]) * up[1]
	const window = smootherstep(-1, 0.5, u) * (1 - smootherstep(0.4, 1, u / LATERAL_FOLD.length))
	const step = 2 * smootherstep(-LATERAL_FOLD.width, LATERAL_FOLD.width, v) - 1
	const overlap = lids.lateralOverlap * window
	// The step stays within a few millimeters of the fold.
	const near = bell(v, 4 * LATERAL_FOLD.width)
	return { offset: 0.5 * overlap * step * near, groove: -overlap * bell(v, LATERAL_FOLD.width) }
}

// The lid's shell at distance `a` from the margin: off the support by the
// margin's thickness at the edge, by the lid's past 2.5 mm.
function shellPoint(context, profile, trace, a) {
	const { lids, eye, fissure } = context
	const { point: q, direction } = alongTrace(trace, a, profile)
	// The upper lid thickens within 2.5 mm; the lower one over 4.5, so it slopes
	// down from its margin instead of standing in a shelf over the globe.
	const reach = 2.5 + 2 * (1 - profile.share) + 2 * (1 - profile.volume)
	const rise = smootherstep(profile.radius, reach, a)
	const b = profile.thickness + (profile.lidThickness - profile.thickness) * rise
	// The margin stands off the support along its normal; away from it that
	// sideways shift fades out over SHIFT_FADE mm and the thickness is taken
	// upright. Shifting every row along its own normal would pull rows back
	// where the support bends (from the globe to the canthi) and crease the
	// skin there.
	const fade = 1 - smootherstep(profile.radius, profile.radius + SHIFT_FADE, a)
	const n = profile.marginNormal
	const x = q[0] + n[0] * profile.thickness * fade
	const y = q[1] + n[1] * profile.thickness * fade
	const support = supportAt(eye, lids, fissure, x, y)
	const normal = thicknessDirection(support.normal)
	const upright = [x, y, support.point[2] + b / normal[2]]
	// From the margin's edge, which stands along the margin's normal, into it.
	const offset = vec3.madd([q[0], q[1], supportZ(eye, lids, fissure, q[0], q[1])], n, b)
	const into = smootherstep(profile.radius, profile.radius + 3, a)
	return { position: vec3.lerp(offset, upright, into), normal, q, direction }
}

// The skin point of a column at distance `a` from the margin: the lid's shell
// turning into the face, which passes through the shell along a ring around
// the fissure (lidContext()), so the two meet without a seam; over them the
// crease under its fold, the pretarsal roll and the lateral overlap.
function skinPoint(context, profile, trace, a) {
	const { lids, open, face } = context
	const shell = shellPoint(context, profile, trace, a)
	const [x, y, z] = shell.position
	const toFace = smootherstep(1.5, profile.ring + 2, a)
	const position = [x, y, z + (face(x, y) - z) * toFace]
	const upper = profile.share * profile.creaseFade
	const creaseGroove = -lids.creaseDepth * bell(a - profile.crease, 0.9) * upper
	let relief = creaseGroove + lids.creaseFold * bell(a - profile.crease - 2.4, 2) * upper
	// The pretarsal roll, fullest in the middle of the lower lid.
	relief +=
		lids.lowerRoll * bell(a - 2.5, 1.6) * (1 - profile.share) * Math.sin(Math.PI * profile.along)
	const fold = lateralFold(lids, open, shell.q[0], shell.q[1])
	relief += fold.offset * smootherstep(profile.radius, profile.radius + 0.6, a)
	// However deep the crease, the skin stays clear of the globe.
	const skin = vec3.madd(position, shell.normal, relief)
	const r = Math.hypot(skin[0], skin[1])
	if (r < context.eye.scleraRadius) {
		skin[2] = smoothMax(skin[2], context.eye.surfaceZ(r) + MIN_THICKNESS, 0.3)
	}
	return {
		position: skin,
		direction: shell.direction,
		fold: Math.min(0, creaseGroove) + fold.groove,
	}
}

// Everything a column's points need.
function columnAt(context, column) {
	const { lids, eye, fissure } = context
	const profile = columnProfile(context, column)
	const trace = traceColumn(context, column)
	// The direction the margin stands off the support in.
	const [mx, my] = alongTrace(trace, 0, profile).point
	profile.marginNormal = thicknessDirection(supportAt(eye, lids, fissure, mx, my).normal)
	return { column, profile, trace }
}

// World position of profile coordinate s on a column, the distance `a` from
// the margin, the direction in which `a` grows, the groove depth and the
// upper-lid share.
function pointOn(context, data, s) {
	const { lids, eye, fissure } = context
	const { column, profile, trace } = data
	const { a, b } = profileAt(s, profile, trace.reach)
	if (b !== null) {
		const { point: q, direction } = alongTrace(trace, a, profile)
		const support = supportAt(eye, lids, fissure, q[0], q[1])
		return {
			position: vec3.madd(support.point, profile.marginNormal, b),
			a,
			direction: a > 0 ? direction : column.direction,
			fold: 0,
			share: profile.share,
		}
	}
	const skin = skinPoint(context, profile, trace, a)
	return { ...skin, a, share: profile.share }
}

// The face the lids turn into (its height at x, y), for these settings.
export function lidFace(lids, eye, nasalSign = 1) {
	return lidContext(lids, eye, createFissure(lids, nasalSign)).face
}

// A lid point at loop parameter t (0–0.5 the upper margin medial → lateral,
// 0.5–1 the lower one back) and profile coordinate s, for the lash roots.
export function lidPoint(t, s, fissure, eye, lids) {
	const context = lidContext(lids, eye, fissure)
	const column = { t, point: context.open.loop(t), direction: context.open.normal(t) }
	return pointOn(context, columnAt(context, column), s)
}

// Ring mesh data: `around` columns, `across` rows along the profile.
// Attributes `lid` = (t, s, a, upper share), `relief` = (row direction x, y,
// groove depth (mm, ≤ 0), share of the way along the margin from the medial
// canthus) and `follow` = (upper share, follow weight).
export function createLidMesh(lids, eye, nasalSign = 1, { around = 560, across = 150 } = {}) {
	const fissure = createFissure(lids, nasalSign)
	const context = lidContext(lids, eye, fissure)
	const columns = loopColumns(context.open, nasalSign, around)
	const positions = new Float32Array(around * across * 3)
	const lid = new Float32Array(around * across * 4)
	const relief = new Float32Array(around * across * 4)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const data = columnAt(context, columns[i])
		const { profile } = data
		for (let j = 0; j < across; j++) {
			const s = j / (across - 1)
			const point = pointOn(context, data, s)
			const index = i * across + j
			positions.set(point.position, index * 3)
			lid.set([profile.t, s, point.a, profile.share], index * 4)
			relief.set([point.direction[0], point.direction[1], point.fold, profile.along], index * 4)
			follow.set([profile.share, followWeight(point.a, profile.band)], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			// Front faces toward +Z: the loop runs clockwise (seen from the front)
			// for a right eye, counter-clockwise for a left one.
			indices.set(nasalSign > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d], k)
			k += 6
		}
	}
	return { positions, lid, relief, follow, indices, fissure }
}

// The conjunctiva in the canthi: where the lids pass in front of the receding
// globe, the opening shows the conjunctiva turning into the fornix and the
// caruncle, not the background. An annulus on conjunctivaZ() from inside the
// globe's outline, dipping under the globe there so the sclera meets it in a
// clean line, and falling back behind the skin at its edge. The skin program
// shades it as wet mucosa (`lid` s = 0); it does not follow the gaze. Front
// faces toward +Z.
export function createConjunctivaMesh(
	lids,
	eye,
	nasalSign = 1,
	{ around = 256, across = 40 } = {},
) {
	const fissure = createFissure(lids, nasalSign)
	const inner = eye.scleraRadius * (FORNIX_START - 0.06)
	const positions = new Float32Array(around * across * 3)
	const lid = new Float32Array(around * across * 4)
	const relief = new Float32Array(around * across * 4)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const angle = (i / around) * Math.PI * 2
		const cx = Math.cos(angle)
		const cy = Math.sin(angle)
		// Out to just past the canthi (further medially), where the lids cover it.
		const reach = 15 + 1.5 * smoothstep(-0.3, 0.6, nasalSign * cx)
		for (let j = 0; j < across; j++) {
			const r = inner + (reach - inner) * (j / (across - 1)) ** 1.5
			const x = cx * r
			const y = cy * r
			const z = conjunctivaZ(eye, lids, fissure, x, y)
			// Under the globe where the conjunctiva is the globe.
			const globe = r < eye.scleraRadius ? eye.surfaceZ(r) : -Infinity
			const dip =
				0.06 * (1 - smoothstep(0, 0.15, z - globe)) + 1.5 * Math.max(0, r - reach + 1.5) ** 2
			const index = i * across + j
			positions.set([x, y, z - dip], index * 3)
			lid.set([i / around, 0, r - inner, cy > 0 ? 1 : 0], index * 4)
			relief.set([cx, cy, 0, 0], index * 4)
			follow.set([cy > 0 ? 1 : 0, 0], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			indices.set([a, c, b, a, d, c], k)
			k += 6
		}
	}
	return { positions, lid, relief, follow, indices }
}

// The tear meniscus: a concave water fillet in the corner between the lid's
// intermarginal strip and the support, along both margins, its radius
// tapering at the canthi and where the margin leaves the globe (lower about
// 0.36 mm, upper smaller: Yokoi 1999, Shen 2008). Attribute `meniscus` = (t, φ
// across the fillet, radius).
export function createMeniscusMesh(lids, eye, nasalSign = 1, { around = 320, across = 10 } = {}) {
	const fissure = createFissure(lids, nasalSign)
	const positions = new Float32Array(around * across * 3)
	const normals = new Float32Array(around * across * 3)
	const meniscus = new Float32Array(around * across * 3)
	const follow = new Float32Array(around * across * 2)
	for (let i = 0; i < around; i++) {
		const t = i / around
		const along = fissure.along(t)
		const share = upperShare(fissure.normal(t), fissure.chord.up)
		const [mx, my] = fissure.loop(t)
		const [nx, ny] = fissure.normal(t)
		const contact = 1 - smoothstep(0.05, 0.5, supportLift(eye, lids, fissure, mx, my))
		const taper = smoothstep(0, 0.08, along) * smoothstep(0, 0.05, 1 - along) * contact
		const radius = (lids.meniscusLower + (lids.meniscusUpper - lids.meniscusLower) * share) * taper
		for (let j = 0; j < across; j++) {
			const phi = (j / (across - 1)) * (Math.PI / 2)
			// Arc center at a = −R (into the opening), b = R (off the support).
			const a = -radius + radius * Math.sin(phi)
			const b = GAP + radius - radius * Math.cos(phi)
			const support = supportAt(eye, lids, fissure, mx + nx * a, my + ny * a)
			const up = thicknessDirection(support.normal)
			const p = vec3.madd(support.point, up, b)
			// The water surface faces the arc center.
			const tangent = vec3.normalize(vec3.sub([nx, ny, 0], vec3.scale(up, nx * up[0] + ny * up[1])))
			const normal = vec3.normalize(
				vec3.add(vec3.scale(tangent, -Math.sin(phi)), vec3.scale(up, Math.cos(phi))),
			)
			const index = i * across + j
			positions.set(p, index * 3)
			normals.set(normal, index * 3)
			meniscus.set([t, j / (across - 1), radius], index * 3)
			follow.set([share, 1], index * 2)
		}
	}
	const indices = new Uint32Array(around * (across - 1) * 6)
	let k = 0
	for (let i = 0; i < around; i++) {
		const next = (i + 1) % around
		for (let j = 0; j < across - 1; j++) {
			const a = i * across + j
			const b = next * across + j
			const c = next * across + j + 1
			const d = i * across + j + 1
			indices.set(nasalSign > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d], k)
			k += 6
		}
	}
	return { positions, normals, meniscus, follow, indices }
}
