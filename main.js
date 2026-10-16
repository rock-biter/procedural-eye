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
import RenderSetup from './src/renderSetup'
import { liquidGlass } from './src/ui/liquidGlass'

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
// the wheel: zoom in is camera.distance; portrait screens are narrow, so their
// zoom out is farther. Landscape screens start zoom.start of the way out
// (unless the URL sets the scene); portrait ones zoomed in.
const startDistance = params.camera.distance
function zoomDistances(settings) {
	return [startDistance, portrait() ? settings.mobileOut : settings.out]
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
// The lashes are not among them: a random eye keeps them.
const RANDOM_EYE_GROUPS = ['eye', 'iris', 'irisColor', 'irisStructure', 'sclera', 'skin']

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

// A plus (zoom in) or a minus (zoom out).
function sign(plus) {
	return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12${plus ? 'M12 6v12' : ''}"/></svg>`
}

// A button of the dock; it blurs itself after a click, because Space toggles
// photo mode only when the page has the focus.
function dockButton(className, label, content, run) {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = className
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
	// Zoom out, zoom in and Random eye, always in view outside the panel:
	// bottom right, or bottom center on phones and tablets (style.css).
	const dock = document.createElement('div')
	dock.className = 'dock'
	dock.append(
		dockButton('zoom', 'Zoom out', sign(false), () => zoom('out')),
		dockButton('zoom', 'Zoom in', sign(true), () => zoom('in')),
		dockButton('random-eye', 'Random-eyes', 'Random-eyes', () =>
			console.log('Random-eyes', panelState.ancestry, loadRandomEye()),
		),
	)
	document.body.appendChild(dock)
	liquidGlass(dock.children)

	// The credit line, top center; its link blurs itself after a click, as the
	// dock's buttons do.
	const credit = document.createElement('div')
	credit.className = 'credit'
	credit.innerHTML =
		'powered by <a href="https://x.com/__rockbiter" target="_blank" rel="noopener">rockbiter</a>, made with three.js and Opus 5.5'
	credit.querySelector('a').addEventListener('click', (event) => event.currentTarget.blur())
	document.body.appendChild(credit)

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
