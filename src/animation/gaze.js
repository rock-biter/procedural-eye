// Eye movements (pure): saccades to a target (main-sequence durations,
// minimum-jerk profile), microsaccades during fixation (Poisson, ≤ 1°) and
// slow drift. Angles in degrees: yaw positive toward +X (the right of the
// picture), pitch positive up. The orientation follows Listing's law: the
// shortest-arc rotation from primary position.
//
// The line of sight is a saccadic position plus a drift offset. The drift is
// smooth: its velocity is an Ornstein–Uhlenbeck process and the offset returns
// toward the saccadic position, so it has no frame-to-frame jitter. Two
// scales leave physiology on demand: `slowdown` stretches every saccade (a
// real one lasts two or three frames and reads as a jump in a macro close-up),
// and `micro` scales the rate and size of the microsaccades and the drift.

export const GAZE = Object.freeze({
	saccadeThreshold: 0.6,
	microsaccadeRate: 1.5, // per second
	microsaccadeAmplitude: 0.35,
	driftSpeed: 0.5, // RMS drift velocity, °/s (about 0.11° RMS offset)
	driftCorrelation: 0.2, // s
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
		// The saccadic position, and the drift offset with its velocity.
		this.base = { yaw: 0, pitch: 0 }
		this.drift = { yaw: 0, pitch: 0 }
		this.driftVelocity = { yaw: 0, pitch: 0 }
		// Saccade duration factor (1: the main sequence) and the scale of the
		// micro-movements (0: none, 1: physiological).
		this.slowdown = 1
		this.micro = 1
		// Saccades to a new target so far (microsaccades excluded).
		this.shifts = 0
	}

	setTarget(yaw, pitch) {
		this.target = { yaw, pitch }
	}

	// Puts the eye at rest on (yaw, pitch), the steady state, without a saccade.
	settle(yaw, pitch) {
		this.target = { yaw, pitch }
		this.base = { yaw, pitch }
		this.drift = { yaw: 0, pitch: 0 }
		this.driftVelocity = { yaw: 0, pitch: 0 }
		this.saccade = null
		this.yaw = yaw
		this.pitch = pitch
	}

	// A saccade of the saccadic position to (yaw, pitch); `micro` for a
	// microsaccade, which does not count as a shift.
	startSaccade(yaw, pitch, micro = false) {
		const amplitude = Math.hypot(yaw - this.base.yaw, pitch - this.base.pitch)
		this.saccade = {
			from: { ...this.base },
			to: { yaw, pitch },
			elapsed: 0,
			duration: saccadeDuration(amplitude) * this.slowdown,
		}
		if (!micro) this.shifts++
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
			this.base.yaw = saccade.from.yaw + (saccade.to.yaw - saccade.from.yaw) * k
			this.base.pitch = saccade.from.pitch + (saccade.to.pitch - saccade.from.pitch) * k
			if (t >= 1) this.saccade = null
		} else {
			const error = Math.hypot(this.target.yaw - this.base.yaw, this.target.pitch - this.base.pitch)
			if (error > s.saccadeThreshold) {
				this.startSaccade(this.target.yaw, this.target.pitch)
			} else if (this.micro > 0 && this.random() < s.microsaccadeRate * this.micro * dt) {
				const size = s.microsaccadeAmplitude * this.micro * Math.exp(0.5 * this.gaussian())
				const amplitude = Math.min(1, size)
				const angle = this.random() * Math.PI * 2
				// Microsaccades also correct half of the line of sight's error.
				const yaw = this.yaw + this.target.yaw
				const pitch = this.pitch + this.target.pitch
				this.startSaccade(
					0.5 * yaw + amplitude * Math.cos(angle) - this.drift.yaw,
					0.5 * pitch + amplitude * Math.sin(angle) - this.drift.pitch,
					true,
				)
			}
		}
		this.stepDrift(dt)
		this.yaw = this.base.yaw + this.drift.yaw
		this.pitch = this.base.pitch + this.drift.pitch
		return { yaw: this.yaw, pitch: this.pitch }
	}

	stepDrift(dt) {
		const s = this.settings
		const decay = Math.exp(-dt / s.driftCorrelation)
		const noise = s.driftSpeed * this.micro * Math.sqrt(1 - decay * decay)
		const back = Math.exp(-s.driftReturn * dt)
		for (const axis of ['yaw', 'pitch']) {
			this.driftVelocity[axis] = this.driftVelocity[axis] * decay + noise * this.gaussian()
			this.drift[axis] = this.drift[axis] * back + this.driftVelocity[axis] * dt
		}
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
