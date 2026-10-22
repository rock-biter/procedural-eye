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
	RGFormat,
	Vector3,
} from 'three'
import Animator from './animation/animator'
import { gazeQuaternion } from './animation/gaze'
import CameraControls from './camera/cameraControls'
import { accumulationSample } from './camera/lensSampling'
import PhysicalCamera from './camera/physicalCamera'
import { entrancePupil } from './eye/cornealOptics'
import Lashes from './adnexa/lashes'
import { lashWidening } from './adnexa/lashGenerator'
import { bakeFissureMap, FISSURE_MAP } from './adnexa/fissureMap'
import LidBlink from './adnexa/lidBlink'
import Lids from './adnexa/lids'
import TearFilm from './adnexa/tearFilm'
import Eyeball from './eye/eyeball'
import { createEyeGeometry } from './eye/eyeProfile'
import EyeRig from './eye/eyeRig'
import Terminator from './eye/terminator'
import IrisAtlas from './iris/irisAtlas'
import IrisColorLut from './iris/irisColorLut'
import { createIrisSpace } from './iris/irisSpace'
import { hexToLinearRgb } from './lighting/colorTemperature'
import { EMITTER_TYPE, sceneLuminance, sphericalDirection } from './lighting/envRig'
import KeyShadow from './lighting/keyShadow'
import LightRig from './lighting/lightRig'
import ShaftLight from './lighting/shaftLight'
import { applyOverrides, cloneParams, diffParams, encodeState, getLeaf } from './params/params'
import { PARAM_SCHEMA } from './params/paramSchema'
import { SKIN_TONES } from './params/skinTones'
import { ParamTransition, TRANSITION } from './params/paramTransition'
import Backdrop from './render/backdrop'
import { encodePng } from './render/pngEncoder'
import PostProcessing from './render/postProcessing'
import { FOCUS_AT_INFINITY } from './renderSetup'
import ScleraMaps from './sclera/scleraMaps'
import { SCLERA_PSI } from './sclera/vesselGenerator'

// The skin tone of the backdrop: the light tone, which the page was matched to.
const BACKDROP_SKIN = SKIN_TONES.find((tone) => tone.name === 'light').color

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
		// The lids, the back shell's shape and the eye the lid mesh, the back
		// shell and the fissure map were built for.
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
		this.shaftLight = new ShaftLight()
		// What the surfaces near the eye take from the key light besides the rig:
		// its shadow, the lids' follow and blink, and the light shafts' light
		// with their shadow.
		const keyLight = {
			...this.keyShadow.uniforms,
			...this.shaftLight.uniforms,
			...this.keyShadow.coverage.uniforms,
			...this.shaftLight.coverage.uniforms,
		}
		// The easter egg: the volume cannon's glitch on the eye (main.js).
		this.terminator = new Terminator()
		this.scleraMaps = new ScleraMaps()
		// The fissure map: r where the lids rest, g closed (the blink's,
		// src/adnexa/lidBlink.js).
		this.fissureMap = new DataTexture(
			new Uint16Array(FISSURE_MAP.size * FISSURE_MAP.size * 2),
			FISSURE_MAP.size,
			FISSURE_MAP.size,
			RGFormat,
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
			{ ...keyLight, ...this.terminator.uniforms },
			{ texture: this.fissureMap, extent: [FISSURE_MAP.halfWidth, FISSURE_MAP.halfHeight] },
			{ texture: this.scleraMaps.texture, psi: SCLERA_PSI },
			params.debug.view,
		)
		this.eyeRig.eyeSpace.add(this.eyeball.mesh)
		this.lids = new Lids(this.lightRig.worldUniforms, keyLight, params.debug.view)
		setup.scene.add(this.lids.mesh, this.lids.back, this.lids.shadow.mesh)
		this.lashes = new Lashes(this.lightRig.worldUniforms, keyLight, params.debug.view)
		setup.scene.add(this.lashes.mesh, this.lashes.shadow.mesh)
		this.tearFilm = new TearFilm(this.lightRig.worldUniforms, keyLight)
		setup.scene.add(this.tearFilm.meniscus)
		// The blink: the lid meshes morph through frames a worker builds.
		this.lidBlink = new LidBlink({
			lids: this.lids,
			lashes: this.lashes,
			tearFilm: this.tearFilm,
			fissureMap: this.fissureMap,
			uniform: this.keyShadow.uniforms.uLidBlink,
		})
		// The backdrop with the soft shadow of the skin patch.
		this.backdrop = new Backdrop({
			...this.keyShadow.coverage.uniforms,
			...this.shaftLight.coverage.uniforms,
		})
		setup.scene.add(this.backdrop.mesh)
		this.physicalCamera = new PhysicalCamera()
		this.post = new PostProcessing(
			setup.renderer,
			setup.scene,
			this.physicalCamera.camera,
			this.lightRig.worldUniforms,
			{ keyCoverage: this.keyShadow.coverage, shafts: this.shaftLight },
		)
		// The dust's clock (s), stopped in photo mode, and when it was last
		// shown over a converged image.
		this.dustTime = 0
		this.dustShown = -Infinity
		// The radians per pixel of this frame; the half-resolution share of a
		// split frame doubles them (src/render/scenePass.js).
		this.pixelAngle = 0.001
		this.post.renderPass.setPixelScale = (scale) => {
			this.eyeball.uniforms.uPixelAngle.value = this.pixelAngle * scale
			this.lids.uniforms.uPixelAngle.value = this.pixelAngle * scale
		}
		// Orbiting takes the camera over from a transition.
		this.controls = new CameraControls(setup.renderer.domElement, PARAM_SCHEMA, params, () => {
			this.transition?.cancel('camera')
			this.notifyChange('camera')
		})
		this.physicalCamera.orbitOffset = this.controls.parallax
		this.cameraEye = new Vector3()
		this.backdropColor = new Color()
		// Continuous interactive frames for measure(): { remaining, resolve }.
		this.benchmark = null
		this.compileMs = null
		// How long the last bake of the skin's relief took (ms, CPU side).
		this.skinBakeMs = null
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
		this.bakeSkin()
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
		this.eyeball.rebuild(this.eye)
		// The lid mesh, the back shell and the fissure map take about half a
		// second: they are rebuilt only when the lids, the shell's shape or the eye
		// change, not for a new lash seed.
		const { clearance, band } = this.params.shell
		const lidKey = JSON.stringify([this.params.lids, clearance, band, this.eye])
		const lids = lidKey !== this.lidKey
		if (lids) {
			this.lidKey = lidKey
			this.lids.rebuild(this.params, this.eye, this.setup.renderer)
			const distances = bakeFissureMap(this.params.lids, this.eye.nasalSign)
			const data = this.fissureMap.image.data
			for (let i = 0; i < distances.length; i++) data[i * 2] = DataUtils.toHalfFloat(distances[i])
			this.fissureMap.needsUpdate = true
		}
		this.lashes.rebuild(this.params, this.eye)
		this.tearFilm.rebuild(this.params, this.eye)
		this.lidBlink.invalidate(lids)
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

	// Bakes the skin's relief and freckles if the skin reads them baked and
	// their inputs changed (src/adnexa/lids.js). Returns whether it baked.
	bakeSkin() {
		const baked = this.lids.bakeRelief(this.setup.renderer, this.params)
		if (baked) this.skinBakeMs = this.lids.relief.bakeMs
		return baked
	}

	// Outside #debug the skin reads its relief and freckles baked; in #debug
	// it evaluates them per pixel, so the panel's edits show at once.
	setSkinBaked(baked) {
		this.lids.setBaked(baked)
		this.bakeSkin()
		this.invalidate()
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
		this.controls.stop()
		this.transition = new ParamTransition(PARAM_SCHEMA, this.params, target, duration)
		for (const path of this.transition.switched) this.markDirty(path)
		this.irisColorLut.beginBlend(target.irisColor)
		// A pose that changes its source (a still eye coming alive, another gaze
		// mode) glides from where it was.
		this.poseFrom = modeChanges ? this.lastPose : null
		this.setup.syncQuality(this.params)
		this.notifyChange('*')
	}

	// Switches the leaves of `overrides` (a deep partial) to its values at once,
	// without a transition (the intro's shuffle of irises): each leaf that
	// changes marks its kind dirty and is notified, as an edit is. A running
	// transition heads for these values too and stops gliding them.
	switchParams(overrides) {
		const before = cloneParams(this.params)
		applyOverrides(PARAM_SCHEMA, this.params, overrides)
		const changed = diffParams(PARAM_SCHEMA, before, this.params)
		if (this.transition) {
			applyOverrides(PARAM_SCHEMA, this.transition.target, overrides)
			for (const path of changed) this.transition.cancel(path)
		}
		for (const path of changed) {
			this.markDirty(path)
			this.notifyChange(path)
		}
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

	// An object shown, hidden or drawn as a wireframe from outside the params
	// (the mesh tree, ?meshtree=1): the soft coverages are made again from the
	// casters now shown, and the image restarts.
	refreshScene() {
		this.keyShadow.coverage.key = null
		this.shaftLight.coverage.key = null
		this.invalidate()
	}

	toggleFrozen() {
		this.frozen = !this.frozen
		// A photo keeps the eye open: a blink under way ends.
		if (this.frozen) {
			this.animator.blink.reset()
			this.lidBlink.set(0)
			if (this.lastPose) this.lastPose.blink = 0
		}
		this.notifyChange('frozen')
	}

	// Starts a blink now (a living eye whose blink frames are built), held or
	// not; it counts as the spontaneous one, which is rescheduled.
	blink() {
		if (!this.params.animation.enabled || this.frozen) return false
		this.animator.blink.start()
		this.animator.blink.schedule()
		return this.lidBlink.ready
	}

	// Holds the blinks (`held`: the intro, until its end), or lets them go
	// on: held, none starts on its own and the spontaneous ones' timer waits.
	holdBlinks(held) {
		this.animator.blink.held = held
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
		// A living eye that blinks needs the blink's frames.
		if (animation.enabled && animation.blinkRate > 0) this.lidBlink.prepare(this.params)
		this.lidBlink.set(result.blink)
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
		// The skin's relief bakes again once its inputs settle: not every
		// frame of a transition (outside #debug nothing changes them anyway).
		if (!this.transition && this.bakeSkin()) this.invalidate()
		if (this.benchmark) {
			this.measureFrame(time)
			return
		}
		// A coasting orbit restarts the image as a drag does; the parallax too.
		const living = this.params.animation.enabled && !this.frozen
		if (this.controls.update(Math.min(delta / 1000, 0.1), living)) this.invalidate()
		this.pose(delta / 1000)
		if (!this.frozen) this.dustTime += Math.min(delta / 1000, 0.1)
		if (this.shaftsMove) this.invalidate()
		// A shot's glitch runs in photo mode too, its preview does not.
		const glitchDelta = Math.min(delta / 1000, 0.1)
		if (this.terminator.step(glitchDelta, this.params, this.frozen)) this.invalidate()
		if (this.converged) {
			// The image is done, the dust still drifts over it: a few pixels per
			// second, so 30 frames per second are enough.
			if (this.dustDrifts && this.dustTime - this.dustShown >= 1 / 30) {
				this.dustShown = this.dustTime
				this.renderDisplay()
			}
			return
		}

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

	// Whether the dust moves over a converged image (not in photo mode).
	get dustDrifts() {
		const dust = this.params.dust
		return (
			!this.frozen &&
			dust.enabled &&
			dust.brightness > 0 &&
			dust.count > 0 &&
			(dust.drift > 0 || dust.turbulence > 0) &&
			this.params.debug.view === 'beauty'
		)
	}

	// Shows the accumulated mean again with this instant's dust, without
	// rendering the scene or adding a sample.
	renderDisplay() {
		const { renderPass, accumulation } = this.post
		this.updateAtmosphere()
		renderPass.enabled = false
		accumulation.displayOnly = true
		this.post.render()
		renderPass.enabled = true
		accumulation.displayOnly = false
	}

	// The dust and the haze of the frame the physical camera is placed for.
	updateAtmosphere() {
		this.post.updateAtmosphere({
			params: this.params,
			pinhole: this.physicalCamera.pinhole,
			emitters: this.lightRig.emitters,
			time: this.dustTime,
			beauty: this.params.debug.view === 'beauty',
		})
	}

	get restartsEveryFrame() {
		return (
			(this.params.animation.enabled && !this.frozen) ||
			this.transition !== null ||
			this.shaftsMove ||
			this.terminator.moving(this.params, this.frozen)
		)
	}

	// Whether the light shafts sway or flicker (not in photo mode): the image
	// restarts every frame, as with a living eye.
	get shaftsMove() {
		const { shafts, debug } = this.params
		return (
			!this.frozen &&
			debug.view === 'beauty' &&
			shafts.enabled &&
			shafts.intensity > 0 &&
			(shafts.sway > 0 || shafts.flicker > 0) &&
			shafts.speed > 0
		)
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
		this.lightRig.update(
			this.params.lighting,
			this.physicalCamera.camera,
			this.eyeRig.worldToEye,
			this.redFlash(),
		)
		this.setup.renderer.setClearColor(
			this.backdropColor.setRGB(...this.backdropRadiance()),
			FOCUS_AT_INFINITY,
		)
		// The key light casts the lid and lash shadows (studio panels and windows
		// only) and the light shafts, whose direction casts the patch's soft
		// shadow on the backdrop.
		const key = this.lightRig.emitters[0]
		const caster = key && key.type <= EMITTER_TYPE.WINDOW ? key : null
		const renderer = this.setup.renderer
		const shadowCenter = [0, 0, this.eye.apexZ - 4]
		// The soft coverages are kept while the lids, the light and these hold.
		const coverage = {
			globeRadius: this.eye.scleraRadius,
			softness: this.params.backdrop.softness,
			lids: this.lidKey,
		}
		this.keyShadow.render(renderer, this.setup.scene, caster, shadowCenter, sample, coverage)
		const beauty = this.params.debug.view === 'beauty'
		this.shaftLight.update(this.params, caster, beauty, this.dustTime)
		if (!sample) {
			this.shaftLight.renderShadow(
				renderer,
				this.setup.scene,
				this.keyShadow,
				shadowCenter,
				coverage,
			)
		}
		this.backdrop.update(this.params, this.backdropColor, this.shaftLight.direction, beauty)
		this.eyeRig.toEye(this.physicalCamera.camera.position, this.cameraEye)
		const camera = this.physicalCamera.camera
		const pixelAngle = (camera.fov * Math.PI) / 180 / size.height
		this.pixelAngle = pixelAngle
		this.terminator.update(this.params, this.lightRig.luminance * 0.05)
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
		// The lashes thicken as the camera zooms out, between the screen's zoom
		// distances (main.js), so they read fuller from afar.
		const zoom = this.controls.distanceLimits?.() ?? [this.params.zoom.in, this.params.zoom.out]
		const widen = lashWidening(this.params.camera.distance, zoom, this.params.lashes.zoomOut)
		this.lashes.update(this.params, widen)
		const lens = this.params.camera
		this.post.splitShading = this.params.quality.splitShading
		this.post.antialias = this.params.quality.antialias
		this.post.update(this.params, size, {
			focalLength: lens.focalLength,
			fNumber: lens.fNumber,
			focusDistance: this.physicalCamera.focusDistance,
			sensorHeight: lens.sensorHeight,
		})
		this.updateAtmosphere()
		this.post.render()
	}

	// The backdrop beyond the skin: the tone of the light skin lit (its
	// albedo, saturated as the subsurface shading saturates it), skin.backdrop
	// as bright. It keeps that tone whatever skin.color becomes, so the page
	// does not change with the skin tones.
	// In the Terminator glitch's red flash it turns glitch.backdrop.
	backdropRadiance() {
		const light = this.lightRig.luminance * 0.05 * this.params.skin.backdrop
		const skin = hexToLinearRgb(BACKDROP_SKIN).map((c) => c ** 1.3 * light)
		const flash = this.terminator.flash(this.params)
		if (flash <= 0) return skin
		const red = hexToLinearRgb(this.params.glitch.backdrop).map((c) => c * light)
		return skin.map((c, i) => c + (red[i] - c) * flash)
	}

	// The red flash of the lights during a shot's glitch, or null.
	redFlash() {
		const amount = this.terminator.flash(this.params)
		if (amount <= 0) return null
		const { light, lightGain } = this.params.glitch
		return { color: hexToLinearRgb(light), gain: lightGain, amount }
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
		return this.present((canvas) => canvas.toDataURL('image/png'))
	}

	// The same as a PNG blob, encoded off the main thread
	// (src/render/pngEncoder.js): the page, and a glitch, go on meanwhile.
	captureBlob() {
		return this.present(encodePng)
	}

	// Re-presents the current image and reads the canvas with `read`.
	present(read) {
		const { renderPass, accumulation } = this.post
		// A living eye keeps no frame: keep this one.
		if (this.samples === 0) this.renderSample(null)
		renderPass.enabled = false
		accumulation.displayOnly = true
		this.post.render()
		const result = read(this.setup.renderer.domElement)
		renderPass.enabled = true
		accumulation.displayOnly = false
		return result
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
				this.controls.stop()
				const unknown = applyOverrides(PARAM_SCHEMA, this.params, overrides)
				this.dirty.add('rebuild').add('define')
				this.notifyChange('*')
				return unknown
			},
			capture: () => this.capture(),
			captureBlob: () => this.captureBlob(),
			toggleFrozen: () => this.toggleFrozen(),
			isFrozen: () => this.frozen,
			// Blinks now; false while the blink's frames are not built yet.
			blink: () => this.blink(),
			isBlinkReady: () => this.lidBlink.ready,
			// The volume cannon's glitch, now; resolves at its peak.
			glitch: () => this.terminator.trigger(),
			isGlitching: () => this.terminator.active,
			measure: (frames) => this.measure(frames),
			measureSync: (frames) => this.measureSync(frames),
			getCompileMs: () => this.compileMs,
			// The skin's relief: baked (outside #debug) or per pixel; the last
			// bake's time.
			setSkinBaked: (baked) => this.setSkinBaked(Boolean(baked)),
			isSkinBaked: () => this.lids.baked,
			getSkinBakeMs: () => this.skinBakeMs,
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
		blink: mix(a.blink, b.blink),
		framing: {
			yaw: mix(a.framing.yaw, b.framing.yaw),
			pitch: mix(a.framing.pitch, b.framing.pitch),
		},
	}
}
