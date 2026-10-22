// PNG encoding off the main thread: the canvas is copied at once
// (createImageBitmap, while its drawing buffer is intact) and a worker draws
// the copy on an OffscreenCanvas and encodes it, so a living page (the
// Terminator glitch, a blink) goes on meanwhile. The canvas' own toBlob()
// encodes in idle time only, and a page drawing every frame has none: after
// a second it encodes all at once. Where workers cannot encode, it is the
// fallback.
let worker = null
let next = 0
const jobs = new Map()

function createWorker() {
	const created = new Worker(new URL('./pngEncoder.worker.js', import.meta.url), {
		type: 'module',
	})
	created.onmessage = ({ data }) => {
		const job = jobs.get(data.id)
		jobs.delete(data.id)
		if (data.error) job.reject(new Error(data.error))
		else job.resolve(data.blob)
	}
	return created
}

// The PNG of `canvas` as it is now, as a blob.
export function encodePng(canvas) {
	if (typeof OffscreenCanvas === 'undefined' || !OffscreenCanvas.prototype.convertToBlob)
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
	const copy = createImageBitmap(canvas)
	worker ??= createWorker()
	const id = next++
	return copy.then(
		(image) =>
			new Promise((resolve, reject) => {
				jobs.set(id, { resolve, reject })
				worker.postMessage({ id, image }, [image])
			}),
	)
}
