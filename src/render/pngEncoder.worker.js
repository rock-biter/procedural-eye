// Encodes a copy of the canvas as a PNG off the main thread
// (src/render/pngEncoder.js posts the jobs).
self.onmessage = async ({ data }) => {
	try {
		const canvas = new OffscreenCanvas(data.image.width, data.image.height)
		canvas.getContext('2d').drawImage(data.image, 0, 0)
		data.image.close()
		self.postMessage({ id: data.id, blob: await canvas.convertToBlob({ type: 'image/png' }) })
	} catch (error) {
		self.postMessage({ id: data.id, error: String(error) })
	}
}
