import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUD, hudLayerRadii, zoomRadius } from '../src/ui/hudLayout'
import {
	clockwise,
	frameBracketClip,
	frameLineClip,
	framingBetween,
	maskedLine,
	outwardRanks,
	revealPolygon,
} from '../src/ui/introLayout'

// The area of a polygon of [x, y] points (shoelace).
const area = (points) =>
	Math.abs(
		points.reduce((sum, [x, y], i) => {
			const [nx, ny] = points[(i + 1) % points.length]
			return sum + x * ny - nx * y
		}, 0) / 2,
	)

test('the mask covers the page, then shrinks to the top right corner and is gone', () => {
	const [width, height] = [1600, 1000]
	assert.equal(area(revealPolygon(width, height, 45, 0)), width * height)
	let last = width * height
	for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
		const covered = area(revealPolygon(width, height, 45, progress))
		assert.ok(covered < last, `shrinks at ${progress}`)
		last = covered
	}
	assert.deepEqual(revealPolygon(width, height, 45, 1), [])
	// Near the end only the top right corner is still covered.
	for (const [x, y] of revealPolygon(width, height, 45, 0.95)) {
		assert.ok(x > width / 2 && y < height / 2)
	}
})

test('the mask is cut square to its travel, at 45 degrees a falling diagonal', () => {
	const points = revealPolygon(1000, 1000, 45, 0.25)
	// The cut's two ends, on the left and the bottom edges, at the same
	// distance from the bottom left corner.
	const left = points.find(([x, y]) => x === 0 && y > 0 && y < 1000)
	const bottom = points.find(([x, y]) => y === 1000 && x > 0 && x < 1000)
	assert.ok(left && bottom)
	assert.ok(Math.abs(1000 - left[1] - bottom[0]) < 1e-9)
	// Halfway, the cut runs through the center.
	const half = revealPolygon(1000, 1000, 45, 0.5)
	assert.ok(Math.abs(area(half) - 500000) < 1e-6)
	// A cut travelling up uncovers the bottom first.
	const up = revealPolygon(800, 600, 90, 0.5)
	assert.ok(up.every(([, y]) => y <= 300 + 1e-9))
})

test('each side of the frame is drawn from one end to the other, clockwise', () => {
	// At the start nothing shows, at the end all of it.
	for (const side of ['top', 'right', 'bottom', 'left']) {
		for (const end of ['start', 'end']) {
			assert.match(frameLineClip(side, end, 0), /100%/)
			assert.doesNotMatch(frameLineClip(side, end, 1), /[1-9]/)
		}
	}
	// Halfway the first half is whole and the second not begun: the top and
	// the right side start with the half from their start edge (left, top),
	// the bottom and the left side with the end one (right, bottom).
	for (const [side, first, second] of [
		['top', 'start', 'end'],
		['right', 'start', 'end'],
		['bottom', 'end', 'start'],
		['left', 'end', 'start'],
	]) {
		assert.doesNotMatch(frameLineClip(side, first, 0.5), /[1-9]/)
		assert.match(frameLineClip(side, second, 0.5), /100%/)
	}
	// The first half grows from its edge (its far end hidden), the second
	// from the middle (its near end, the edge, hidden).
	assert.equal(frameLineClip('top', 'start', 0.25), 'inset(0% 50% 0% 0%)')
	assert.equal(frameLineClip('top', 'end', 0.75), 'inset(0% 0% 0% 50%)')
	assert.equal(frameLineClip('right', 'start', 0.25), 'inset(0% 0% 50% 0%)')
	assert.equal(frameLineClip('right', 'end', 0.75), 'inset(50% 0% 0% 0%)')
	assert.equal(frameBracketClip('right', 0.25), 'inset(0% 0% 75% 0%)')
	assert.equal(frameBracketClip('left', 0.25), 'inset(75% 0% 0% 0%)')
})

test('a masked line moves its own size and its clip keeps it in its box', () => {
	const [width, height, margin] = [120, 17, 6]
	for (const side of ['above', 'below', 'left', 'right']) {
		const { from, to } = maskedLine(side, width, height, margin)
		const axis = side === 'above' || side === 'below' ? 'y' : 'x'
		const size = axis === 'y' ? height : width
		assert.equal(Math.abs(from[axis]), size)
		assert.equal(to[axis], 0)
		// The clip's numbers, top right bottom left: the edge it enters by
		// insets the element's own move, the others reach `margin` past it.
		const insets = (clip) => clip.match(/-?[\d.]+/g).map(Number)
		const index = { above: 0, right: 1, below: 2, left: 3 }[side]
		insets(from.clipPath).forEach((value, i) => assert.equal(value, i === index ? size : -margin))
		insets(to.clipPath).forEach((value, i) => assert.equal(value, i === index ? 0 : -margin))
	}
	// Above, it comes down; from the left, it moves right.
	assert.ok(maskedLine('above', width, height).from.y < 0)
	assert.ok(maskedLine('left', width, height).from.x < 0)
	assert.throws(() => maskedLine('middle', width, height))
})

test('the camera glides geometrically and lands on its framing', () => {
	const from = { distance: 200, sensor: 12 }
	const to = { distance: 300, sensor: 18 }
	const half = framingBetween(from, to, 0.5)
	assert.ok(Math.abs(half.distance - Math.sqrt(200 * 300)) < 1e-9)
	assert.ok(Math.abs(half.sensor - Math.sqrt(12 * 18)) < 1e-9)
	assert.deepEqual(framingBetween(from, to, 0), from)
	assert.deepEqual(framingBetween(from, to, 1), to)
})

test('the HUD comes in from the center outward', () => {
	const radius = 240
	const radii = hudLayerRadii(radius)
	const order = Object.entries(radii)
		.sort((a, b) => a[1] - b[1])
		.map(([name]) => name)
	// On a desktop HUD the zoom lies on the central circle.
	assert.equal(radii.zoom, radii.line)
	assert.deepEqual(order, [
		'arcs',
		'inner',
		'line',
		'zoom',
		'aperture',
		'spin',
		'readouts',
		'outer',
	])
	// On a split HUD the zoom's circle lies past the readouts.
	const split = hudLayerRadii(radius, HUD, true)
	assert.equal(split.zoom, zoomRadius(radius, true))
	assert.ok(split.readouts < split.zoom && split.zoom < split.outer)

	// Layers on one circle share a rank.
	const ranked = outwardRanks(Object.entries(radii).map(([name, r]) => ({ name, radius: r })))
	const rank = Object.fromEntries(ranked.map(({ layer, rank }) => [layer.name, rank]))
	assert.equal(rank.arcs, 0)
	assert.equal(rank.zoom, rank.line)
	assert.equal(rank.outer, 6)
})

test('buttons come in clockwise from the top', () => {
	const points = [
		{ name: 'left', x: -1, y: 0 },
		{ name: 'bottom', x: 0, y: 1 },
		{ name: 'top', x: 0, y: -1 },
		{ name: 'right', x: 1, y: 0 },
	]
	assert.deepEqual(
		clockwise(points).map(({ name }) => name),
		['top', 'right', 'bottom', 'left'],
	)
	assert.deepEqual(
		clockwise(points, 0).map(({ name }) => name),
		['right', 'bottom', 'left', 'top'],
	)
})
