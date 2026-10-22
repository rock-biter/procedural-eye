// Builds the blink's frames (src/adnexa/blinkFrames.js) off the main thread:
// about a second and a half of work after a lid rebuild, which would stall
// the frame loop (src/adnexa/lidBlink.js posts the jobs).
import { createBlinkFrames, frameBuffers } from './blinkFrames'

self.onmessage = ({ data }) => {
	const frames = createBlinkFrames(data.params, { lids: data.lids, layout: data.layout })
	self.postMessage({ id: data.id, ...frames }, frameBuffers(frames))
}
