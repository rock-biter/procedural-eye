// The synthesized sounds of the foley (docs/AUDIO.md), as mono sample
// buffers at `rate` Hz that src/audio/audioEngine.js wraps in AudioBuffers:
// seeded, so every load sounds the same.
import { createRandom } from '../random'

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

// A fine detent: a tooth a fraction of a millimeter high snapping past its
// pawl. A 0.25 ms knock of noise rings three small metal modes (about 4.2,
// 6.9 and 9.8 kHz, dying in 1.4, 0.9 and 0.6 ms), each `take` tuned a little
// differently; 6 ms in all.
export function fineTick(rate, take = 0) {
	const random = createRandom(`fine:${take}`)
	const modes = [
		[4200, 0.0014, 1],
		[6900, 0.0009, 0.7],
		[9800, 0.0006, 0.45],
	].map(([frequency, decay, amplitude]) => ({
		frequency: frequency * (0.92 + 0.16 * random()),
		decay,
		amplitude,
		phase: random() * 2 * Math.PI,
	}))
	const knock = Math.round(0.00025 * rate)
	const out = Float32Array.from({ length: Math.round(0.006 * rate) }, (_, i) => {
		const t = i / rate
		let value = i < knock ? 0.6 * (random() * 2 - 1) * (1 - i / knock) : 0
		for (const mode of modes)
			value +=
				mode.amplitude *
				Math.exp(-t / mode.decay) *
				Math.sin(2 * Math.PI * mode.frequency * t + mode.phase)
		return value
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
