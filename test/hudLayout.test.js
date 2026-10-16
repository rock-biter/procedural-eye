import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	HUD,
	elasticZoomLevel,
	hudLayout,
	knobAngle,
	knobLevel,
	knobSnap,
	orbitRing,
	pullLevel,
	spinRing,
	toneArcs,
	trackLevel,
	zoomDistance,
	zoomLevel,
	zoomProgress,
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
const chord = (radius, a, b) =>
	Math.hypot(...point(radius, a).map((v, i) => v - point(radius, b)[i]))

test('desktop: the circle is inscribed in the box, the tones around 140°, the zoom 32° apart around 0°', () => {
	const { radius, angles } = hudLayout(...SCREENS.desktop, TONES)
	assert.equal(radius, 460)
	assert.ok(near(angles.tones[(TONES - 1) / 2], HUD.tones.center))
	assert.ok(near(angles.zoomOut - angles.zoomIn, 32 * DEGREE))
	assert.ok(near((angles.zoomIn + angles.zoomOut) / 2, 0))
	assert.ok(near(angles.random, HUD.random.angle))
})

for (const [screen, [width, height]] of Object.entries(SCREENS)) {
	const { radius, angles } = hudLayout(width, height, TONES)

	test(`${screen}: every button and the knob's track lie inside the box`, () => {
		assert.ok(radius > 100 && radius <= Math.min(width, height) / 2, `radius ${radius}`)
		const inside = (angle, half) => {
			const [x, y] = point(radius, angle)
			return Math.abs(x) <= width / 2 - half && Math.abs(y) <= height / 2 - half
		}
		const buttons = [...angles.tones, angles.zoomIn, angles.zoomOut, angles.random]
		for (const angle of buttons) assert.ok(inside(angle, HUD.button / 2), `${angle}`)
		for (let level = 0; level <= 1; level += 0.05) {
			assert.ok(inside(knobAngle(level, angles.track), HUD.knob / 2), `level ${level}`)
		}
	})

	test(`${screen}: the tones lie in the bottom-left quadrant, fair highest, evenly spaced`, () => {
		const { tones } = angles
		assert.equal(tones.length, TONES)
		for (const angle of tones) assert.ok(angle >= Math.PI / 2 && angle <= Math.PI, `${angle}`)
		for (let i = 1; i < tones.length; i++) {
			assert.ok(tones[i] < tones[i - 1], 'each tone lower than the one before')
			assert.ok(near((tones[i - 1] - tones[i]) * radius, HUD.tones.spacing), 'spacing in px')
		}
	})

	test(`${screen}: zoom in above zoom out, the knob's track between them, Random eye below`, () => {
		const { zoomIn, zoomOut, random } = angles
		assert.deepEqual(angles.track, [zoomIn, zoomOut], 'from under one button to under the other')
		assert.ok(zoomIn < zoomOut && zoomOut < random, `${[zoomIn, zoomOut, random]}`)
		assert.ok((zoomOut - zoomIn) * radius >= HUD.zoom.minArc - 1e-9, 'room for the knob')
		assert.ok(zoomOut - zoomIn >= HUD.zoom.span - 1e-9)
		assert.ok(random > 0 && random < Math.PI / 2)
		assert.ok((random - zoomOut) * radius >= HUD.random.spacing - 1e-9)
	})

	test(`${screen}: no two buttons overlap`, () => {
		const all = [...angles.tones, angles.zoomIn, angles.zoomOut, angles.random]
		for (let i = 0; i < all.length; i++) {
			for (let j = i + 1; j < all.length; j++) {
				const distance = chord(radius, all[i], all[j])
				assert.ok(distance >= HUD.button, `buttons ${i} and ${j}: ${distance.toFixed(1)} px`)
			}
		}
	})
}

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
})

test('the knob sits on the horizontal at the middle of the zoom, the ends symmetric about it', () => {
	for (const [width, height] of Object.values(SCREENS)) {
		const { angles } = hudLayout(width, height, TONES)
		assert.ok(near(knobAngle(0.5, angles.track), 0))
		assert.ok(near(angles.zoomIn, -angles.zoomOut))
	}
	// The start framing sits there: halfway on the zoom's log scale.
	assert.ok(near(zoomLevel(zoomDistance(0.5, [180, 480]), [180, 480]), 0.5))
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
})

test('the spinning circle lies between the central and the outer ring and turns a step per click', () => {
	for (const radius of [150, 460]) {
		const outer = orbitRing(radius, 0.5, 'outer').radius
		const still = spinRing(radius, 0)
		assert.ok(still.radius > radius + 8 && still.radius < outer - 8)
		const [dash, gap] = still.dashArray
		assert.equal(dash, HUD.spin.dash)
		// A whole number of dashes around, about spin.gap apart.
		const count = (2 * Math.PI * still.radius) / (dash + gap)
		assert.ok(near(count, Math.round(count), 1e-9))
		assert.ok(Math.abs(gap - HUD.spin.gap) < (dash + HUD.spin.gap) / 2)
		assert.equal(still.dashOffset, -0)
		// Each click turns it HUD.spin.step further, clockwise.
		const three = spinRing(radius, 3)
		assert.ok(near(-three.dashOffset / three.radius, 3 * HUD.spin.step))
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
