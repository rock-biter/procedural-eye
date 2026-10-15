// Pupil size (pure). The steady-state diameter follows Watson & Yellott's
// unified formula (luminance, field area, age, one or two eyes); the dynamics
// follow Pamplona et al.'s model in M = atanh((D − 4.9) / 3): the pupil
// answers the luminance of `latency` seconds ago, approaching the target
// exponentially in M, constricting about three times faster than it dilates,
// within the measured velocity limits, with hippus (pupillary unrest) on top.
// Data: docs/RESEARCH.md.

export function stanleyDaviesDiameter(luminance, fieldArea) {
	const x = ((Math.max(luminance, 0) * fieldArea) / 846) ** 0.41
	return 7.75 - (5.75 * x) / (x + 2)
}

// Watson & Yellott 2012: luminance in cd/m², field area in deg², age in years.
export function watsonYellottDiameter({ luminance, fieldArea = 1250, age = 30, eyes = 2 }) {
	const effective = luminance * (eyes === 1 ? 0.1 : 1)
	const base = stanleyDaviesDiameter(effective, fieldArea)
	return base + (age - 28.58) * (0.02132 - 0.009562 * base)
}

const toM = (d) => Math.atanh((Math.min(Math.max(d, 1.95), 7.85) - 4.9) / 3)
const fromM = (m) => 4.9 + 3 * Math.tanh(m)

export const PUPIL_DYNAMICS = Object.freeze({
	latency: 0.23,
	constrictionTime: 0.22,
	dilationTime: 0.7,
	maxConstriction: 4.2, // mm/s
	maxDilation: 1.1,
	step: 1 / 240,
})

export class PupilDynamics {
	constructor(diameter, random = Math.random, settings = PUPIL_DYNAMICS) {
		this.settings = settings
		this.diameter = diameter
		this.time = 0
		this.history = [{ time: 0, target: diameter }]
		this.carry = 0
		// Hippus: a few slow sines with seeded phases (0.05–2.3 Hz).
		this.hippus = Array.from({ length: 5 }, (_, i) => ({
			frequency: 0.05 * 2.6 ** i,
			phase: random() * Math.PI * 2,
			weight: 1 / (1 + i),
		}))
	}

	// The target the pupil reacts to now: the one from `latency` ago.
	delayedTarget() {
		const time = this.time - this.settings.latency
		let target = this.history[0].target
		for (const entry of this.history) {
			if (entry.time <= time) target = entry.target
			else break
		}
		return target
	}

	// Advances by `dt` seconds toward `target` (mm), in fixed steps.
	step(dt, target) {
		const s = this.settings
		this.carry += dt
		while (this.carry >= s.step) {
			this.carry -= s.step
			this.time += s.step
			this.history.push({ time: this.time, target })
			while (this.history.length > 2 && this.history[1].time <= this.time - s.latency)
				this.history.shift()
			const goal = this.delayedTarget()
			const constricting = goal < this.diameter
			const tau = constricting ? s.constrictionTime : s.dilationTime
			const m = toM(goal) + (toM(this.diameter) - toM(goal)) * Math.exp(-s.step / tau)
			let next = fromM(m)
			const limit = (constricting ? s.maxConstriction : s.maxDilation) * s.step
			next = Math.min(Math.max(next, this.diameter - limit), this.diameter + limit)
			this.diameter = next
		}
		return this.diameter
	}

	// Diameter with hippus of `amplitude` mm (RMS about amplitude / 2).
	withHippus(amplitude) {
		let sum = 0
		let norm = 0
		for (const h of this.hippus) {
			sum += h.weight * Math.sin(2 * Math.PI * h.frequency * this.time + h.phase)
			norm += h.weight
		}
		return this.diameter + (amplitude * sum) / norm
	}
}
