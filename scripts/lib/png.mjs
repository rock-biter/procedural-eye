// PNG decoding and comparison for the browser scripts (from the terrain
// project's bench): 8-bit RGB/RGBA PNGs only, which is what Chrome writes.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

// 8-bit RGB or RGBA PNG to { width, height, channels, pixels }.
export function decodePng(path) {
	const file = readFileSync(path)
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

// PSNR over RGB and the share of pixels whose largest channel differs by more than 16.
export function compareImages(pathA, pathB) {
	const a = decodePng(pathA)
	const b = decodePng(pathB)
	if (a.width !== b.width || a.height !== b.height) return null
	let squared = 0
	let changed = 0
	for (let i = 0; i < a.width * a.height; i++) {
		let largest = 0
		for (let c = 0; c < 3; c++) {
			const d = a.pixels[i * a.channels + c] - b.pixels[i * b.channels + c]
			squared += d * d
			largest = Math.max(largest, Math.abs(d))
		}
		if (largest > 16) changed++
	}
	const mse = squared / (a.width * a.height * 3)
	return { psnr: 10 * Math.log10((255 * 255) / mse), changed: changed / (a.width * a.height) }
}
