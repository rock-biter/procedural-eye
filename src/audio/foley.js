// The arithmetic of the camera foley (docs/AUDIO.md), apart from Web Audio:
// detents crossed between two values and the creak of a track pulled past
// its end (src/audio/cameraFoley.js).

const EPSILON = 1e-9

// The detents `step` apart (multiples of it) that a move from `from` to `to`
// falls into, signed with the move: a detent counts when it is reached, not
// when it is left, so a move that starts on one does not count it again.
export function crossings(from, to, step) {
	if (to > from) return Math.floor(to / step + EPSILON) - Math.floor(from / step + EPSILON)
	return Math.ceil(to / step - EPSILON) - Math.ceil(from / step - EPSILON)
}

// Stops from f/1: each stop halves the light, and the f-number grows by √2.
export const stops = (fNumber) => 2 * Math.log2(fNumber)

// How far `level` lies past either end of [0, 1], as a share of the furthest
// the elastic drag reaches (`elasticity`), 0 inside.
export function overshoot(level, elasticity) {
	const past = level < 0 ? -level : level > 1 ? level - 1 : 0
	return elasticity > 0 ? Math.min(past / elasticity, 1) : 0
}

// A mechanism forced past its end stop creaks: stick-slip pulses (a rate,
// Hz) ringing a resonance (Hz) that rise as it is pulled further, louder
// while it moves (`speed`, levels per second).
export function strainDrive(amount, speed) {
	return {
		gain: amount ** 1.5 * (0.3 + 0.7 * (1 - Math.exp(-Math.abs(speed) / 0.15))),
		rate: 16 + 46 * amount,
		resonance: 650 + 1100 * amount,
	}
}
