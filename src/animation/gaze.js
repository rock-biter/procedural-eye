// Eye movements (pure): saccades to a target (main-sequence durations,
// minimum-jerk profile), microsaccades during fixation (Poisson, ≤ 1°) and
// slow drift (an Ornstein–Uhlenbeck process). Angles in degrees: yaw positive
// toward +X (the right of the picture), pitch positive up. The orientation
// follows Listing's law: the shortest-arc rotation from primary position.

export const GAZE = Object.freeze({
	saccadeThreshold: 0.6,
	microsaccadeRate: 1.5, // per second
	microsaccadeAmplitude: 0.35,
	driftSigma: 0.25, // °/√s
	driftReturn: 2.5, // 1/s
})

// Saccade duration (s) for an amplitude (°): about 2.2 ms per degree + 21 ms.
export function saccadeDuration(amplitude) {
	return (2.2 * amplitude + 21) / 1000
}

// Main-sequence peak velocity (°/s).
export function saccadePeakVelocity(amplitude) {
	return 500 * (1 - Math.exp(-amplitude / 14))
}

const minimumJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t)

export class GazeModel {
	constructor(random = Math.random, settings = GAZE) {
		this.random = random
		this.settings = settings
		this.yaw = 0
		this.pitch = 0
		this.target = { yaw: 0, pitch: 0 }
		this.saccade = null
		this.drift = { yaw: 0, pitch: 0 }
		this.microsaccades = true
	}

	setTarget(yaw, pitch) {
		this.target = { yaw, pitch }
	}

	// Puts the eye at rest on (yaw, pitch), the steady state, without a saccade.
	settle(yaw, pitch) {
		this.target = { yaw, pitch }
		this.yaw = yaw
		this.pitch = pitch
		this.saccade = null
	}

	startSaccade(yaw, pitch) {
		const amplitude = Math.hypot(yaw - this.yaw, pitch - this.pitch)
		this.saccade = {
			from: { yaw: this.yaw, pitch: this.pitch },
			to: { yaw, pitch },
			elapsed: 0,
			duration: saccadeDuration(amplitude),
		}
	}

	gaussian() {
		const u = Math.max(this.random(), 1e-12)
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.random())
	}

	step(dt) {
		const s = this.settings
		if (this.saccade) {
			const saccade = this.saccade
			saccade.elapsed += dt
			const t = Math.min(saccade.elapsed / saccade.duration, 1)
			const k = minimumJerk(t)
			this.yaw = saccade.from.yaw + (saccade.to.yaw - saccade.from.yaw) * k
			this.pitch = saccade.from.pitch + (saccade.to.pitch - saccade.from.pitch) * k
			if (t >= 1) this.saccade = null
		} else {
			const error = Math.hypot(this.target.yaw - this.yaw, this.target.pitch - this.pitch)
			if (error > s.saccadeThreshold) {
				this.startSaccade(this.target.yaw, this.target.pitch)
			} else if (this.microsaccades && this.random() < s.microsaccadeRate * dt) {
				const amplitude = Math.min(1, s.microsaccadeAmplitude * Math.exp(0.5 * this.gaussian()))
				const angle = this.random() * Math.PI * 2
				// Microsaccades also correct the drift back toward the target.
				const yaw =
					this.target.yaw + 0.5 * (this.yaw - this.target.yaw) + amplitude * Math.cos(angle)
				const pitch =
					this.target.pitch + 0.5 * (this.pitch - this.target.pitch) + amplitude * Math.sin(angle)
				this.startSaccade(yaw, pitch)
			} else {
				// Drift: mean-reverting random walk around the fixation point.
				const decay = Math.exp(-s.driftReturn * dt)
				const noise = s.driftSigma * Math.sqrt(dt)
				this.yaw = this.target.yaw + (this.yaw - this.target.yaw) * decay + noise * this.gaussian()
				this.pitch =
					this.target.pitch + (this.pitch - this.target.pitch) * decay + noise * this.gaussian()
			}
		}
		return { yaw: this.yaw, pitch: this.pitch }
	}
}

// Listing's law: the rotation (quaternion [x, y, z, w]) taking the primary
// direction +Z to the gaze direction by the shortest arc, so no torsion.
export function gazeQuaternion(yaw, pitch) {
	const y = (yaw * Math.PI) / 180
	const p = (pitch * Math.PI) / 180
	const direction = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)]
	// Axis = +Z × direction, angle = acos(direction.z).
	const axis = [-direction[1], direction[0], 0]
	const length = Math.hypot(axis[0], axis[1])
	if (length < 1e-12) return [0, 0, 0, 1]
	const angle = Math.acos(Math.min(Math.max(direction[2], -1), 1))
	const s = Math.sin(angle / 2) / length
	return [axis[0] * s, axis[1] * s, 0, Math.cos(angle / 2)]
}
