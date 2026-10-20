import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	HUD,
	apertureArcScale,
	apertureFNumber,
	apertureLength,
	apertureLens,
	apertureProgress,
	apertureRadius,
	apertureTrack,
	apertureTrackArc,
	elasticZoomLevel,
	hudAngles,
	hudLayout,
	knobAngle,
	knobLevel,
	knobSnap,
	dashFit,
	orbitArt,
	orbitRing,
	pullLevel,
	spinRing,
	swayTurn,
	toneArcs,
	toneReach,
	toneSteps,
	turnTones,
	zoomValueRadius,
	trackLevel,
	zoomDistance,
	zoomLevel,
	zoomProgress,
	zoomRadius,
	zoomSensor,
} from '../src/ui/hudLayout'

// The HUD's box on a desktop window (1600 × 1000), on a phone held upright
// (390 × 844) and on its side.
const SCREENS = {
	desktop: [1520, 920],
	phone: [350, 804],
	'phone on its side': [804, 350],
}
const TONES = 5
const DEGREE = Math.PI / 180

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance
const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)]

test('desktop: the circle is scaled from the one inscribed in the box, the tones around 180°, the zoom 32° apart around 0°', () => {
	const { radius, angles } = hudLayout(...SCREENS.desktop, TONES)
	assert.equal(radius, Math.floor(460 * HUD.scale))
	assert.ok(near(angles.tones[(TONES - 1) / 2], HUD.tones.center))
	assert.ok(near(angles.zoomOut - angles.zoomIn, 32 * DEGREE))
	assert.ok(near((angles.zoomIn + angles.zoomOut) / 2, 0))
	assert.ok(near(angles.random, HUD.random.angle))
})

for (const [screen, [width, height]] of Object.entries(SCREENS)) {
	const { radius, zoomRadius: zoom, split, angles } = hudLayout(width, height, TONES)
	const toneCenter = split ? HUD.split.tones.center : HUD.tones.center

	test(`${screen}: every button and the knob's track lie inside the box`, () => {
		assert.ok(
			radius > 100 && radius <= (Math.min(width, height) / 2) * HUD.scale,
			`radius ${radius}`,
		)
		const inside = (angle, half, ring = radius) => {
			const [x, y] = point(ring, angle)
			return Math.abs(x) <= width / 2 - half && Math.abs(y) <= height / 2 - half
		}
		// The tones anywhere their group turns, glide and overshoot included;
		// on a split HUD reaching a little past the box.
		const overhang = split ? HUD.split.overhang : 0
		const buttons = [...toneReach(angles, radius), angles.random]
		for (const angle of buttons) assert.ok(inside(angle, HUD.button / 2 - overhang), `${angle}`)
		for (const angle of [angles.zoomIn, angles.zoomOut])
			assert.ok(inside(angle, HUD.button / 2, zoom), `${angle}`)
		for (let level = 0; level <= 1; level += 0.05) {
			assert.ok(inside(knobAngle(level, angles.track), HUD.knob / 2, zoom), `level ${level}`)
		}
	})

	test(`${screen}: the tones lie evenly spaced about their center, light highest, the middle one there`, () => {
		const { tones } = angles
		assert.equal(tones.length, TONES)
		assert.ok(near(tones[(TONES - 1) / 2], toneCenter), 'the middle tone at the center')
		const [from, to] = split ? [Math.PI / 2, Math.PI] : [Math.PI / 2, 1.5 * Math.PI]
		for (const angle of tones) assert.ok(angle >= from - 1e-9 && angle < to + 1e-9, `${angle}`)
		for (let i = 1; i < tones.length; i++) {
			assert.ok(tones[i] < tones[i - 1], 'each tone lower than the one before')
			assert.ok(near((tones[i - 1] - tones[i]) * radius, HUD.tones.spacing), 'spacing in px')
		}
	})

	test(`${screen}: the zoom's buttons about the knob's track, Random eye clear of them`, () => {
		const { zoomIn, zoomOut, random } = angles
		assert.deepEqual(angles.track, [zoomIn, zoomOut], 'from under one button to under the other')
		assert.ok(zoomIn < zoomOut, `${[zoomIn, zoomOut]}`)
		assert.ok((zoomOut - zoomIn) * zoom >= HUD.zoom.minArc - 1e-9, 'room for the knob')
		assert.ok(zoomOut - zoomIn >= HUD.zoom.span - 1e-9)
		if (split) {
			// Zoom out at the left, zoom in at the right, the middle at the bottom.
			assert.ok(near(zoom, radius * HUD.split.zoom.radiusRatio))
			assert.ok((zoomOut - zoomIn) * zoom >= HUD.split.zoom.minArc - 1e-9)
			assert.ok(Math.cos(zoomOut) < 0 && Math.cos(zoomIn) > 0)
			assert.ok(near(random, 0), 'Random eye at the right, on the horizontal')
		} else {
			assert.equal(zoom, radius)
			assert.ok(zoomOut < random && random > 0 && random < Math.PI / 2, 'Random eye below')
			assert.ok((random - zoomOut) * radius >= HUD.random.spacing - 1e-9)
		}
	})

	test(`${screen}: no two buttons overlap, whichever tone is pressed`, () => {
		// Buttons as points; the zoom's on their own circle.
		const at = (angle, ring = radius) => point(ring, angle)
		const zooms = [angles.zoomIn, angles.zoomOut].map((angle) => at(angle, zoom))
		const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
		for (let pressed = 0; pressed < TONES; pressed++) {
			const turned = turnTones(angles.tones, radius, toneSteps(pressed, TONES))
			// The pressed tone at the group's center.
			assert.ok(near(turned[pressed], toneCenter))
			const all = [...[...turned, angles.random].map((angle) => at(angle)), ...zooms]
			for (let i = 0; i < all.length; i++) {
				for (let j = i + 1; j < all.length; j++) {
					const distance = apart(all[i], all[j])
					assert.ok(distance >= HUD.button, `buttons ${i} and ${j}: ${distance.toFixed(1)} px`)
				}
			}
		}
		// Nor anywhere between, as the group glides.
		for (const angle of toneReach(angles, radius)) {
			for (const other of [at(angles.random), ...zooms]) {
				assert.ok(apart(at(angle), other) >= HUD.button, `${angle} near ${other}`)
			}
		}
		// The knob's track clear of every tone and of Random eye.
		if (split) {
			for (let level = 0; level <= 1; level += 0.05) {
				const knob = at(knobAngle(level, angles.track), zoom)
				for (const angle of [...toneReach(angles, radius), angles.random])
					assert.ok(apart(at(angle), knob) >= (HUD.button + HUD.knob) / 2, `level ${level}`)
			}
		}
	})
}

test('a portrait box splits the HUD: the zoom on a wider circle, kept above a reserved bottom', () => {
	const [width, height] = SCREENS.phone
	assert.ok(hudLayout(...SCREENS.phone, TONES).split)
	assert.ok(!hudLayout(...SCREENS['phone on its side'], TONES).split)
	assert.ok(!hudLayout(...SCREENS.desktop, TONES).split)
	assert.equal(zoomRadius(150, false), 150)
	assert.equal(zoomRadius(150, true), 150 * HUD.split.zoom.radiusRatio)
	for (const bottom of [0, 120, 260]) {
		const { radius, zoomRadius: zoom, angles } = hudLayout(width, height, TONES, HUD, { bottom })
		const floor = bottom > 0 ? height - bottom - HUD.split.zoom.clearance : height
		for (let level = 0; level <= 1; level += 0.05) {
			const [, y] = point(zoom, knobAngle(level, angles.track))
			assert.ok(height / 2 + y <= floor - HUD.knob / 2 + 1e-9, `bottom ${bottom}, level ${level}`)
		}
		// A taller reserve costs the circle some size, never its place.
		if (bottom === 260) assert.ok(radius < hudLayout(width, height, TONES).radius)
	}
})

test('the knob runs from zoom out (level 0) to zoom in (level 1) and back', () => {
	const track = [-0.1, 0.3]
	assert.ok(near(knobAngle(0, track), 0.3))
	assert.ok(near(knobAngle(1, track), -0.1))
	for (const level of [0, 0.25, 0.5, 1])
		assert.ok(near(trackLevel(knobAngle(level, track), track), level))
	assert.equal(trackLevel(0.5, track), 0, 'past zoom out')
	assert.equal(trackLevel(-0.4, track), 1, 'past zoom in')
})

test('a dragged knob snaps to an end within HUD.zoom.snap px of it or past it', () => {
	const radius = 400
	const track = [0, 0.5]
	const snap = HUD.zoom.snap / radius
	assert.equal(knobSnap(-0.1, track, radius), 1, 'past zoom in')
	assert.equal(knobSnap(snap * 0.9, track, radius), 1)
	assert.equal(knobSnap(snap * 1.1, track, radius), null)
	assert.equal(knobSnap(0.25, track, radius), null)
	assert.equal(knobSnap(0.5 - snap * 1.1, track, radius), null)
	assert.equal(knobSnap(0.5 - snap * 0.9, track, radius), 0)
	assert.equal(knobSnap(0.6, track, radius), 0, 'past zoom out')
	// The snap starts once the knob overlaps the button.
	assert.ok(HUD.zoom.snap < HUD.button / 2 + HUD.knob / 2)
})

test('the two zoom rings keep their zoom-out sizes and counter-rotate inside and outside the central ring', () => {
	for (const radius of [100, 150, 450, 800]) {
		let previousInner = null
		let previousOuter = null
		for (const level of [0, 0.25, 0.5, 0.75, 1]) {
			const inner = orbitRing(radius, level, 'inner')
			const outer = orbitRing(radius, level, 'outer')
			assert.ok(inner.radius > 0 && inner.radius < radius)
			assert.ok(outer.radius > radius)
			if (previousInner) {
				assert.equal(inner.radius, previousInner.radius)
				assert.equal(outer.radius, previousOuter.radius)
				assert.ok(inner.turn > previousInner.turn)
				assert.ok(outer.turn < previousOuter.turn)
			}
			previousInner = inner
			previousOuter = outer
		}
	}
	for (const kind of ['inner', 'outer']) {
		assert.deepEqual(orbitRing(450, -1, kind), orbitRing(450, 0, kind))
		assert.deepEqual(orbitRing(450, 2, kind), orbitRing(450, 1, kind))
		// Level at the middle of the zoom, turned as much either way by the ends.
		assert.ok(near(orbitRing(450, 0.5, kind).turn, 0))
		assert.ok(near(orbitRing(450, 0, kind).turn, -orbitRing(450, 1, kind).turn))
	}
	assert.ok(near(orbitRing(450, 1, 'inner').turn, 45 * DEGREE))
	assert.ok(near(orbitRing(450, 1, 'outer').turn, -30 * DEGREE))
	// Stretched past an end by a drag, they turn on a little.
	assert.ok(near(orbitRing(450, 1.1, 'inner', true).turn, 1.2 * 45 * DEGREE))
	assert.ok(near(orbitRing(450, -0.1, 'outer', true).turn, 1.2 * 30 * DEGREE))
	// A split HUD's: level with the vertical at the middle of the zoom, the
	// inner one in from the central circle, clear of the tones' arcs, the
	// outer one out past the spinning circle and the readouts.
	const radius = 163
	for (const kind of ['inner', 'outer']) {
		const ring = orbitRing(radius, 0.5, kind, false, HUD, true)
		assert.ok(near(ring.turn, 90 * DEGREE))
		assert.ok(near(ring.radius, radius * HUD.split[kind].radiusRatio))
		const ends = [0, 1].map((level) => orbitRing(radius, level, kind, false, HUD, true).turn)
		assert.ok(near(ends[0] - 90 * DEGREE, 90 * DEGREE - ends[1]))
		// Each the other way than elsewhere.
		const turned = orbitRing(radius, 1, kind).turn
		assert.ok(near(ends[1] - 90 * DEGREE, -turned))
		const art = orbitArt(kind, radius, HUD, true)
		const tick = HUD.split[kind].tick ?? HUD[kind].tick
		assert.ok(near(art.reach, ring.radius * (1 + Math.max(tick, 0))))
	}
	const inner = orbitRing(radius, 0.5, 'inner', false, HUD, true).radius
	assert.ok(inner * (1 + HUD.inner.tick) > toneArcs(radius, 0, HUD, true)[0].radius + 4)
	assert.ok(inner < radius - 8)
	const outer = orbitRing(radius, 0.5, 'outer', false, HUD, true).radius
	// The outer ring's ticks half as long as elsewhere.
	assert.ok(near(HUD.split.outer.tick, HUD.outer.tick / 2))
	const teeth = spinRing(radius, 0, HUD, true).teeth
	assert.ok(outer > teeth.radius + teeth.width / 2 + 8)
	assert.ok(outer > zoomValueRadius(radius, HUD, true) + 8)
})

test('a dashed line starts and ends on a whole dash, its gap close to the one asked', () => {
	for (const length of [7, 40, 151.3, 1234.5]) {
		const [dash, gap] = dashFit(length, 3, 4)
		const count = (length + gap) / (dash + gap)
		assert.ok(near(count, Math.round(count), 1e-9), `${length}`)
		assert.equal(dash, 3)
		assert.ok(Math.abs(gap - 4) <= 3.5 / Math.max(1, Math.round(count) - 1) + 1e-9)
	}
	assert.deepEqual(dashFit(2, 3, 4), [2, 0], 'too short for two dashes: one')
})

test('the segmented rings keep their dashes in px at any size, their geometry following it', () => {
	const { dash, gap, tickDash, tickGap } = HUD.orbitDash
	for (const kind of ['inner', 'outer']) {
		for (const radius of [100, 163, 487]) {
			const { reach, paths } = orbitArt(kind, radius)
			const ring = radius * HUD[kind].radiusRatio
			assert.ok(near(reach, ring * (1 + Math.max(HUD[kind].tick, 0))))
			assert.equal(paths.length, kind === 'inner' ? 2 : 4)
			for (const { d, dashArray } of paths) {
				// The arcs' dashes or the outer ticks', their gap within half a
				// period spread over the gaps of the line.
				const tick = dashArray[0] === tickDash && kind === 'outer' && !d.includes('A')
				const [want, space] = tick ? [tickDash, tickGap] : [dash, gap]
				assert.equal(dashArray[0], want, d)
				const numbers = d.match(/-?[\d.]+/g).map(Number)
				assert.ok(Math.hypot(numbers[0], numbers[1]) <= reach + 0.01, d)
				const length = tick ? Math.abs(HUD[kind].tick) * ring : null
				if (length !== null) {
					const count = Math.round((length + space) / (want + space))
					assert.ok(Math.abs(dashArray[1] - space) <= (want + space) / 2 / (count - 1) + 1e-9)
				} else assert.ok(Math.abs(dashArray[1] - space) < 0.5, `${kind} ${radius}: ${dashArray}`)
			}
		}
	}
	// The inner ring's arcs over ±31° about the horizontal, the outer's ±33.4°.
	const end = (d) =>
		d
			.match(/A[^A-Z]*/)[0]
			.trim()
			.split(/\s+/)
			.slice(-2)
			.map(Number)
	for (const kind of ['inner', 'outer']) {
		const [x, y] = end(orbitArt(kind, 487).paths[0].d)
		assert.ok(near(Math.atan2(y, x), HUD[kind].arc, 1e-3), kind)
	}
})

test('the knob sits on the horizontal at the middle of the zoom (split: at the bottom), the ends symmetric about it', () => {
	for (const [width, height] of Object.values(SCREENS)) {
		const { angles, split } = hudLayout(width, height, TONES)
		const middle = split ? HUD.split.zoom.center : 0
		assert.ok(near(knobAngle(0.5, angles.track), middle))
		assert.ok(near(angles.zoomIn - middle, middle - angles.zoomOut))
	}
	// The start framing sits there: halfway on the zoom's log scale.
	assert.ok(near(zoomLevel(zoomDistance(0.5, [180, 480]), [180, 480]), 0.5))
})

test('the zoom shrinks the sensor toward the zoom-in end, the framing tightening all the way', () => {
	const sensors = [12, 24]
	assert.ok(near(zoomSensor(0, sensors), 24))
	assert.ok(near(zoomSensor(1, sensors), 12))
	// Past the ends (an elastic drag) it holds the end's.
	assert.ok(near(zoomSensor(-0.2, sensors), 24))
	assert.ok(near(zoomSensor(1.2, sensors), 12))
	// Mostly near the zoom-in end: halfway it has done less than half.
	assert.ok(zoomSensor(0.5, sensors) > Math.sqrt(12 * 24))
	// With the defaults' ends (a 110 mm lens, the zoom-in farther for the
	// smaller sensor), the field framed narrows monotonically as the zoom goes in.
	const limits = [230, 480]
	let field = Infinity
	for (let level = 0; level <= 1; level += 0.05) {
		const distance = zoomDistance(level, limits)
		const next = (zoomSensor(level, sensors) * (distance - 110)) / 110
		assert.ok(next < field, `field at ${level}`)
		assert.ok(zoomSensor(level + 0.05, sensors) <= zoomSensor(level, sensors))
		field = next
	}
})

test('the zoom value reads between the spinning circle and the outer zoom ring', () => {
	// Desktop and phone radii, and a split HUD's.
	for (const [radius, split] of [
		[150, false],
		[460, false],
		[163, true],
	]) {
		const at = zoomValueRadius(radius, HUD, split)
		const spin = spinRing(radius, 0, HUD, split)
		// The camera angles opposite, a split HUD's less its drop.
		const angles = at - (split ? HUD.split.readouts.drop : 0)
		for (const reach of [at, angles]) {
			assert.ok(reach > spin.teeth.radius + spin.teeth.width / 2 - 1)
			assert.ok(reach < orbitRing(radius, 0.5, 'outer', false, HUD, split).radius)
		}
	}
	assert.ok(near(zoomValueRadius(163, HUD, true), 163 * 1.28 + 4))
})

test('the layers sway with the mouse, alternating ways, the inner ones the most', () => {
	const { arcs, inner, spin, outer } = HUD.sway
	// From the innermost layer out.
	const layers = [...arcs, inner, spin, outer]
	for (const layer of layers) {
		assert.ok(near(swayTurn(layer, { x: 0, y: 0 }), 0))
		assert.ok(near(swayTurn(layer, { x: 1, y: 1 }), layer.turn))
		assert.ok(near(swayTurn(layer, { x: -1, y: -1 }), -layer.turn))
		assert.ok(layer.lag > 0 && Math.abs(layer.turn) <= 8 * DEGREE, 'slight')
	}
	for (let i = 1; i < layers.length; i++) {
		assert.ok(Math.sign(layers[i].turn) !== Math.sign(layers[i - 1].turn), 'alternating')
		assert.ok(Math.abs(layers[i].turn) <= Math.abs(layers[i - 1].turn), 'outer layers less')
	}
})

test('three arcs inside the inner ring take the places of each skin tone', () => {
	for (const radius of [150, 460]) {
		const inner = orbitRing(radius, 0.5, 'inner').radius
		HUD.arcs.tones.forEach((centers, tone) => {
			const arcs = toneArcs(radius, tone)
			assert.equal(arcs.length, 3)
			for (const [i, arc] of arcs.entries()) {
				assert.ok(arc.radius < inner - 8, 'inside the inner zoom ring')
				const [length, gap] = arc.dashArray
				// One dash around, HUD.arcs.span long, centered on its place.
				assert.ok(near(length + gap, 2 * Math.PI * arc.radius, 1e-9))
				assert.ok(near(length / arc.radius, HUD.arcs.span, 1e-12))
				const middle = (-arc.dashOffset + length / 2) / arc.radius
				assert.ok(near(middle, centers[i], 1e-12))
			}
			// The arcs never overlap.
			const sorted = [...centers].sort((a, b) => a - b)
			for (let i = 0; i < 3; i++) {
				const next = i === 2 ? sorted[0] + 2 * Math.PI : sorted[i + 1]
				assert.ok(next - sorted[i] > HUD.arcs.span, `tone ${tone}`)
			}
		})
	}
	// At rest (the first tone) they are 120° apart; a tone per skin button.
	const [a, b, c] = HUD.arcs.tones[0]
	assert.ok(near(b - a, (2 * Math.PI) / 3) && near(c - b, (2 * Math.PI) / 3))
	assert.equal(HUD.arcs.tones.length, 5)
	assert.deepEqual(toneArcs(460, 5), toneArcs(460, 0))
	// A split HUD draws them on a smaller circle, at the same places.
	for (const [i, arc] of toneArcs(163, 2, HUD, true).entries()) {
		assert.ok(near(arc.radius, 163 * HUD.split.arcs.radiusRatio))
		assert.ok(arc.radius < toneArcs(163, 2)[i].radius)
		assert.ok(
			near(
				-arc.dashOffset / arc.radius,
				-toneArcs(163, 2)[i].dashOffset / (163 * HUD.arcs.radiusRatio),
			),
		)
	}
})

test('the spinning circle lies between the central and the outer ring and turns a step per click', () => {
	// Desktop and phone radii, and a split HUD's.
	for (const [radius, split] of [
		[150, false],
		[460, false],
		[163, true],
	]) {
		const outer = orbitRing(radius, 0.5, 'outer', false, HUD, split).radius
		const still = spinRing(radius, 0, HUD, split)
		assert.ok(still.radius > radius + 8 && still.radius < outer - 8)
		const [dash, gap] = still.dashArray
		assert.equal(dash, HUD.spin.dash)
		// A whole number of dashes around, about spin.gap apart.
		const count = (2 * Math.PI * still.radius) / (dash + gap)
		assert.ok(near(count, Math.round(count), 1e-9))
		assert.ok(Math.abs(gap - HUD.spin.gap) < (dash + HUD.spin.gap) / 2)
		// Each click turns it HUD.spin.step further, clockwise.
		const three = spinRing(radius, 3, HUD, split)
		assert.ok(near((still.dashOffset - three.dashOffset) / three.radius, 3 * HUD.spin.step))
		// Its teeth: HUD.spin.teeth ticks out from the line, evenly spaced from
		// HUD.spin.toothStart, turning with it.
		for (const [turns, turned] of [
			[0, still],
			[3, three],
		]) {
			const { teeth } = turned
			assert.ok(near(teeth.radius - teeth.width / 2, turned.radius))
			assert.equal(teeth.width, split ? HUD.split.spin.tooth : HUD.spin.tooth)
			const [mark, space] = teeth.dashArray
			assert.equal(mark, 1)
			assert.ok(near(((mark + space) * HUD.spin.teeth) / teeth.radius, 2 * Math.PI))
			const first = (-teeth.dashOffset + mark / 2) / teeth.radius
			assert.ok(near(first, HUD.spin.toothStart + turns * HUD.spin.step))
			// Every tooth falls in the middle of a dash of the line.
			const [dash, gap] = turned.dashArray
			const period = dash + gap
			assert.ok(near(((2 * Math.PI * turned.radius) / period) % HUD.spin.teeth, 0, 1e-6))
			for (let k = 0; k < HUD.spin.teeth; k++) {
				const at = (first + (k * 2 * Math.PI) / HUD.spin.teeth) * turned.radius
				const inPattern = (((at + turned.dashOffset) % period) + period) % period
				assert.ok(near(inPattern, dash / 2, 1e-6), `tooth ${k}`)
			}
		}
	}
})

test('past an end the knob runs further than the camera, which keeps its overshoot', () => {
	const elasticity = 0.12
	const stretch = HUD.zoom.stretch
	assert.ok(stretch >= 3)
	// Along the track the knob is the camera's level.
	for (const level of [0, 0.3, 0.5, 1]) assert.equal(knobLevel(level, elasticity), level)
	// pullLevel() undoes the resistance.
	for (const pull of [-0.8, -0.2, -0.01, 1.01, 1.3, 2]) {
		assert.ok(near(pullLevel(elasticZoomLevel(pull, elasticity), elasticity), pull, 1e-9))
	}
	let previous = 1
	for (let pull = 1.001; pull < 4; pull *= 1.2) {
		const camera = elasticZoomLevel(pull, elasticity)
		const knob = knobLevel(camera, elasticity)
		// Further than the camera, short of the pull, bounded by stretch times
		// the camera's limit, and still moving outward.
		assert.ok(knob > camera && knob <= pull + 1e-12)
		assert.ok(knob - 1 < stretch * elasticity)
		assert.ok(knob > previous)
		previous = knob
	}
	// Both ends alike, continuous at them, and none without elasticity.
	assert.ok(near(knobLevel(-0.05, elasticity) - 0, -(knobLevel(1.05, elasticity) - 1), 1e-12))
	assert.ok(near(knobLevel(1 + 1e-7, elasticity), 1 + 1e-7, 1e-9))
	assert.equal(knobLevel(1.05, 0), 1)
	// A pull of a whole track past the end: the camera overshoots as before,
	// the knob more than three times as far.
	const camera = elasticZoomLevel(2, elasticity) - 1
	assert.ok((knobLevel(1 + camera, elasticity) - 1) / camera > 3)
})

test('drag overshoot is continuous, symmetric, bounded and increasingly resistant', () => {
	const limit = 0.12
	for (const level of [0, 0.1, 0.5, 0.9, 1]) assert.equal(elasticZoomLevel(level, limit), level)
	let previous = 0
	let previousSlope = 1
	for (const excess of [0.001, 0.01, 0.05, 0.1, 0.5, 2, 100]) {
		const low = elasticZoomLevel(-excess, limit)
		const high = elasticZoomLevel(1 + excess, limit)
		assert.ok(low < 0 && low > -limit)
		assert.ok(high > 1 && high < 1 + limit)
		assert.ok(near(low, 1 - high))
		assert.ok(high > previous)
		const h = 1e-7
		const slope = (elasticZoomLevel(1 + excess + h, limit) - high) / h
		assert.ok(slope >= 0 && slope < previousSlope)
		previous = high
		previousSlope = slope
	}
	const h = 1e-7
	assert.ok(near((elasticZoomLevel(1 + h, limit) - 1) / h, 1, 1e-5))
	assert.equal(elasticZoomLevel(-1, 0), 0)
	assert.equal(elasticZoomLevel(2, 0), 1)
	const track = [-0.2, 0.2]
	assert.ok(trackLevel(-0.3, track, limit) > 1)
	assert.ok(trackLevel(0.3, track, limit) < 0)
	assert.equal(trackLevel(0, track, limit), 0.5, 'returning inside loses the resistance')
})

test('elastic camera progress round-trips beyond the stops while the public zoom level stays bounded', () => {
	const limits = [180, 480]
	for (const level of [-0.12, -0.05, 0, 0.5, 1, 1.05, 1.12]) {
		const distance = zoomDistance(level, limits)
		assert.ok(near(zoomProgress(distance, limits), level))
		assert.ok(near(zoomLevel(distance, limits), Math.min(Math.max(level, 0), 1)))
	}
})

test('the zoom level runs from 0 out to 1 in on a log scale, and round-trips', () => {
	const limits = [180, 480]
	assert.equal(zoomLevel(480, limits), 0)
	assert.equal(zoomLevel(180, limits), 1)
	assert.ok(near(zoomLevel(Math.sqrt(180 * 480), limits), 0.5))
	for (const level of [0, 0.25, 0.5, 0.9, 1]) {
		assert.ok(near(zoomLevel(zoomDistance(level, limits), limits), level))
	}
	assert.ok(near(zoomDistance(0, limits), 480) && near(zoomDistance(1, limits), 180))
})

test('the zoom level is clamped outside the limits', () => {
	assert.equal(zoomLevel(1000, [180, 480]), 0)
	assert.equal(zoomLevel(100, [180, 480]), 1)
	assert.equal(zoomLevel(300, [300, 300]), 1, 'no range')
})

test('a desktop HUD has the aperture knob between the zoom and the spinning circle, between + and −, inside the box', () => {
	const elasticity = 0.05
	const desktop = hudLayout(...SCREENS.desktop, TONES, HUD, { aperture: { elasticity } })
	const { radius, angles, aperture } = desktop
	assert.equal(radius, hudLayout(...SCREENS.desktop, TONES).radius)
	assert.equal(aperture.radius, apertureRadius(radius))
	assert.equal(aperture.length, apertureLength(radius))
	assert.deepEqual(aperture.track, apertureTrack(angles.track, aperture.radius, elasticity))
	assert.equal(hudLayout(...SCREENS.desktop, TONES).aperture, null, 'only when asked')
	const phone = hudLayout(...SCREENS.phone, TONES, HUD, { aperture: { elasticity } })
	assert.equal(phone.aperture, null)
	// Its lens halfway between the zoom's circle and the spinning circle,
	// HUD.aperture.share of the gap between them long, at any size; hovered
	// and bouncing at a click, longer, still inside the gap.
	const { share, grow, pulse } = HUD.aperture
	assert.ok(share > 0 && grow > 1 && pulse >= grow && share * pulse < 0.9)
	for (const size of [343, 487, 700]) {
		const ring = apertureRadius(size)
		const spin = spinRing(size, 0).radius
		const length = apertureLength(size)
		assert.ok(near(ring - size, spin - ring))
		assert.ok(near(length, (spin - size) * share))
		assert.ok(ring - (length * pulse) / 2 > size + 2, `${size}: past the zoom's circle`)
		assert.ok(ring + (length * pulse) / 2 < spin - 2, `${size}: inside the spinning circle`)
		assert.ok(length > 16, `${size}: ${length}`)
	}
	// Stretched as far as the drag can carry it past either end (a bound it
	// never quite reaches), the line stays HUD.aperture.padding px short of
	// the line of the button's inner edge, HUD.aperture.edge px from its
	// center along the circle, so it never meets the button's glyph (30 px,
	// its brackets as wide); without elasticity, at the ends themselves.
	assert.ok(HUD.aperture.padding > 0)
	for (const e of [0, elasticity, 0.1]) {
		for (const size of [343, 487]) {
			const zoom = hudAngles(size, TONES)
			const ring = apertureRadius(size)
			const track = apertureTrack(zoom.track, ring, e)
			assert.ok(zoom.zoomIn < track[0] && track[0] < track[1] && track[1] < zoom.zoomOut)
			const farthest = HUD.aperture.stretch * e
			for (const [level, button, inward] of [
				[1 + farthest, zoom.zoomIn, 1],
				[-farthest, zoom.zoomOut, -1],
			]) {
				const angle = knobAngle(level, track)
				const side = angle - (inward * HUD.aperture.width) / 2 / ring
				// Its side's distance along the button's tangent from its center.
				const along = ring * Math.sin(inward * (side - button))
				const clear = HUD.aperture.edge + HUD.aperture.padding
				assert.ok(near(along, clear, 0.05), `${e}, ${size}: ${along}`)
			}
		}
	}
	// Its whole track in the box, on a box about square too, where it can
	// shrink the circle.
	for (const [width, height] of [SCREENS.desktop, [700, 640]]) {
		const fit = hudLayout(width, height, TONES, HUD, { aperture: { elasticity } })
		const { length } = fit.aperture
		const reach = Math.max(HUD.aperture.hit, length * HUD.aperture.grow) / 2
		for (let level = 0; level <= 1; level += 0.05) {
			const [x, y] = point(fit.aperture.radius, knobAngle(level, fit.aperture.track))
			assert.ok(Math.abs(x) <= width / 2 - reach && Math.abs(y) <= height / 2 - reach)
		}
	}
})

test('a dashed arc marks the track of the aperture knob, a whole dash at either end', () => {
	const { radius, aperture } = hudLayout(...SCREENS.desktop, TONES, HUD, {
		aperture: { elasticity: 0.05 },
	})
	const center = { cx: 764, cy: 464 }
	const { d, dashArray } = apertureTrackArc(center, aperture.radius, aperture.track)
	const [x0, y0, r, , , , , x1, y1] = d.match(/-?[\d.]+/g).map(Number)
	// From one end of the track to the other, on the knob's circle, clockwise.
	for (const [[x, y], angle] of [
		[[x0, y0], aperture.track[0]],
		[[x1, y1], aperture.track[1]],
	]) {
		assert.ok(near(x, center.cx + aperture.radius * Math.cos(angle), 0.01))
		assert.ok(near(y, center.cy + aperture.radius * Math.sin(angle), 0.01))
	}
	assert.ok(near(r, aperture.radius, 0.01) && d.includes(' 0 0 1 '))
	assert.ok(aperture.radius > radius)
	// The frame's dashes, a whole one at either end.
	const length = (aperture.track[1] - aperture.track[0]) * aperture.radius
	const [dash, gap] = dashArray
	assert.equal(dash, HUD.dash)
	const count = (length + gap) / (dash + gap)
	assert.ok(near(count, Math.round(count), 1e-9))
	assert.ok(Math.abs(dash + gap - HUD.dashPeriod) < 1)
})

test('the aperture knob is a biconvex lens in profile, thickest at its middle', () => {
	const { width, rim } = HUD.aperture
	assert.ok(width > rim && rim > 0)
	for (const length of [22, 38]) {
		const d = apertureLens(length)
		const numbers = d.match(/-?[\d.]+/g).map(Number)
		// M -rim/2 -length/2, H rim/2, A face face 0 0 1 rim/2 length/2, H -rim/2,
		// A face face 0 0 1 -rim/2 -length/2: flat rims at the ends, a face either
		// side.
		const [x0, y0, x1, face, , , , , x2, y2] = numbers
		assert.ok(near(x0, -rim / 2) && near(x1, rim / 2) && near(x2, rim / 2), d)
		assert.ok(near(y0, -length / 2) && near(y2, length / 2), d)
		assert.equal(d.match(/A/g).length, 2)
		assert.ok(d.endsWith('Z'))
		// Each face bulges out to half the lens's width at its middle.
		const sag = face - Math.sqrt(face * face - (length / 2) ** 2)
		assert.ok(near(rim / 2 + sag, width / 2, 0.01), `${length}: ${rim / 2 + sag}`)
	}
})

test('the aperture knob runs from the widest f-number to the narrowest on a log scale, and round-trips', () => {
	const limits = [10, 30]
	assert.ok(near(apertureProgress(10, limits), 0))
	assert.ok(near(apertureProgress(30, limits), 1))
	// The middle of the track halfway in stops.
	assert.ok(near(apertureProgress(Math.sqrt(300), limits), 0.5))
	for (const level of [-0.05, 0, 0.37, 1, 1.05]) {
		assert.ok(near(apertureProgress(apertureFNumber(level, limits), limits), level, 1e-12))
	}
	// Past the ends unclamped, for the elastic drag; the default overshoot keeps
	// the f-number inside the schema's range (1.4 to 32).
	assert.ok(apertureProgress(32, limits) > 1 && apertureProgress(9, limits) < 0)
	assert.ok(apertureFNumber(1 + 0.05, limits) < 32)
	assert.equal(apertureProgress(10, [10, 10]), 0)
})

test("the tones' arcs grow as the aperture opens, bounded, inside the inner zoom ring", () => {
	const [open, closed] = HUD.aperture.arcs
	assert.ok(open > 1 && closed < 1, 'about their size at rest')
	assert.equal(apertureArcScale(0), open)
	assert.equal(apertureArcScale(1), closed)
	assert.ok(apertureArcScale(0.3) < apertureArcScale(0.2), 'smaller stopped down')
	// Past the ends no further than the elastic drag, whatever the f-number.
	const elasticity = 0.05
	const widest = apertureArcScale(-elasticity, elasticity)
	assert.ok(widest > open)
	assert.equal(apertureArcScale(-3, elasticity), widest)
	assert.equal(apertureArcScale(-3), open)
	assert.equal(apertureArcScale(5, elasticity), apertureArcScale(1 + elasticity, elasticity))
	// The widest arcs keep clear of the inner zoom ring's ticks.
	for (const radius of [280, 460]) {
		const inner = orbitRing(radius, 0.5, 'inner')
		const ticks = inner.radius * (1 + HUD.inner.tick)
		assert.ok(toneArcs(radius, 0)[0].radius * widest < ticks - 4, `${radius}`)
	}
})
