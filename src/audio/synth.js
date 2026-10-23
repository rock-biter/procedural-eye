// The synthesized sounds of the foley and the glass harp's friction
// (docs/AUDIO.md), as mono sample buffers at `rate` Hz that
// src/audio/audioEngine.js wraps in AudioBuffers: seeded, so every load sounds
// the same.
import { createRandom } from '../random'

// White noise, `seconds` long: the glasses' friction (src/audio/ambience.js).
export function noise(rate, seconds, seed = 'noise') {
	const random = createRandom(seed)
	return Float32Array.from({ length: Math.round(rate * seconds) }, () => random() * 2 - 1)
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

// A struck partial: `amplitude`, `frequency` (Hz), `decay` (s), `phase`.
const partial = (amplitude, frequency, decay, phase = 0) => ({ amplitude, frequency, decay, phase })

// Adds `partials`, struck `start` s in, to `out` at `rate` Hz, each under
// `envelope(t)` (by default an `attack` s ramp) times its exponential decay.
// Each is a rotating phasor, so a long buffer costs no sines.
function strike(out, rate, start, partials, attack = 0.002, envelope = null) {
	const first = Math.round(start * rate)
	const ramp = Math.round(attack * rate)
	for (const { amplitude, frequency, decay, phase } of partials) {
		const step = (2 * Math.PI * frequency) / rate
		const cosStep = Math.cos(step)
		const sinStep = Math.sin(step)
		const damping = Math.exp(-1 / (decay * rate))
		let c = Math.cos(phase)
		let s = Math.sin(phase)
		let level = amplitude
		const end = Math.min(out.length, first + Math.ceil(decay * 9 * rate))
		for (let i = first; i < end; i++) {
			const j = i - first
			const shape = envelope ? envelope(j / rate) : j < ramp ? j / ramp : 1
			out[i] += level * s * shape
			const next = c * cosStep - s * sinStep
			s = s * cosStep + c * sinStep
			c = next
			level *= damping
		}
	}
}

// A small metal knock: a 0.6 ms burst of noise ringing three modes (about
// 2.3, 3.7 and 5.6 kHz, dying in 6, 4 and 2.5 ms), `start` s in.
function knock(out, rate, start, random, amplitude) {
	const first = Math.round(start * rate)
	const burst = Math.round(0.0006 * rate)
	for (let i = 0; i < burst; i++) out[first + i] += amplitude * (random() * 2 - 1) * (1 - i / burst)
	strike(
		out,
		rate,
		start,
		[
			partial(amplitude, 2300 * (0.95 + 0.1 * random()), 0.006, random() * 6),
			partial(0.7 * amplitude, 3700 * (0.95 + 0.1 * random()), 0.004, random() * 6),
			partial(0.45 * amplitude, 5600 * (0.95 + 0.1 * random()), 0.0025, random() * 6),
		],
		0.0002,
	)
}

// A task of the checklist done (the foley's `unlock`): a
// latch springing open, two small metal knocks 40 ms apart, then a glass
// struck twice, a fifth up: D6 then A6 (the glass harp's key D, which the
// foley's rate moves to the key played), each with the inharmonic overtones
// of a glass (2.32 and 4.25 times), dying in 1.1 s; 2.6 s in all, the last
// half second faded out.
export function chime(rate, seed = 'chime') {
	const random = createRandom(seed)
	const out = new Float32Array(Math.round(2.6 * rate))
	knock(out, rate, 0, random, 0.35)
	knock(out, rate, 0.04, random, 0.3)
	const glass = (frequency, amplitude) => [
		partial(amplitude, frequency, 1.1, random() * 6),
		partial(0.3 * amplitude, frequency * 2.32, 0.45, random() * 6),
		partial(0.1 * amplitude, frequency * 4.25, 0.2, random() * 6),
	]
	strike(out, rate, 0.07, glass(1174.66, 1), 0.0015)
	strike(out, rate, 0.18, glass(1760, 0.85), 0.0015)
	fadeOut(out, Math.round(0.5 * rate))
	return normalize(out)
}

// Fades the last `count` samples of `out` to nothing (a raised cosine).
function fadeOut(out, count) {
	for (let i = 0; i < count; i++)
		out[out.length - count + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / count)
}

// The awakening of the Sharingan (the foley's `gong`): a large singing bowl
// struck once, its fundamental D3 (the key D, as the chime). Its five
// lowest modes stand as a thin bowl's (2.83, 5.42, 8.77 and 12.87 times the
// first), each a pair a little apart, so it beats slowly (0.8 to 3.4 Hz),
// the higher ones fainter and shorter; under them a sub-octave blooms in
// over a third of a second, as a gong's body, and a shimmer of six high
// partials swells for half a second and dies; the mallet's soft thump and a
// click start it. 9 s, the last 1.5 faded out.
export function bowl(rate, seed = 'bowl') {
	const random = createRandom(seed)
	const out = new Float32Array(Math.round(9 * rate))
	const fundamental = 146.83
	const modes = [
		[1, 1, 6.5, 0.8],
		[2.83, 0.5, 4.5, 1.3],
		[5.42, 0.3, 2.8, 2.1],
		[8.77, 0.16, 1.6, 2.8],
		[12.87, 0.08, 1, 3.4],
	]
	const pairs = modes.flatMap(([ratio, amplitude, decay, beat]) => [
		partial(amplitude / 2, fundamental * ratio - beat / 2, decay, random() * 6),
		partial(amplitude / 2, fundamental * ratio + beat / 2, decay, random() * 6),
	])
	strike(out, rate, 0, pairs, 0.004)
	// The sub-octave blooming in: a slow attack.
	strike(out, rate, 0, [partial(0.45, fundamental / 2, 4, random() * 6)], 0.35)
	// The shimmer: t·e^(1 − t/0.5) / 0.5, at its height half a second in
	// (its decay the e^(−t/0.5)).
	const shimmer = Array.from({ length: 6 }, () =>
		partial(0.06 * Math.E, 1100 + 1800 * random(), 0.5, random() * 6),
	)
	strike(out, rate, 0, shimmer, 0, (t) => t / 0.5)
	// The mallet: a soft thump (noise through a 600 Hz low-pass, dying in
	// 12 ms) and a 1.5 ms click.
	const k = 1 - Math.exp((-2 * Math.PI * 600) / rate)
	let low = 0
	const thump = Math.round(0.08 * rate)
	for (let i = 0; i < thump; i++) {
		const t = i / rate
		low += k * (random() * 2 - 1 - low)
		out[i] += 4 * low * Math.exp(-t / 0.012) + (t < 0.0015 ? 0.3 * (random() * 2 - 1) : 0)
	}
	fadeOut(out, Math.round(1.5 * rate))
	return normalize(out)
}
