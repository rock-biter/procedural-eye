import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	coast,
	follow,
	parallaxReach,
	releaseVelocity,
	zoomToward,
} from '../src/camera/orbitMotion'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('release speed: the drag of the last tenth of a second, still time included', () => {
	// 60 moves per second, 1° of azimuth each.
	const track = Array.from({ length: 30 }, (_, i) => ({
		time: i / 60,
		azimuth: i,
		elevation: -i / 2,
	}))
	const last = track.at(-1).time
	const flick = releaseVelocity(track, last)
	close(flick.azimuth, 60, 1e-9, 'azimuth')
	close(flick.elevation, -30, 1e-9, 'elevation')
	// Held still for half the window before letting go: about half as fast.
	close(releaseVelocity(track, last + 0.05).azimuth, 30, 10, 'held')
	// Held still longer than the window: no coasting.
	assert.deepEqual(releaseVelocity(track, last + 0.2), { azimuth: 0, elevation: 0 })
	assert.deepEqual(releaseVelocity([], 1), { azimuth: 0, elevation: 0 })
})

test('coasting covers speed × inertia whatever the frame rate, then stops', () => {
	const run = (dt) => {
		let velocity = { azimuth: 90, elevation: 0 }
		let turned = 0
		let steps = 0
		while (velocity && steps < 10000) {
			const step = coast(velocity, dt, 0.2)
			turned += step.azimuth
			velocity = step.velocity
			steps++
		}
		assert.equal(velocity, null)
		return turned
	}
	close(run(1 / 60), 18, 0.01, '60 fps')
	close(run(1 / 20), 18, 0.01, '20 fps')
	assert.equal(coast({ azimuth: 90, elevation: 0 }, 1 / 60, 0).velocity, null)
})

test('the parallax reaches further zoomed out, linear in the zoom level', () => {
	const controls = { parallax: 3, parallaxOut: 6 }
	const limits = [180, 480]
	assert.equal(parallaxReach(controls, 180, limits), 3)
	assert.equal(parallaxReach(controls, 480, limits), 6)
	// Halfway on the zoom's log scale, halfway between the two.
	close(parallaxReach(controls, Math.sqrt(180 * 480), limits), 4.5, 1e-9)
	// Past the limits it stays at their reach; without limits, zoomed in.
	assert.equal(parallaxReach(controls, 120, limits), 3)
	assert.equal(parallaxReach(controls, 700, limits), 6)
	assert.equal(parallaxReach(controls, 480, null), 3)
})

test('the wheel zoom eases to its target on a log scale, alike at any frame rate', () => {
	// A time constant along the log of the distance: the same share of the way
	// zooming in or out.
	const lag = 0.15
	const step = (from, to, dt) =>
		Math.log(zoomToward(from, to, dt, lag) / from) / Math.log(to / from)
	close(step(300, 200, lag), 1 - Math.exp(-1), 1e-12)
	close(step(200, 300, lag), 1 - Math.exp(-1), 1e-12)
	// 60 or 20 frames per second reach the same distance by the same time.
	const run = (dt) => {
		let distance = 300
		for (let t = 0; t < 0.3 - 1e-9; t += dt) distance = zoomToward(distance, 200, dt, lag)
		return distance
	}
	close(run(1 / 60), run(1 / 20), 1e-9)
	// It lands on the target, and with no lag jumps there.
	let distance = 300
	for (let i = 0; i < 200; i++) distance = zoomToward(distance, 200, 1 / 60, lag)
	assert.equal(distance, 200)
	assert.equal(zoomToward(300, 200, 1 / 60, 0), 200)
})

test('follow glides with its lag and lands on the target', () => {
	close(follow(0, 1, 0.4, 0.4), 1 - Math.exp(-1), 1e-12)
	assert.equal(follow(0, 1, 0.016, 0), 1)
	assert.equal(follow(0.9995, 1, 0.016, 0.4), 1)
})
