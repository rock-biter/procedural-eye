// The living eye (pure): pupil light reflex with hippus, eye movements and
// blinks, stepped by the frame loop. step() returns the pupil diameter, the
// optical axis orientation (yaw, pitch in degrees; the visual axis, which
// aims at the target, lies `kappa` degrees nasal of it), the lids' follow
// angles, the blink's closure (src/animation/blink.js) and the line of sight
// the camera frames (`framing`: the settled gaze, without the
// micro-movements; the center of the looks while the eye looks around,
// straight ahead while it follows the cursor, so it moves within a still
// frame).
import { createRandom, gaussian } from '../random'
import { BlinkModel } from './blink'
import { GazeModel } from './gaze'
import { PupilDynamics, watsonYellottDiameter } from './pupilDynamics'

// The pupil change of a look settles through two cascaded lags (seconds), so
// it eases in and out before the pupil dynamics take it.
const LOOK_PUPIL_LAG = 0.3

export default class Animator {
	constructor(seed = 1) {
		this.random = createRandom(`animator:${seed}`)
		this.pupil = null
		this.gaze = new GazeModel(this.random)
		this.gazeStarted = false
		// Blinks draw from their own stream, so they leave the looks as they were.
		this.blink = new BlinkModel(createRandom(`blink:${seed}`))
		// Looking around: the offset of the current look from the center and
		// the time left on it.
		this.look = { yaw: 0, pitch: 0 }
		this.lookTimer = 0
		// The pupil change of the current look (mm), its eased value, and the
		// gaze shifts it belongs to.
		this.lookPupil = 0
		this.lookPupilEased = [0, 0]
		this.shifts = 0
		this.time = 0
	}

	// Steady-state pupil for the scene: rig luminance × adaptation as cd/m².
	targetPupil(params, sceneLuminance) {
		return watsonYellottDiameter({
			luminance: sceneLuminance * params.animation.adaptation,
			age: params.eye.age,
		})
	}

	// `luminance(yaw, pitch)`: the scene luminance toward a line of sight
	// (degrees), `pointer`: { x, y } in [-1, 1] (the canvas), `camera`:
	// { yaw, pitch } of the camera seen from the eye, `nasalSign`: +1 for a
	// right eye.
	step(dt, params, { luminance, pointer, camera, nasalSign }) {
		const a = params.animation
		if (!a.enabled) return this.rest(params, nasalSign)
		this.time += dt

		let yaw
		let pitch
		if (a.gaze === 'camera') {
			yaw = camera.yaw
			pitch = camera.pitch
		} else if (a.gaze === 'cursor') {
			yaw = pointer.x * 25
			pitch = pointer.y * 18
		} else if (a.gaze === 'fixed') {
			yaw = a.yaw
			pitch = a.pitch
		} else {
			if (this.gazeStarted) this.lookTimer -= dt
			if (this.lookTimer <= 0) this.nextLook(a)
			yaw = a.yaw + this.look.yaw
			pitch = a.pitch + this.look.pitch
		}
		this.gaze.micro = a.microMovements
		this.gaze.slowdown = a.saccadeSlowdown
		// The first step starts at rest on the target: a frozen start shows the
		// steady state, as the pupil does.
		if (!this.gazeStarted) this.gaze.settle(yaw, pitch)
		this.gazeStarted = true
		this.gaze.setTarget(yaw, pitch)
		const gaze = this.gaze.step(dt)
		// A large gaze shift may bring a blink with it.
		if (this.gaze.shifts !== this.shifts)
			this.blink.gazeShift(this.gaze.shiftAmplitude, a.blinkRate)
		const blink = this.blink.step(dt, a.blinkRate, a.blinkSlowdown)

		// The light along the line of sight, and the pupil change of the look.
		const look = this.stepLookPupil(dt, a, pitch)
		const target = a.pupilReflex
			? this.targetPupil(params, luminance(gaze.yaw, gaze.pitch)) + look
			: params.iris.pupilDiameter
		this.pupil ??= new PupilDynamics(target, this.random)
		this.pupil.step(dt, Math.min(Math.max(target, 1.5), 8))
		const pupilDiameter = a.pupilReflex
			? this.pupil.withHippus(a.hippus)
			: params.iris.pupilDiameter

		let framing = { yaw, pitch }
		if (a.gaze === 'cursor') framing = { yaw: 0, pitch: 0 }
		else if (a.gaze === 'wander') framing = { yaw: a.yaw, pitch: a.pitch }
		return pose(params, pupilDiameter, gaze.yaw, gaze.pitch, nasalSign, framing, blink)
	}

	// The next look around animation.yaw / pitch: held for about
	// lookInterval seconds (log-normal), within lookRange (vertically 0.6 of
	// it); one look in three comes back near the center, the others land at
	// least a third of the range from the last one.
	nextLook(a) {
		const random = this.random
		const g = gaussian(random(), random())
		this.lookTimer = a.lookInterval * Math.exp(0.4 * g - 0.08)
		const range = a.lookRange
		if (!this.gazeStarted) {
			// The eye starts on the center.
			this.look = { yaw: 0, pitch: 0 }
			return
		}
		if (random() < 1 / 3) {
			const angle = random() * Math.PI * 2
			const radius = 0.15 * range * random()
			this.look = { yaw: radius * Math.cos(angle), pitch: 0.6 * radius * Math.sin(angle) }
			return
		}
		let look = this.look
		for (let i = 0; i < 8; i++) {
			const angle = random() * Math.PI * 2
			const radius = range * Math.sqrt(random())
			look = { yaw: radius * Math.cos(angle), pitch: 0.6 * radius * Math.sin(angle) }
			if (Math.hypot(look.yaw - this.look.yaw, look.pitch - this.look.pitch) >= range / 3) break
		}
		this.look = look
	}

	// Each gaze shift brings its own pupil size, within ±pupilResponse mm:
	// interest dilates it, nearer things constrict it (the near response),
	// and those lie more often below, so looks down constrict on average.
	// `pitch`: the line of sight of the look.
	stepLookPupil(dt, a, pitch) {
		if (this.gaze.shifts !== this.shifts) {
			this.shifts = this.gaze.shifts
			const g = gaussian(this.random(), this.random())
			this.lookPupil = a.pupilResponse * Math.min(Math.max(0.5 * g + (pitch - a.pitch) / 25, -1), 1)
		}
		const k = 1 - Math.exp(-dt / LOOK_PUPIL_LAG)
		const eased = this.lookPupilEased
		eased[0] += (this.lookPupil - eased[0]) * k
		eased[1] += (eased[0] - eased[1]) * k
		return eased[1]
	}

	// A still eye (the living eye off), posed by its parameters alone: the
	// pupil of iris.pupilDiameter and the line of sight along animation.yaw /
	// pitch, whatever the camera does, so the camera can circle a still subject.
	rest(params, nasalSign) {
		const { yaw, pitch } = params.animation
		return pose(params, params.iris.pupilDiameter, yaw, pitch, nasalSign, { yaw, pitch })
	}
}

// The step result for a line of sight (yaw, pitch in degrees).
function pose(params, pupilDiameter, yaw, pitch, nasalSign, framing, blink = 0) {
	const pitchRadians = (pitch * Math.PI) / 180
	const follow = params.animation.lidFollow
	return {
		pupilDiameter,
		// The optical axis sits κ temporal of the line of sight.
		yaw: yaw - nasalSign * params.eye.kappa,
		pitch,
		lidFollow: [0.9 * pitchRadians * follow, 0.35 * pitchRadians * follow],
		blink,
		framing,
	}
}
