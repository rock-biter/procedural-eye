import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	HUD,
	hudLayout,
	knobAngle,
	knobSnap,
	trackLevel,
	zoomDistance,
	zoomLevel,
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

test('desktop: the circle is inscribed in the box, the tones around 165°, the zoom 30° apart around 5°', () => {
	const { radius, angles } = hudLayout(...SCREENS.desktop, TONES)
	assert.equal(radius, 460)
	assert.ok(near(angles.tones[(TONES - 1) / 2], HUD.tones.center))
	assert.ok(near(angles.zoomOut - angles.zoomIn, 30 * DEGREE))
	assert.ok(near((angles.zoomIn + angles.zoomOut) / 2, 5 * DEGREE))
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
