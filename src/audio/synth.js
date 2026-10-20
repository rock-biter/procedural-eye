// The synthesized sounds of the foley and the drone (docs/AUDIO.md), as
// mono sample buffers at `rate` Hz that src/audio/audioEngine.js wraps in
// AudioBuffers: seeded, so every load sounds the same.
import { createRandom } from '../random'

// White noise, `seconds` long, for the looped noise voices.
export function noise(rate, seconds, seed = 'noise') {
	const random = createRandom(seed)
	return Float32Array.from({ length: Math.round(rate * seconds) }, () => random() * 2 - 1)
}

// Pink-ish noise (Paul Kellet's economy filter over white noise), for the air
// under the drone; normalized to a peak of 1.
export function pinkNoise(rate, seconds, seed = 'pink') {
	const white = noise(rate, seconds, seed)
	let b0 = 0
	let b1 = 0
	let b2 = 0
	const pink = white.map((w) => {
		b0 = 0.99765 * b0 + w * 0.099046
		b1 = 0.963 * b1 + w * 0.2965164
		b2 = 0.57 * b2 + w * 1.0526913
		return b0 + b1 + b2 + w * 0.1848
	})
	return normalize(pink)
}

// The grit of a ring turned by hand: sparse clicks of random height, about
// `density` a second, each a couple of samples of decaying noise. Played
// faster, they come denser and higher.
export function grit(rate, seconds, density = 90, seed = 'grit') {
	const random = createRandom(seed)
	const out = new Float32Array(Math.round(rate * seconds))
	const decay = Math.exp(-1 / (0.0008 * rate))
	let i = Math.floor((random() * rate) / density)
	while (i < out.length) {
		const height = 0.2 + 0.8 * random() ** 2
		let amplitude = height
		for (let j = i; j < out.length && amplitude > 1e-3; j++) {
			out[j] += amplitude * (random() * 2 - 1)
			amplitude *= decay
		}
		i += 1 + Math.floor((-Math.log(1 - random()) * rate) / density)
	}
	return normalize(out)
}

// The hover's tick: a 4 ms burst of high noise, decaying fast.
export function tick(rate, seed = 'tick') {
	const random = createRandom(seed)
	const length = Math.round(0.004 * rate)
	let previous = 0
	const out = Float32Array.from({ length }, (_, i) => {
		const white = random() * 2 - 1
		// A first difference: the noise loses its lows.
		const high = white - previous
		previous = white
		return high * Math.exp(-i / (0.0008 * rate))
	})
	return normalize(out)
}

// The autofocus confirmation: two 2.8 kHz blips of 55 ms, 45 ms apart, each
// with 3 ms ramps.
export function beep(rate, frequency = 2800) {
	const on = 0.055
	const gap = 0.045
	const ramp = 0.003
	const out = new Float32Array(Math.round((2 * on + gap) * rate))
	for (const start of [0, on + gap]) {
		const first = Math.round(start * rate)
		const length = Math.round(on * rate)
		for (let i = 0; i < length; i++) {
			const t = i / rate
			const envelope = Math.min(t / ramp, (on - t) / ramp, 1)
			out[first + i] = Math.sin(2 * Math.PI * frequency * t) * envelope
		}
	}
	return out
}

function normalize(x) {
	const peak = x.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
	return peak > 0 ? x.map((v) => v / peak) : x
}
