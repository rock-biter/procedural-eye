// The camera foley of the interface (docs/AUDIO.md): the HUD's cues (a
// press, a hover, a tap on a knob, Random eye, Snapshot, photo mode) and,
// once a frame, the sounds that follow the camera itself, whatever moves it:
// the zoom ring's and the aperture ring's detents, the creak of a knob pulled
// past its end and the autofocus beep once a photo has converged. Sounds pan
// with the place of their control on the screen.
import { follow } from '../camera/orbitMotion'
import { crossings, overshoot, stops, strainDrive } from './foley'

// Time constants (s): the speeds the creak follows, and its levels.
const SPEED_LAG = 0.04
const LEVEL_LAG = 0.03
// How far to the sides the controls pan, at the window's edges.
const PAN = 0.6
// A hover sounds only under a mouse that moved this recently (ms), not when a
// control slides under a still one (the zoom's knob at an end).
const HOVER_MOVE = 150
// Snapshot's shutter fires this long (s) after its focus beep starts.
const SHUTTER_DELAY = 0.22
// At most this many detents of one frame sound.
const MAX_RUN = 8

export default class CameraFoley {
	constructor(engine) {
		this.engine = engine
		this.params = engine.params
		this.previous = null
		this.speeds = { zoom: 0, aperture: 0 }
		this.beepTime = -Infinity
		this.strain = null
		this.moved = -Infinity
		window.addEventListener('pointermove', (event) => {
			if (event.pointerType === 'mouse') this.moved = performance.now()
		})
		engine.onReady((context) => this.build(context))
	}

	// The creak: stick-slip pulses ringing a resonance.
	build(context) {
		const stick = context.createOscillator()
		stick.type = 'sawtooth'
		const resonance = context.createBiquadFilter()
		resonance.type = 'bandpass'
		resonance.Q.value = 9
		const gain = context.createGain()
		gain.gain.value = 0
		stick.connect(resonance).connect(gain).connect(this.engine.buses.controls)
		stick.start()
		this.strain = { gain, stick, resonance }
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
			case 'random':
				this.engine.play(this.params.sound.film === 'motor' ? 'wind' : 'advance', { pan })
				break
			case 'snapshot':
				this.engine.play('beep', { pan })
				this.engine.play('shutter', { pan, delay: SHUTTER_DELAY })
				break
			case 'frozen':
				this.engine.play(detail.frozen ? 'mirrorUp' : 'mirrorDown')
				break
		}
	}

	// Once a frame, `dt` s after the last: `zoom` and `aperture`, the levels of
	// the two knobs' tracks (unclamped: past an end while dragged elastically)
	// with their elasticities, `fNumber`, and the photo's `frozen` and
	// `converged`.
	update(dt, state) {
		const previous = this.previous
		this.previous = state
		if (!previous || dt <= 0) return
		const { engine } = this
		const levels = this.params.sound
		const pan = PAN * 0.6
		const clamp01 = (value) => Math.min(Math.max(value, 0), 1)
		// The detents a frame crossed, spread evenly over the next frame's
		// time, so a fast turn keeps its density at any frame rate.
		const run = (name, count, rate) => {
			const clicks = Math.min(Math.abs(count), MAX_RUN)
			for (let i = 0; i < clicks; i++) engine.play(name, { pan, rate, delay: (i * dt) / clicks })
		}

		// The zoom ring's detents, higher as it zooms in; the aperture ring's,
		// finer and lighter, higher as it stops down.
		run(
			'zoom',
			crossings(previous.zoom, state.zoom, 1 / levels.zoomDetents),
			1.3 + 0.15 * clamp01(state.zoom),
		)
		run(
			levels.apertureTicks === 'fine' ? 'apertureFine' : 'aperture',
			crossings(stops(previous.fNumber), stops(state.fNumber), 1 / levels.detents),
			1 + 0.15 * clamp01(state.aperture),
		)

		const now = engine.context?.currentTime ?? 0
		if (state.frozen && state.converged && !previous.converged && now - this.beepTime > 1) {
			this.beepTime = now
			engine.play('beep', { pan })
		}

		if (!this.strain) return
		// The creak of the knob pulled furthest past its end.
		const speed = (key) => {
			const value = (state[key] - previous[key]) / dt
			this.speeds[key] = follow(this.speeds[key], value, dt, SPEED_LAG)
			return this.speeds[key]
		}
		const pulls = [
			[overshoot(state.zoom, state.zoomElasticity), speed('zoom')],
			[overshoot(state.aperture, state.apertureElasticity), speed('aperture')],
		].sort((a, b) => b[0] - a[0])
		const creak = strainDrive(pulls[0][0], pulls[0][1])
		const set = (param, value) => param.setTargetAtTime(value, now, LEVEL_LAG)
		set(this.strain.gain.gain, creak.gain * levels.volumes.strain * 0.25)
		set(this.strain.stick.frequency, creak.rate)
		set(this.strain.resonance.frequency, creak.resonance)
	}
}

// The pan of an element by its horizontal place on the screen.
function panOf(element) {
	if (!element?.getBoundingClientRect) return 0
	const box = element.getBoundingClientRect()
	if (box.width === 0 && box.height === 0) return 0
	return PAN * (((box.left + box.width / 2) / window.innerWidth) * 2 - 1)
}
