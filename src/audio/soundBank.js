// The sounds the foley plays (docs/AUDIO.md): the recorded takes of each
// (src/audio/sounds/, cut by `pnpm sounds`) or the synthesized buffer
// (src/audio/synth.js), the leaf of the `sound` params group that sets its
// gain, how much of `sound.variation` (cents) its rate varies by, and at
// most how many play at once, at least `gap` s apart. A sound asked for
// sooner than `gap` after the last one plays no new voice: its level adds to
// that one's instead (src/audio/audioEngine.js).
import advance from './sounds/advance.mp3?url'
import dial1 from './sounds/dial-1.mp3?url'
import dial2 from './sounds/dial-2.mp3?url'
import dial3 from './sounds/dial-3.mp3?url'
import dial4 from './sounds/dial-4.mp3?url'
import dial5 from './sounds/dial-5.mp3?url'
import mirrorDown from './sounds/mirror-down.mp3?url'
import mirrorUp from './sounds/mirror-up.mp3?url'
import press1 from './sounds/press-1.mp3?url'
import press2 from './sounds/press-2.mp3?url'
import press3 from './sounds/press-3.mp3?url'
import ratchet1 from './sounds/ratchet-1.mp3?url'
import ratchet2 from './sounds/ratchet-2.mp3?url'
import ratchet3 from './sounds/ratchet-3.mp3?url'
import ratchet4 from './sounds/ratchet-4.mp3?url'
import ratchet5 from './sounds/ratchet-5.mp3?url'
import shutter from './sounds/shutter.mp3?url'
import wind from './sounds/wind.mp3?url'

export const SOUNDS = {
	// The click of a camera button: + and −, the skin tones, Random eye, a tap
	// on a knob, More info and the sound toggle.
	press: { takes: [press1, press2, press3], gain: 'press', vary: 1, voices: 3, gap: 0.02 },
	// The zoom ring's detents: a Nikon FM2's dial, smaller and higher (the
	// foley plays it faster).
	zoom: {
		takes: [dial1, dial2, dial3, dial4, dial5],
		gain: 'zoom',
		vary: 1,
		voices: 4,
		gap: 0.018,
	},
	// The aperture ring's detents, lighter: the ratchet of a film advance
	// lever, tick by tick.
	aperture: {
		takes: [ratchet1, ratchet2, ratchet3, ratchet4, ratchet5],
		gain: 'aperture',
		vary: 1,
		voices: 4,
		gap: 0.018,
	},
	// Random eye: the film advanced to a new frame, by lever or by motor.
	advance: { takes: [advance], gain: 'advance', vary: 0.3, voices: 2, gap: 0.12 },
	wind: { takes: [wind], gain: 'advance', vary: 0.3, voices: 2, gap: 0.12 },
	// Snapshot, and photo mode's mirror lock-up.
	shutter: { takes: [shutter], gain: 'shutter', vary: 0.2, voices: 2, gap: 0.12 },
	mirrorUp: { takes: [mirrorUp], gain: 'mirror', vary: 0.3, voices: 1, gap: 0.12 },
	mirrorDown: { takes: [mirrorDown], gain: 'mirror', vary: 0.3, voices: 1, gap: 0.12 },
	// Synthesized: the hover's tick and the autofocus confirmation (before
	// Snapshot's shutter, and once a photo has converged).
	tick: { synth: 'tick', gain: 'hover', vary: 1, voices: 2, gap: 0.04 },
	beep: { synth: 'beep', gain: 'beep', vary: 0, voices: 1, gap: 0.5 },
}

// Every recorded file, once.
export const SOUND_FILES = [...new Set(Object.values(SOUNDS).flatMap((sound) => sound.takes ?? []))]
