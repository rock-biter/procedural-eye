import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUD, hudAngles, hudRadius, zoomDistance, zoomLevel } from '../src/ui/hudLayout'

// The HUD's box on a desktop window (1600 × 1000) and on a phone (390 × 844).
const SCREENS = {
	desktop: [1520, 920],
	phone: [350, 804],
}
const TONES = 5

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance
const point = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)]
const chord = (radius, a, b) =>
	Math.hypot(...point(radius, a).map((v, i) => v - point(radius, b)[i]))

for (const [screen, [width, height]] of Object.entries(SCREENS)) {
	const radius = hudRadius(width, height)
	const angles = hudAngles(radius, TONES)

	test(`${screen}: the circle and its buttons fit in the box`, () => {
		assert.ok(radius > 100, `radius ${radius}`)
		assert.ok(radius + HUD.button / 2 <= Math.min(width, height) / 2)
	})

	test(`${screen}: the tones lie in the bottom-left quadrant, fair highest, evenly spaced`, () => {
		const { tones } = angles
		assert.equal(tones.length, TONES)
		for (const angle of tones) assert.ok(angle > Math.PI / 2 && angle < Math.PI, `${angle}`)
		for (let i = 1; i < tones.length; i++) {
			assert.ok(tones[i] < tones[i - 1], 'each tone lower than the one before')
			assert.ok(near((tones[i - 1] - tones[i]) * radius, HUD.tones.spacing), 'spacing in px')
		}
		const middle = tones[(TONES - 1) / 2]
		assert.ok(near(middle, HUD.tones.center))
	})

	test(`${screen}: zoom in, the level and zoom out, then Random eye, in the bottom-right quadrant`, () => {
		const { zoomIn, zoomLevel: level, zoomOut, random } = angles
		const order = [zoomIn, level, zoomOut, random]
		for (const angle of order) assert.ok(angle > 0 && angle < Math.PI / 2, `${order}`)
		for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `${order}`)
		assert.ok(near(level - zoomIn, zoomOut - level), 'the level midway')
		assert.ok((random - zoomOut) * radius >= HUD.random.spacing - 1e-9)
	})

	test(`${screen}: no two buttons overlap`, () => {
		const all = [...angles.tones, angles.zoomIn, angles.zoomLevel, angles.zoomOut, angles.random]
		for (let i = 0; i < all.length; i++) {
			for (let j = i + 1; j < all.length; j++) {
				const distance = chord(radius, all[i], all[j])
				assert.ok(distance >= HUD.button, `buttons ${i} and ${j}: ${distance.toFixed(1)} px`)
			}
		}
	})
}

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
