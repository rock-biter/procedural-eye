// The Web Audio graph of the sound design (docs/AUDIO.md). The browser
// lets a page make sound only after a gesture, so the context is created at
// the first press or key (the recordings are fetched before, decoded then);
// a sound asked for while they decode plays if they arrive within LATE s.
// The controls' bus and the ambience's feed the master (`sound.volume`),
// which a limiter keeps under 0 dBFS; a sound may also send into the
// controls' reverb (the achievements', the awakening's). Muted, the master fades out and the
// context suspends. So does every sound while the page is hidden or the
// window has lost the focus; back, it fades in again where it was.
import { SOUNDS, SOUND_FILES, takesOf } from './soundBank'
import { impulseResponse } from './impulse'
import { beep, bowl, chime, fineTick, tick } from './synth'

const SYNTHS = { tick, beep, fine: fineTick, chime, bowl }
// The controls' reverb: a hall, darker than the glasses'.
const REVERB = { rt60: 4, bright: 6000, seed: 'controls' }
const LATE = 0.15
// The master's time constant (s) toward a new volume or mute, and back
// from a pause.
const FADE = 0.08
const RESUME_FADE = 0.3

export default class AudioEngine {
	// `params`: the live params, whose `sound` group sets the levels.
	constructor({ params, muted = false }) {
		this.params = params
		this.muted = muted
		// Hidden or out of focus (a press or a key brings the focus back).
		this.paused = false
		this.resumed = -Infinity
		this.context = null
		this.decoded = false
		this.buffers = new Map()
		this.played = {}
		this.voices = {}
		this.last = {}
		this.lastTake = {}
		this.pending = []
		// The master's last scheduled target and time constant.
		this.target = null
		this.lag = null
		// The meter of stats(), only once asked for.
		this.metered = false
		this.analyser = null
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
		document.addEventListener('visibilitychange', () => this.pause(document.hidden))
		window.addEventListener('blur', () => this.pause(true))
		window.addEventListener('focus', () => this.pause(document.hidden))
		window.addEventListener('pointerdown', () => this.pause(false), true)
	}

	// Every sound stops while `paused` (the page hidden or out of focus): the
	// master fades out, then the context suspends; back, it resumes and the
	// master fades in.
	pause(paused) {
		if (paused === this.paused) return
		this.paused = paused
		if (!this.context) return
		if (paused) {
			this.update()
			setTimeout(
				() => {
					if (this.paused) this.context.suspend()
				},
				6 * FADE * 1000,
			)
		} else if (!this.muted) {
			this.context.resume()
			this.resumed = this.context.currentTime
			this.update()
		}
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
			if (!this.muted && !this.paused && this.context.state !== 'running') this.context.resume()
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
		this.limiter = limiter
		this.master.connect(limiter).connect(context.destination)
		if (this.metered) this.insertMeter()
		this.buses = { controls: context.createGain(), ambience: context.createGain() }
		for (const bus of Object.values(this.buses)) bus.connect(this.master)
		this.reverb = null
		// The synthesized buffers now; the long ones (`lazy`) and the reverb
		// once the page is idle, or when first played.
		for (const sound of Object.values(SOUNDS))
			if (sound.synth && !sound.lazy) this.synthesize(sound)
		const later = window.requestIdleCallback ?? ((run) => setTimeout(run, 500))
		later(() => {
			for (const sound of Object.values(SOUNDS)) if (sound.lazy) this.synthesize(sound)
			this.send()
		})
		this.update()
		this.decode()
	}

	// The buffers of a synthesized sound, unless built already.
	synthesize(sound) {
		for (const key of takesOf(sound)) {
			if (this.buffers.has(key)) continue
			const [name, take] = key.split(':')
			const samples =
				take === undefined
					? SYNTHS[name](this.context.sampleRate)
					: SYNTHS[name](this.context.sampleRate, Number(take))
			this.buffers.set(key, { buffer: this.buffer(samples), offset: 0 })
		}
	}

	// The controls' reverb, made at its first use, into their bus.
	send() {
		if (this.reverb) return this.reverb
		const rate = this.context.sampleRate
		const [left, right] = impulseResponse(rate, REVERB)
		const impulse = this.context.createBuffer(2, left.length, rate)
		impulse.copyToChannel(left, 0)
		impulse.copyToChannel(right, 1)
		this.reverb = this.context.createConvolver()
		this.reverb.normalize = false
		this.reverb.buffer = impulse
		this.reverb.connect(this.buses.controls)
		return this.reverb
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

	// Plays the sound `name` (src/audio/soundBank.js) on the controls bus,
	// `delay` s from now: `gain` on top of its params level, `rate` before its
	// variation, `pan` from −1 (left) to 1. Returns its source, or null.
	play(name, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
		const sound = SOUNDS[name]
		const levels = this.params.sound
		const level = gain * levels.volumes[sound.gain]
		if (!this.context || this.muted || level <= 0) return null
		if (!this.ready && !sound.synth) {
			this.pending.push({
				name,
				options: { gain, rate, pan, delay },
				time: performance.now() / 1000,
			})
			return null
		}
		const now = this.context.currentTime + delay
		// Too soon after the last: its level adds to that one's.
		const last = this.last[name]
		if (last && now - last.time < sound.gap) {
			last.level = Math.min(last.level + level * 0.5, last.level * 2)
			last.gain.gain.setValueAtTime(last.level, now)
			return null
		}
		if ((this.voices[name] ?? 0) >= sound.voices) return null
		if (sound.lazy) this.synthesize(sound)
		const { buffer, offset } = this.buffers.get(this.take(name, takesOf(sound))) ?? {}
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
		// Its share sent into the reverb (`reverb`).
		let wet = null
		if (sound.reverb) {
			wet = this.context.createGain()
			wet.gain.value = sound.reverb
			output.connect(wet).connect(this.send())
		}
		source.start(now, offset)
		this.voices[name] = (this.voices[name] ?? 0) + 1
		source.onended = () => {
			this.voices[name]--
			panner.disconnect()
			wet?.disconnect()
		}
		this.last[name] = { time: now, gain: output, level: output.gain.value }
		this.played[name] = (this.played[name] ?? 0) + 1
		return source
	}

	// One of `takes` (the keys of a sound's buffers) other than its last one.
	take(name, takes) {
		let index = Math.floor(Math.random() * takes.length)
		if (takes.length > 1 && index === this.lastTake[name]) index = (index + 1) % takes.length
		this.lastTake[name] = index
		return takes[index]
	}

	setMuted(muted) {
		this.muted = muted
		if (!this.context) return
		if (!muted && !this.paused) this.context.resume()
		this.update()
		if (muted)
			setTimeout(
				() => {
					if (this.muted) this.context.suspend()
				},
				6 * FADE * 1000,
			)
	}

	// Once a frame: the master volume from the params (none muted or paused),
	// scheduled again only when it or its time constant changes (the same
	// target from the current value is the same exponential); with the meter
	// (stats()), the loudest sample and the power of the master since the last
	// stats().
	update() {
		if (!this.context) return
		const now = this.context.currentTime
		const silent = this.muted || this.paused
		const lag = !silent && now - this.resumed < 1 ? RESUME_FADE : FADE
		const target = silent ? 0 : this.params.sound.volume
		if (target !== this.target || lag !== this.lag) {
			this.target = target
			this.lag = lag
			this.master.gain.setTargetAtTime(target, now, lag)
		}
		if (!this.analyser) return
		this.analyser.getFloatTimeDomainData(this.samples)
		for (const sample of this.samples) {
			this.peak = Math.max(this.peak, Math.abs(sample))
			this.power.sum += sample * sample
		}
		this.power.count += this.samples.length
	}

	// The meter of stats() (the development tools): an analyser after the
	// limiter, read once a frame from then on. Off the graph otherwise.
	enableMeter() {
		this.metered = true
		if (this.context && !this.analyser) this.insertMeter()
	}

	insertMeter() {
		this.analyser = this.context.createAnalyser()
		this.analyser.fftSize = 2048
		this.samples = new Float32Array(this.analyser.fftSize)
		this.limiter.disconnect()
		this.limiter.connect(this.analyser).connect(this.context.destination)
	}

	// The context's state, the mute and the pause, how often each sound
	// played, and the peak and the RMS level of the master (dBFS, sampled once
	// a frame, from the first call on) since the last call.
	stats() {
		this.enableMeter()
		const decibels = (amplitude) => (amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity)
		const stats = {
			state: this.context?.state ?? 'none',
			ready: this.ready,
			muted: this.muted,
			paused: this.paused,
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
