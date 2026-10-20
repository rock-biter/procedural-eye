// The arithmetic of the camera foley (docs/AUDIO.md), apart from Web Audio:
// detents crossed between two values, the drive of the continuous voices from
// a speed, and the events at the ends of a track (src/audio/cameraFoley.js).

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

// 0 at rest to 1 at speeds well above `scale`.
const drive = (speed, scale) => 1 - Math.exp(-Math.abs(speed) / scale)

// The power zoom's motor at a zoom speed (levels per second; the buttons
// glide the whole track in zoom.duration, up to about 2.7 levels/s): its
// gain, and its rate spinning up with it, a little higher zooming in.
export function motorDrive(speed) {
	const amount = drive(speed, 0.5)
	return { gain: amount, rate: (0.82 + 0.3 * amount) * (speed >= 0 ? 1.03 : 0.97) }
}

// The zoom ring turned by hand at a speed (levels per second): the gain of
// its friction, the cutoff of its noise (Hz) and the rate of its grit.
export function ringDrive(speed) {
	const amount = drive(speed, 0.8)
	return { gain: amount, cutoff: 700 + 2600 * amount, rate: 0.6 + 1.4 * amount }
}

// The tripod head's swish at an orbit speed (degrees per second).
export function orbitDrive(speed) {
	const amount = drive(speed, 70)
	return { gain: amount, cutoff: 260 + 700 * amount }
}

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
		gain: amount ** 1.5 * (0.3 + 0.7 * drive(speed, 0.15)),
		rate: 16 + 46 * amount,
		resonance: 650 + 1100 * amount,
	}
}

const END = 1e-3

// The end-stop event of a track's level moving from `from` to `to`: 'stop'
// when it reaches an end (or passes it) from inside, 'settle' when it comes
// back to an end from past it (a spring back), null otherwise.
export function endEvent(from, to) {
	if (from === null || from === undefined) return null
	const inside = (level) => level > END && level < 1 - END
	const past = (level) => level < -END || level > 1 + END
	if (inside(from) && !inside(to)) return 'stop'
	if (past(from) && !past(to)) return 'settle'
	return null
}
