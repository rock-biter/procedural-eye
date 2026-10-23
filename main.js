import './style.css'
import { gsap } from 'gsap'
import EyeApp from './src/app'
import Ambience from './src/audio/ambience'
import AudioEngine from './src/audio/audioEngine'
import CameraFoley from './src/audio/cameraFoley'
import { PARAM_SCHEMA } from './src/params/paramSchema'
import {
	applyOverrides,
	cloneParams,
	createDefaults,
	createParams,
	decodeState,
	getLeaf,
	setValue,
} from './src/params/params'
import { TRANSITION } from './src/params/paramTransition'
import { randomEye, randomIrises } from './src/params/populationPriors'
import { SECRET_TONE, SKIN_TONES } from './src/params/skinTones'
import RenderSetup from './src/renderSetup'
import { SHARINGAN_NAMES, photoWords, pickPattern } from './src/eye/sharinganPatterns'
import { KONAMI, createSequence, parseUnlocks } from './src/ui/unlocks'
import { magnification } from './src/camera/cameraOptics'
import { createHud } from './src/ui/hud'
import { CHECKLIST, createChecklist } from './src/ui/checklist'
import { TASKS, createProgress } from './src/ui/checklistTasks'
import { FIRST_SHOT, SHOTS, createShotLog, terminatorLog } from './src/ui/consoleArt'
import { INTRO, createIntro } from './src/ui/intro'
import {
	HUD,
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
// ?meshtree=1, ?intro=, ?debug, ?dev, #debug), creates the params, the
// renderer and the app, the HUD and its intro unless ?gui=0, and, on request
// only, the development tools (src/debug/devTools.js: the console API, the
// panel while the URL ends in #debug, the mesh tree with ?meshtree=1).
const urlParams = new URLSearchParams(window.location.search)
// The presets (src/params/presets.js) load only for ?preset= (the default
// preset is the defaults themselves).
const PRESETS = urlParams.has('preset') ? (await import('./src/params/presets')).PRESETS : null
const preset = PRESETS?.[urlParams.get('preset')] ?? { params: {} }
const state = urlParams.get('state') ? decodeState(urlParams.get('state')) : null
// Portrait screens (phones held upright) keep the camera target at the
// entrance pupil's depth: camera.targetZ 0.
const portrait = () => window.innerWidth < window.innerHeight
function fitScreen(target) {
	if (portrait()) setValue(PARAM_SCHEMA, target, 'camera.targetZ', 0)
	return target
}

const params = fitScreen(createParams(PARAM_SCHEMA, preset.params, state))
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

// The calls into the development tools, once they are loaded
// (src/debug/devTools.js sets them).
const hooks = { refreshPanel: () => {}, onRandomEye: null }

// The panel's random-eye ancestry and the length of preset and random-eye
// transitions (seconds; 0 switches at once).
const panelState = { ancestry: 'european', transition: TRANSITION.duration }

// The groups a random eye resets to their defaults before applying its sample.
// The lashes and the skin are not among them: a random eye keeps them.
const RANDOM_EYE_GROUPS = ['eye', 'iris', 'irisColor', 'irisStructure', 'sclera']

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

// The irises of `count` random eyes for the intro's shuffle (randomIrises(),
// no two of a shade in a row), each on the defaults of its groups, as a random
// eye resets them: deep partials of the params. An iris's token (its seed,
// its melanin and its stroma's scattering) tells it from another.
const IRIS_GROUPS = ['irisColor', 'irisStructure']
function drawIrises(count) {
	const defaults = createDefaults(PARAM_SCHEMA)
	return randomIrises(count).map(({ params: overrides }) => {
		const eye = {}
		for (const group of IRIS_GROUPS) eye[group] = structuredClone(defaults[group])
		applyOverrides(PARAM_SCHEMA, eye, overrides)
		return eye
	})
}
const irisOf = (values) =>
	Object.fromEntries(IRIS_GROUPS.map((group) => [group, structuredClone(values[group])]))
const irisToken = ({ irisColor, irisStructure }) =>
	[irisStructure.seed, irisColor.ablMelanin, irisColor.eumelanin, irisColor.stromaScattering].join()

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

// Glides `skin.color` to the tone `name` (src/params/skinTones.js, the
// hidden one too), as the skin buttons do. The rest keeps the values a
// running transition is heading for.
function skinTone(name, duration = panelState.transition) {
	const tone = [...SKIN_TONES, SECRET_TONE].find((candidate) => candidate.name === name)
	if (!tone) return false
	if (app.targetParams.skin.color === tone.color) return true
	const target = cloneParams(app.targetParams)
	setValue(PARAM_SCHEMA, target, 'skin.color', tone.color)
	app.transitionTo(target, duration)
	return true
}

// The sound design's cues (src/audio/cameraFoley.js), once the HUD has set
// them up: nothing without it (?gui=0).
let cue = () => {}
// What the development tools take of the interface: { audio, ambience,
// intro, INTRO }, none without it.
let ui = null
// The intro (src/ui/intro.js), with the interface, and whether it plays at
// start-up: not with ?intro=0, not for a capture (?photo=), not with reduced
// motion. ?intro=dev keeps its timeline and loads GSDevTools to scrub it.
let intro = null
// The color tables of the intro's irises, being built.
let irisesReady = Promise.resolve()
const introPlays =
	urlParams.get('intro') !== '0' &&
	!urlParams.has('photo') &&
	!window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Downloads the current (accumulated) image with its state in a tEXt chunk,
// to the sound of a focus beep and a shutter (from `element`, Snapshot, if
// given).
async function savePng(element) {
	cue('snapshot', { element })
	await takePhoto()
}

// The download of savePng(), without its sound, as `name`.png (eye- and the
// time by default), with the owner of the Sharingan on the eye, if any, after
// the name or before the time (eye-itachi-<time>.png, photoWords()). The
// image is the one of the call, caught before the PNG's tools load; it is
// encoded off the main thread, so the page goes on meanwhile.
async function takePhoto(name) {
	const pattern = app.sharingan.onEye(app.params)
	const owner = pattern && photoWords(pattern)
	const words = name ? [name, owner] : ['eye', owner, Date.now()]
	const state = app.getState()
	const captured = app.captureBlob()
	const { insertPngText } = await import('./src/render/pngMetadata')
	const bytes = new Uint8Array(await (await captured).arrayBuffer())
	const tagged = insertPngText(bytes, 'eye-state', state)
	download(new Blob([tagged], { type: 'image/png' }), `${words.filter(Boolean).join('-')}.png`)
}

// The viewer's mute and volume (sound.volume, the master), kept in the
// browser (none in a private window: on, at the default volume).
const MUTED_KEY = 'random-eyes:muted'
const VOLUME_KEY = 'random-eyes:volume'
// The checklist's progress and the skin tones worn (desktop only).
const CHECKLIST_KEY = 'random-eyes:checklist'
// How long (s) after the checklist is done the Sharingan awakens: after the
// photo's shutter that does the last task.
const AWAKEN_DELAY = 0.4
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

// The tab's title while the page is hidden, with the interface: a line of the
// eye left staring at the empty window (main.js's showTabTitle()).
const TAB_TITLES = [
	'I can see you…',
	'I saw that.',
	'Still watching…',
	'Blink if you miss me',
	"Come back, I'm drying out",
	'Staring contest: you lost',
]

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
	const frameElement = frame()
	document.body.appendChild(frameElement)

	// The sound design (src/audio/, docs/AUDIO.md): the camera foley of the
	// controls and the ambience, which start at the first press or key (the
	// ambience fading in slowly) and pause while the page is hidden or out of
	// focus. The viewer's mute (the sound toggle, M) is kept in the browser.
	const audio = new AudioEngine({ params: app.params, muted: readStored(MUTED_KEY) === '1' })
	const foley = new CameraFoley(audio)
	const ambience = new Ambience(audio)
	cue = (name, detail) => foley.cue(name, detail)
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
		if (path !== 'frozen') return
		cue('frozen', { frozen: app.frozen })
		if (app.frozen) report('photo')
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
	// frame, gliding or not. It also has the hidden tone and, on desktops, the
	// Sharingan, which the checklist unlocks (below). `desktop` (a fine
	// pointer) tells a desktop's checklist and photo mode's line from a
	// phone's or a tablet's.
	const desktop = window.matchMedia('(pointer: fine)').matches
	const hud = createHud({
		tones: SKIN_TONES,
		secretTone: SECRET_TONE,
		onTone: (name) => {
			const color = app.targetParams.skin.color
			wearTone(name)
			skinTone(name)
			if (app.targetParams.skin.color !== color)
				report(name === SECRET_TONE.name ? 'secret' : 'tone')
		},
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
		onRandom: () => {
			// A new eye is a human one again.
			app.sharingan.hide(app.params, motionless.matches)
			const features = loadRandomEye()
			hooks.onRandomEye?.(panelState.ancestry, features)
			report('iris')
		},
		// Once the checklist is done (below), a desktop's Sharingan: another
		// pattern at random at each press, counted for the Uchiha clan; with the
		// clan complete, now and then the Rinnegan (src/eye/sharingan.js).
		onSharingan: desktop
			? () => {
					const clan = progress.done().some((task) => task.id === 'uchiha')
					const odds = clan || unlocks.has('rinnegan') ? app.params.sharingan.rinnegan : 0
					const next = pickPattern(app.sharingan.name, Math.random, odds)
					app.sharingan.show(next, app.params, motionless.matches)
					if (next === 'rinnegan') report('rinnegan')
					// The clan complete, the Rinnegan shows through for an instant.
					else if (report('uchiha', next) === 'done') app.sharingan.hint()
				}
			: null,
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

	// The checklist under it (src/ui/checklist.js): on desktops as wide as the
	// room left of the HUD's circle, short of the skin tones, and down to above
	// the camera's angles, by the circle's middle (hidden where it is too
	// narrow or too short); on a split HUD (phones) across the title's width,
	// down to the circle's middle. Phones and tablets (no fine pointer) show
	// one task at a time and leave out a desktop's tasks (the focus, photo
	// mode, the tab's titles, the console's reports). It shows once the intro
	// ends. The controls report what is done;
	// only the task shown counts (src/ui/checklistTasks.js). The hidden tone
	// (SECRET_TONE) can be pressed once its task shows and every tone has
	// been worn since (a press that brings the task in is not one of them),
	// and from then on. The progress is kept in the browser, with those tones.
	const readChecklist = () => {
		try {
			return JSON.parse(readStored(CHECKLIST_KEY)) ?? {}
		} catch {
			return {}
		}
	}
	const saved = readChecklist()
	const tasks = desktop ? TASKS : TASKS.filter((task) => !task.desktop)
	const progress = createProgress(tasks, {
		counts: {
			titles: TAB_TITLES.length,
			shots: SHOTS.length + 1,
			uchiha: SHARINGAN_NAMES.length,
		},
		saved,
	})
	const worn = new Set(Array.isArray(saved.tones) ? saved.tones : [])
	// What `?unlock=` gives this page without the checklist
	// (src/ui/unlocks.js), and whether the Konami code has unlocked the
	// Sharingan (kept with the checklist, until Reset).
	const unlocks = parseUnlocks(urlParams.get('unlock'))
	let konami = saved.konami === true
	const keepChecklist = () =>
		writeStored(CHECKLIST_KEY, JSON.stringify({ ...progress.state(), tones: [...worn], konami }))
	const secretShown = () => progress.current()?.id === 'secret'
	const unlockSecret = () => {
		const found = progress.done().some((task) => task.id === 'secret')
		const allWorn = SKIN_TONES.every((tone) => worn.has(tone.name))
		hud.unlockSecret(unlocks.has('tone') || found || (secretShown() && allWorn))
	}
	// A desktop's checklist done unlocks the Sharingan (the HUD's tomoe) and
	// its hidden tasks, and so do the Konami code and `?unlock=` (not the
	// hidden tasks); Reset locks it again and takes it off the eye. Done
	// live (`live`), it awakens AWAKEN_DELAY s later, after the photo's
	// shutter: a singing bowl, a shockwave over the image from the eye (not
	// with reduced motion), the HUD's tomoe coming in and a first Sharingan
	// at random, counted for the clan. True when it awakens.
	let sharinganUnlocked = false
	// `count`: the first Sharingan counts for the clan (not when the panel of
	// #debug plays the awakening again).
	const awaken = (count = true) => {
		cue('awaken')
		if (!motionless.matches) app.post.shockwave.trigger()
		if (sharinganUnlocked) hud.unlockSharingan(true, true)
		const first = pickPattern(app.sharingan.name, Math.random, 0)
		app.sharingan.show(first, app.params, motionless.matches)
		if (count) report('uchiha', first)
	}
	const unlockSharingan = (live) => {
		const ids = new Set(progress.done().map((task) => task.id))
		const done =
			desktop &&
			(konami || unlocks.has('sharingan') || tasks.every((task) => task.hidden || ids.has(task.id)))
		const awakens = live && done && !sharinganUnlocked
		sharinganUnlocked = done
		if (awakens)
			gsap.delayedCall(AWAKEN_DELAY, () => {
				if (sharinganUnlocked) awaken()
			})
		else hud.unlockSharingan(done)
		if (!done) app.sharingan.hide(app.params)
		return awakens
	}
	// The awakening again, counting for nothing: with the Sharingan
	// unlocked, its button hidden and brought in again; otherwise its sound,
	// its shockwave and a Sharingan alone.
	const replayAwakening = () => {
		if (sharinganUnlocked) hud.unlockSharingan(false)
		awaken(false)
	}
	// The Konami code (↑ ↑ ↓ ↓ ← → ← → B A, a desktop's, not typed into a
	// field of the panel) unlocks the Sharingan, which awakens; unlocked
	// already, it plays the awakening again.
	const konamiCode = createSequence(KONAMI)
	window.addEventListener('keydown', (event) => {
		if (!desktop || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
		if (event.target.closest?.('input, textarea, select, [contenteditable]')) return
		if (!konamiCode(event.key)) return
		if (sharinganUnlocked) return replayAwakening()
		konami = true
		keepChecklist()
		unlockSharingan(true)
	})
	// Each task done sounds as something unlocking (by the list, at the
	// left), the controls' as the achievements'; the one that awakens the
	// Sharingan sounds its bowl instead.
	// The panel of #debug hears every change too.
	let doneCount = progress.done().length
	const checklistListeners = new Set()
	const checklist = createChecklist({
		tasks,
		progress,
		compact: !desktop,
		onChange: () => {
			keepChecklist()
			unlockSecret()
			const newly = progress.done().slice(doneCount)
			doneCount = progress.done().length
			const awakens = unlockSharingan(true)
			if (!awakens && newly.length > 0) cue('achievement', { element: checklist.element })
			countFirstShot()
			for (const listener of checklistListeners) listener()
		},
		// Reset forgets the tones worn and the Konami code too: the hidden
		// tone and the Sharingan lock again.
		onReset: () => {
			worn.clear()
			konami = false
		},
	})
	const report = (id, key) => checklist.report(id, key)
	// The T-800's first report comes once a page, before every other: told
	// already, it counts as soon as the task of the reports shows (shoot()).
	const countFirstShot = () => {
		if (shotLog.line !== null && progress.current()?.id === 'shots') report('shots', FIRST_SHOT)
	}
	const wearTone = (name) => {
		if (!checklist.counting() || !secretShown() || worn.has(name)) return
		if (!SKIN_TONES.some((tone) => tone.name === name)) return
		worn.add(name)
		keepChecklist()
		unlockSecret()
	}
	document.body.appendChild(checklist.element)
	sounding(checklist.resetButton, 'reset')
	unlockSecret()
	unlockSharingan(false)
	// Its room, measured once the HUD has laid out (its own observer, made
	// first, runs first).
	new ResizeObserver(() => {
		const circle = hud.circle()
		const { left, top } = checklist.element.getBoundingClientRect()
		if (!circle) return checklist.fit(0, 0)
		const right = circle.split
			? masthead.getBoundingClientRect().right
			: circle.x - circle.radius - HUD.button / 2 - CHECKLIST.gap
		const bottom = circle.y - CHECKLIST.readout - CHECKLIST.gap
		checklist.fit(right - left, bottom - top)
	}).observe(hud.element)
	// Once a frame, the framing (the camera's distance or orbit: the zoom's
	// controls, the wheel, a drag) and the focus (the f-number: the
	// aperture knob, the wheel over it, a right-drag) moving.
	let camera = null
	const watchCamera = () => {
		requestAnimationFrame(watchCamera)
		const { distance, azimuth, elevation, fNumber } = app.params.camera
		if (camera) {
			const { distance: d, azimuth: a, elevation: e, fNumber: f } = camera
			if (distance !== d || azimuth !== a || elevation !== e) report('framing')
			if (fNumber !== f) report('focus')
		}
		camera = { distance, azimuth, elevation, fNumber }
	}
	requestAnimationFrame(watchCamera)

	// The tab's title while the page is hidden (TAB_TITLES), "I can see you…"
	// the first time, then another one drawn each time (never the same twice
	// in a row). Back, the page's own title.
	const pageTitle = document.title
	let tabTitle = null
	const showTabTitle = () => {
		if (!document.hidden) {
			document.title = pageTitle
			return
		}
		const skip = 1 + Math.floor(Math.random() * (TAB_TITLES.length - 1))
		tabTitle = tabTitle === null ? 0 : (tabTitle + skip) % TAB_TITLES.length
		document.title = TAB_TITLES[tabTitle]
		report('titles', tabTitle)
	}
	document.addEventListener('visibilitychange', showTabTitle)
	showTabTitle()

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
	// The handle at `shown` (the level, but for the spring below).
	const showVolume = (shown = app.params.sound.volume) => {
		volume.style.setProperty('--volume', shown)
		volume.setAttribute('aria-valuenow', String(Math.round(app.params.sound.volume * 100)))
	}
	const putVolume = (level) => {
		const rounded = Math.round(Math.min(Math.max(level, 0), 1) * 100) / 100
		for (const values of new Set([app.params, app.targetParams]))
			setValue(PARAM_SCHEMA, values, 'sound.volume', rounded)
		showVolume()
		hooks.refreshPanel()
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
	// The volume to `to` over `duration` s, set through `apply` (eased out
	// unless `ease` says otherwise; at once with reduced motion), then `done`.
	const glideVolume = (to, duration, apply = putVolume, done = () => {}, ease = 'power2.out') => {
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
			ease,
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
	// the music slowing back to its own speed with them. Pulled ELEVEN of the
	// furthest it can run, the volume goes to eleven (the checklist's).
	const VOLUME_FOLLOW = { line: 0.3, toggle: 0.15 }
	const SPRING_BACK = 0.9
	const ELEVEN = 0.5
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
		if (pull < 0 && spring.reach > 0) {
			compress(-pull * VOLUME_TRACK)
			return
		}
		unspring()
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
		if (stretch.amount >= ELEVEN) report('eleven')
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
	// Past the left end a drag compresses the credit line as a spring: the
	// handle runs on left with the line held to it, and everything left of it
	// (the credit and the sound toggle) squeezes toward the left edge to make
	// room, up to `sound.squeeze` of its width. The handle follows the pointer
	// one to one at first, ever more stiffly, and stops at that limit once the
	// pointer has gone twice as far (sooner where the window ends). The
	// further it is compressed the louder the spring will throw the handle:
	// meanwhile the volume rises from silence to that level and the glass harp
	// slows, down to `sound.squeezeRate` of its speed at the limit, the handle
	// staying at the line's start. Let go, the line and the text spring back
	// with an elastic bounce, stronger the more they were compressed, the
	// handle is thrown along the line to that level and the music speeds back
	// up. At the limit the spring is armed and the handle trembles: let go, it
	// shoots the handle at Snapshot (on a phone, where Snapshot is above it,
	// off the window's right edge first), which recoils the way it was hit,
	// and the handle bounces off it and tumbles out of the window, the volume
	// going to full and falling back from there to the default level, where a
	// new handle pops up a moment later. The hit glitches the eye, the T-800
	// showing through (src/eye/terminator.js), and the photo is taken at the
	// glitch's peak.
	const SPRING_RELEASE = 0.8
	const SQUEEZE_BULGE = 0.8
	const SHOT_SPEED = 2200
	const BANK_SPEED = 900
	const SHOT_SPIN = 1080
	const GRAVITY = 2600
	const RESPAWN = 1.4
	// The handle's run past the left end (px), its limit (px), the width the
	// text squeezes (px), the pointer's run to the limit (px), whether the
	// spring is armed, and the level the handle is shown at.
	const spring = { under: 0, reach: 0, width: 0, travel: 0, armed: false, shown: 0 }
	// Squeezed, the text also grows a little taller (its width to the power
	// −SQUEEZE_BULGE) about the middle of the slider's line, and stretched past
	// its width in the bounce a little lower; the slider is scaled back both
	// ways, keeping its size.
	const showSpring = (under) => {
		const squeeze = Math.max((spring.width - under) / spring.width, 0.05)
		const bulge = squeeze ** -SQUEEZE_BULGE
		credit.style.scale = under ? `${squeeze} ${bulge}` : ''
		volume.style.scale = under ? `${1 / squeeze} ${1 / bulge}` : ''
	}
	// Armed, a hint of the Terminator glitch rises in the eye (src/eye/terminator.js).
	const setArmed = (armed) => {
		spring.armed = armed
		volume.classList.toggle('armed', armed)
		app.terminator.setCharged(armed, motionless.matches)
	}
	const slowed = (amount) => 1 - (1 - app.params.sound.squeezeRate) * Math.max(amount, 0)
	// Compressed by a pointer `pushed` px past the left end.
	const compress = (pushed) => {
		const t = Math.min(pushed / spring.travel, 1)
		spring.under = spring.reach * (1 - (1 - t) ** 2)
		const amount = spring.under / spring.reach
		setArmed(t >= 1)
		showSpring(spring.under)
		userVolume(amount)
		showVolume(0)
		ambience.setSpeed(slowed(amount))
	}
	const unspring = () => {
		if (spring.under === 0) return
		spring.under = 0
		setArmed(false)
		showSpring(0)
		ambience.setSpeed(1)
	}
	// Let go: the spring releases, throwing the handle to the level it was
	// compressed to, or, armed and let go by the pointer (`fire`), at Snapshot.
	const release = (fire) => {
		const { under, armed } = spring
		if (under <= 0) return
		const amount = under / spring.reach
		const shot = fire && armed
		setArmed(false)
		if (shot) shoot()
		const level = shot ? 1 : amount
		// Shot, the handle is gone and comes back on its own (shoot()), even
		// while the spring, held up by the photo, still bounces.
		const ease = () => {
			showSpring(spring.under)
			ambience.setSpeed(slowed((amount * Math.max(spring.under, 0)) / under))
			if (!shot) showVolume(spring.shown)
		}
		spring.shown = 0
		if (motionless.matches) {
			spring.under = 0
			spring.shown = level
			ease()
			settle()
			return
		}
		gsap.to(spring, {
			under: 0,
			duration: SPRING_RELEASE * (0.6 + 0.4 * amount),
			ease: `elastic.out(1, ${0.75 - 0.35 * amount})`,
			onUpdate: ease,
		})
		gsap.to(spring, {
			shown: level,
			duration: SPRING_RELEASE * 0.7,
			ease: 'power3.out',
			onUpdate: ease,
			onComplete: settle,
		})
	}
	// The handle shot at Snapshot from where it is: it flies there (SHOT_SPEED
	// px/s; a bank shot BANK_SPEED, its legs short), spinning SHOT_SPIN
	// degrees a second, Snapshot takes a photo and recoils (the T-800 reports
	// each hit in the console, shotLog), and the handle bounces off it, falls
	// out of the window tumbling and comes back later at the default level,
	// where the volume has fallen meanwhile.
	const shotLog = createShotLog()
	const shoot = () => {
		const from = volume.querySelector('.volume-handle').getBoundingClientRect()
		const to = snapshot.getBoundingClientRect()
		volume.classList.add('fired')
		userVolume(1)
		showVolume()
		const shot = document.createElement('div')
		shot.className = 'volume-shot'
		shot.addEventListener('animationend', () => shot.classList.remove('wall'))
		document.body.append(shot)
		const place = (x, y, turn) => {
			shot.style.translate = `${x}px ${y}px`
			shot.style.rotate = `${turn}deg`
		}
		const start = [from.left + from.width / 2, from.top + from.height / 2]
		// Snapshot above the handle (a phone's footer, a column): a bank shot
		// off the window's right edge, up into Snapshot's lower right quarter,
		// which it knocks up, left and counterclockwise (--recoil-*, style.css).
		// Else straight at its left side, knocking it right.
		const bank = to.bottom < from.top
		const hit = bank
			? [to.right - to.width / 4, to.bottom - 2]
			: [to.left + 4, to.top + to.height / 2]
		const stops = bank
			? [[window.innerWidth - 4, start[1] - 0.35 * (start[1] - hit[1])], hit]
			: [hit]
		const recoil = bank ? { x: '-3px', y: '-7px', turn: '-2deg' } : null
		for (const axis of ['x', 'y', 'turn'])
			if (recoil) snapshot.style.setProperty(`--recoil-${axis}`, recoil[axis])
			else snapshot.style.removeProperty(`--recoil-${axis}`)
		const speed = bank ? BANK_SPEED : SHOT_SPEED
		const shortest = bank ? 0.15 : 0.2
		// The legs, the first on a slight arc, spinning all the way; the
		// velocity the last one ends with.
		const timeline = gsap.timeline()
		let turn = 0
		let velocity = [0, 0]
		stops.reduce((a, b, i) => {
			const distance = Math.hypot(b[0] - a[0], b[1] - a[1])
			const duration = Math.max(distance / speed, shortest)
			const leg = { t: 0 }
			const from = turn
			const arc = i === 0 ? distance * 0.06 : 0
			turn += SHOT_SPIN * duration
			velocity = [(b[0] - a[0]) / duration, (b[1] - a[1]) / duration]
			timeline.to(leg, {
				t: 1,
				duration,
				ease: 'none',
				onUpdate: () => {
					const { t } = leg
					place(
						a[0] + (b[0] - a[0]) * t,
						a[1] + (b[1] - a[1]) * t - arc * 4 * t * (1 - t),
						from + SHOT_SPIN * duration * t,
					)
				},
				// Off the window's edge: a light click and a squash.
				onComplete:
					i < stops.length - 1
						? () => {
								cue('tap', { control: 'volume', element: shot })
								shot.classList.remove('wall')
								void shot.offsetWidth
								shot.classList.add('wall')
							}
						: undefined,
			})
			return b
		}, start)
		timeline.eventCallback('onComplete', () => {
			snapshot.classList.remove('recoil')
			void snapshot.offsetWidth
			snapshot.classList.add('recoil')
			cue('press', { control: 'snapshot', element: snapshot })
			cue('snapshot', { element: snapshot })
			// The hit does the cannon's task; the T-800 reports it in the
			// console (the next task counts the reports), and the easter egg's
			// photo, which catches the T-800, takes the report's name. With
			// reduced motion the glitch holds still.
			report('cannon')
			console.log(...shotLog.next())
			report('shots', shotLog.line)
			const name = shotLog.name
			app.terminator.trigger(motionless.matches).then(() => {
				catchShut()
				return takePhoto(name)
			})
			// Bounced off Snapshot (back and up from its side; down from below,
			// still drifting left), then falling, spinning.
			let [x, y] = hit
			let vx = bank ? 0.5 * velocity[0] : -0.3 * velocity[0]
			let vy = bank ? 250 : -380
			let last = performance.now()
			const fall = (now) => {
				const dt = Math.min((now - last) / 1000, 0.05)
				last = now
				vy += GRAVITY * dt
				x += vx * dt
				y += vy * dt
				turn -= 900 * dt
				place(x, y, turn)
				if (y < window.innerHeight + 40) return requestAnimationFrame(fall)
				shot.remove()
			}
			requestAnimationFrame(fall)
		})
		// The volume glides from full down to the default level while the
		// handle is away, reaching it as the new one pops up there: both on
		// GSAP's clock, held up alike by the photo. A mute or a key meanwhile
		// takes over.
		const rest = getLeaf(PARAM_SCHEMA, 'sound.volume').default
		glideVolume(rest, RESPAWN, userVolume, settle, 'power2.inOut')
		gsap.delayedCall(RESPAWN, () => {
			volume.classList.remove('fired')
			volume.classList.add('respawn')
		})
	}
	volume.addEventListener('animationend', (event) => {
		if (event.animationName === 'volume-respawn') volume.classList.remove('respawn')
	})
	const tapVolume = () => cue('tap', { control: 'volume', element: volume })
	const volumeAt = (event) =>
		(event.clientX - (volumeDrag?.left ?? volume.getBoundingClientRect().left)) / VOLUME_TRACK
	const settle = () => {
		remember(app.params.sound.volume)
		report('volume')
	}
	let volumeDrag = null
	volume.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 || volumeDrag) return
		if (gsap.isTweening(spring) || volume.classList.contains('fired')) return
		volume.setPointerCapture(event.pointerId)
		volume.classList.add('dragging')
		// The spring: the text left of the line, measured at rest, squeezing
		// about the middle of the slider's line, which stays put.
		const { left, top, height } = volume.getBoundingClientRect()
		const box = credit.getBoundingClientRect()
		spring.width = left - box.left
		credit.style.transformOrigin = `left ${top + height / 2 - box.top}px`
		spring.reach = app.params.sound.squeeze * spring.width
		spring.travel = Math.max(Math.min(2 * spring.reach, left - 8), 1)
		const at = (event.clientX - left) / VOLUME_TRACK
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
		volumeDrag = { id: event.pointerId, offset: onHandle ? at - pull : 0, left }
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
		const sprung = spring.under > 0
		release(tap)
		if (!gliding() && !sprung) settle()
		if (tap && !sprung) tapVolume()
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

	// A photo (Snapshot's or the volume cannon's, the image of the moment it
	// is taken) of the eye at least EYE_SHUT shut (the pose's blink, 0 open to
	// 1 shut) catches it not looking (the checklist's).
	const EYE_SHUT = 0.5
	const catchShut = () => {
		if ((app.lastPose?.blink ?? 0) >= EYE_SHUT) report('blink')
	}

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
		catchShut()
		report('snapshot')
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
	// viewport's size in CSS pixels, updated as the window resizes; under it,
	// on desktops, whether photo mode (Space) is on, in the accent while it
	// is.
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
	const photoMode = desktop ? document.createElement('div') : null
	if (photoMode) {
		photoMode.className = 'photo-mode'
		const showPhotoMode = () => {
			photoMode.textContent = `photo mode ${app.frozen ? 'on' : 'off'}`
			photoMode.classList.toggle('on', app.frozen)
		}
		showPhotoMode()
		app.listeners.add((path) => {
			if (path === 'frozen') showPhotoMode()
		})
		stats.append(photoMode)
	}
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

	// The intro (src/ui/intro.js): the image opening under a diagonal cut, the
	// camera pulling back and turning into its framing, the iris shuffling, the
	// HUD, the frame and the texts coming in, then the first blink. Its camera starts `zoom` of the zoom knob's travel
	// closer than its framing (as far as zoom in), its distance and sensor on
	// the zoom's curve, and moves as the knob moves it (setZoomLevel());
	// it turns about the line of sight outside the params, as the parallax
	// turns it (PhysicalCamera.roll). Its reel of irises, drawn now when it
	// plays, has their color tables built ahead in workers
	// (IrisColorLut.prepare()), so each switch (EyeApp.switchParams()) needs
	// no rebuild; one not ready when it starts is left out. Until it plays,
	// the interface waits hidden and a black mask covers the image.
	// The eye's first blink comes as the intro ends: its blinks are held
	// meanwhile (from load), and should the blink's frames still be building
	// then, it waits for them, BLINK_WAIT ms at most. An eye that does not
	// blink (animation.blinkRate 0, a still eye) is only let go.
	const BLINK_WAIT = 4000
	const firstBlink = () => {
		const until = performance.now() + BLINK_WAIT
		const go = () => {
			const { enabled, blinkRate } = app.params.animation
			const blinks = enabled && blinkRate > 0
			if (blinks && !app.lidBlink.ready && performance.now() < until)
				return requestAnimationFrame(go)
			app.holdBlinks(false)
			if (blinks) app.blink()
		}
		go()
	}
	const reelEyes = introPlays ? drawIrises(INTRO.shuffle.count) : []
	irisesReady = app.irisColorLut.prepare(reelEyes.map((eye) => eye.irisColor))
	intro = createIntro({
		hud,
		frame: frameElement,
		texts: [masthead.querySelector('h1'), masthead.querySelector('p'), credit],
		lines: [moreInfo, viewport, fps, ...(photoMode ? [photoMode] : [])],
		snapshot,
		camera: {
			framing(zoom) {
				const { distance, sensorHeight } = app.params.camera
				const { sensorIn, sensorOut } = app.params.zoom
				const level = zoomProgress(distance, zoomLimits())
				const start = Math.min(level + zoom, Math.max(level, 1))
				return {
					from: {
						distance: zoomDistance(start, zoomLimits()),
						sensor: zoomSensor(start, [sensorIn, sensorOut]),
					},
					to: { distance, sensor: sensorHeight },
				}
			},
			set({ distance, sensor }) {
				setValue(PARAM_SCHEMA, app.params, 'camera.distance', distance)
				setValue(PARAM_SCHEMA, app.params, 'camera.sensorHeight', sensor)
				app.onParamChange('camera.distance')
				app.onParamChange('camera.sensorHeight')
				return app.params.camera.distance
			},
			distance: () => app.params.camera.distance,
			turn(degrees) {
				app.physicalCamera.roll = degrees
				app.invalidate()
			},
		},
		irises: {
			eyes: () => reelEyes.filter((eye) => app.irisColorLut.has(eye.irisColor)),
			current: () => irisOf(app.targetParams),
			show(eye) {
				app.switchParams(eye)
				return irisToken(app.targetParams)
			},
			token: () => irisToken(app.targetParams),
		},
		blinks: { hold: () => app.holdBlinks(true), first: firstBlink },
		dev: urlParams.get('intro') === 'dev',
		onEnd: () => checklist?.show(),
	})
	if (introPlays) intro.hold()
	else checklist?.show()
	// The checklist for the console: complete() does the task shown, reset()
	// is Reset's.
	// The panel of #debug's too: every task done or not, the awakening played
	// again (with the Sharingan unlocked, its button hidden and brought in
	// again; otherwise its sound, its shockwave and a Sharingan alone),
	// counting for nothing, and its parts alone.
	const checklistTools = {
		complete: () => checklist?.complete(),
		reset: () => checklist?.reset(),
		state: () => ({ ...progress.state(), tones: [...worn], konami }),
		tasks: tasks.map(({ id, text, achievement = false, hidden = false }) => ({
			id,
			text,
			achievement,
			hidden,
		})),
		setDone: (id, done) => checklist?.setDone(id, done),
		subscribe: (listener) => checklistListeners.add(listener),
		replayAwakening: () => replayAwakening(),
		achievementSound: () => cue('achievement', { element: checklist.element }),
		shockwave: () => app.post.shockwave.trigger(),
		hint: () => app.sharingan.hint(),
	}
	ui = { audio, ambience, intro, INTRO, checklist: checklistTools }

	// For whoever opens the console: the T-800's eye, with its warnings about
	// the volume (src/ui/consoleArt.js); each shot that hits Snapshot adds a
	// line (shoot()).
	console.log(...terminatorLog())
}

// The development tools load only on request: with a flag of the scripts or
// the console (?debug, ?dev, ?stats, ?gui=0, ?photo=, ?preset=, ?view=,
// ?meshtree=1, ?intro=dev), or once the URL ends in #debug (the panel). A
// plain page never downloads them.
const DEV_FLAGS = ['debug', 'dev', 'stats', 'photo', 'preset', 'view']
const devRequested =
	urlParams.get('gui') === '0' ||
	urlParams.get('meshtree') === '1' ||
	urlParams.get('intro') === 'dev' ||
	DEV_FLAGS.some((flag) => urlParams.has(flag))
let devTools = null
const loadDevTools = () => {
	devTools ??= import('./src/debug/devTools').then(({ installDevTools }) =>
		installDevTools({
			app,
			urlParams,
			panelState,
			fitScreen,
			ui,
			hooks,
			actions: {
				savePng,
				download,
				api: {
					randomEye: loadRandomEye,
					zoom,
					getZoomLevel,
					setZoomLevel,
					getApertureLevel,
					setApertureLevel,
					skinTone,
				},
			},
		}),
	)
	return devTools
}
if (devRequested || window.location.hash === '#debug') loadDevTools()
window.addEventListener('hashchange', () => {
	if (window.location.hash === '#debug') loadDevTools()
})

// Outside #debug the skin reads its relief and freckles baked (once, before
// the first frame); in #debug it evaluates them per pixel, live with the
// panel. Also without the HUD (?gui=0), for captures.
const updateSkinMode = () => app.setSkinBaked(window.location.hash !== '#debug')
window.addEventListener('hashchange', updateSkinMode)
updateSkinMode()

// The intro plays on the first frames of the image, once the fonts it splits
// the texts in have loaded and the color tables of its irises are built (for
// IRISES_WAIT ms at most: the shuffle leaves out those not ready); should the
// start fail, the interface still shows and the error is not swallowed.
const IRISES_WAIT = 3000
const started = app.start()
if (intro && introPlays) {
	const play = () => intro.play()
	const irises = Promise.race([
		irisesReady.catch((error) => console.error(error)),
		new Promise((resolve) => setTimeout(resolve, IRISES_WAIT)),
	])
	Promise.all([document.fonts.ready, irises])
		.then(() => started)
		.then(play, (error) => {
			play()
			throw error
		})
}
