// The drone's reverb (docs/AUDIO.md): a synthetic impulse response of a
// large soft room for a ConvolverNode, two channels of seeded noise under an
// exponential decay that falls 60 dB in `rt60` s, after a short `predelay`.
// Its highs die sooner: a one-pole low-pass closes along the tail, from about
// `bright` Hz at the start to a sixth of it at the end.
import { createRandom } from '../random'

export function impulseResponse(
	rate,
	{ rt60 = 4.5, predelay = 0.012, bright = 9000, seed = 'reverb' } = {},
) {
	const length = Math.round((predelay + rt60) * rate)
	const delay = Math.round(predelay * rate)
	const channels = [0, 1].map((channel) => {
		const random = createRandom(`${seed}:${channel}`)
		const out = new Float32Array(length)
		let low = 0
		for (let i = delay; i < length; i++) {
			const t = (i - delay) / rate
			const cutoff = bright / (1 + (5 * t) / rt60)
			const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate)
			low += k * (random() * 2 - 1 - low)
			// 60 dB down at rt60; a 5 ms fade-in avoids a click at the onset.
			out[i] = low * Math.exp((-6.91 * t) / rt60) * Math.min(t / 0.005, 1)
		}
		return out
	})
	// Unit energy per channel, so the wet level does not depend on the length.
	for (const channel of channels) {
		const energy = Math.sqrt(channel.reduce((sum, v) => sum + v * v, 0))
		for (let i = 0; i < channel.length; i++) channel[i] /= energy
	}
	return channels
}
