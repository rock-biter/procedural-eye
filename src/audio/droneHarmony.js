// The drone's harmony (docs/AUDIO.md): each eye's seed draws a low root, a
// mode and a cycle of open chords (sus2, quartal, open fifths), which the
// drone walks through, each voice moving to the nearest note of the next
// chord. Notes are MIDI numbers.
import { createRandom } from '../random'

// Semitones of each degree of the modes; all have a major second and a
// fifth, so the open shapes below always ring.
export const MODES = {
	dorian: [0, 2, 3, 5, 7, 9, 10],
	aeolian: [0, 2, 3, 5, 7, 8, 10],
	mixolydian: [0, 2, 4, 5, 7, 9, 10],
	lydian: [0, 2, 4, 6, 7, 9, 11],
}

// Chord shapes in steps of the mode above the chord's degree: the bass first,
// then the upper voices.
const SHAPES = [
	[0, 4, 8, 11, 14],
	[0, 4, 7, 9, 13],
	[0, 3, 6, 9, 12],
	[0, 4, 7, 8, 11],
]

// The degrees a cycle may move to from the tonic, the plagal ones likelier.
const DEGREES = [3, 3, 5, 5, 4, 1, 6]

// A1 to E2: low enough to sit under everything, high enough to be heard on
// small speakers through their harmonics.
const ROOTS = [33, 35, 36, 38, 40]

export const VOICES = 5
// The range the upper voices keep to.
export const RANGE = [45, 76]

const note = (root, mode, step) =>
	root +
	12 * Math.floor(step / mode.length) +
	mode[((step % mode.length) + mode.length) % mode.length]

// The harmony of `seed`: { root, mode, chords }, a cycle of `length` chords
// starting on the tonic, each VOICES notes, the bass first.
export function droneHarmony(seed, length = 4) {
	const random = createRandom(`drone:${seed}`)
	const root = ROOTS[Math.floor(random() * ROOTS.length)]
	const modeName = Object.keys(MODES)[Math.floor(random() * 4)]
	const mode = MODES[modeName]
	const degrees = [0]
	while (degrees.length < length) {
		const degree = DEGREES[Math.floor(random() * DEGREES.length)]
		if (degree !== degrees[degrees.length - 1]) degrees.push(degree)
	}
	let previous = null
	const chords = degrees.map((degree) => {
		const shape = SHAPES[Math.floor(random() * SHAPES.length)]
		const notes = shape.map((step) => note(root, mode, degree + step))
		// The bass stays in the lowest octave above the root.
		notes[0] = root + ((notes[0] - root) % 12)
		previous = previous ? voiceLead(previous, notes) : place(notes)
		return previous
	})
	return { root, mode: modeName, chords }
}

// The upper voices of a first chord folded into RANGE.
function place(notes) {
	return [notes[0], ...notes.slice(1).map((n) => fold(n, RANGE[0] + 6))]
}

// The note of `n`'s pitch class nearest `target`, inside RANGE.
function fold(n, target) {
	let best = n
	for (let octave = -4; octave <= 4; octave++) {
		const candidate = n + 12 * octave
		if (candidate < RANGE[0] || candidate > RANGE[1]) continue
		if (
			Math.abs(candidate - target) < Math.abs(best - target) ||
			best < RANGE[0] ||
			best > RANGE[1]
		)
			best = candidate
	}
	return best
}

// Moves the voices of `from` to the notes of `to`: the bass to the new bass,
// each upper voice to the pitch class of the new chord left nearest to it.
export function voiceLead(from, to) {
	const classes = to.slice(1)
	const result = [to[0]]
	const upper = from.slice(1)
	// The voices that are closest to a target choose first.
	const order = upper.map((_, i) => i)
	const nearest = (n) => Math.min(...classes.map((c) => Math.abs(fold(c, n) - n)))
	order.sort((a, b) => nearest(upper[a]) - nearest(upper[b]))
	const left = [...classes]
	const moved = new Array(upper.length)
	for (const i of order) {
		let best = 0
		for (let j = 1; j < left.length; j++)
			if (
				Math.abs(fold(left[j], upper[i]) - upper[i]) <
				Math.abs(fold(left[best], upper[i]) - upper[i])
			)
				best = j
		moved[i] = fold(left[best], upper[i])
		left.splice(best, 1)
	}
	return [...result, ...moved]
}

export const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12)
