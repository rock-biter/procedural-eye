// The Web Audio graph of the sound design (docs/AUDIO.md). The browser
// lets a page make sound only after a gesture, so the context is created at
// the first press or key (the recordings are fetched before, decoded then);
// a sound asked for while they decode plays if they arrive within LATE s.
// Two buses, the controls' foley and the ambient drone, meet in the master,
// which a limiter keeps under 0 dBFS. Muted, the master fades out and the
// context suspends; a hidden page suspends it too.
import { SOUNDS, SOUND_FILES } from './soundBank'
import { beep, tick } from './synth'

const SYNTHS = { tick, beep }
const LATE = 0.15
// The master's time constant (s) toward a new volume or mute.
const FADE = 0.08

export default class AudioEngine {
	// `params`: the live params, whose `sound` group sets the levels.
	constructor({ params, muted = false }) {
		this.params = params
		this.muted = muted
		this.context = null
		this.decoded = false
		this.buffers = new Map()
		this.played = {}
		this.voices = {}
		this.last = {}
		this.lastTake = {}
		this.pending = []
		this.peak = 0
		this.power = { sum: 0, count: 0 }
		this.readyListeners = []
		// Fetched now, decoded once there is a context.
		this.files = new Map(
			SOUND_FILES.map((url) => [
				url,
				fetch(url)
					.then((response) => (response.ok ? response.arrayBuffer() : null))
					.catch(() => null),
			]),
		)
		this.onGesture = () => {
			if (!this.muted) this.unlock()
		}
		window.addEventListener('pointerdown', this.onGesture, true)
		window.addEventListener('keydown', this.onGesture, true)
		document.addEventListener('visibilitychange', () => {
			if (!this.context) return
			if (document.hidden) this.context.suspend()
			else if (!this.muted) this.context.resume()
		})
	}

	get ready() {
		return this.context !== null && this.decoded
	}

	// Calls `listener(context)` once the sounds are decoded (at once if they are).
	onReady(listener) {
		if (this.ready) listener(this.context)
		else this.readyListeners.push(listener)
	}

	// Creates (or resumes) the context; call it from a gesture.
	unlock() {
		if (this.context) {
			if (!this.muted && this.context.state !== 'running') this.context.resume()
			return
		}
		window.removeEventListener('pointerdown', this.onGesture, true)
		window.removeEventListener('keydown', this.onGesture, true)
		const context = new AudioContext({ latencyHint: 'interactive' })
		this.context = context
		this.master = context.createGain()
		this.master.gain.value = 0
		const limiter = context.createDynamicsCompressor()
		limiter.threshold.value = -6
		limiter.knee.value = 6
		limiter.ratio.value = 12
		limiter.attack.value = 0.002
		limiter.release.value = 0.15
		this.analyser = context.createAnalyser()
		this.analyser.fftSize = 2048
		this.samples = new Float32Array(this.analyser.fftSize)
		this.master.connect(limiter).connect(this.analyser).connect(context.destination)
		this.buses = {
			controls: context.createGain(),
			ambient: context.createGain(),
		}
		for (const [name, bus] of Object.entries(this.buses)) {
			bus.gain.value = this.params.sound[name]
			bus.connect(this.master)
		}
		for (const [name, generate] of Object.entries(SYNTHS))
			this.buffers.set(name, { buffer: this.buffer(generate(context.sampleRate)), offset: 0 })
		this.update()
		this.decode()
	}

	async decode() {
		await Promise.all(
			[...this.files].map(async ([url, fetched]) => {
				const data = await fetched
				if (!data) return console.warn(`Sound ${url} did not load`)
				const buffer = await this.context.decodeAudioData(data)
				this.buffers.set(url, { buffer, offset: leading(buffer) })
			}),
		)
		this.decoded = true
		for (const listener of this.readyListeners) listener(this.context)
		this.readyListeners = []
		const now = performance.now() / 1000
		for (const { name, options, time } of this.pending)
			if (now - time < LATE) this.play(name, options)
		this.pending = []
	}

	// A mono AudioBuffer of `samples` at the context's rate.
	buffer(samples) {
		const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate)
		buffer.copyToChannel(samples, 0)
		return buffer
	}

	// Plays the sound `name` (src/audio/soundBank.js) on the controls bus:
	// `gain` on top of its params level, `rate` before its variation, `pan`
	// from −1 (left) to 1. Returns its source, or null.
	play(name, { gain = 1, rate = 1, pan = 0 } = {}) {
		const sound = SOUNDS[name]
		const levels = this.params.sound
		const level = gain * levels[sound.gain]
		if (!this.context || this.muted || level <= 0) return null
		if (!this.ready && !sound.synth) {
			this.pending.push({ name, options: { gain, rate, pan }, time: performance.now() / 1000 })
			return null
		}
		const now = this.context.currentTime
		// Too soon after the last: its level adds to that one's.
		const last = this.last[name]
		if (last && now - last.time < sound.gap) {
			last.level = Math.min(last.level + level * 0.5, last.level * 2)
			last.gain.gain.setValueAtTime(last.level, now)
			return null
		}
		if ((this.voices[name] ?? 0) >= sound.voices) return null
		const { buffer, offset } = this.buffers.get(sound.synth ?? this.take(name, sound)) ?? {}
		if (!buffer) return null
		const source = this.context.createBufferSource()
		source.buffer = buffer
		const cents = (Math.random() * 2 - 1) * levels.variation * sound.vary
		source.playbackRate.value = rate * 2 ** (cents / 1200)
		const output = this.context.createGain()
		output.gain.value = level * 10 ** (((Math.random() * 2 - 1) * 1.5 * sound.vary) / 20)
		const panner = this.context.createStereoPanner()
		panner.pan.value = Math.max(-1, Math.min(1, pan))
		source.connect(output).connect(panner).connect(this.buses.controls)
		source.start(now, offset)
		this.voices[name] = (this.voices[name] ?? 0) + 1
		source.onended = () => {
			this.voices[name]--
			panner.disconnect()
		}
		this.last[name] = { time: now, gain: output, level: output.gain.value }
		this.played[name] = (this.played[name] ?? 0) + 1
		return source
	}

	// A take of `sound` other than its last one.
	take(name, { takes }) {
		let index = Math.floor(Math.random() * takes.length)
		if (takes.length > 1 && index === this.lastTake[name]) index = (index + 1) % takes.length
		this.lastTake[name] = index
		return takes[index]
	}

	// The looped sound `name`, silent, playing on the controls bus: its gain
	// node and its playbackRate for the caller to drive. Null before the
	// sounds are decoded.
	loop(name) {
		const sound = SOUNDS[name]
		const { buffer } = (this.ready && this.buffers.get(sound.takes[0])) ?? {}
		if (!buffer) return null
		const source = this.context.createBufferSource()
		source.buffer = buffer
		source.loop = true
		const gain = this.context.createGain()
		gain.gain.value = 0
		source.connect(gain).connect(this.buses.controls)
		source.start()
		return { gain, rate: source.playbackRate, level: () => this.params.sound[sound.gain] }
	}

	// A looped noise source of `samples` (src/audio/synth.js), not connected.
	noise(samples) {
		const source = this.context.createBufferSource()
		source.buffer = this.buffer(samples)
		source.loop = true
		source.start()
		return source
	}

	setMuted(muted) {
		this.muted = muted
		if (!this.context) return
		if (!muted) this.context.resume()
		this.update()
		if (muted)
			setTimeout(
				() => {
					if (this.muted) this.context.suspend()
				},
				6 * FADE * 1000,
			)
	}

	// Once a frame: the levels of the master and the buses from the params,
	// and the loudest sample and the power of the master since the last
	// stats().
	update() {
		if (!this.context) return
		const { volume, controls, ambient } = this.params.sound
		const now = this.context.currentTime
		this.master.gain.setTargetAtTime(this.muted ? 0 : volume, now, FADE)
		this.buses.controls.gain.setTargetAtTime(controls, now, FADE)
		this.buses.ambient.gain.setTargetAtTime(ambient, now, FADE)
		this.analyser.getFloatTimeDomainData(this.samples)
		for (const sample of this.samples) {
			this.peak = Math.max(this.peak, Math.abs(sample))
			this.power.sum += sample * sample
		}
		this.power.count += this.samples.length
	}

	// The context's state, the mute, how often each sound played, and the
	// peak and the RMS level of the master (dBFS, sampled once a frame) since
	// the last call.
	stats() {
		const decibels = (amplitude) => (amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity)
		const stats = {
			state: this.context?.state ?? 'none',
			ready: this.ready,
			muted: this.muted,
			played: { ...this.played },
			peak: decibels(this.peak),
			rms: decibels(Math.sqrt(this.power.sum / Math.max(this.power.count, 1))),
		}
		this.peak = 0
		this.power = { sum: 0, count: 0 }
		return stats
	}
}

// Where a decoded buffer's sound starts (s): 1 ms before it first comes within
// 40 dB of its peak, past any silence a decoder put before it.
function leading(buffer) {
	const samples = buffer.getChannelData(0)
	let peak = 0
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
	const index = samples.findIndex((sample) => Math.abs(sample) > peak * 0.01)
	return Math.max(index / buffer.sampleRate - 0.001, 0)
}
