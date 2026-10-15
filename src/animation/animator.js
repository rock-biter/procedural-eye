// The living eye (pure): pupil light reflex with hippus and eye movements,
// stepped by the frame loop. step() returns the pupil diameter, the optical
// axis orientation (yaw, pitch in degrees; the visual axis, which aims at the
// target, lies `kappa` degrees nasal of it), the lids' follow angles and the
// line of sight the camera frames (`framing`: the settled gaze, without the
// micro-movements; straight ahead while the eye roams after the cursor or
// wanders, so it moves within a still frame).
import { createRandom } from '../random'
import { GazeModel } from './gaze'
import { PupilDynamics, watsonYellottDiameter } from './pupilDynamics'

export default class Animator {
	constructor(seed = 1) {
		this.random = createRandom(`animator:${seed}`)
		this.pupil = null
		this.gaze = new GazeModel(this.random)
		this.gazeStarted = false
		this.wanderTimer = 0
		this.time = 0
	}

	// Steady-state pupil for the scene: rig luminance × adaptation as cd/m².
	targetPupil(params, sceneLuminance) {
		return watsonYellottDiameter({
			luminance: sceneLuminance * params.animation.adaptation,
			age: params.eye.age,
		})
	}

	// `pointer`: { x, y } in [-1, 1] (the canvas), `camera`: { yaw, pitch } of
	// the camera seen from the eye, `nasalSign`: +1 for a right eye.
	step(dt, params, { sceneLuminance, pointer, camera, nasalSign }) {
		const a = params.animation
		if (!a.enabled) return this.rest(params, nasalSign)
		this.time += dt
		const target = a.pupilReflex
			? this.targetPupil(params, sceneLuminance)
			: params.iris.pupilDiameter
		this.pupil ??= new PupilDynamics(target, this.random)
		this.pupil.step(dt, target)
		const pupilDiameter = a.pupilReflex
			? this.pupil.withHippus(a.hippus)
			: params.iris.pupilDiameter

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
			this.wanderTimer -= dt
			if (this.wanderTimer <= 0) {
				this.wanderTimer = 0.8 + 2.2 * this.random()
				this.wanderTarget = { yaw: (this.random() - 0.5) * 24, pitch: (this.random() - 0.5) * 14 }
			}
			yaw = this.wanderTarget.yaw
			pitch = this.wanderTarget.pitch
		}
		this.gaze.microsaccades = a.microsaccades
		// The first step starts at rest on the target: a frozen start shows the
		// steady state, as the pupil does.
		if (!this.gazeStarted) this.gaze.settle(yaw, pitch)
		this.gazeStarted = true
		this.gaze.setTarget(yaw, pitch)
		const gaze = this.gaze.step(dt)
		const roams = a.gaze === 'cursor' || a.gaze === 'wander'
		const framing = roams ? { yaw: 0, pitch: 0 } : { yaw, pitch }
		return pose(params, pupilDiameter, gaze.yaw, gaze.pitch, nasalSign, framing)
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
function pose(params, pupilDiameter, yaw, pitch, nasalSign, framing) {
	const pitchRadians = (pitch * Math.PI) / 180
	const follow = params.animation.lidFollow
	return {
		pupilDiameter,
		// The optical axis sits κ temporal of the line of sight.
		yaw: yaw - nasalSign * params.eye.kappa,
		pitch,
		lidFollow: [0.9 * pitchRadians * follow, 0.35 * pitchRadians * follow],
		framing,
	}
}
