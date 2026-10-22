// Builds iris color lookups (src/iris/irisColor.js) off the main thread,
// about 40 ms each, for the tables src/iris/irisColorLut.js prepares ahead of
// time (the intro's shuffle of irises).
import { buildIrisColorLut } from './irisColor'

self.onmessage = ({ data }) => {
	for (const { key, model } of data) {
		const floats = buildIrisColorLut(model)
		self.postMessage({ key, floats }, [floats.buffer])
	}
}
