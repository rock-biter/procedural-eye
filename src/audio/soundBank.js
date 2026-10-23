// The sounds the foley plays (docs/AUDIO.md): the recorded takes of each
// (src/audio/sounds/, cut by `pnpm sounds`) or the synthesized buffer
// (src/audio/synth.js), the leaf of `sound.volumes` that sets its gain, how
// much of `sound.variation` (cents) its rate varies by, and at most how many
// play at once, at least `gap` s apart; a long synthesized one is built once
// the page is idle (`lazy`), and `reverb` is the share it sends into the
// controls' reverb. A sound asked for
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
import freewheel1 from './sounds/freewheel-1.mp3?url'
import freewheel2 from './sounds/freewheel-2.mp3?url'
import freewheel3 from './sounds/freewheel-3.mp3?url'
import freewheel4 from './sounds/freewheel-4.mp3?url'
import freewheel5 from './sounds/freewheel-5.mp3?url'
import press1 from './sounds/press-1.mp3?url'
import press2 from './sounds/press-2.mp3?url'
import press3 from './sounds/press-3.mp3?url'
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
		voices: 8,
		gap: 0.012,
	},
	// The aperture ring's detents, finer and lighter than the zoom's
	// (`sound.apertureTicks`): the pawl of a bicycle's freewheel, tick by
	// tick, or a synthesized tick of three small metal modes.
	aperture: {
		takes: [freewheel1, freewheel2, freewheel3, freewheel4, freewheel5],
		gain: 'aperture',
		vary: 1,
		voices: 8,
		gap: 0.008,
	},
	apertureFine: { synth: 'fine', synthTakes: 5, gain: 'aperture', vary: 1, voices: 8, gap: 0.008 },
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
	// Synthesized, in the glass harp's key (the foley's rate): an achievement
	// of the checklist (a latch springs open, a glass rings twice a fifth up),
	// and the awakening of the Sharingan (a large singing bowl struck once).
	unlock: { synth: 'chime', gain: 'unlock', vary: 0, voices: 2, gap: 0.3, reverb: 0.35 },
	gong: { synth: 'bowl', lazy: true, gain: 'gong', vary: 0, voices: 2, gap: 1, reverb: 0.6 },
}

// The buffers a sound draws its takes from: its files, or its synth's
// buffers (`synth:i` when it has several takes, `synthTakes`).
export const takesOf = (sound) =>
	!sound.synth
		? sound.takes
		: sound.synthTakes
			? Array.from({ length: sound.synthTakes }, (_, i) => `${sound.synth}:${i}`)
			: [sound.synth]

// Every recorded file, once.
export const SOUND_FILES = [...new Set(Object.values(SOUNDS).flatMap((sound) => sound.takes ?? []))]
