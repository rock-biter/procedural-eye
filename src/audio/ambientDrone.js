// The ambient drone (docs/AUDIO.md): a slow pad of five voices on the
// harmony of the eye's seed (src/audio/droneHarmony.js), each two detuned
// oscillators breathing with a slow seeded swell, through one low-pass into
// a dry path and a long reverb, over a faint bed of air. It follows the eye
// without accents: the pupil opens and closes the low-pass (constricted,
// brighter; dilated, darker), a blink muffles it as the lids close, the zoom
// draws it near (drier) or far (wetter). Every `sound.droneChord` s the voices
// glide to the next chord; a new eye glides them to its own harmony. Photo
// mode holds it: the swells stop where they are, no chord changes, 4 dB down.
import { follow } from '../camera/orbitMotion'
import { createRandom } from '../random'
import { VOICES, droneHarmony, frequency, voiceLead } from './droneHarmony'
import { impulseResponse } from './impulse'
import { pinkNoise } from './synth'

// The glide between chords and the fade in at the start (s).
const GLIDE = 6
const FADE_IN = 4
// Each voice's level and the air's, under the bus.
const VOICE_LEVEL = 0.025
const AIR_LEVEL = 0.012
// The pupil's range (mm) the low-pass spans, and the swell's periods (s).
const PUPIL = [2, 7]
const SWELL = [7, 17]

export default class AmbientDrone {
	constructor(engine) {
		this.engine = engine
		this.params = engine.params
		this.seed = null
		this.chord = 0
		this.notes = null
		this.elapsed = 0
		this.frozen = false
		this.cutoff = null
		engine.onReady((context) => this.build(context))
	}

	build(context) {
		const bus = this.engine.buses.ambient
		const rate = context.sampleRate
		this.output = context.createGain()
		this.output.gain.value = 0
		this.output.gain.setTargetAtTime(1, context.currentTime, FADE_IN / 3)
		this.output.connect(bus)

		this.filter = context.createBiquadFilter()
		this.filter.type = 'lowpass'
		this.filter.Q.value = 0.5
		this.dry = context.createGain()
		this.wet = context.createGain()
		const reverb = context.createConvolver()
		reverb.normalize = false
		const [left, right] = impulseResponse(rate)
		const impulse = context.createBuffer(2, left.length, rate)
		impulse.copyToChannel(left, 0)
		impulse.copyToChannel(right, 1)
		reverb.buffer = impulse
		this.filter.connect(this.dry).connect(this.output)
		this.filter.connect(this.wet).connect(reverb).connect(this.output)

		const random = createRandom('drone:voices')
		this.voices = Array.from({ length: VOICES }, (_, i) => {
			const level = context.createGain()
			level.gain.value = VOICE_LEVEL * (i === 0 ? 1.4 : 1)
			// The swell: a slow sine adding up to half the level.
			const swell = context.createOscillator()
			swell.frequency.value = 1 / (SWELL[0] + random() * (SWELL[1] - SWELL[0]))
			const depth = context.createGain()
			depth.gain.value = VOICE_LEVEL * 0.5
			swell.connect(depth).connect(level.gain)
			swell.start(context.currentTime + random() * SWELL[0])
			const pan = context.createStereoPanner()
			pan.pan.value = i === 0 ? 0 : (i % 2 ? -1 : 1) * (0.25 + 0.15 * random())
			const oscillators = [
				['sine', -4],
				['triangle', 4],
			].map(([type, detune]) => {
				const oscillator = context.createOscillator()
				oscillator.type = type
				oscillator.detune.value = detune
				oscillator.connect(level)
				oscillator.start()
				return oscillator
			})
			level.connect(pan).connect(this.filter)
			return { oscillators, swell, rate: swell.frequency.value }
		})

		// The air: pink noise in a slowly wandering band.
		const air = this.engine.noise(pinkNoise(rate, 4))
		const band = context.createBiquadFilter()
		band.type = 'bandpass'
		band.Q.value = 0.7
		band.frequency.value = 900
		const wander = context.createOscillator()
		wander.frequency.value = 1 / 23
		const wanderDepth = context.createGain()
		wanderDepth.gain.value = 500
		wander.connect(wanderDepth).connect(band.frequency)
		wander.start()
		const airLevel = context.createGain()
		airLevel.gain.value = AIR_LEVEL
		air.connect(band).connect(airLevel)
		airLevel.connect(this.output)
		airLevel.connect(reverb)
		this.wanderRate = wander.frequency.value
		this.wander = wander
		this.ready = true
	}

	// Once a frame, `dt` s after the last: the eye's `seed`, its `pupil`
	// diameter (mm), the lids' `blink` closure (0 open, 1 shut), the `zoom`
	// level (0 out, 1 in) and whether the photo is `frozen`.
	update(dt, { seed, pupil, blink, zoom, frozen }) {
		if (!this.ready) return
		const context = this.engine.context
		const now = context.currentTime
		const levels = this.params.sound

		if (seed !== this.seed) {
			this.seed = seed
			this.harmony = droneHarmony(seed)
			this.chord = 0
			this.elapsed = 0
			this.glideTo(this.harmony.chords[0], now, this.notes ? GLIDE * 0.6 : 0)
		} else if (!frozen) {
			this.elapsed += dt
			if (this.elapsed > levels.droneChord) {
				this.elapsed = 0
				this.chord = (this.chord + 1) % this.harmony.chords.length
				this.glideTo(this.harmony.chords[this.chord], now, GLIDE)
			}
		}

		if (frozen !== this.frozen) {
			this.frozen = frozen
			// Held: the swells stop where they are, and go on from there.
			for (const voice of this.voices)
				voice.swell.frequency.setTargetAtTime(frozen ? 1e-4 : voice.rate, now, 0.6)
			this.wander.frequency.setTargetAtTime(frozen ? 1e-4 : this.wanderRate, now, 0.6)
			this.output.gain.setTargetAtTime(frozen ? 10 ** (-4 / 20) : 1, now, 0.6)
		}

		const opening = Math.min(Math.max((pupil - PUPIL[0]) / (PUPIL[1] - PUPIL[0]), 0), 1)
		const target =
			levels.droneBrightness * 2 ** (levels.droneMotion * (1 - 2 * opening)) * (1 - 0.75 * blink)
		this.cutoff = follow(this.cutoff ?? target, target, dt, 0.08)
		this.filter.frequency.setTargetAtTime(this.cutoff, now, 0.05)
		const wet = levels.droneReverb * (0.6 + 0.4 * (1 - zoom))
		this.wet.gain.setTargetAtTime(wet, now, 0.3)
		this.dry.gain.setTargetAtTime((1 - 0.5 * wet) * (1 - 0.25 * blink), now, 0.05)
	}

	// Every voice to its note of `chord` (the upper ones by the nearest way),
	// over `seconds`.
	glideTo(chord, now, seconds) {
		this.notes = this.notes ? voiceLead(this.notes, chord) : chord
		this.voices.forEach((voice, i) => {
			for (const oscillator of voice.oscillators) {
				const hz = frequency(this.notes[i])
				if (seconds > 0) oscillator.frequency.setTargetAtTime(hz, now, seconds / 3)
				else oscillator.frequency.setValueAtTime(hz, now)
			}
		})
	}
}
