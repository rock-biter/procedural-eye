// PNG decoding, encoding and comparison for the browser scripts (from the
// terrain project's bench): 8-bit RGB/RGBA PNGs only, which is what Chrome
// writes. compareImages() measures how far a capture strays from a baseline
// (docs/QUALITY.md, scripts/compare.mjs).
import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { crc32 } from '../../src/render/pngMetadata.js'

// 8-bit RGB or RGBA PNG bytes to { width, height, channels, pixels }.
export function decodePngBuffer(file) {
	let offset = 8
	let width = 0
	let height = 0
	let colorType = 0
	const data = []
	while (offset < file.length) {
		const length = file.readUInt32BE(offset)
		const type = file.toString('ascii', offset + 4, offset + 8)
		const chunk = file.subarray(offset + 8, offset + 8 + length)
		if (type === 'IHDR') {
			width = chunk.readUInt32BE(0)
			height = chunk.readUInt32BE(4)
			colorType = chunk[9]
		} else if (type === 'IDAT') data.push(chunk)
		offset += 12 + length
	}
	const channels = colorType === 6 ? 4 : 3
	const raw = inflateSync(Buffer.concat(data))
	const stride = width * channels
	const pixels = Buffer.alloc(height * stride)
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)]
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
		for (let x = 0; x < stride; x++) {
			const left = x >= channels ? pixels[y * stride + x - channels] : 0
			const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
			const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
			let value = line[x]
			if (filter === 1) value += left
			else if (filter === 2) value += up
			else if (filter === 3) value += (left + up) >> 1
			else if (filter === 4) {
				const estimate = left + up - upLeft
				const dLeft = Math.abs(estimate - left)
				const dUp = Math.abs(estimate - up)
				const dUpLeft = Math.abs(estimate - upLeft)
				value += dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft
			}
			pixels[y * stride + x] = value & 255
		}
	}
	return { width, height, channels, pixels }
}

export function decodePng(path) {
	return decodePngBuffer(readFileSync(path))
}

// RGBA (or RGB with `channels` 3) 8-bit pixels to PNG bytes, unfiltered.
export function encodePng(width, height, pixels, channels = 4) {
	const stride = width * channels
	const raw = Buffer.alloc(height * (stride + 1))
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0
		raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
	}
	const chunk = (type, data) => {
		const out = Buffer.alloc(12 + data.length)
		out.writeUInt32BE(data.length, 0)
		out.write(type, 4, 'ascii')
		data.copy(out, 8)
		out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
		return out
	}
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header[8] = 8
	header[9] = channels === 4 ? 6 : 2
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	])
}

const asImage = (image) => (typeof image === 'string' ? decodePng(image) : image)

// The differences between images `a` (the baseline) and `b` (decoded, or
// paths), per pixel the largest channel difference d (8-bit):
// - psnr over RGB, maxDiff, and over[k]: the share of pixels with d > k;
// - tileBias: the largest mean signed luminance difference (b − a, in 8-bit
//   steps) over a `tile`² tile, where it lies: a systematic shift, such as a
//   flipped or offset lookup, shows there while noise averages out;
// - outliers: the pixels with d > `outlier`, their 4-connected clusters and
//   the largest one (isolated pixels are noise, blobs are not).
// With `maps`, also 8-bit RGBA images of |d|×16, |d|×64, the signed
// luminance difference (red: b brighter, blue: darker, ×16), the tile biases
// (×64) and the outlier mask, for scripts/compare.mjs.
export function compareImages(imageA, imageB, { tile = 16, outlier = 16, maps = false } = {}) {
	const a = asImage(imageA)
	const b = asImage(imageB)
	if (a.width !== b.width || a.height !== b.height) return null
	const { width, height } = a
	const count = width * height
	const largest = new Uint8Array(count)
	const signed = new Float32Array(count)
	const thresholds = [0, 1, 2, 4, 16]
	const over = Object.fromEntries(thresholds.map((k) => [k, 0]))
	let squared = 0
	let maxDiff = 0
	for (let i = 0; i < count; i++) {
		let d = 0
		let lumaA = 0
		let lumaB = 0
		for (let c = 0; c < 3; c++) {
			const va = a.pixels[i * a.channels + c]
			const vb = b.pixels[i * b.channels + c]
			const delta = vb - va
			squared += delta * delta
			d = Math.max(d, Math.abs(delta))
			const weight = c === 0 ? 0.2126 : c === 1 ? 0.7152 : 0.0722
			lumaA += weight * va
			lumaB += weight * vb
		}
		largest[i] = d
		signed[i] = lumaB - lumaA
		maxDiff = Math.max(maxDiff, d)
		for (const k of thresholds) if (d > k) over[k]++
	}
	for (const k of thresholds) over[k] /= count
	const mse = squared / (count * 3)
	const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)

	const tilesX = Math.ceil(width / tile)
	const tilesY = Math.ceil(height / tile)
	const tileMeans = new Float32Array(tilesX * tilesY)
	const tileBias = { max: 0, x: 0, y: 0 }
	for (let ty = 0; ty < tilesY; ty++) {
		for (let tx = 0; tx < tilesX; tx++) {
			let sum = 0
			let n = 0
			for (let y = ty * tile; y < Math.min(height, (ty + 1) * tile); y++) {
				for (let x = tx * tile; x < Math.min(width, (tx + 1) * tile); x++) {
					sum += signed[y * width + x]
					n++
				}
			}
			const mean = sum / n
			tileMeans[ty * tilesX + tx] = mean
			if (Math.abs(mean) > Math.abs(tileBias.max)) {
				tileBias.max = mean
				tileBias.x = tx * tile
				tileBias.y = ty * tile
			}
		}
	}

	// Clusters of outliers, by flood fill.
	const label = new Int32Array(count).fill(-1)
	const stack = []
	let clusters = 0
	let largestCluster = 0
	let outlierPixels = 0
	for (let i = 0; i < count; i++) {
		if (largest[i] <= outlier || label[i] >= 0) continue
		let size = 0
		label[i] = clusters
		stack.push(i)
		while (stack.length > 0) {
			const j = stack.pop()
			size++
			const x = j % width
			const neighbors = [
				x > 0 ? j - 1 : -1,
				x < width - 1 ? j + 1 : -1,
				j >= width ? j - width : -1,
				j + width < count ? j + width : -1,
			]
			for (const k of neighbors) {
				if (k >= 0 && largest[k] > outlier && label[k] < 0) {
					label[k] = clusters
					stack.push(k)
				}
			}
		}
		clusters++
		outlierPixels += size
		largestCluster = Math.max(largestCluster, size)
	}

	const result = {
		width,
		height,
		psnr,
		maxDiff,
		over,
		tileBias,
		outliers: { pixels: outlierPixels, clusters, largest: largestCluster },
	}
	if (maps) {
		const gray = (scale) => {
			const out = Buffer.alloc(count * 4)
			for (let i = 0; i < count; i++) {
				const v = Math.min(255, largest[i] * scale)
				out[i * 4] = v
				out[i * 4 + 1] = v
				out[i * 4 + 2] = v
				out[i * 4 + 3] = 255
			}
			return out
		}
		const diverging = (value, scale, out, i) => {
			const v = Math.min(255, Math.abs(value) * scale)
			out[i * 4] = value > 0 ? v : 0
			out[i * 4 + 1] = 0
			out[i * 4 + 2] = value < 0 ? v : 0
			out[i * 4 + 3] = 255
		}
		const signedMap = Buffer.alloc(count * 4)
		const tileMap = Buffer.alloc(count * 4)
		const outlierMap = Buffer.alloc(count * 4)
		for (let i = 0; i < count; i++) {
			const x = i % width
			const y = (i - x) / width
			diverging(signed[i], 16, signedMap, i)
			diverging(tileMeans[Math.floor(y / tile) * tilesX + Math.floor(x / tile)], 64, tileMap, i)
			const v = largest[i] > outlier ? 255 : 0
			outlierMap[i * 4] = v
			outlierMap[i * 4 + 1] = v
			outlierMap[i * 4 + 2] = v
			outlierMap[i * 4 + 3] = 255
		}
		result.maps = {
			diff16: gray(16),
			diff64: gray(64),
			signed: signedMap,
			tiles: tileMap,
			outliers: outlierMap,
		}
	}
	return result
}
