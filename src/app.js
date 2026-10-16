// The application: owns the eye rig, the eyeball, the light rig, the physical
// camera and the post-processing, and runs the frame loop. Parameter changes
// arrive through onParamChange(path); their schema `kind` decides what is
// rebuilt, and any change restarts the accumulation. While nothing changes,
// frames accumulate jittered samples (pixel, lens) until
// params.quality.photoSamples, then rendering stops and the image stays.
// transitionTo() carries the params to new values over a couple of seconds
// (src/params/paramTransition.js), so the eye transforms in place.
import {
	Color,
	DataTexture,
	DataUtils,
	HalfFloatType,
	LinearFilter,
	Quaternion,
	RedFormat,
	Vector3,
} from 'three'
import Animator from './animation/animator'
import { gazeQuaternion } from './animation/gaze'
import CameraControls from './camera/cameraControls'
import { accumulationSample } from './camera/lensSampling'
import PhysicalCamera from './camera/physicalCamera'
import { entrancePupil } from './eye/cornealOptics'
import Lashes from './adnexa/lashes'
import { bakeFissureMap, FISSURE_MAP } from './adnexa/fissureMap'
import Lids from './adnexa/lids'
import TearFilm from './adnexa/tearFilm'
import Eyeball from './eye/eyeball'
import { createEyeGeometry } from './eye/eyeProfile'
import EyeRig from './eye/eyeRig'
import IrisAtlas from './iris/irisAtlas'
import IrisColorLut from './iris/irisColorLut'
import { createIrisSpace } from './iris/irisSpace'
import { hexToLinearRgb } from './lighting/colorTemperature'
import { EMITTER_TYPE, sceneLuminance, sphericalDirection } from './lighting/envRig'
import KeyShadow from './lighting/keyShadow'
import LightRig from './lighting/lightRig'
import { applyOverrides, cloneParams, encodeState, getLeaf } from './params/params'
import { PARAM_SCHEMA } from './params/paramSchema'
import { ParamTransition, TRANSITION } from './params/paramTransition'
import PostProcessing from './render/postProcessing'
import { FOCUS_AT_INFINITY } from './renderSetup'
import ScleraMaps from './sclera/scleraMaps'
import { SCLERA_PSI } from './sclera/vesselGenerator'

export default class EyeApp {
	// `frozen`: start with the animation clock stopped (captures).
	constructor({ setup, params, frozen = false }) {
		this.setup = setup
		this.params = params
		// Photo mode: the animation clock stops and frames accumulate.
		this.frozen = frozen
		this.animator = new Animator()
		this.pointer = { x: 0, y: 0 }
		this.pupilDiameter = params.iris.pupilDiameter
		this.gaze = new Quaternion()
		// The line of sight the camera frames (src/animation/animator.js).
		this.framing = { yaw: 0, pitch: 0 }
		this.animationStarted = false
		// The last pose, and the one a transition's pose glides from.
		this.lastPose = null
		this.poseFrom = null
		// The running parameter transition.
		this.transition = null
		window.addEventListener('pointermove', (event) => {
			this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
			this.pointer.y = 1 - (event.clientY / window.innerHeight) * 2
		})
		window.addEventListener('keydown', (event) => {
			if (event.code === 'Space' && event.target === document.body) this.toggleFrozen()
		})
		this.irisSpace = null
		// The lids and eye the lid mesh and the fissure map were built for.
		this.lidKey = null
		this.dirty = new Set(['rebuild', 'bake', 'define'])
		this.listeners = new Set()
		this.lastTime = null

		this.eyeRig = new EyeRig()
		setup.scene.add(this.eyeRig.pivot)
		this.lightRig = new LightRig()
		this.irisAtlas = new IrisAtlas()
		this.irisColorLut = new IrisColorLut()
		this.keyShadow = new KeyShadow()
		this.scleraMaps = new ScleraMaps()
		this.fissureMap = new DataTexture(
			new Uint16Array(FISSURE_MAP.size * FISSURE_MAP.size),
			FISSURE_MAP.size,
			FISSURE_MAP.size,
			RedFormat,
			HalfFloatType,
		)
		this.fissureMap.minFilter = LinearFilter
		this.fissureMap.magFilter = LinearFilter
		this.eyeball = new Eyeball(
			this.lightRig.eyeUniforms,
			{
				atlas: this.irisAtlas.texture,
				pigment: this.irisAtlas.pigmentTexture,
				colorLut: this.irisColorLut.texture,
			},
			this.keyShadow.uniforms,
			{ texture: this.fissureMap, extent: [FISSURE_MAP.halfWidth, FISSURE_MAP.halfHeight] },
			{ texture: this.scleraMaps.texture, psi: SCLERA_PSI },
			params.debug.view,
		)
		this.eyeRig.eyeSpace.add(this.eyeball.mesh)
		this.lids = new Lids(this.lightRig.worldUniforms, this.keyShadow.uniforms, params.debug.view)
		setup.scene.add(this.lids.mesh)
		this.lashes = new Lashes(
			this.lightRig.worldUniforms,
			this.keyShadow.uniforms,
			params.debug.view,
		)
		setup.scene.add(this.lashes.mesh)
		this.tearFilm = new TearFilm(this.lightRig.worldUniforms, this.keyShadow.uniforms)
		setup.scene.add(this.tearFilm.meniscus, this.tearFilm.bubbles)
		this.physicalCamera = new PhysicalCamera()
		this.post = new PostProcessing(setup.renderer, setup.scene, this.physicalCamera.camera)
		// Orbiting takes the camera over from a transition.
		this.controls = new CameraControls(setup.renderer.domElement, PARAM_SCHEMA, params, () => {
			this.transition?.cancel('camera')
			this.notifyChange('camera')
		})
		this.cameraEye = new Vector3()
		this.backdropColor = new Color()
		// Continuous interactive frames for measure(): { remaining, resolve }.
		this.benchmark = null
		this.compileMs = null
		this.rebuild()
		setup.onResize = () => this.resize()
		this.resize()
		this.frame = this.frame.bind(this)
	}

	// Compiles every program before the first frame (KHR_parallel_shader_compile
	// where available) and records how long it took.
	async start() {
		if (this.dirty.has('rebuild')) this.rebuild()
		if (this.dirty.has('rebuild') || this.dirty.has('bake')) this.bake()
		this.dirty.delete('rebuild')
		this.dirty.delete('bake')
		const started = performance.now()
		this.renderSample(null)
		await this.setup.renderer.compileAsync(this.setup.scene, this.physicalCamera.camera)
		this.compileMs = performance.now() - started
		this.invalidate()
		requestAnimationFrame(this.frame)
	}

	// Wall-clock time of `frames` interactive frames, each finished with a
	// synchronous one-pixel read: on ANGLE-Metal the timer queries are not
	// reliable, a forced completion is. Returns { meanMs, minMs, maxMs, samples }.
	measureSync(frames = 30) {
		const renderer = this.setup.renderer
		const times = []
		// Reading the canvas would wait for the display; the scene buffer is
		// offscreen and written every frame, kept or not.
		const pixel = new Uint16Array(4)
		const finish = () => {
			renderer.readRenderTargetPixels(this.post.composer.inputBuffer, 0, 0, 1, 1, pixel)
		}
		const render = () => {
			this.invalidate()
			this.post.accumulation.passthrough = this.restartsEveryFrame
			this.renderSample(null)
			this.post.accumulation.passthrough = false
			finish()
		}
		render()
		for (let i = 0; i < frames; i++) {
			const start = performance.now()
			render()
			times.push(performance.now() - start)
		}
		times.sort((a, b) => a - b)
		const round = (value) => Math.round(value * 100) / 100
		return {
			meanMs: round(times.reduce((sum, value) => sum + value, 0) / frames),
			medianMs: round(times[Math.floor(frames / 2)]),
			minMs: round(times[0]),
			maxMs: round(times[frames - 1]),
			samples: frames,
		}
	}

	// Renders `frames` interactive frames back to back (no accumulation) and
	// resolves with the frame statistics, GPU time included where available.
	measure(frames = 120) {
		this.setup.frameStats.getStats()
		return new Promise((resolve) => {
			this.benchmark = { remaining: frames, resolve }
		})
	}

	rebuild() {
		this.eye = createEyeGeometry(this.params)
		this.irisSpace = this.createIrisSpace()
		// The camera aims at the apparent pupil plane (entrance pupil).
		this.focusDepth = entrancePupil(this.eye).depth
		this.eyeRig.setGeometry(this.eye)
		this.eyeball.rebuild(this.eye)
		// The lid mesh and the fissure map take about half a second: they are
		// rebuilt only when the lids or the eye change, not for a new lash seed.
		const lidKey = JSON.stringify([this.params.lids, this.eye])
		if (lidKey !== this.lidKey) {
			this.lidKey = lidKey
			this.lids.rebuild(this.params, this.eye, this.setup.renderer)
			const distances = bakeFissureMap(this.params.lids, this.eye.nasalSign)
			const data = this.fissureMap.image.data
			for (let i = 0; i < distances.length; i++) data[i] = DataUtils.toHalfFloat(distances[i])
			this.fissureMap.needsUpdate = true
		}
		this.lashes.rebuild(this.params, this.eye)
		this.tearFilm.rebuild(this.params, this.eye)
	}

	createIrisSpace() {
		return createIrisSpace({
			restPupilRadius: this.params.iris.restPupilDiameter / 2,
			rootRadius: this.params.iris.rootRadius,
			collaretteFraction: this.params.irisStructure.collarette.position,
			thicknessResponse: this.params.irisStructure.thicknessResponse,
		})
	}

	// The color lookup and the vessel map rebuild only when their inputs
	// change; during a transition the lookup crossfades instead.
	bake() {
		this.irisSpace = this.createIrisSpace()
		this.irisAtlas.bake(this.setup.renderer, this.params, this.irisSpace, this.eye.nasalSign)
		if (!this.irisColorLut.blending) this.irisColorLut.update(this.params.irisColor)
		this.scleraMaps.bake(this.params, this.eye.scleraRadius)
	}

	resize() {
		const { width, height } = this.setup.sizes
		this.post.setSize(width, height)
		this.invalidate()
	}

	// Call after changing the parameter at `path`.
	onParamChange(path) {
		const leaf = getLeaf(PARAM_SCHEMA, path)
		if (this.transition) this.interruptTransition(path, leaf)
		this.markDirty(path)
		this.setup.syncQuality(this.params)
		this.notifyChange(path)
	}

	markDirty(path) {
		const leaf = getLeaf(PARAM_SCHEMA, path)
		if (leaf) this.dirty.add(leaf.kind)
	}

	// Carries the params to `target` (a full params object) over `duration`
	// seconds: numbers and colors glide, the rest switches at the start.
	transitionTo(target, duration = TRANSITION.duration) {
		const mode = (p) =>
			p.animation.enabled ? `${p.animation.gaze}:${p.animation.pupilReflex}` : 'still'
		const modeChanges = mode(this.params) !== mode(target)
		this.transition = new ParamTransition(PARAM_SCHEMA, this.params, target, duration)
		for (const path of this.transition.switched) this.markDirty(path)
		this.irisColorLut.beginBlend(target.irisColor)
		// A pose that changes its source (a still eye coming alive, another gaze
		// mode) glides from where it was.
		this.poseFrom = modeChanges ? this.lastPose : null
		this.setup.syncQuality(this.params)
		this.notifyChange('*')
	}

	// The params as they will be when the running transition ends.
	get targetParams() {
		return this.transition ? this.transition.target : this.params
	}

	stepTransition(dt) {
		const transition = this.transition
		for (const path of transition.step(dt)) this.markDirty(path)
		if (this.irisColorLut.blending) this.irisColorLut.setBlend(transition.progress)
		this.invalidate()
		if (transition.done) this.endTransition()
	}

	// Ends the running transition on its target, except under `keep` (a path
	// someone just set).
	finishTransition(keep = null) {
		if (!this.transition) return
		if (keep) this.transition.cancel(keep)
		for (const path of this.transition.finish()) this.markDirty(path)
		if (this.irisColorLut.blending) this.irisColorLut.setBlend(1)
		this.endTransition()
	}

	endTransition() {
		this.transition = null
		this.poseFrom = null
		this.notifyChange('*')
	}

	// An edit during a transition: a value read every frame just stops
	// gliding; a baked or rebuilt one ends the transition, because the color
	// lookup cannot crossfade under it.
	interruptTransition(path, leaf) {
		if (leaf?.kind === 'uniform') this.transition.cancel(path)
		else this.finishTransition(path)
	}

	notifyChange(path) {
		this.invalidate()
		for (const listener of this.listeners) listener(path)
	}

	invalidate() {
		this.post.accumulation.reset()
	}

	toggleFrozen() {
		this.frozen = !this.frozen
		this.notifyChange('frozen')
	}

	// The eye's pose for this frame. A living eye steps the animation and keeps
	// restarting the image; in photo mode it keeps its instant (a frozen start
	// takes one step, the steady state). A still eye (animation.enabled off) is
	// posed by its parameters whenever the image restarts.
	pose(delta) {
		const living = this.params.animation.enabled
		if (living && !this.frozen) {
			this.animate(delta)
			this.invalidate()
		} else if (living ? !this.animationStarted : this.samples === 0) {
			this.animate(0)
		}
	}

	// One animation step: pupil, gaze, lids, framing.
	animate(delta) {
		const { animation, camera: lens } = this.params
		// A first look into the camera starts where it settles: the eye looking
		// along the orbit, the camera framing its pupil.
		if (!this.animationStarted && animation.enabled && animation.gaze === 'camera') {
			this.framing = { yaw: lens.azimuth, pitch: lens.elevation }
		}
		// The camera of this frame (renderSample places it again with its sample).
		this.physicalCamera.update(
			this.params,
			this.eye,
			this.focusDepth,
			this.setup.getDrawingBufferSize(),
			null,
			this.framing,
		)
		const camera = this.physicalCamera.camera.position
		let result = this.animator.step(Math.min(delta, 0.1), this.params, {
			// The pupil weighs the light by its angle from the line of sight.
			luminance: (yaw, pitch) =>
				sceneLuminance(
					this.params.lighting,
					this.lightRig.emitters,
					sphericalDirection(yaw, pitch),
				),
			pointer: this.pointer,
			camera: {
				yaw: (Math.atan2(camera.x, camera.z) * 180) / Math.PI,
				pitch: (Math.atan2(camera.y, Math.hypot(camera.x, camera.z)) * 180) / Math.PI,
			},
			nasalSign: this.eye.nasalSign,
		})
		if (this.poseFrom && this.transition)
			result = blendPose(this.poseFrom, result, this.transition.progress)
		this.lastPose = result
		this.pupilDiameter = result.pupilDiameter
		this.framing = result.framing
		this.gaze.fromArray(gazeQuaternion(result.yaw, result.pitch))
		this.eyeRig.setGaze(this.gaze)
		this.keyShadow.uniforms.uLidFollow.value.fromArray(result.lidFollow)
		this.animationStarted = true
	}

	get samples() {
		return this.post.accumulation.samples
	}

	get converged() {
		return this.samples >= this.params.quality.photoSamples
	}

	frame(time) {
		requestAnimationFrame(this.frame)
		const delta = this.lastTime === null ? 0 : time - this.lastTime
		this.lastTime = time
		// A long frame (a rebuild, a compile) does not skip the transition.
		if (this.transition) this.stepTransition(Math.min(delta / 1000, 0.1))
		if (this.dirty.has('rebuild')) this.rebuild()
		if (this.dirty.has('rebuild') || this.dirty.has('bake')) this.bake()
		if (this.dirty.has('define')) {
			this.eyeball.setDebugView(this.params.debug.view)
			this.lids.setDebugView(this.params.debug.view)
			this.lashes.setDebugView(this.params.debug.view)
		}
		this.dirty.clear()
		if (this.benchmark) {
			this.measureFrame(time)
			return
		}
		this.pose(delta / 1000)
		if (this.converged) return

		// Only interactive frames adapt the resolution: a resize restarts the
		// accumulation. It comes before the frame is drawn: a canvas resized
		// after drawing is cleared, and the browser would show it black.
		if (this.samples === 0 && delta > 0) this.setup.adaptPixelRatio(delta)
		const stats = this.setup.frameStats
		stats.beginFrame(time)
		const fresh = this.samples === 0
		// A living eye or a transition restarts the image on the next frame:
		// this one is shown without being kept.
		this.post.accumulation.passthrough = fresh && this.restartsEveryFrame
		this.renderSample(fresh ? null : accumulationSample(this.samples))
		this.post.accumulation.passthrough = false
		stats.endFrame()
	}

	get restartsEveryFrame() {
		return (this.params.animation.enabled && !this.frozen) || this.transition !== null
	}

	measureFrame(time) {
		const stats = this.setup.frameStats
		stats.beginFrame(time)
		this.invalidate()
		this.post.accumulation.passthrough = this.restartsEveryFrame
		this.renderSample(null)
		this.post.accumulation.passthrough = false
		stats.endFrame()
		if (--this.benchmark.remaining <= 0) {
			const { resolve } = this.benchmark
			this.benchmark = null
			// The last GPU queries resolve a few frames later.
			setTimeout(() => resolve({ ...this.setup.getStats(), compileMs: this.compileMs }), 300)
		}
	}

	renderSample(sample) {
		const size = this.setup.getDrawingBufferSize()
		this.physicalCamera.update(this.params, this.eye, this.focusDepth, size, sample, this.framing)
		this.eyeRig.updateMatrices()
		this.lightRig.update(this.params.lighting, this.physicalCamera.camera, this.eyeRig.worldToEye)
		this.setup.renderer.setClearColor(
			this.backdropColor.setRGB(...this.backdropRadiance()),
			FOCUS_AT_INFINITY,
		)
		// The key light casts the lid and lash shadows (studio panels and windows only).
		const key = this.lightRig.emitters[0]
		const casts = key && key.type <= EMITTER_TYPE.WINDOW
		this.keyShadow.render(
			this.setup.renderer,
			this.setup.scene,
			casts ? key : null,
			[0, 0, this.eye.apexZ - 4],
			sample,
		)
		this.eyeRig.toEye(this.physicalCamera.camera.position, this.cameraEye)
		const camera = this.physicalCamera.camera
		const pixelAngle = (camera.fov * Math.PI) / 180 / size.height
		this.eyeball.update(
			this.params,
			this.pupilDiameter,
			this.eye,
			this.irisSpace,
			this.cameraEye,
			pixelAngle,
			!sample,
			this.eyeRig.eyeToWorld,
			this.reflectedRadiance(this.params.skin.color, 0.35),
			this.reflectedRadiance(this.params.lashes.color, 0.5),
			this.lightRig.luminance * 0.05,
		)
		this.lids.update(this.params, pixelAngle)
		this.lashes.update(this.params)
		const lens = this.params.camera
		this.post.update(this.params, size, {
			focalLength: lens.focalLength,
			fNumber: lens.fNumber,
			focusDistance: this.physicalCamera.focusDistance,
			sensorHeight: lens.sensorHeight,
		})
		this.post.render()
	}

	// The backdrop beyond the skin: the tone of the lit skin (its albedo,
	// saturated as the subsurface shading saturates it), skin.backdrop as bright.
	backdropRadiance() {
		const light = this.lightRig.luminance * 0.05 * this.params.skin.backdrop
		return hexToLinearRgb(this.params.skin.color).map((c) => c ** 1.3 * light)
	}

	// Approximate radiance of a diffuse surface of sRGB `hex` near the eye, lit
	// by the rig, as the cornea reflects it (`exposure`: share of the light).
	reflectedRadiance(hex, exposure) {
		const color = hexToLinearRgb(hex)
		const light = this.lightRig.luminance * exposure * 0.05
		return color.map((c) => c * light)
	}

	// The current image as a PNG data URL: the accumulated mean, re-presented
	// in the same task so the drawing buffer is still intact.
	capture() {
		const { renderPass, accumulation } = this.post
		// A living eye keeps no frame: keep this one.
		if (this.samples === 0) this.renderSample(null)
		renderPass.enabled = false
		accumulation.displayOnly = true
		this.post.render()
		const url = this.setup.renderer.domElement.toDataURL('image/png')
		renderPass.enabled = true
		accumulation.displayOnly = false
		return url
	}

	// window.__EYE__: the hooks of the capture script and the console.
	createApi() {
		return {
			params: this.params,
			getAccumulation: () => ({
				samples: this.samples,
				target: this.params.quality.photoSamples,
				converged: this.converged,
			}),
			getRenderStats: () => this.setup.getStats(),
			getState: () => encodeState(PARAM_SCHEMA, this.params),
			getParams: () => cloneParams(this.params),
			// A full params object to glide to (see main.js for presets).
			transitionTo: (target, duration) => this.transitionTo(cloneParams(target), duration),
			getTargetParams: () => cloneParams(this.targetParams),
			isTransitioning: () => this.transition !== null,
			setParams: (overrides) => {
				this.finishTransition()
				const unknown = applyOverrides(PARAM_SCHEMA, this.params, overrides)
				this.dirty.add('rebuild').add('define')
				this.notifyChange('*')
				return unknown
			},
			capture: () => this.capture(),
			toggleFrozen: () => this.toggleFrozen(),
			isFrozen: () => this.frozen,
			measure: (frames) => this.measure(frames),
			measureSync: (frames) => this.measureSync(frames),
			getCompileMs: () => this.compileMs,
			getEyeGeometry: () => ({ apexZ: this.eye.apexZ, focusDepth: this.focusDepth }),
		}
	}
}

// The pose `k` (0 to 1) of the way from pose `a` to pose `b`.
function blendPose(a, b, k) {
	const mix = (x, y) => x + (y - x) * k
	return {
		pupilDiameter: mix(a.pupilDiameter, b.pupilDiameter),
		yaw: mix(a.yaw, b.yaw),
		pitch: mix(a.pitch, b.pitch),
		lidFollow: [mix(a.lidFollow[0], b.lidFollow[0]), mix(a.lidFollow[1], b.lidFollow[1])],
		framing: {
			yaw: mix(a.framing.yaw, b.framing.yaw),
			pitch: mix(a.framing.pitch, b.framing.pitch),
		},
	}
}
