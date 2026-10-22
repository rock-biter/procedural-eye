import './style.css'
import { gsap } from 'gsap'
import EyeApp from './src/app'
import Ambience from './src/audio/ambience'
import AudioEngine from './src/audio/audioEngine'
import CameraFoley from './src/audio/cameraFoley'
import { SOUNDS } from './src/audio/soundBank'
import { PARAM_SCHEMA } from './src/params/paramSchema'
import {
	allValues,
	applyOverrides,
	cloneParams,
	createDefaults,
	createParams,
	decodeState,
	setValue,
} from './src/params/params'
import { TRANSITION } from './src/params/paramTransition'
import { ANCESTRIES, randomEye } from './src/params/populationPriors'
import { PRESETS } from './src/params/presets'
import { SKIN_TONES } from './src/params/skinTones'
import RenderSetup from './src/renderSetup'
import { magnification } from './src/camera/cameraOptics'
import { createHud } from './src/ui/hud'
import {
	apertureFNumber,
	apertureProgress,
	elasticZoomLevel,
	pullLevel,
	zoomDistance,
	zoomLevel,
	zoomProgress,
	zoomSensor,
} from './src/ui/hudLayout'

// The bootstrap: reads the URL (?preset=, ?state=, ?photo=, ?view=, ?gui=0, ?dpr=,
// ?meshtree=1, #debug), creates the params, the renderer and the app, the HUD
// unless ?gui=0, the panel while the URL ends in #debug, and the mesh tree
// with ?meshtree=1.
const urlParams = new URLSearchParams(window.location.search)
const presetName = PRESETS[urlParams.get('preset')] ? urlParams.get('preset') : 'default'
const state = urlParams.get('state') ? decodeState(urlParams.get('state')) : null
// Portrait screens (phones held upright) keep the camera target at the
// entrance pupil's depth: camera.targetZ 0.
const portrait = () => window.innerWidth < window.innerHeight
function fitScreen(target) {
	if (portrait()) setValue(PARAM_SCHEMA, target, 'camera.targetZ', 0)
	return target
}

const params = fitScreen(createParams(PARAM_SCHEMA, PRESETS[presetName].params, state))
if (urlParams.has('photo'))
	setValue(PARAM_SCHEMA, params, 'quality.photoSamples', urlParams.get('photo'))
if (urlParams.has('view')) setValue(PARAM_SCHEMA, params, 'debug.view', urlParams.get('view'))

// The zoom-in and zoom-out distances of the screen's shape, which also bound
// the wheel: portrait screens are narrow, so they zoom in less far, to
// zoom.mobileIn, and out farther, to zoom.mobileOut. Unless the URL
// sets the scene, screens start zoom.start (landscape) or zoom.mobileStart
// (portrait) of the way out on the zoom's log scale, the knob's: at 0.5 the
// knob sits on the horizontal.
function zoomDistances(settings) {
	return portrait() ? [settings.mobileIn, settings.mobileOut] : [settings.in, settings.out]
}
// Sets the camera of `target` to the zoom `level` (0 out, 1 in; past them
// while the knob is dragged elastically) of the screen's zoom `settings`: the
// distance, and the sensor height the zoom sets there (src/ui/hudLayout.js),
// smaller zoomed in for a deeper focus.
function zoomCamera(target, level, settings) {
	const distance = zoomDistance(level, zoomDistances(settings))
	const sensor = zoomSensor(level, [settings.sensorIn, settings.sensorOut])
	setValue(PARAM_SCHEMA, target, 'camera.distance', distance)
	setValue(PARAM_SCHEMA, target, 'camera.sensorHeight', sensor)
}
if (!urlParams.has('state') && !urlParams.has('preset')) {
	const start = portrait() ? params.zoom.mobileStart : params.zoom.start
	zoomCamera(params, 1 - start, params.zoom)
}

const setup = new RenderSetup({ params, urlParams })
// Captures (?photo=) start frozen: a deterministic instant.
const app = new EyeApp({ setup, params, frozen: urlParams.has('photo') })
// The app object itself, for console debugging.
if (urlParams.has('debug')) window.__EYE_APP__ = app
app.controls.distanceLimits = () => zoomDistances(app.targetParams.zoom)
app.controls.zoomSensor = (distance) => {
	const settings = app.targetParams.zoom
	return zoomSensor(zoomLevel(distance, zoomDistances(settings)), [
		settings.sensorIn,
		settings.sensorOut,
	])
}
// The f-numbers at the ends of the HUD's aperture knob (desktop only),
// aperture.open by Zoom out (level 0) and aperture.closed by Zoom in (1),
// which also bound the wheel over it.
const apertureLimits = () => [app.targetParams.aperture.open, app.targetParams.aperture.closed]
app.controls.fNumberLimits = apertureLimits

// ?meshtree=1: the scene graph at the left, each object's visible and each
// mesh's wireframe, with the frame's draw calls and the scene's vertices
// (src/debug/meshTree.js), loaded on demand, with or without the HUD.
if (urlParams.get('meshtree') === '1') {
	import('./src/debug/meshTree').then(({ createMeshTree }) =>
		createMeshTree({
			scene: setup.scene,
			onChange: () => app.refreshScene(),
			drawCalls: () => setup.frameStats.drawCalls,
		}),
	)
}

// The panel's random-eye ancestry and the length of preset and random-eye
// transitions (seconds; 0 switches at once).
const panelState = { ancestry: 'european', transition: TRANSITION.duration }

// The groups a random eye resets to their defaults before applying its sample.
// The lashes and the skin are not among them: a random eye keeps them.
const RANDOM_EYE_GROUPS = ['eye', 'iris', 'irisColor', 'irisStructure', 'sclera']

// Glides to the preset `name`: its overrides on the defaults, the viewer's
// volume kept (sound.volume, the slider by the sound toggle).
function loadPreset(name, duration = panelState.transition) {
	if (!PRESETS[name]) return false
	const target = fitScreen(createParams(PARAM_SCHEMA, PRESETS[name].params))
	setValue(PARAM_SCHEMA, target, 'sound.volume', app.targetParams.sound.volume)
	app.transitionTo(target, duration)
	return true
}

// Glides to a random eye of `ancestry`. The other groups keep the values a
// running transition is heading for.
function loadRandomEye(ancestry = panelState.ancestry, seed, duration = panelState.transition) {
	const { params: overrides, features } = randomEye(ancestry, seed)
	const target = cloneParams(app.targetParams)
	const defaults = createDefaults(PARAM_SCHEMA)
	for (const group of RANDOM_EYE_GROUPS) target[group] = structuredClone(defaults[group])
	applyOverrides(PARAM_SCHEMA, target, overrides)
	app.transitionTo(target, duration)
	return features
}

// Glides the camera back to its start ('in') or out to the whole figure
// ('out', by the screen's shape), over zoom.duration (or `duration` s: the
// HUD's knob snapping to an end). The rest keeps the values a running
// transition is heading for.
function zoom(direction, duration = app.targetParams.zoom.duration) {
	const target = cloneParams(app.targetParams)
	zoomCamera(target, direction === 'in' ? 1 : 0, target.zoom)
	app.transitionTo(target, duration)
}

// The zoom level of the HUD's knob, 0 out to 1 in, between the screen's
// zoom distances (src/ui/hudLayout.js); setting it moves the camera at once,
// as the wheel does, and stops a zoom gliding.
const zoomLimits = () => zoomDistances(app.targetParams.zoom)
const getZoomLevel = () => zoomLevel(app.params.camera.distance, zoomLimits())
function setZoomLevel(level) {
	zoomCamera(app.params, level, app.targetParams.zoom)
	app.onParamChange('camera.distance')
	app.onParamChange('camera.sensorHeight')
}

// The aperture knob's level, 0 at the widest f-number to 1 at the narrowest,
// on their log scale (src/ui/hudLayout.js); setting it sets camera.fNumber
// at once, as the knob does (with its elastic drag, past the ends), and stops
// a glide of it.
const getApertureLevel = () =>
	Math.min(Math.max(apertureProgress(app.params.camera.fNumber, apertureLimits()), 0), 1)
function setApertureLevel(level) {
	setValue(PARAM_SCHEMA, app.params, 'camera.fNumber', apertureFNumber(level, apertureLimits()))
	app.onParamChange('camera.fNumber')
}

// Glides camera.fNumber to the widest f-number (`end` 0) or the narrowest (1)
// over `duration` s (the HUD's aperture knob springing back from past an
// end). The rest keeps the values a running transition is heading for.
function aperture(end, duration) {
	const target = cloneParams(app.targetParams)
	const [open, closed] = apertureLimits()
	setValue(PARAM_SCHEMA, target, 'camera.fNumber', end === 1 ? closed : open)
	app.transitionTo(target, duration)
}

// A right-drag over the image moves the aperture as the HUD's knob does
// (`sideDrag`, src/camera/cameraControls.js), from its horizontal motion,
// rightward stopping down, APERTURE_DRAG_PX px across the knob's range: past
// an end resisted (aperture.elasticity), and let go there after moving, it
// glides back in APERTURE_SPRING_BACK s, as the knob does. From an f-number
// off the range (a preset's) it starts at the nearer end. holdAperture(held)
// shows it on the HUD's knob, once there is one.
const APERTURE_DRAG_PX = 525
const APERTURE_SPRING_BACK = 0.25
let holdAperture = () => {}
let apertureDrag = null
app.controls.sideDrag = {
	start() {
		const elasticity = app.params.aperture.elasticity
		const level = apertureProgress(app.params.camera.fNumber, apertureLimits())
		const reachable = level > -elasticity && level < 1 + elasticity
		const pull = reachable ? pullLevel(level, elasticity) : Math.min(Math.max(level, 0), 1)
		apertureDrag = { pull, moved: false }
		holdAperture(true)
	},
	move(dx) {
		apertureDrag.pull += dx / APERTURE_DRAG_PX
		apertureDrag.moved = true
		setApertureLevel(elasticZoomLevel(apertureDrag.pull, app.params.aperture.elasticity))
	},
	end() {
		const { moved } = apertureDrag
		apertureDrag = null
		holdAperture(false)
		const level = apertureProgress(app.params.camera.fNumber, apertureLimits())
		if (moved && (level < 0 || level > 1)) aperture(level < 0 ? 0 : 1, APERTURE_SPRING_BACK)
	},
}

// Glides `skin.color` to the tone `name` (src/params/skinTones.js), as the
// skin buttons do. The rest keeps the values a running transition is heading
// for.
function skinTone(name, duration = panelState.transition) {
	const tone = SKIN_TONES.find((candidate) => candidate.name === name)
	if (!tone) return false
	if (app.targetParams.skin.color === tone.color) return true
	const target = cloneParams(app.targetParams)
	setValue(PARAM_SCHEMA, target, 'skin.color', tone.color)
	app.transitionTo(target, duration)
	return true
}

window.__EYE__ = {
	...app.createApi(),
	getPresetNames: () => Object.keys(PRESETS),
	getPresetInfo: (name) => {
		const preset = PRESETS[name]
		return preset ? { label: preset.label, references: preset.references ?? [] } : null
	},
	loadPreset,
	randomEye: loadRandomEye,
	zoom,
	getZoomLevel,
	setZoomLevel,
	getApertureLevel,
	setApertureLevel,
	skinTone,
}

// The sound design's cues (src/audio/cameraFoley.js), once the HUD has set
// them up: nothing without it (?gui=0).
let cue = () => {}
// Plays a sound of src/audio/soundBank.js by its name, for the panel.
let audition = null
// Reads the params back into the panel, once it is built (the volume slider
// sets sound.volume without a change that would restart the image).
let refreshPanel = () => {}

// Downloads the current (accumulated) image with its state in a tEXt chunk,
// to the sound of a focus beep and a shutter (from `element`, Snapshot, if
// given).
async function savePng(element) {
	cue('snapshot', { element })
	const { insertPngText } = await import('./src/render/pngMetadata')
	const dataUrl = window.__EYE__.capture()
	const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) =>
		c.charCodeAt(0),
	)
	const tagged = insertPngText(bytes, 'eye-state', window.__EYE__.getState())
	download(new Blob([tagged], { type: 'image/png' }), `eye-${Date.now()}.png`)
}

// The viewer's mute and volume (sound.volume, the master), kept in the
// browser (none in a private window: on, at the default volume).
const MUTED_KEY = 'random-eyes:muted'
const VOLUME_KEY = 'random-eyes:volume'
function readStored(key) {
	try {
		return window.localStorage.getItem(key)
	} catch {
		return null
	}
}
function writeStored(key, value) {
	try {
		window.localStorage.setItem(key, value)
	} catch {
		// The choice holds for this page only.
	}
}

// Downloads the values the panel is heading for (not a transition's in-between
// ones) as defaults.json, the file that replaces src/params/defaults.json. The
// debug view is left out, so the app never starts in one.
function exportDefaults() {
	const values = allValues(PARAM_SCHEMA, app.targetParams)
	delete values.debug
	const json = `${JSON.stringify(values, null, 2)}\n`
	download(new Blob([json], { type: 'application/json' }), 'defaults.json')
}

function download(blob, filename) {
	const link = document.createElement('a')
	link.href = URL.createObjectURL(blob)
	link.download = filename
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// The frame around the page (style.css): a cross of 1 px arms at each corner
// and a dashed line along each side, across the whole window, made of two
// halves, each from a window edge to the middle (style.css mirrors the second
// one). The dashes are an SVG pattern: FRAME_DASH px every FRAME_DASH_PERIOD
// px from the edge, one centered on the first pixel of every period (rounded
// toward the edge). A square dash in a square cell dashes the 1 px lines of
// both directions. At the middle of the left and right sides a bracket (a
// 33 px upright with an 8 px tick inward from its middle row) stands 8 px
// inside the line.
const FRAME_DASH = 3
const FRAME_DASH_PERIOD = 8
function frame() {
	const element = document.createElement('div')
	element.className = 'frame'
	element.setAttribute('aria-hidden', 'true')
	const lines = ['top', 'right', 'bottom', 'left'].flatMap((side) =>
		['start', 'end'].map((end) => [side, end]),
	)
	const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
	const origin = -Math.floor(FRAME_DASH / 2)
	element.innerHTML = [
		...lines.map(([side, end]) => {
			const id = `frame-dashes-${side}-${end}`
			return `<svg class="frame-line frame-${side} frame-${end}"><pattern id="${id}" x="${origin}" y="${origin}" width="${FRAME_DASH_PERIOD}" height="${FRAME_DASH_PERIOD}" patternUnits="userSpaceOnUse"><rect width="${FRAME_DASH}" height="${FRAME_DASH}"/></pattern><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
		}),
		...corners.map(
			(corner) =>
				`<svg class="frame-cross frame-${corner}"><rect x="50%" width="1" height="100%"/><rect y="50%" width="100%" height="1"/></svg>`,
		),
		...['left', 'right'].map(
			(side) =>
				`<svg class="frame-bracket frame-bracket-${side}"><rect width="1" height="33"/><rect x="1" y="16" width="8" height="1"/></svg>`,
		),
	].join('')
	return element
}

if (urlParams.get('gui') !== '0') {
	// The frame around the page; the rest of the interface stays inside it.
	document.body.appendChild(frame())

	// The sound design (src/audio/, docs/AUDIO.md): the camera foley of the
	// controls and the ambience, which start at the first press or key (the
	// ambience fading in slowly) and pause while the page is hidden or out of
	// focus. The viewer's mute (the sound toggle, M) is kept in the browser.
	const audio = new AudioEngine({ params: app.params, muted: readStored(MUTED_KEY) === '1' })
	const foley = new CameraFoley(audio)
	const ambience = new Ambience(audio)
	cue = (name, detail) => foley.cue(name, detail)
	window.__EYE__.getSoundStats = () => ({ ...audio.stats(), musicSpeed: ambience.rate })
	audition = (name) => {
		audio.unlock()
		return audio.play(name) !== null
	}
	// A mouse entering a control of the page and, unless `press` is false, a
	// press on it, also from the keyboard.
	const sounding = (element, control, press = true) => {
		element.addEventListener('pointerenter', (event) => {
			if (event.pointerType === 'mouse') cue('hover', { control, element })
		})
		if (!press) return
		element.addEventListener('pointerdown', (event) => {
			if (event.button === 0) cue('press', { control, element })
		})
		element.addEventListener('click', (event) => {
			if (event.detail === 0) cue('press', { control, element })
		})
	}
	app.listeners.add((path) => {
		if (path === 'frozen') cue('frozen', { frozen: app.frozen })
	})
	// Once a frame, what the sounds follow: the knobs' levels (past their
	// ends while dragged), the f-number and the photo.
	let soundTime = null
	const soundFrame = (time) => {
		requestAnimationFrame(soundFrame)
		const dt = soundTime === null ? 0 : Math.min((time - soundTime) / 1000, 0.1)
		soundTime = time
		const { camera, zoom, aperture } = app.params
		audio.update()
		ambience.update()
		foley.update(dt, {
			zoom: zoomProgress(camera.distance, zoomLimits()),
			aperture: apertureProgress(camera.fNumber, apertureLimits()),
			fNumber: camera.fNumber,
			zoomElasticity: zoom.elasticity,
			apertureElasticity: aperture.elasticity,
			frozen: app.frozen,
			converged: app.converged,
		})
	}
	requestAnimationFrame(soundFrame)

	// The HUD around the eye (src/ui/hud.js): the skin tones, the zoom, the
	// aperture (desktop only) and Random eye on a dashed circle. The tone of
	// the color the params are heading for is pressed, also after the panel or
	// a preset changes it; the zoom and aperture knobs follow the camera every
	// frame, gliding or not.
	const hud = createHud({
		tones: SKIN_TONES,
		onTone: (name) => skinTone(name),
		onZoom: (direction, duration) => zoom(direction, duration),
		onZoomLevel: (level) => setZoomLevel(level),
		// The wheel over the knob zooms as over the canvas, smoothly.
		onZoomWheel: (deltaY) => app.controls.wheel(deltaY),
		getZoomElasticity: () => app.params.zoom.elasticity,
		onAperture: (end, duration) => aperture(end, duration),
		onApertureLevel: (level) => setApertureLevel(level),
		// The wheel over the aperture knob eases the f-number as the zoom's.
		onApertureWheel: (deltaY) => app.controls.apertureWheel(deltaY),
		getApertureElasticity: () => app.params.aperture.elasticity,
		onRandom: () => console.log('Random eye', panelState.ancestry, loadRandomEye()),
		onCue: (name, detail) => cue(name, detail),
	})
	document.body.appendChild(hud.element)
	hud.mount()
	holdAperture = (held) => hud.holdAperture(held)
	const pressTone = () => hud.pressTone(app.targetParams.skin.color)
	pressTone()
	app.listeners.add((path) => {
		if (path === '*' || path === 'skin.color') pressTone()
	})
	// The zoom's value by the knob: the macro magnification of the camera at
	// its focus distance (camera.distance), as a lens's reproduction ratio
	// reads (1× is life size on the sensor); beside it, on a desktop HUD, the
	// f-number with one decimal, which the aperture knob follows.
	// Opposite, the camera's polar angles about the eye, azimuth then
	// elevation in degrees, the mouse parallax's turn included (it moves the
	// camera too, CameraControls.parallax): unsigned, without spaces or units.
	// The angles light up while the orbit moves (a drag, its coasting, a
	// glide), not for the parallax alone.
	const degrees = (value) => Math.abs(value).toFixed(1)
	let orbit = null
	const showZoomLevel = () => {
		requestAnimationFrame(showZoomLevel)
		const { distance, focalLength, fNumber, azimuth, elevation } = app.params.camera
		const { parallax } = app.controls
		const orbiting = orbit !== null && (orbit[0] !== azimuth || orbit[1] !== elevation)
		orbit = [azimuth, elevation]
		hud.showCameraAngles(
			`${degrees(azimuth + parallax.azimuth)},${degrees(elevation + parallax.elevation)}`,
			orbiting,
		)
		hud.showZoomLevel(zoomProgress(distance, zoomLimits()))
		hud.showZoomValue(`${magnification(focalLength, distance).toFixed(3)}`)
		hud.showApertureLevel(apertureProgress(fNumber, apertureLimits()))
		hud.showApertureValue(`f/${fNumber.toFixed(1)}`)
	}
	showZoomLevel()

	// The title with a line about the project, top left, and the credit line,
	// bottom left; the credit's link blurs itself after a click, as the HUD
	// buttons do. On phones the title drops its dash and breaks before "eyes",
	// and the panel starts below it, at its height (--masthead-height,
	// style.css).
	const description = `<span class="title">Random-eyes</span> is the eye configurator nobody asked for: a procedural human eye, from iris crypts to lashes, rendered live in your browser. <span>Face sold separately</span>.`
	const masthead = document.createElement('header')
	masthead.className = 'masthead'
	masthead.innerHTML = `<h1>Random<span class="title-dash">-</span><span class="title-eyes">eyes</span></h1><p>${description}</p>`
	document.body.appendChild(masthead)
	new ResizeObserver(() => {
		document.documentElement.style.setProperty('--masthead-height', `${masthead.offsetHeight}px`)
	}).observe(masthead)

	// Phones hide the line about the project under the title: More info, on
	// the baseline of "eyes", opens it in a dropdown between the title and
	// Snapshot (style.css). A second press, Escape or a press outside it
	// closes it.
	const moreInfo = document.createElement('button')
	moreInfo.type = 'button'
	moreInfo.className = 'more-info'
	moreInfo.textContent = 'More info'
	moreInfo.setAttribute('aria-controls', 'info')
	const info = document.createElement('div')
	info.id = 'info'
	info.className = 'info'
	info.innerHTML = `<p>${description}</p>`
	const showInfo = (shown) => {
		info.classList.toggle('open', shown)
		moreInfo.setAttribute('aria-expanded', String(shown))
	}
	showInfo(false)
	moreInfo.addEventListener('click', () => {
		moreInfo.blur()
		showInfo(!info.classList.contains('open'))
	})
	sounding(moreInfo, 'more-info')
	window.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') showInfo(false)
	})
	window.addEventListener('pointerdown', (event) => {
		if (!info.contains(event.target) && !moreInfo.contains(event.target)) showInfo(false)
	})
	document.body.append(moreInfo, info)

	const credit = document.createElement('p')
	credit.className = 'credit'
	credit.innerHTML =
		'powered by <a class="swap-underline" href="https://x.com/__rockbiter" target="_blank" rel="noopener">rockbiter</a>, made with three.js and Opus 5.5'
	credit.querySelector('a').addEventListener('click', (event) => event.currentTarget.blur())
	sounding(credit.querySelector('a'), 'credit', false)

	// The sound toggle, at the end of the credit line, and M (while the page,
	// not a control, has the focus, as Space): sound on or off, kept in the
	// browser. Off, the volume glides to zero and the sound stops; on, it
	// glides back to the level it had. It blurs itself after a click, as the
	// HUD buttons do; its label carries the animated underline (style.css).
	const soundToggle = document.createElement('button')
	soundToggle.type = 'button'
	soundToggle.className = 'sound-toggle'
	const soundLabel = document.createElement('span')
	soundLabel.className = 'swap-underline'
	soundToggle.append(soundLabel)
	let soundMuted = readStored(MUTED_KEY) === '1'
	const showSound = () => {
		soundLabel.textContent = soundMuted ? 'sound off' : 'sound on'
		soundToggle.setAttribute('aria-pressed', String(!soundMuted))
		soundToggle.title = soundMuted ? 'Turn the sound on (M)' : 'Turn the sound off (M)'
	}
	// The toggle's state, kept in the browser; the engine's mute follows it
	// (at once when turned on, once the volume is down when turned off).
	const markMuted = (muted) => {
		soundMuted = muted
		writeStored(MUTED_KEY, muted ? '1' : '0')
		showSound()
		volume.classList.toggle('muted', muted)
	}
	const unmute = () => {
		markMuted(false)
		audio.setMuted(false)
		audio.unlock()
	}
	const setMuted = (muted) => {
		if (muted) {
			remember(app.params.sound.volume)
			markMuted(true)
			glideVolume(0, MUTE_GLIDE, putVolume, () => audio.setMuted(true))
		} else {
			unmute()
			glideVolume(remembered, MUTE_GLIDE)
		}
	}
	const toggleSound = () => {
		setMuted(!soundMuted)
		cue('press', { control: 'sound', element: soundToggle })
	}
	soundToggle.addEventListener('click', () => {
		soundToggle.blur()
		toggleSound()
	})
	sounding(soundToggle, 'sound')
	window.addEventListener('keydown', (event) => {
		if (event.target !== document.body || event.repeat) return
		if (event.key !== 'm' && event.key !== 'M') return
		if (event.metaKey || event.ctrlKey || event.altKey) return
		toggleSound()
	})

	// The volume, beside the sound toggle: the master (sound.volume, the
	// panel's master volume too) on a dashed line VOLUME_TRACK px long, in the
	// accent up to its square handle (style.css). A press on the handle holds
	// it where it was grabbed and a drag carries it; a press elsewhere glides
	// the volume there in VOLUME_GLIDE s (a drag takes over); the arrow keys
	// step it; a tap sounds at its new level as it is let go. Down to zero it
	// turns the sound off, up from zero on again; the toggle brings back the
	// last level above zero it settled on, kept in the browser. It sets the
	// params without a change, which would restart the image.
	const VOLUME_TRACK = 80
	const VOLUME_STEP = 0.05
	const VOLUME_GLIDE = 0.35
	const MUTE_GLIDE = 0.5
	const motionless = window.matchMedia('(prefers-reduced-motion: reduce)')
	const volume = document.createElement('div')
	volume.className = 'volume'
	volume.tabIndex = 0
	volume.title = 'Volume'
	volume.setAttribute('role', 'slider')
	volume.setAttribute('aria-label', 'Volume')
	volume.setAttribute('aria-valuemin', '0')
	volume.setAttribute('aria-valuemax', '100')
	volume.style.setProperty('--volume-track', `${VOLUME_TRACK}px`)
	volume.innerHTML = '<span class="volume-line"></span><span class="volume-handle"></span>'
	const showVolume = () => {
		const level = app.params.sound.volume
		volume.style.setProperty('--volume', level)
		volume.setAttribute('aria-valuenow', String(Math.round(level * 100)))
	}
	const putVolume = (level) => {
		const rounded = Math.round(Math.min(Math.max(level, 0), 1) * 100) / 100
		for (const values of new Set([app.params, app.targetParams]))
			setValue(PARAM_SCHEMA, values, 'sound.volume', rounded)
		showVolume()
		refreshPanel()
	}
	// The level the toggle brings back.
	const stored = Number.parseFloat(readStored(VOLUME_KEY))
	let remembered = Number.isFinite(stored) && stored > 0 ? stored : app.params.sound.volume || 0.5
	const remember = (level) => {
		if (level <= 0) return
		remembered = level
		writeStored(VOLUME_KEY, String(level))
	}
	// The viewer's own level: at zero the sound turns off, above it on.
	const userVolume = (level) => {
		putVolume(level)
		if (app.params.sound.volume > 0) {
			if (soundMuted) unmute()
			return
		}
		if (!soundMuted) markMuted(true)
		if (!audio.muted) audio.setMuted(true)
	}
	const glide = { level: 0, to: 0 }
	const gliding = () => gsap.isTweening(glide)
	// The volume to `to` over `duration` s, set through `apply` (eased out;
	// at once with reduced motion), then `done`.
	const glideVolume = (to, duration, apply = putVolume, done = () => {}) => {
		gsap.killTweensOf(glide)
		glide.level = app.params.sound.volume
		glide.to = to
		if (motionless.matches) {
			apply(to)
			done()
			return
		}
		gsap.to(glide, {
			level: to,
			duration,
			ease: 'power2.out',
			onUpdate: () => apply(glide.level),
			onComplete: done,
		})
	}
	putVolume(soundMuted ? 0 : remembered)
	app.listeners.add((path) => {
		if (path === '*' || path === 'sound.volume') showVolume()
	})
	// Past the right end a drag pulls on, as the HUD's knobs do: the volume
	// stays full and the handle follows, resisted by the knobs' law
	// (elasticZoomLevel()) up to `sound.stretch` px past the end (less where
	// the window has no room for it), the line and the toggle dragged along by
	// their shares of its run (VOLUME_FOLLOW), and the glass harp playing
	// faster the further it is pulled, up to `sound.stretchRate` times at the
	// limit. Let go, they spring back with an elastic ease in SPRING_BACK s,
	// the music slowing back to its own speed with them.
	const VOLUME_FOLLOW = { line: 0.3, toggle: 0.15 }
	const SPRING_BACK = 0.9
	// The handle's run past the end (px) and its share of the furthest it can
	// run (0 to 1), which sets the music's speed.
	const stretch = { over: 0, amount: 0 }
	// The furthest the handle can run past the end (px), as a share of the
	// track.
	const stretchReach = () => {
		const room = window.innerWidth - volume.getBoundingClientRect().right - 24
		return Math.max(Math.min(app.params.sound.stretch, room), 0) / VOLUME_TRACK
	}
	const showStretch = (over, amount) => {
		volume.style.setProperty('--volume-over', `${over}px`)
		volume.style.setProperty('--volume-line-over', `${over * VOLUME_FOLLOW.line}px`)
		soundToggle.style.translate = over ? `${over * VOLUME_FOLLOW.toggle}px 0` : ''
		ambience.setSpeed(1 + (app.params.sound.stretchRate - 1) * Math.max(amount, 0))
	}
	// Pulled to `pull` (of the track; past 1, past the end).
	const pullVolume = (pull) => {
		const reach = stretchReach()
		if (pull <= 1 || reach <= 0) {
			if (stretch.over !== 0) showStretch((stretch.over = 0), (stretch.amount = 0))
			userVolume(pull)
			return
		}
		userVolume(1)
		stretch.over = (elasticZoomLevel(pull, reach) - 1) * VOLUME_TRACK
		stretch.amount = stretch.over / (reach * VOLUME_TRACK)
		showStretch(stretch.over, stretch.amount)
	}
	const springBack = () => {
		const { over, amount } = stretch
		if (over <= 0) return
		const ease = (value) => {
			stretch.over = value
			stretch.amount = (amount * value) / over
			showStretch(value, stretch.amount)
		}
		if (motionless.matches) return ease(0)
		gsap.to(stretch, {
			over: 0,
			duration: SPRING_BACK,
			ease: 'elastic.out(1, 0.75)',
			onUpdate: () => ease(stretch.over),
		})
	}
	const tapVolume = () => cue('tap', { control: 'volume', element: volume })
	const volumeAt = (event) => (event.clientX - volume.getBoundingClientRect().left) / VOLUME_TRACK
	const settle = () => remember(app.params.sound.volume)
	let volumeDrag = null
	volume.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 || volumeDrag) return
		volume.setPointerCapture(event.pointerId)
		volume.classList.add('dragging')
		const at = volumeAt(event)
		// Grabbed while it springs back, it is held where it was grabbed: its
		// offset counts the handle's run past the end.
		const springing = gsap.isTweening(stretch)
		gsap.killTweensOf(stretch)
		const shown = app.params.sound.volume + stretch.over / VOLUME_TRACK
		const onHandle = Math.abs(at - shown) * VOLUME_TRACK <= 6 || springing
		const pull =
			stretch.over > 0
				? pullLevel(1 + stretch.over / VOLUME_TRACK, stretchReach())
				: app.params.sound.volume
		volumeDrag = { id: event.pointerId, offset: onHandle ? at - pull : 0 }
		if (onHandle) gsap.killTweensOf(glide)
		else glideVolume(at, VOLUME_GLIDE, userVolume, settle)
	})
	volume.addEventListener('pointermove', (event) => {
		if (volumeDrag?.id !== event.pointerId) return
		const at = volumeAt(event) - volumeDrag.offset
		// A drag takes over from the glide once the pointer leaves where it
		// pressed.
		if (gliding() && Math.abs(at - glide.to) * VOLUME_TRACK < 3) return
		gsap.killTweensOf(glide)
		pullVolume(at)
	})
	const releaseVolume = (event, tap) => {
		if (volumeDrag?.id !== event.pointerId) return
		volumeDrag = null
		volume.classList.remove('dragging')
		volume.blur()
		springBack()
		if (!gliding()) settle()
		if (tap) tapVolume()
	}
	volume.addEventListener('pointerup', (event) => releaseVolume(event, true))
	volume.addEventListener('pointercancel', (event) => releaseVolume(event, false))
	volume.addEventListener('lostpointercapture', (event) => releaseVolume(event, false))
	volume.addEventListener('keydown', (event) => {
		const level = app.params.sound.volume
		const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }
		const to =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? 1
					: steps[event.key] && level + steps[event.key] * VOLUME_STEP
		if (to === undefined) return
		event.preventDefault()
		gsap.killTweensOf(glide)
		userVolume(to)
		settle()
		tapVolume()
	})
	sounding(volume, 'volume', false)
	showSound()
	volume.classList.toggle('muted', soundMuted)

	// The toggle and the volume keep to one line as the credit wraps, the
	// middle dot before them with the line above.
	const soundControls = document.createElement('span')
	soundControls.className = 'sound-controls'
	soundControls.append(soundToggle, volume)
	credit.append(' · ', soundControls)

	// Snapshot, bottom right: saves the image as the panel's Save PNG does
	// (the state in a tEXt chunk). The word inside the HUD's reticle corners
	// (style.css); it blurs itself after a click, as the HUD buttons do (Space
	// toggles photo mode only when the page has the focus).
	const snapshot = document.createElement('button')
	snapshot.type = 'button'
	snapshot.className = 'snapshot'
	snapshot.title = 'Save a PNG of the image'
	snapshot.textContent = 'Snapshot'
	snapshot.addEventListener('click', () => {
		snapshot.blur()
		savePng(snapshot)
	})
	sounding(snapshot, 'snapshot', false)

	// The two share a footer: no box of its own on wide screens, where each
	// keeps its corner; on phones a column across the frame, Snapshot above
	// the credit line, and the panel stops above it (--footer-height), as
	// does the zoom's circle of a split HUD (src/ui/hud.js).
	const footer = document.createElement('footer')
	footer.className = 'footer'
	footer.append(snapshot, credit)
	document.body.appendChild(footer)
	new ResizeObserver(() => {
		document.documentElement.style.setProperty('--footer-height', `${footer.offsetHeight}px`)
		hud.reserveBottom(footer.offsetHeight)
	}).observe(footer)

	// The frame rate, top right, styled as the credit line: the frames the page
	// shows per second, counted over half a second. A gap longer than a second
	// is a hidden tab, not a slow frame, and is not shown. Above it, the
	// viewport's size in CSS pixels, updated as the window resizes.
	const stats = document.createElement('div')
	stats.className = 'fps'
	const viewport = document.createElement('div')
	viewport.className = 'viewport-size'
	const showViewport = () => {
		viewport.textContent = `${window.innerWidth}x${window.innerHeight}`
	}
	showViewport()
	window.addEventListener('resize', showViewport)
	const fps = document.createElement('div')
	fps.textContent = '-- fps'
	stats.append(viewport, fps)
	document.body.appendChild(stats)
	let frames = 0
	let since = null
	const countFrame = (time) => {
		requestAnimationFrame(countFrame)
		since ??= time
		frames++
		const elapsed = time - since
		if (elapsed < 500) return
		if (elapsed < 1000) fps.textContent = `${Math.round((frames * 1000) / elapsed)} fps`
		frames = 0
		since = time
	}
	requestAnimationFrame(countFrame)

	// The panel shows while the URL ends in #debug: built the first time, then
	// hidden and shown again as the hash changes.
	let panel = null
	const updatePanel = async () => {
		const shown = window.location.hash === '#debug'
		if (shown) panel ??= createPanel()
		if (panel) (await panel).pane.hidden = !shown
	}
	window.addEventListener('hashchange', updatePanel)
	updatePanel()
}

// The collapsed panel: the presets, the actions, every parameter, the random
// ancestry and the transition length.
async function createPanel() {
	const { createGui } = await import('./src/debug/gui')
	const gui = createGui({
		schema: PARAM_SCHEMA,
		params,
		presets: PRESETS,
		onChange: (path) => app.onParamChange(path),
		onPreset: (name) => loadPreset(name),
		actions: [
			{ title: 'Photo (freeze / live) — Space', run: () => window.__EYE__.toggleFrozen() },
			{ title: 'Save PNG', run: () => savePng() },
			{ title: 'Export defaults JSON', run: () => exportDefaults() },
			{
				title: 'Copy state URL',
				run: () => {
					const url = new URL(window.location.href)
					url.searchParams.set('state', window.__EYE__.getState())
					navigator.clipboard?.writeText(url.toString())
					console.log(url.toString())
				},
			},
		],
	})
	gui.pane.addBinding(panelState, 'ancestry', {
		label: 'random ancestry',
		options: Object.fromEntries(ANCESTRIES.map((name) => [name, name])),
		index: 1,
	})
	gui.pane.addBinding(panelState, 'transition', {
		label: 'transition (s)',
		min: 0,
		max: 6,
		step: 0.1,
		index: 3,
	})
	// Any sound of the foley on demand, to tune the volumes by ear: in the
	// `sound` folder, after the master volume and the volumes.
	const soundFolder = gui.pane.children.find((child) => child.title === 'sound')
	if (audition && soundFolder) {
		const sounds = Object.keys(SOUNDS)
		const heard = { sound: sounds[0] }
		soundFolder.addBinding(heard, 'sound', {
			label: 'listen to',
			options: Object.fromEntries(sounds.map((name) => [name, name])),
			index: 2,
		})
		soundFolder
			.addButton({ title: 'Play sound', index: 3 })
			.on('click', () => audition(heard.sound))
	}
	app.listeners.add((path) => {
		if (path === 'camera' || path === '*') gui.refresh()
	})
	refreshPanel = () => gui.refresh()
	return gui
}

// Outside #debug the skin reads its relief and freckles baked (once, before
// the first frame); in #debug it evaluates them per pixel, live with the
// panel. Also without the HUD (?gui=0), for captures.
const updateSkinMode = () => app.setSkinBaked(window.location.hash !== '#debug')
window.addEventListener('hashchange', updateSkinMode)
updateSkinMode()

app.start()
