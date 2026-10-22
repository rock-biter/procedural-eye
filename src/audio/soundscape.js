// The arithmetic of the glass harp (docs/AUDIO.md), apart from Web Audio:
// the glasses' tuning, which glass sings next and how (src/audio/ambience.js).
// A wine glass rubbed with a wet finger sings a nearly pure tone: its
// fundamental, a few weak harmonics from the finger's stick-slip, and a slow
// beat between the two halves of its rim's mode, which rise with the
// finger's pressure, swell with its speed and ring on when it lifts.

// The keys the glasses can be tuned to: their tonic (MIDI) near the fifth
// octave, where wine glasses sing (in D, A4 440 Hz to F#6 1480 Hz; the keys
// span D4 to A6 between them).
export const KEYS = { C: 72, D: 74, E: 76, F: 77, G: 67, A: 69 }
const PENTATONIC = [0, 2, 4, 7, 9]

// The glasses of the key `name`: its major pentatonic from a fourth below the
// tonic to a little over an octave above it.
export function glassNotes(name) {
	const tonic = KEYS[name] ?? KEYS.D
	const notes = []
	for (let midi = tonic - 5; midi <= tonic + 17; midi++)
		if (PENTATONIC.includes((((midi - tonic) % 12) + 12) % 12)) notes.push(midi)
	return notes
}

export const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

// How well two notes sound together: thirds, fourths, fifths, sixths and
// octaves well, seconds and sevenths less, the same note not at all.
export function consonance(a, b) {
	if (a === b) return -Infinity
	const interval = Math.abs(a - b) % 12
	if ([0, 3, 4, 5, 7, 8, 9].includes(interval)) return 1
	if ([2, 10].includes(interval)) return -1
	return -2
}

// A note of `notes` for a new glass among the `sounding` ones (`random`,
// [0, 1) numbers), likelier the better it sounds with them, never one already
// sounding; `upper` keeps to the upper half of the glasses.
export function pickNote(random, notes, sounding, upper = false) {
	const candidates = (upper ? notes.slice(Math.floor(notes.length / 2)) : notes).filter(
		(midi) => !sounding.includes(midi),
	)
	if (candidates.length === 0) return null
	const weights = candidates.map((midi) =>
		Math.exp(sounding.reduce((sum, other) => sum + consonance(midi, other), 0)),
	)
	let threshold = random() * weights.reduce((sum, weight) => sum + weight, 0)
	for (let i = 0; i < candidates.length; i++) {
		threshold -= weights[i]
		if (threshold < 0) return candidates[i]
	}
	return candidates[candidates.length - 1]
}

// The harmonics a rubbed glass sings above its fundamental: their order and
// level. A louder glass, rubbed harder, sings them `brightness` times louder.
export const GLASS_HARMONICS = [
	[2, 0.07],
	[3, 0.025],
	[4, 0.01],
]

const between = (random, [low, high]) => low + (high - low) * random()

// How a glass sings (s and Hz): it rises over `attack`, holds for `hold`
// while the finger circles (its level swelling by `swellDepth` at
// `swellRate`), and rings on after it lifts, dying with the time constant
// `release`. Its rim's two halves beat `beat` times a second, the weaker
// `twin` of the fundamental's level. A louder glass (`lead`) rises faster,
// sings brighter and stands nearer the middle.
export function glassVoice(random, lead = false) {
	return {
		level: lead ? between(random, [0.85, 1]) : between(random, [0.45, 1]),
		attack: between(random, lead ? [1.5, 3] : [2.5, 5]),
		hold: between(random, lead ? [3, 7] : [6, 14]),
		release: between(random, lead ? [2, 3.5] : [1.2, 2.5]),
		beat: between(random, lead ? [0.8, 2.4] : [0.4, 1.8]),
		twin: between(random, [0.15, 0.35]),
		swellRate: between(random, [0.12, 0.3]),
		swellDepth: between(random, lead ? [0.2, 0.3] : [0.1, 0.22]),
		brightness: lead ? 1.6 : 1,
		pan: between(random, lead ? [-0.3, 0.3] : [-0.6, 0.6]),
	}
}

// The wait (s) before the next quiet glass, and before the next louder one
// at `perMinute` a minute (exponentially distributed, at least 8 s).
export const nextQuietGlass = (random) => between(random, [1.5, 6])
export const nextLoudGlass = (random, perMinute) =>
	Math.max(8, (-Math.log(1 - random()) * 60) / perMinute)

// A slow fade in, 0 to 1 over `points` values: sin², which starts and lands
// without a corner.
export function fadeCurve(points = 64) {
	return Float32Array.from(
		{ length: points },
		(_, i) => Math.sin((Math.PI / 2) * (i / (points - 1))) ** 2,
	)
}
