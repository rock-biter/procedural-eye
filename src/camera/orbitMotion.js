// The motion of the pointer controls (src/camera/cameraControls.js), in
// degrees and seconds: the orbit's speed when a drag lets go, its coasting
// afterwards, and the lagged follow of the mouse parallax.

// How far back the release speed looks: the drag of the last tenth of a
// second, so a pointer held still before letting go does not coast.
export const RELEASE_WINDOW = 0.1
// Below this distance left to coast (degrees), the orbit stops.
const COAST_REST = 0.005

// `track`: { time (s), azimuth, elevation } after each move of a drag, oldest
// first; `time`: the release. The mean speed (deg/s) from the oldest move of
// the window to the release, so the time the pointer stood still counts.
export function releaseVelocity(track, time) {
	const recent = track.filter((entry) => time - entry.time <= RELEASE_WINDOW)
	if (recent.length < 2) return { azimuth: 0, elevation: 0 }
	const first = recent[0]
	const last = recent.at(-1)
	const span = Math.max(time - first.time, 1e-3)
	return {
		azimuth: (last.azimuth - first.azimuth) / span,
		elevation: (last.elevation - first.elevation) / span,
	}
}

// One step of a coasting orbit: the speed decays with the time constant `tau`
// (s), so a release at speed v coasts v·tau in all. Exact for any `dt`.
// Returns the turn of the step and the speed after it, or a null speed once
// what is left to coast falls under COAST_REST.
export function coast(velocity, dt, tau) {
	if (tau <= 0) return { azimuth: 0, elevation: 0, velocity: null }
	const decay = Math.exp(-dt / tau)
	const share = tau * (1 - decay)
	const next = { azimuth: velocity.azimuth * decay, elevation: velocity.elevation * decay }
	const left = Math.hypot(next.azimuth, next.elevation) * tau
	return {
		azimuth: velocity.azimuth * share,
		elevation: velocity.elevation * share,
		velocity: left < COAST_REST ? null : next,
	}
}

// `current` glides toward `target` with the time constant `lag` (s; 0 jumps),
// and lands on it once closer than `rest`.
export function follow(current, target, dt, lag, rest = 1e-3) {
	const next = lag > 0 ? target + (current - target) * Math.exp(-dt / lag) : target
	return Math.abs(next - target) < rest ? target : next
}
