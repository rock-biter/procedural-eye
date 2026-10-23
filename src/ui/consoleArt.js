// The T-800 in the console (main.js, pure). At load, its eye: a red lens
// glowing in a chrome socket, as the easter egg shows it
// (src/eye/terminator.js), drawn in heavy block characters on black, round
// in the console's monospace cells; under it the T-800's vision readout,
// whose warnings are hints to the volume cannon that brings it out (main.js:
// the volume slider squeezed past its left end and let go). Then a line for
// every shot that hits Snapshot.

// The eye, in rows of the console (a character is about `aspect` times as
// tall as it is wide: 13 px lines of 6.6 px characters in Chrome's DevTools),
// its circles' radii from the outside in: the chrome
// ring, light then shaded (its bevel); a ring of `teeth`, `period` degrees
// apart and `length` long, as the HUD's segmented rings; the lens, its rim,
// its red, its glow and its core, with a highlight up and to the left.
export const EYE = Object.freeze({
	aspect: 2,
	chrome: Object.freeze([9.5, 8.7, 7.8]),
	teeth: Object.freeze({ outer: 7, inner: 6.1, period: 30, length: 22 }),
	lens: Object.freeze({ rim: 5.4, red: 4, glow: 2.6, core: 1.4 }),
	highlight: Object.freeze({ x: -1.7, y: -1.6, radius: 0.7 }),
})

// Each part's character and style; every cell is on black, or on a color of
// its own so heavy blocks meet across the console's line spacing. DevTools
// adds a run's padding to its line's height (it would stretch the eye) and
// its lines fall on fractional pixels (thin seams between them): a pixel of
// padding taken back by a negative margin overlaps the lines without moving
// them.
const CELL = 'font-weight:bold;padding:1px 0;margin:-1px 0;'
const PARTS = {
	space: [' ', 'background:#000;'],
	light: ['█', 'color:#d4d9df;background:#d4d9df;'],
	shade: ['▓', 'color:#9aa1a9;background:#5b6168;'],
	tooth: ['▓', 'color:#7d848c;background:#2b2f34;'],
	rim: ['▒', 'color:#ff2a1a;background:#3d0402;'],
	red: ['▓', 'color:#ff3a1c;background:#9a0f06;'],
	glow: ['█', 'color:#ff4b22;background:#ff4b22;text-shadow:0 0 6px #ff2a1a;'],
	core: ['█', 'color:#fff1dc;background:#fff1dc;text-shadow:0 0 8px #ff8a4a;'],
	highlight: ['█', 'color:#ffd9cf;background:#ffd9cf;'],
	readout: [null, 'background:#000;color:#ff3b2f;'],
}

// The readout under the eye, a line each, the first centered, none wider
// than the eye, so a narrow console (DevTools docked at the side) does not
// wrap the block: warnings that are the steps to fire the cannon (drag the
// volume past zero, squeeze it until its handle trembles, let go).
const READOUT = [
	"I'LL BE BACK.",
	'',
	'T-800 · VISUAL SYSTEMS ONLINE',
	'> SCAN: 1 EYE. FACE SOLD SEPARATELY.',
	'> WARNING: DO NOT MISTREAT THE VOLUME.',
	'> YOU WILL REGRET IT.',
	'> DO NOT DRAG IT BELOW ZERO.',
	'> DO NOT SQUEEZE IT UNTIL IT SHAKES.',
	'> AND WHATEVER YOU DO, DO NOT LET GO.',
	'> SNAPSHOT HAS BEEN WARNED.',
]

// The T-800's report of a shot at Snapshot: the first always, then the others
// in a shuffled turn, none twice before they have all come.
const FIRST_SHOT = 'I TOLD YOU NOT TO LET GO.'
export const SHOTS = Object.freeze([
	'TARGET ACQUIRED. SNAPSHOT TERMINATED.',
	'HASTA LA VISTA, BUTTON.',
	'SNAPSHOT WILL BE BACK.',
	'WARNING IGNORED. AGAIN.',
	'THE VOLUME HAS FEELINGS TOO, YOU KNOW.',
	'NICE SHOT. SKYNET IS TAKING NOTES.',
	'PHOTO SAVED. EVIDENCE COLLECTED.',
	'NO BUTTONS WERE HARMED. PROBABLY.',
	'JUDGMENT DAY, BUT FOR BUTTONS.',
	"YOU CAN'T REASON WITH A VOLUME SLIDER.",
	'SKYNET RATES YOUR AIM: ADEQUATE.',
	'COME WITH ME IF YOU WANT TO SNAP.',
])

// Spaces of black around the block.
const PADDING = 2

// The part of the eye at `x` columns and `y` rows from its center.
function eyePart(x, y, eye) {
	const u = x / eye.aspect
	const d = Math.hypot(u, y)
	const [outer, bevel, inner] = eye.chrome
	if (d > outer) return 'space'
	if (d > bevel) return 'light'
	if (d > inner) return 'shade'
	const { teeth, lens, highlight } = eye
	if (d <= teeth.outer && d > teeth.inner) {
		const angle = (Math.atan2(y, u) * 180) / Math.PI + 360 + teeth.length / 2
		return angle % teeth.period < teeth.length ? 'tooth' : 'space'
	}
	if (d > lens.rim) return 'space'
	if (Math.hypot(u - highlight.x, y - highlight.y) < highlight.radius) return 'highlight'
	if (d < lens.core) return 'core'
	if (d < lens.glow) return 'glow'
	if (d < lens.red) return 'red'
	return 'rim'
}

// The eye as rows of parts, from its top to its bottom, as tall and wide as
// the chrome ring (a radius of a whole number and a half fills its top and
// bottom rows).
export function terminatorEye(eye = EYE) {
	const radius = eye.chrome[0]
	const rows = Math.floor(radius)
	const cols = Math.floor(radius * eye.aspect)
	const parts = []
	for (let y = -rows; y <= rows; y++) {
		const row = []
		for (let x = -cols; x <= cols; x++) row.push(eyePart(x, y, eye))
		parts.push(row)
	}
	return parts
}

// Runs of one style each as console.log() arguments: a format string (%c) and
// the styles. `rows`: lines of [character, part] cells.
function styledLog(rows) {
	let format = ''
	const styles = []
	let run = null
	rows.forEach((row, i) => {
		if (i > 0) format += '\n'
		for (const [character, part] of row) {
			if (part !== run) {
				format += '%c'
				styles.push(CELL + PARTS[part][1])
				run = part
			}
			format += character
		}
	})
	return [format, ...styles]
}

// The console.log() arguments that draw the eye and its readout, on a black
// rectangle: every line padded to the widest.
export function terminatorLog(eye = EYE) {
	const parts = terminatorEye(eye)
	const width = Math.max(parts[0].length, ...READOUT.map((line) => line.length)) + 2 * PADDING
	const spaces = (count) => Array.from({ length: count }, () => [' ', 'space'])
	const center = (cells) => {
		const left = Math.floor((width - cells.length) / 2)
		return [...spaces(left), ...cells, ...spaces(width - left - cells.length)]
	}
	const text = (line, centered) => {
		const left = centered ? Math.floor((width - line.length) / 2) : PADDING
		const padded = ' '.repeat(left) + line + ' '.repeat(width - left - line.length)
		return [...padded].map((character) => [character, 'readout'])
	}
	return styledLog([
		spaces(width),
		...parts.map((row) => center(row.map((part) => [PARTS[part][0], part]))),
		spaces(width),
		...READOUT.map((line, i) => text(line, i === 0)),
		text('', false),
	])
}

// The T-800's reports of the shots at Snapshot: next() gives the
// console.log() arguments of the next one, numbered, in the readout's red;
// `line`, the line of the last one (null before the first).
export function createShotLog(random = Math.random) {
	let count = 0
	let turn = []
	let last = null
	let line = null
	const draw = () => {
		if (turn.length === 0) {
			turn = [...SHOTS]
			for (let i = turn.length - 1; i > 0; i--) {
				const j = Math.floor(random() * (i + 1))
				;[turn[i], turn[j]] = [turn[j], turn[i]]
			}
			// A new turn does not start with the line the last one ended on.
			if (turn[0] === last) turn.push(turn.shift())
		}
		return (last = turn.shift())
	}
	return {
		next() {
			count++
			line = count === 1 ? FIRST_SHOT : draw()
			return [`%c  > SHOT ${count} · ${line}  `, CELL + PARTS.readout[1]]
		},
		get line() {
			return line
		},
	}
}
