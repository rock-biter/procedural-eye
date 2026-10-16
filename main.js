import './style.css'
import EyeApp from './src/app'
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
import { GLASS, liquidGlass } from './src/ui/liquidGlass'

// The bootstrap: reads the URL (?preset=, ?state=, ?photo=, ?view=, ?gui=0, ?dpr=,
// #debug), creates the params, the renderer and the app, the dock unless
// ?gui=0, and the panel while the URL ends in #debug.
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
// the wheel: portrait screens are narrow, so they zoom in to camera.distance
// and out farther; landscape ones zoom in closer, to zoom.in. Landscape
// screens start zoom.start of the way out (unless the URL sets the scene);
// portrait ones zoomed in.
const startDistance = params.camera.distance
function zoomDistances(settings) {
	return portrait() ? [startDistance, settings.mobileOut] : [settings.in, settings.out]
}
if (!portrait() && !urlParams.has('state') && !urlParams.has('preset')) {
	const [near, far] = zoomDistances(params.zoom)
	setValue(PARAM_SCHEMA, params, 'camera.distance', near + (far - near) * params.zoom.start)
}

const setup = new RenderSetup({ params, urlParams })
// Captures (?photo=) start frozen: a deterministic instant.
const app = new EyeApp({ setup, params, frozen: urlParams.has('photo') })
// The app object itself, for console debugging.
if (urlParams.has('debug')) window.__EYE_APP__ = app
app.controls.distanceLimits = () => zoomDistances(app.targetParams.zoom)

// The panel's random-eye ancestry and the length of preset and random-eye
// transitions (seconds; 0 switches at once).
const panelState = { ancestry: 'european', transition: TRANSITION.duration }

// The groups a random eye resets to their defaults before applying its sample.
// The lashes and the skin are not among them: a random eye keeps them.
const RANDOM_EYE_GROUPS = ['eye', 'iris', 'irisColor', 'irisStructure', 'sclera']

// Glides to the preset `name`: its overrides on the defaults.
function loadPreset(name, duration = panelState.transition) {
	if (!PRESETS[name]) return false
	app.transitionTo(fitScreen(createParams(PARAM_SCHEMA, PRESETS[name].params)), duration)
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
// ('out', by the screen's shape), over zoom.duration. The rest keeps the
// values a running transition is heading for.
function zoom(direction) {
	const settings = app.targetParams.zoom
	const [near, far] = zoomDistances(settings)
	const target = cloneParams(app.targetParams)
	setValue(PARAM_SCHEMA, target, 'camera.distance', direction === 'in' ? near : far)
	app.transitionTo(target, settings.duration)
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
	skinTone,
}

// Downloads the current (accumulated) image with its state in a tEXt chunk.
async function savePng() {
	const { insertPngText } = await import('./src/render/pngMetadata')
	const dataUrl = window.__EYE__.capture()
	const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) =>
		c.charCodeAt(0),
	)
	const tagged = insertPngText(bytes, 'eye-state', window.__EYE__.getState())
	download(new Blob([tagged], { type: 'image/png' }), `eye-${Date.now()}.png`)
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

// The glass of the skin buttons: a bevel and a bend scaled to their size.
const SMALL_GLASS = { ...GLASS, bezel: 10, maxOffset: 7 }

// The frame around the page (style.css): a cross of 1 px arms at each corner
// and a dotted line along each side, across the whole window: a 1 px dot
// every FRAME_DOT_SPACING px of an SVG pattern.
const FRAME_DOT_SPACING = 8
function frame() {
	const element = document.createElement('div')
	element.className = 'frame'
	element.setAttribute('aria-hidden', 'true')
	const sides = ['top', 'right', 'bottom', 'left']
	const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
	element.innerHTML = [
		...sides.map(
			(side) =>
				`<svg class="frame-line frame-${side}"><pattern id="frame-dots-${side}" width="${FRAME_DOT_SPACING}" height="${FRAME_DOT_SPACING}" patternUnits="userSpaceOnUse"><rect width="1" height="1"/></pattern><rect width="100%" height="100%" fill="url(#frame-dots-${side})"/></svg>`,
		),
		...corners.map(
			(corner) =>
				`<svg class="frame-cross frame-${corner}"><rect x="50%" width="1" height="100%"/><rect y="50%" width="100%" height="1"/></svg>`,
		),
	].join('')
	return element
}

// A plus (zoom in) or a minus (zoom out).
function sign(plus) {
	return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12${plus ? 'M12 6v12' : ''}"/></svg>`
}

// A glass button (the dock, the skin tones); it blurs itself after a click,
// because Space toggles photo mode only when the page has the focus.
function glassButton(className, label, content, run) {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = `glass ${className}`
	button.setAttribute('aria-label', label)
	button.title = label
	button.innerHTML = content
	button.addEventListener('click', () => {
		run()
		button.blur()
	})
	return button
}

if (urlParams.get('gui') !== '0') {
	// The frame around the page; the rest of the interface stays inside it.
	document.body.appendChild(frame())

	// Zoom out, zoom in and Random eye, always in view outside the panel:
	// bottom right, or on phones and tablets Random-eyes bottom center and the
	// zoom buttons stacked bottom right (style.css).
	const dock = document.createElement('div')
	dock.className = 'dock'
	dock.append(
		glassButton('zoom zoom-out', 'Zoom out', sign(false), () => zoom('out')),
		glassButton('zoom zoom-in', 'Zoom in', sign(true), () => zoom('in')),
		glassButton('random-eye', 'Random-eyes', 'Random-eyes', () =>
			console.log('Random-eyes', panelState.ancestry, loadRandomEye()),
		),
	)
	document.body.appendChild(dock)
	liquidGlass(dock.children)

	// The skin tones, bottom left: a column of small glass buttons, each with
	// a bead of its color. The one of the color the params are heading for is
	// pressed, also after the panel or a preset changes it.
	const skinTones = document.createElement('div')
	skinTones.className = 'skin-tones'
	skinTones.setAttribute('role', 'group')
	skinTones.setAttribute('aria-label', 'Skin tone')
	const toneButtons = SKIN_TONES.map((tone) => {
		const button = glassButton('skin', `${tone.label} skin`, '<span></span>', () =>
			skinTone(tone.name),
		)
		button.style.setProperty('--tone', tone.color)
		return button
	})
	const pressTone = () => {
		const color = app.targetParams.skin.color
		toneButtons.forEach((button, i) =>
			button.setAttribute('aria-pressed', String(SKIN_TONES[i].color === color)),
		)
	}
	skinTones.append(...toneButtons)
	document.body.appendChild(skinTones)
	liquidGlass(toneButtons, SMALL_GLASS)
	pressTone()
	app.listeners.add((path) => {
		if (path === '*' || path === 'skin.color') pressTone()
	})

	// The title and the credit line, top left; the credit's link blurs itself
	// after a click, as the glass buttons do.
	const masthead = document.createElement('header')
	masthead.className = 'masthead'
	masthead.innerHTML =
		'<h1>Random-eyes</h1><p class="credit">powered by <a href="https://x.com/__rockbiter" target="_blank" rel="noopener">rockbiter</a>, made with three.js and Opus 5.5</p>'
	masthead.querySelector('a').addEventListener('click', (event) => event.currentTarget.blur())
	document.body.appendChild(masthead)

	// The frame rate, top right, styled as the credit line: the frames the page
	// shows per second, counted over half a second. A gap longer than a second
	// is a hidden tab, not a slow frame, and is not shown.
	const fps = document.createElement('div')
	fps.className = 'fps'
	fps.textContent = '-- fps'
	document.body.appendChild(fps)
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
	app.listeners.add((path) => {
		if (path === 'camera' || path === '*') gui.refresh()
	})
	return gui
}

app.start()
