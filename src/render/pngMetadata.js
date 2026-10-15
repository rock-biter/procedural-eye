// PNG text metadata (pure): inserts a tEXt chunk after IHDR, so an exported
// image carries the state that regenerates its eye (?state=).

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

export function crc32(bytes) {
	let crc = 0xffffffff
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

export function insertPngText(png, keyword, text) {
	const encoder = new TextEncoder()
	const data = new Uint8Array([...encoder.encode(keyword), 0, ...encoder.encode(text)])
	const chunk = new Uint8Array(12 + data.length)
	const view = new DataView(chunk.buffer)
	view.setUint32(0, data.length)
	chunk.set(encoder.encode('tEXt'), 4)
	chunk.set(data, 8)
	view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
	// Signature (8) + IHDR (4 length + 4 type + 13 data + 4 crc).
	const end = 8 + 25
	const out = new Uint8Array(png.length + chunk.length)
	out.set(png.subarray(0, end), 0)
	out.set(chunk, end)
	out.set(png.subarray(end), end + chunk.length)
	return out
}

// Text chunks of a PNG as { keyword: text }.
export function readPngText(png) {
	const decoder = new TextDecoder()
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
	const result = {}
	let offset = 8
	while (offset + 8 <= png.length) {
		const length = view.getUint32(offset)
		const type = decoder.decode(png.subarray(offset + 4, offset + 8))
		if (type === 'tEXt') {
			const data = png.subarray(offset + 8, offset + 8 + length)
			const zero = data.indexOf(0)
			result[decoder.decode(data.subarray(0, zero))] = decoder.decode(data.subarray(zero + 1))
		}
		offset += 12 + length
	}
	return result
}
