import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareImages, decodePngBuffer, encodePng } from '../scripts/lib/png.mjs'

const WIDTH = 64
const HEIGHT = 48

// A smooth RGBA test image, roughly mid-grey.
function image(edit) {
	const pixels = Buffer.alloc(WIDTH * HEIGHT * 4)
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			const i = (y * WIDTH + x) * 4
			pixels[i] = 60 + x
			pixels[i + 1] = 80 + y
			pixels[i + 2] = 120
			pixels[i + 3] = 255
		}
	}
	edit?.(pixels)
	return { width: WIDTH, height: HEIGHT, channels: 4, pixels }
}

const at = (x, y) => (y * WIDTH + x) * 4

test('encodePng round-trips through the decoder', () => {
	const original = image()
	const decoded = decodePngBuffer(encodePng(WIDTH, HEIGHT, original.pixels))
	assert.equal(decoded.width, WIDTH)
	assert.equal(decoded.height, HEIGHT)
	assert.equal(decoded.channels, 4)
	assert.deepEqual(decoded.pixels, original.pixels)
})

test('identical images have no difference', () => {
	const result = compareImages(image(), image())
	assert.equal(result.psnr, Infinity)
	assert.equal(result.maxDiff, 0)
	assert.equal(result.over[0], 0)
	assert.equal(result.tileBias.max, 0)
	assert.equal(result.outliers.clusters, 0)
})

test('a uniform shift shows as a tile bias, not as outliers', () => {
	const shifted = image((pixels) => {
		for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] += 1
	})
	const result = compareImages(image(), shifted)
	assert.equal(result.maxDiff, 1)
	assert.equal(result.over[0], 1)
	assert.equal(result.over[1], 0)
	assert.ok(Math.abs(result.tileBias.max - 1) < 1e-4)
	assert.equal(result.outliers.pixels, 0)
})

test('outliers are counted in 4-connected clusters', () => {
	const spots = image((pixels) => {
		pixels[at(5, 5)] += 40
		for (let y = 20; y < 23; y++) for (let x = 30; x < 33; x++) pixels[at(x, y) + 1] += 40
		pixels[at(50, 40) + 2] -= 17
	})
	const result = compareImages(image(), spots)
	assert.equal(result.maxDiff, 40)
	assert.equal(result.outliers.clusters, 3)
	assert.equal(result.outliers.pixels, 11)
	assert.equal(result.outliers.largest, 9)
})

test('the maps mark where the images differ', () => {
	const spot = image((pixels) => {
		pixels[at(10, 12)] += 4
	})
	const { maps } = compareImages(image(), spot, { maps: true })
	assert.equal(maps.diff16[at(10, 12)], 64)
	assert.equal(maps.diff16[at(11, 12)], 0)
	assert.ok(maps.signed[at(10, 12)] > 0, 'brighter shows red')
	assert.equal(maps.signed[at(10, 12) + 2], 0)
})

test('images of different sizes are not compared', () => {
	const small = { width: 2, height: 2, channels: 4, pixels: Buffer.alloc(16) }
	assert.equal(compareImages(image(), small), null)
})
