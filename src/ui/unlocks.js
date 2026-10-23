// What a page can unlock without the checklist (pure; main.js,
// docs/DEVELOPMENT.md#url-flags): `?unlock=` names what it gives at once,
// for the page only, and the Konami code unlocks the Sharingan for good
// (kept with the checklist, until Reset).

// The hidden skin tone, the Sharingan's button, the Rinnegan among its
// patterns (with the Sharingan).
export const UNLOCKS = Object.freeze(['tone', 'sharingan', 'rinnegan'])

// The unlocks of `?unlock=` (`value`: the flag's, null without it): a comma
// list of UNLOCKS, or all of them for `all` or an empty value; the
// Rinnegan brings the Sharingan.
export function parseUnlocks(value) {
	if (value === null || value === undefined) return new Set()
	const names = value
		.split(',')
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean)
	if (names.length === 0 || names.includes('all')) return new Set(UNLOCKS)
	const unlocks = new Set(names.filter((name) => UNLOCKS.includes(name)))
	if (unlocks.has('rinnegan')) unlocks.add('sharingan')
	return unlocks
}

// ↑ ↑ ↓ ↓ ← → ← → B A, as `KeyboardEvent.key`s in lower case.
export const KONAMI = Object.freeze([
	'arrowup',
	'arrowup',
	'arrowdown',
	'arrowdown',
	'arrowleft',
	'arrowright',
	'arrowleft',
	'arrowright',
	'b',
	'a',
])

// A matcher of `sequence`: called with each key pressed (a
// `KeyboardEvent.key`), true when the last ones are the sequence, which
// then starts again.
export function createSequence(sequence = KONAMI) {
	let recent = []
	return (key) => {
		recent.push(key.toLowerCase())
		if (recent.length > sequence.length) recent.shift()
		if (recent.length < sequence.length || recent.some((k, i) => k !== sequence[i])) return false
		recent = []
		return true
	}
}
