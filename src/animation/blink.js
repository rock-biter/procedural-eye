// Spontaneous blinks (pure): when the lids blink and how far they close.
// step() returns the blink's closure, 0 open (the lids where `lids.closure`
// rests them) to 1 closed, which the lid meshes morph by
// (src/adnexa/lidBlink.js).
//
// - Rate: blinks come about `rate` times a minute (15.5 at rest, Argilés
//   2015), at intervals spread log-normally (Borges 2010): a blink follows
//   another within a second now and then, and some intervals are long.
// - Kinematics: the upper lid closes in 0.10 s and opens in 0.21 s (Casse
//   2007); a complete blink rests closed for a moment (10–50 ms). The speed of
//   each phase rises and falls (a parabola in voluntary blinks, Kwon 2013), so
//   each eases in and out; the last tenth of the opening creeps on for half a
//   second (Kwon's late opening phase).
// - Depth: about one blink in seven stops short (14.5%, Argilés 2015).
// - Gaze-evoked blinks: a large gaze shift brings a blink with it, nearly
//   always past about 33° (Evinger 1994).
// - Held (`held`, the intro until its end): no blink starts on its own and
//   the spontaneous ones' timer waits.
// `slowdown` stretches every phase (below 1 it shortens them).
import { lerp, smoothstep } from '../math'
import { gaussian } from '../random'

export const BLINK = Object.freeze({
	// Phase durations (s).
	closing: 0.1,
	closed: 0.03,
	opening: 0.21,
	// The share of the opening that creeps, and how long the opening lasts with it.
	creep: 0.1,
	settle: 0.5,
	// σ of the log-normal interval (a coefficient of variation of about 0.8).
	spread: 0.7,
	// Share of incomplete blinks and the range of their depth.
	incomplete: 0.15,
	partial: [0.5, 0.9],
	// The chance of a gaze-evoked blink, rising with the shift (°) over this
	// range up to `evokedChance`.
	evoked: [12, 36],
	evokedChance: 0.9,
})

const ease = (u) => smoothstep(0, 1, u)

export class BlinkModel {
	constructor(random = Math.random) {
		this.random = random
		// 'open', 'closing', 'closed' or 'opening', the time into it (s), the
		// closure it started from and the depth of the blink.
		this.phase = 'open'
		this.elapsed = 0
		this.from = 0
		this.depth = 1
		this.closure = 0
		// The time to the next spontaneous blink, in mean intervals: it runs at
		// the rate, so a new rate applies at once.
		this.timer = null
		// Blinks so far.
		this.count = 0
		// Whether blinks wait: none starts on its own, the timer stops.
		this.held = false
	}

	// The next spontaneous blink: a log-normal interval of mean 1.
	schedule() {
		const s = BLINK.spread
		this.timer = Math.exp(s * gaussian(this.random(), this.random()) - (s * s) / 2)
	}

	// Starts a blink from wherever the lids are (a blink can follow another
	// before the lids are fully open).
	start() {
		const random = this.random
		const [shallow, deep] = BLINK.partial
		this.depth = random() < BLINK.incomplete ? lerp(shallow, deep, random()) : 1
		this.phase = 'closing'
		this.from = this.closure
		this.elapsed = 0
		this.count++
	}

	get closingOrClosed() {
		return this.phase === 'closing' || this.phase === 'closed'
	}

	// A gaze shift of `amplitude` degrees may bring a blink with it; it counts
	// as the spontaneous one. `rate` 0: no blinks at all.
	gazeShift(amplitude, rate) {
		if (rate <= 0 || this.held || this.closingOrClosed) return
		const [low, high] = BLINK.evoked
		if (this.random() < BLINK.evokedChance * smoothstep(low, high, amplitude)) {
			this.start()
			this.schedule()
		}
	}

	// Opens the lids at once and ends the blink.
	reset() {
		this.phase = 'open'
		this.elapsed = 0
		this.closure = 0
	}

	// Duration (s) of the current phase.
	duration(slowdown) {
		const durations = {
			closing: BLINK.closing,
			closed: this.depth >= 1 ? BLINK.closed : 0,
			opening: BLINK.settle,
		}
		return durations[this.phase] * slowdown
	}

	// Advances `dt` seconds at `rate` blinks per minute; returns the closure.
	step(dt, rate, slowdown = 1) {
		if (this.timer === null) this.schedule()
		if (rate > 0 && !this.held) this.timer -= (dt * rate) / 60
		if (this.timer <= 0 && !this.held && !this.closingOrClosed) {
			this.start()
			this.schedule()
		}
		let left = dt
		while (this.phase !== 'open') {
			const duration = this.duration(slowdown)
			const used = Math.min(left, duration - this.elapsed)
			this.elapsed += used
			left -= used
			if (this.elapsed < duration) break
			this.nextPhase()
		}
		this.closure = this.closureNow(slowdown)
		return this.closure
	}

	nextPhase() {
		this.elapsed = 0
		if (this.phase === 'closing') {
			// A blink that starts more closed than its depth closes no further.
			this.depth = Math.max(this.depth, this.from)
			this.phase = 'closed'
		} else if (this.phase === 'closed') {
			this.phase = 'opening'
		} else {
			this.phase = 'open'
		}
	}

	closureNow(slowdown) {
		const t = this.elapsed / slowdown
		switch (this.phase) {
			case 'closing': {
				const depth = Math.max(this.depth, this.from)
				return this.from + (depth - this.from) * ease(t / BLINK.closing)
			}
			case 'closed':
				return this.depth
			case 'opening': {
				const main = (1 - BLINK.creep) * (1 - ease(t / BLINK.opening))
				const creep = BLINK.creep * (1 - ease(t / BLINK.settle))
				return this.depth * (main + creep)
			}
			default:
				return 0
		}
	}
}
