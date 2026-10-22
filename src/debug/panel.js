// The collapsed panel of #debug (src/debug/devTools.js): the presets, the
// actions, every parameter, the random ancestry and the transition length,
// and, in the `sound` folder, any sound of the foley on demand.
import { SOUNDS } from '../audio/soundBank'
import { allValues } from '../params/params'
import { PARAM_SCHEMA } from '../params/paramSchema'
import { ANCESTRIES } from '../params/populationPriors'
import { PRESETS } from '../params/presets'
import { createGui } from './gui'

// `context`: main.js's (src/debug/devTools.js), `loadPreset` its own.
export function createPanel(context, loadPreset) {
	const { app, panelState, actions, ui, hooks } = context
	const gui = createGui({
		schema: PARAM_SCHEMA,
		params: app.params,
		presets: PRESETS,
		onChange: (path) => app.onParamChange(path),
		onPreset: (name) => loadPreset(name),
		actions: [
			{ title: 'Photo (freeze / live) — Space', run: () => app.toggleFrozen() },
			{ title: 'Save PNG', run: () => actions.savePng() },
			{ title: 'Export defaults JSON', run: () => exportDefaults(app, actions.download) },
			{
				title: 'Copy state URL',
				run: () => {
					const url = new URL(window.location.href)
					url.searchParams.set('state', app.getState())
					navigator.clipboard?.writeText(url.toString())
					console.log(url.toString())
				},
			},
		],
	})
	gui.pane.addBinding(panelState, 'ancestry', {
		label: 'random ancestry',
		options: Object.fromEntries(ANCESTRIES.map((name) => [name, name])),
		index: 0,
	})
	gui.pane.addBinding(panelState, 'transition', {
		label: 'transition (s)',
		min: 0,
		max: 6,
		step: 0.1,
		index: 2,
	})
	// Any sound of the foley on demand, to tune the volumes by ear: in the
	// `sound` folder, after the master volume and the volumes.
	const soundFolder = gui.pane.children.find((child) => child.title === 'sound')
	if (ui && soundFolder) {
		const sounds = Object.keys(SOUNDS)
		const heard = { sound: sounds[0] }
		soundFolder.addBinding(heard, 'sound', {
			label: 'listen to',
			options: Object.fromEntries(sounds.map((name) => [name, name])),
			index: 2,
		})
		soundFolder.addButton({ title: 'Play sound', index: 3 }).on('click', () => {
			ui.audio.unlock()
			ui.audio.play(heard.sound)
		})
	}
	app.listeners.add((path) => {
		if (path === 'camera' || path === '*') gui.refresh()
	})
	hooks.refreshPanel = () => gui.refresh()
	return gui
}

// Downloads the values the panel is heading for (not a transition's in-between
// ones) as defaults.json, the file that replaces src/params/defaults.json. The
// debug view is left out, so the app never starts in one.
function exportDefaults(app, download) {
	const values = allValues(PARAM_SCHEMA, app.targetParams)
	delete values.debug
	const json = `${JSON.stringify(values, null, 2)}\n`
	download(new Blob([json], { type: 'application/json' }), 'defaults.json')
}
