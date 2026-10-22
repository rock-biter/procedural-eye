// The ambience (docs/AUDIO.md): a glass harp, wine glasses rubbed with a wet
// finger, far off in a long reverb. A few quiet glasses (`sound.glasses` at
// once) keep singing in turn, each note chosen to sound well with the others
// (src/audio/soundscape.js); now and then (`sound.leadRate` a minute) a
// louder one rises over them. It fades in slowly (`sound.fadeIn`) once the
// sound starts at the first gesture, and again after a mute; the engine
// pauses it with the rest.
import { createRandom } from '../random'
import { impulseResponse } from './impulse'
import {
	GLASS_HARMONICS,
	fadeCurve,
	frequency,
	glassNotes,
	glassVoice,
	nextLoudGlass,
	nextQuietGlass,
	pickNote,
} from './soundscape'
import { noise } from './synth'

// The peak of a quiet glass and of a louder one, before their volumes.
const QUIET_PEAK = 0.08
const LOUD_PEAK = 0.24
// How much of the glasses rings dry; all of it goes through the reverb.
const DRY = 0.35
// The finger's friction: a whisper of noise in a narrow band on the note
// (about 35 dB under the tone).
const FRICTION = 0.5
const FRICTION_Q = 30

export default class Ambience {
	constructor(engine) {
		this.engine = engine
		this.params = engine.params
		this.voices = []
		this.quietAt = null
		this.loudAt = null
		this.wasMuted = engine.muted
		this.random = createRandom(`glasses:${Math.random()}`)
		engine.onReady((context) => this.build(context))
	}

	build(context) {
		const rate = context.sampleRate
		this.output = context.createGain()
		this.output.connect(this.engine.buses.ambience)
		// The glasses: a little dry, all of them through a long, dark reverb.
		const glasses = context.createGain()
		const dry = context.createGain()
		dry.gain.value = DRY
		const reverb = context.createConvolver()
		reverb.normalize = false
		const [left, right] = impulseResponse(rate, { rt60: 7, bright: 5000, seed: 'glasses' })
		const impulse = context.createBuffer(2, left.length, rate)
		impulse.copyToChannel(left, 0)
		impulse.copyToChannel(right, 1)
		reverb.buffer = impulse
		glasses.connect(dry).connect(this.output)
		glasses.connect(reverb).connect(this.output)
		// Quiet and louder glasses on their own volumes.
		this.quiet = context.createGain()
		this.loud = context.createGain()
		this.quiet.connect(glasses)
		this.loud.connect(glasses)
		// The friction's noise, one looped source shared by every glass.
		this.friction = context.createBufferSource()
		this.friction.buffer = this.engine.buffer(noise(rate, 3, 'glasses'))
		this.friction.loop = true
		this.friction.start()
		this.fadeIn()
	}

	// The whole ambience from silence, over `sound.fadeIn` s; the first glass
	// starts at once.
	fadeIn() {
		const now = this.engine.context.currentTime
		const gain = this.output.gain
		gain.cancelScheduledValues(now)
		gain.setValueAtTime(0, now)
		const seconds = this.params.sound.fadeIn
		if (seconds > 0) gain.setValueCurveAtTime(fadeCurve(), now, seconds)
		else gain.setValueAtTime(1, now)
		this.quietAt = now
	}

	// Once a frame: the volumes, a fade in after a mute, and the next glass
	// due, quiet or louder.
	update() {
		const context = this.engine.context
		if (!this.output || !context) return
		const now = context.currentTime
		const sound = this.params.sound
		if (this.wasMuted && !this.engine.muted) this.fadeIn()
		this.wasMuted = this.engine.muted
		this.quiet.gain.setTargetAtTime(sound.volumes.glasses, now, 0.1)
		this.loud.gain.setTargetAtTime(sound.volumes.lead, now, 0.1)
		this.voices = this.voices.filter((voice) => voice.end > now)

		// A quiet glass whenever fewer than `sound.glasses` are still rising
		// or singing (a glass ringing on after the finger lifts leaves room).
		const singing = this.voices.filter((voice) => !voice.lead && voice.lifts > now).length
		if (singing < sound.glasses && now >= this.quietAt) {
			this.sing(false, now + 0.05)
			this.quietAt = now + nextQuietGlass(this.random)
		}
		if (sound.leadRate <= 0) {
			this.loudAt = null
			return
		}
		this.loudAt ??= now + nextLoudGlass(this.random, sound.leadRate)
		if (now >= this.loudAt && !this.voices.some((voice) => voice.lead && voice.lifts > now)) {
			this.sing(true, now + 0.05)
			this.loudAt = now + nextLoudGlass(this.random, sound.leadRate)
		}
	}

	// One glass at `time`, quiet or louder (`lead`), on a note that sounds
	// well with those singing.
	sing(lead, time) {
		const context = this.engine.context
		const notes = glassNotes(this.params.sound.glassKey)
		const sounding = this.voices.map((voice) => voice.midi)
		const midi = pickNote(this.random, notes, sounding, lead)
		if (midi === null) return
		const voice = glassVoice(this.random, lead)
		const fundamental = frequency(midi)
		const peak = voice.level * (lead ? LOUD_PEAK : QUIET_PEAK)
		const lifts = time + voice.attack + voice.hold
		const end = lifts + 7 * voice.release

		// The envelope: a sin² rise, a hold, then the ring dying away.
		const envelope = context.createGain()
		envelope.gain.setValueAtTime(0, time)
		envelope.gain.setValueCurveAtTime(
			fadeCurve(32).map((v) => v * peak),
			time,
			voice.attack,
		)
		envelope.gain.setTargetAtTime(0, lifts, voice.release)
		// The finger's swell: the level breathing around its envelope.
		const swell = context.createGain()
		swell.gain.value = 1 - voice.swellDepth / 2
		const swellRate = context.createOscillator()
		swellRate.frequency.value = voice.swellRate
		const swellDepth = context.createGain()
		swellDepth.gain.value = voice.swellDepth / 2
		swellRate.connect(swellDepth).connect(swell.gain)
		const panner = context.createStereoPanner()
		panner.pan.value = voice.pan
		swell
			.connect(envelope)
			.connect(panner)
			.connect(lead ? this.loud : this.quiet)

		// The tone: the fundamental and its beating twin, and the harmonics.
		const nyquist = context.sampleRate / 2
		const partials = [
			[fundamental, 1 - voice.twin],
			[fundamental + voice.beat, voice.twin],
			...GLASS_HARMONICS.map(([order, level]) => [fundamental * order, level * voice.brightness]),
		]
		const sources = [swellRate]
		for (const [hz, level] of partials) {
			if (hz > 0.9 * nyquist) continue
			const oscillator = context.createOscillator()
			oscillator.frequency.value = hz
			const gain = context.createGain()
			gain.gain.value = level
			oscillator.connect(gain).connect(swell)
			sources.push(oscillator)
		}
		// The friction: the shared noise through a narrow band on the note,
		// only while the finger rubs.
		const band = context.createBiquadFilter()
		band.type = 'bandpass'
		band.frequency.value = fundamental
		band.Q.value = FRICTION_Q
		const rub = context.createGain()
		rub.gain.setValueAtTime(0, time)
		rub.gain.linearRampToValueAtTime(FRICTION * voice.brightness, time + voice.attack)
		rub.gain.setTargetAtTime(0, lifts, 0.08)
		this.friction.connect(band).connect(rub).connect(swell)

		for (const source of sources) {
			source.start(time)
			source.stop(end)
		}
		// Once the glass has died away, its nodes go.
		sources[0].onended = () => {
			band.disconnect()
			panner.disconnect()
		}
		this.voices.push({ midi, lead, lifts, end })
		const name = lead ? 'glass-lead' : 'glass'
		this.engine.played[name] = (this.engine.played[name] ?? 0) + 1
	}
}
