import './style.css'
import EyeApp from './src/app'
import { PARAM_SCHEMA } from './src/params/paramSchema'
import {
	applyOverrides,
	createDefaults,
	createParams,
	decodeState,
	setValue,
} from './src/params/params'
import { ANCESTRIES, randomEye } from './src/params/populationPriors'
import { PRESETS } from './src/params/presets'
import RenderSetup from './src/renderSetup'

// The bootstrap: reads the URL (?preset=, ?state=, ?photo=, ?view=, ?gui=0, ?dpr=),
// creates the params, the renderer and the app, and the GUI unless hidden.
const urlParams = new URLSearchParams(window.location.search)
const presetName = PRESETS[urlParams.get('preset')] ? urlParams.get('preset') : 'default'
const state = urlParams.get('state') ? decodeState(urlParams.get('state')) : null
const params = createParams(PARAM_SCHEMA, PRESETS[presetName].params, state)
if (urlParams.has('photo'))
	setValue(PARAM_SCHEMA, params, 'quality.photoSamples', urlParams.get('photo'))
if (urlParams.has('view')) setValue(PARAM_SCHEMA, params, 'debug.view', urlParams.get('view'))

const setup = new RenderSetup({ params, urlParams })
// Captures (?photo=) start frozen: a deterministic instant.
const app = new EyeApp({ setup, params, frozen: urlParams.has('photo') })
// The app object itself, for console debugging.
if (urlParams.has('debug')) window.__EYE_APP__ = app
window.__EYE__ = {
	...app.createApi(),
	getPresetNames: () => Object.keys(PRESETS),
	getPresetInfo: (name) => {
		const preset = PRESETS[name]
		return preset ? { label: preset.label, references: preset.references ?? [] } : null
	},
}

const randomState = { ancestry: 'european' }

// Downloads the current (accumulated) image with its state in a tEXt chunk.
async function savePng() {
	const { insertPngText } = await import('./src/render/pngMetadata')
	const dataUrl = window.__EYE__.capture()
	const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) =>
		c.charCodeAt(0),
	)
	const tagged = insertPngText(bytes, 'eye-state', window.__EYE__.getState())
	const link = document.createElement('a')
	link.href = URL.createObjectURL(new Blob([tagged], { type: 'image/png' }))
	link.download = `eye-${Date.now()}.png`
	link.click()
	setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

if (urlParams.get('gui') !== '0') {
	const { createGui } = await import('./src/debug/gui')
	const gui = createGui({
		schema: PARAM_SCHEMA,
		params,
		presets: PRESETS,
		onChange: (path) => app.onParamChange(path),
		onPreset: (name) => {
			const fresh = createParams(PARAM_SCHEMA, PRESETS[name].params)
			applyOverrides(PARAM_SCHEMA, params, fresh)
			app.dirty.add('rebuild').add('define')
			app.notifyChange('*')
		},
		actions: [
			{ title: 'Photo (freeze / live) — Space', run: () => window.__EYE__.toggleFrozen() },
			{
				title: 'Random eye',
				run: () => {
					const { params: overrides, features } = randomEye(randomState.ancestry)
					const defaults = createDefaults(PARAM_SCHEMA)
					for (const group of [
						'eye',
						'iris',
						'irisColor',
						'irisStructure',
						'sclera',
						'lashes',
						'skin',
					]) {
						params[group] = structuredClone(defaults[group])
					}
					applyOverrides(PARAM_SCHEMA, params, overrides)
					console.log('Random eye', randomState.ancestry, features)
					app.dirty.add('rebuild').add('bake').add('define')
					app.notifyChange('*')
				},
			},
			{ title: 'Save PNG', run: () => savePng() },
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
	gui.pane.addBinding(randomState, 'ancestry', {
		label: 'random ancestry',
		options: Object.fromEntries(ANCESTRIES.map((name) => [name, name])),
		index: 1,
	})
	app.listeners.add((path) => {
		if (path === 'camera' || path === '*') gui.refresh()
	})
}

app.start()
