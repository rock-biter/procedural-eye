import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	animateShafts,
	bakeShaftCookie,
	beamGeometry,
	beamIntegral,
	cookieExtent,
	createShafts,
	erf,
	MAX_SHAFTS,
	SHAFT_FLOATS,
	shaftFrame,
} from '../src/atmosphere/lightShafts'
import { vec3 } from '../src/math'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) <= tolerance, `${label ?? ''} ${a} vs ${b}`)

const layout = { count: 6, width: 3, widthVariation: 0.5, spread: 40 }

test('beams are seeded, finite and capped', () => {
	const a = createShafts(3, layout)
	assert.equal(a.length, 6 * SHAFT_FLOATS)
	assert.deepEqual(a, createShafts(3, layout))
	assert.notDeepEqual(a, createShafts(4, layout))
	assert.ok(a.every(Number.isFinite))
	assert.equal(createShafts(1, { ...layout, count: 40 }).length, MAX_SHAFTS * SHAFT_FLOATS)
	for (let o = 0; o < a.length; o += SHAFT_FLOATS) {
		assert.ok(Math.hypot(a[o], a[o + 1]) <= 40 + 1e-9, 'within the spread')
		assert.ok(a[o + 2] >= 0.9 && a[o + 2] <= 9, 'σ around the width')
		assert.ok(a[o + 3] > 0 && a[o + 3] <= 1, 'intensity')
	}
	// No variation: every beam has the width.
	const even = createShafts(3, { ...layout, widthVariation: 0 })
	for (let o = 0; o < even.length; o += SHAFT_FLOATS) close(even[o + 2], 3, 1e-6)
})

test('alignment lays the blades side by side across their long sides, along the angle', () => {
	const options = { ...layout, alignment: 1, angle: 30, offsetX: 10, offsetY: -5 }
	const beams = createShafts(5, options)
	const long = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
	const across = []
	for (let o = 0; o < beams.length; o += SHAFT_FLOATS) {
		const x = beams[o] - 10
		const y = beams[o + 1] + 5
		close(x * long[0] + y * long[1], 0, 1e-4, 'on the line across')
		across.push(-x * long[1] + y * long[0])
		close(beams[o + 4], Math.PI / 6, 1e-6, 'long side along the angle')
	}
	for (let i = 1; i < across.length; i++) assert.ok(across[i] > across[i - 1], 'in order')
	// The other draws are the same: only the centers and angles moved.
	const scattered = createShafts(5, { ...options, alignment: 0 })
	for (let o = 0; o < beams.length; o += SHAFT_FLOATS) {
		assert.equal(beams[o + 2], scattered[o + 2])
		assert.equal(beams[o + 3], scattered[o + 3])
	}
})

test('the cookie holds each blade: peak on its axis, its whole integral, its long side, nothing at the border', () => {
	const beams = Float32Array.of(10, -20, 2, 0.8, 0, -30, 15, 3, 0.5, Math.PI / 2)
	const size = 256
	const elongation = 4
	const extent = cookieExtent(beams, elongation)
	close(extent, 30 + 3 * 3 * 4, 1e-4, 'extent')
	const cookie = bakeShaftCookie(beams, elongation, size, extent)
	const texel = (2 * extent) / size
	const at = (u, v) =>
		cookie[Math.floor((v + extent) / texel) * size + Math.floor((u + extent) / texel)]
	close(at(10, -20), 0.8, 0.03, 'first peak')
	close(at(-30, 15), 0.5, 0.03, 'second peak')
	// The first blade lies along u, the second along v.
	assert.ok(at(14, -20) > 0.5 * 0.8 && at(10, -16) < 0.2 * 0.8, 'first along u')
	assert.ok(at(-30, 21) > 0.5 * 0.5 && at(-24, 15) < 0.2 * 0.5, 'second along v')
	let sum = 0
	for (const value of cookie) sum += value
	const expected = 2 * Math.PI * elongation * (0.8 * 4 + 0.5 * 9)
	close(sum * texel * texel, expected, expected * 0.01, 'integral')
	for (let i = 0; i < size; i++) {
		assert.ok(cookie[i] < 0.02 && cookie[(size - 1) * size + i] < 0.02, 'border')
	}
})

test('animated beams sway and flicker within their bounds, smoothly, and hold still without motion', () => {
	const beams = createShafts(2, layout)
	const motion = { sway: 3, flicker: 0.4, speed: 1 }
	assert.deepEqual(animateShafts(beams, 2, { ...motion, sway: 0, flicker: 0 }, 12.3), beams)
	assert.deepEqual(
		animateShafts(beams, 2, { ...motion, speed: 0 }, 0),
		animateShafts(beams, 2, motion, 0),
	)
	let moved = 0
	for (let step = 0; step < 200; step++) {
		const time = step * 0.37
		const a = animateShafts(beams, 2, motion, time)
		const b = animateShafts(beams, 2, motion, time + 1 / 60)
		for (let o = 0; o < beams.length; o += SHAFT_FLOATS) {
			assert.ok(
				Math.hypot(a[o] - beams[o], a[o + 1] - beams[o + 1]) <= 3 * Math.SQRT2 + 1e-9,
				'sway',
			)
			assert.ok(a[o + 3] >= 0.6 * beams[o + 3] - 1e-9 && a[o + 3] <= beams[o + 3] + 1e-9, 'flicker')
			assert.equal(a[o + 2], beams[o + 2])
			assert.equal(a[o + 4], beams[o + 4])
			// A frame apart, a fraction of a millimeter.
			assert.ok(Math.hypot(b[o] - a[o], b[o + 1] - a[o + 1]) < 0.15, 'smooth')
			moved = Math.max(moved, Math.abs(a[o] - beams[o]))
		}
	}
	assert.ok(moved > 1, 'it moves')
})

test('erf is within its approximation', () => {
	const table = [
		[0, 0],
		[0.5, 0.5204999],
		[1, 0.8427008],
		[2, 0.9953223],
	]
	for (const [x, value] of table) {
		close(erf(x), value, 2e-4, `erf(${x})`)
		close(erf(-x), -value, 2e-4, `erf(${-x})`)
	}
})

test('the beams spread from their source, their frame orthonormal', () => {
	const toSource = vec3.normalize([0.5, 0.7, 0.5])
	const frame = shaftFrame(toSource)
	close(vec3.dot(frame.u, frame.direction), 0, 1e-9, 'u ⟂ L')
	close(vec3.dot(frame.v, frame.direction), 0, 1e-9, 'v ⟂ L')
	close(frame.u[1], 0, 1e-9, 'u level')
	assert.ok(frame.v[1] > 0, 'v up')
	close(vec3.dot(frame.direction, toSource), -1, 1e-9, 'toward the eye')
	const near = beamGeometry(Float32Array.of(20, 0, 2, 1, 0), frame, 300)
	const far = beamGeometry(Float32Array.of(20, 0, 2, 1, 0), frame, 3000)
	// Off the center, a beam leans away from the beams' direction, less from afar.
	const lean = (beam) => Math.acos(vec3.dot(beam.axis, frame.direction))
	close(lean(near), Math.atan(20 / 300), 1e-9, 'lean')
	assert.ok(lean(far) < lean(near) / 5)
	close(vec3.dot(near.side, near.axis), 0, 1e-9, 'side ⟂ axis')
	close(vec3.length(near.side), 1, 1e-9, '|side|')
})

test('the beam integral matches a numerical integration, fades end on, and stays finite along a beam', () => {
	const frame = shaftFrame(vec3.normalize([0.5, 0.7, 0.5]))
	// From afar the taper is negligible: an exact Gaussian blade.
	const beam = beamGeometry(Float32Array.of(6, -4, 3, 0.7, 0.6), frame, 1e9)
	const elongation = 5
	const reach = 80
	const long = vec3.cross(beam.axis, beam.side)
	const density = (point) => {
		const d = vec3.sub(point, beam.center)
		const a = vec3.dot(d, beam.side) / beam.sigma
		const b = vec3.dot(d, long) / (beam.sigma * elongation)
		const s = vec3.dot(d, beam.axis) / reach
		return beam.intensity * Math.exp(-0.5 * (a * a + b * b + s * s))
	}
	const origin = [-120, 30, 350]
	for (const [target, length] of [
		[[0, 0, 0], 600],
		[[8, -3, 2], 360],
		[[30, 20, -10], 500],
	]) {
		const direction = vec3.normalize(vec3.sub(target, origin))
		let numeric = 0
		const steps = 20000
		for (let i = 0; i < steps; i++) {
			numeric += density(vec3.madd(origin, direction, ((i + 0.5) / steps) * length))
		}
		numeric *= length / steps
		const sin2 = 1 - vec3.dot(direction, beam.axis) ** 2
		const { integral, closest } = beamIntegral(origin, direction, length, beam, elongation, reach)
		close(integral, numeric * sin2, Math.max(numeric * 2e-3, 1e-6), 'integral')
		assert.ok(closest >= 0 && closest <= length)
	}
	// Along the beam's axis itself: finite, and faded out.
	const start = vec3.madd(beam.center, beam.axis, -150)
	const along = beamIntegral(start, beam.axis, 300, beam, elongation, reach)
	assert.ok(Number.isFinite(along.integral) && along.integral >= 0 && along.integral < 1e-6)
	// Across it: the most.
	const side = beamIntegral(vec3.madd(beam.center, long, -200), long, 400, beam, elongation, reach)
	assert.ok(side.integral > 0.5 * beam.intensity * beam.sigma * elongation * Math.sqrt(2 * Math.PI))
})
