// The camera foley of the interface (docs/AUDIO.md): the HUD's cues (a
// press, a hover, a tone turning by, Random eye) and, once a frame, the
// voices that follow the camera itself, whatever moves it: the power zoom's
// motor (the buttons, a snap, the wheel, the keys) or the ring turned by hand
// (the zoom knob held), the aperture ring's detents, the end stops and the
// creak of a track pulled past them, the tripod head's swish as the camera
// orbits, the mirror of photo mode and the autofocus beep once its image has
// converged. Sounds pan with the place of their control on the screen.
import { follow } from '../camera/orbitMotion'
import {
	crossings,
	endEvent,
	motorDrive,
	orbitDrive,
	overshoot,
	ringDrive,
	stops,
	strainDrive,
} from './foley'
import { grit, noise } from './synth'

// Time constants (s): the speeds the voices follow, and the voices' levels.
const SPEED_LAG = 0.04
const LEVEL_LAG = 0.03
// How far to the sides the controls pan, at the window's edges.
const PAN = 0.6
// A hover sounds only under a mouse that moved this recently (ms), not when a
// control slides under a still one (the zoom's knob at an end).
const HOVER_MOVE = 150

export default class CameraFoley {
	constructor(engine) {
		this.engine = engine
		this.params = engine.params
		this.held = { zoom: false, aperture: false }
		this.previous = null
		this.speeds = { zoom: 0, aperture: 0, orbit: 0 }
		this.toneSteps = null
		this.beepTime = -Infinity
		this.voices = null
		this.moved = -Infinity
		window.addEventListener('pointermove', (event) => {
			if (event.pointerType === 'mouse') this.moved = performance.now()
		})
		engine.onReady((context) => this.build(context))
	}

	build(context) {
		const { engine } = this
		const bus = engine.buses.controls
		const rate = context.sampleRate
		const motor = engine.loop('motor')

		// The ring: friction (noise through a band-pass) and grit (sparse
		// clicks, denser and higher as it turns faster).
		const friction = context.createBiquadFilter()
		friction.type = 'bandpass'
		friction.Q.value = 0.9
		engine.noise(noise(rate, 2, 'ring')).connect(friction)
		const gritSource = engine.noise(grit(rate, 2))
		const gritFilter = context.createBiquadFilter()
		gritFilter.type = 'highpass'
		gritFilter.frequency.value = 1800
		gritSource.connect(gritFilter)
		const ring = context.createGain()
		ring.gain.value = 0
		const gritGain = context.createGain()
		gritGain.gain.value = 0.7
		friction.connect(ring)
		gritFilter.connect(gritGain).connect(ring)
		ring.connect(bus)

		// The creak: stick-slip pulses ringing a resonance.
		const stick = context.createOscillator()
		stick.type = 'sawtooth'
		const resonance = context.createBiquadFilter()
		resonance.type = 'bandpass'
		resonance.Q.value = 9
		const strain = context.createGain()
		strain.gain.value = 0
		stick.connect(resonance).connect(strain).connect(bus)
		stick.start()

		// The tripod head: low noise through a wide band-pass.
		const swishFilter = context.createBiquadFilter()
		swishFilter.type = 'bandpass'
		swishFilter.Q.value = 0.7
		const swishLow = context.createBiquadFilter()
		swishLow.type = 'lowpass'
		swishLow.frequency.value = 1800
		const swish = context.createGain()
		swish.gain.value = 0
		engine.noise(noise(rate, 2, 'swish')).connect(swishFilter)
		swishFilter.connect(swishLow).connect(swish).connect(bus)

		this.voices = {
			motor,
			ring: { gain: ring, filter: friction, grit: gritSource },
			strain: { gain: strain, stick, resonance },
			swish: { gain: swish, filter: swishFilter },
		}
	}

	// A cue of the HUD (src/ui/hud.js) or the page (main.js): `detail.element`,
	// if any, is the control, whose place on the screen sets the pan.
	cue(name, detail = {}) {
		const pan = panOf(detail.element)
		switch (name) {
			case 'hover':
				if (performance.now() - this.moved < HOVER_MOVE) this.engine.play('tick', { pan })
				break
			case 'press':
				this.engine.play('press', { pan })
				break
			case 'tap':
				this.engine.play('press', { pan, gain: 0.6 })
				break
			case 'grab':
			case 'release':
				this.held[detail.control] = name === 'grab'
				break
			case 'tones': {
				// The tone group turns by whole steps of its places: a detent each.
				const { steps, start } = detail
				const count = this.toneSteps === null || start ? 0 : crossings(this.toneSteps, steps, 1)
				this.toneSteps = steps
				if (count !== 0) this.engine.play('dial', { pan, gain: Math.min(Math.abs(count), 2) * 0.8 })
				break
			}
			case 'random':
				this.engine.play(this.params.sound.film === 'motor' ? 'wind' : 'advance', { pan })
				break
			case 'snapshot':
				this.engine.play('shutter', { pan })
				break
			case 'frozen':
				this.engine.play(detail.frozen ? 'mirrorUp' : 'mirrorDown')
				break
		}
	}

	// Once a frame, `dt` s after the last: `zoom` and `aperture`, the levels of
	// the two knobs' tracks (unclamped: past an end while dragged elastically)
	// with their elasticities, `fNumber`, the camera's `azimuth` and
	// `elevation` (degrees) and the photo's `frozen` and `converged`.
	update(dt, state) {
		const previous = this.previous
		this.previous = state
		if (!previous || dt <= 0) return
		const { engine } = this
		const now = engine.context?.currentTime ?? 0
		const levels = this.params.sound

		const speed = (key, value) => {
			this.speeds[key] = follow(this.speeds[key], value / dt, dt, SPEED_LAG)
			return this.speeds[key]
		}
		const zoomSpeed = speed('zoom', state.zoom - previous.zoom)
		const apertureSpeed = speed('aperture', state.aperture - previous.aperture)
		const orbitSpeed = speed(
			'orbit',
			Math.hypot(state.azimuth - previous.azimuth, state.elevation - previous.elevation),
		)

		// Each knob at a level whose end it reaches or comes back to.
		const pan = PAN * 0.6
		for (const key of ['zoom', 'aperture']) {
			const event = endEvent(previous[key], state[key])
			if (event) engine.play(event, { pan, gain: event === 'settle' ? 0.7 : 1 })
		}

		// The aperture ring's detents, higher as it stops down.
		const detents = crossings(stops(previous.fNumber), stops(state.fNumber), 1 / levels.detents)
		if (detents !== 0) {
			const closing = Math.min(Math.max(state.aperture, 0), 1)
			engine.play('detent', {
				pan,
				rate: 1.3 + 0.15 * closing,
				gain: Math.min(0.75 + 0.15 * (Math.abs(detents) - 1), 1.2),
			})
		}

		if (state.frozen && state.converged && !previous.converged && now - this.beepTime > 1) {
			this.beepTime = now
			engine.play('beep', { pan })
		}

		if (!this.voices) return
		const { motor, ring, strain, swish } = this.voices
		const set = (param, value) => param.setTargetAtTime(value, now, LEVEL_LAG)

		// The zoom: by hand while the knob is held, else by the motor.
		const byHand = this.held.zoom
		if (motor) {
			const { gain, rate } = motorDrive(zoomSpeed)
			set(motor.gain.gain, byHand ? 0 : gain * levels.motor * 0.5)
			set(motor.rate, rate)
		}
		const turning = ringDrive(zoomSpeed)
		set(ring.gain.gain, byHand ? turning.gain * levels.ring * 0.5 : 0)
		set(ring.filter.frequency, turning.cutoff)
		set(ring.grit.playbackRate, turning.rate)

		// The creak of the track pulled furthest past its end.
		const pulls = [
			[overshoot(state.zoom, state.zoomElasticity), zoomSpeed],
			[overshoot(state.aperture, state.apertureElasticity), apertureSpeed],
		].sort((a, b) => b[0] - a[0])
		const creak = strainDrive(pulls[0][0], pulls[0][1])
		set(strain.gain.gain, creak.gain * levels.strain * 0.25)
		set(strain.stick.frequency, creak.rate)
		set(strain.resonance.frequency, creak.resonance)

		const head = orbitDrive(orbitSpeed)
		set(swish.gain.gain, head.gain * levels.orbit)
		set(swish.filter.frequency, head.cutoff)
	}
}

// The pan of an element by its horizontal place on the screen.
function panOf(element) {
	if (!element?.getBoundingClientRect) return 0
	const box = element.getBoundingClientRect()
	if (box.width === 0 && box.height === 0) return 0
	return PAN * (((box.left + box.width / 2) / window.innerWidth) * 2 - 1)
}
