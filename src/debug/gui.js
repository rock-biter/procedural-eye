// The Tweakpane panel, generated from PARAM_SCHEMA: one folder per group, one
// binding per leaf. Bindings edit the params object in place and report the
// changed path; app listeners refresh the panel when something else (the
// camera controls, a preset) changes the values.
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'
import { Pane } from 'tweakpane'
import { isLeaf, leafType } from '../params/params'

// Set while the panel reads the params back: Tweakpane reports those reads as
// changes, and they are not edits.
let refreshing = false

function bindingOptions(leaf, key) {
	const label = leaf.unit ? `${leaf.label ?? key} (${leaf.unit})` : (leaf.label ?? key)
	const options = { label }
	switch (leafType(leaf)) {
		case 'number':
			Object.assign(options, { min: leaf.min, max: leaf.max, step: leaf.step })
			break
		case 'choice':
			options.options = Object.fromEntries(leaf.options.map((option) => [option, option]))
			break
		case 'color':
			options.view = 'color'
			break
	}
	return options
}

function buildFolder(container, schema, values, prefix, onChange) {
	for (const [key, node] of Object.entries(schema)) {
		const path = prefix ? `${prefix}.${key}` : key
		if (isLeaf(node)) {
			container.addBinding(values, key, bindingOptions(node, key)).on('change', (event) => {
				if (!refreshing) onChange(path, event.value, event.last)
			})
		} else {
			const folder = container.addFolder({ title: key, expanded: false })
			buildFolder(folder, node, values[key], path, onChange)
		}
	}
}

// `actions`: [{ title, run }] buttons above the folders; `presets`: { name: { label } }.
export function createGui({ schema, params, onChange, actions = [], presets = null, onPreset }) {
	const pane = new Pane({ title: 'Procedural eye' })
	pane.registerPlugin(EssentialsPlugin)
	const fps = pane.addBlade({ view: 'fpsgraph', label: 'fps', rows: 2 })
	if (presets) {
		const state = { preset: Object.keys(presets)[0] }
		pane
			.addBinding(state, 'preset', {
				options: Object.fromEntries(
					Object.entries(presets).map(([name, preset]) => [preset.label, name]),
				),
			})
			.on('change', (event) => onPreset(event.value))
	}
	for (const action of actions) pane.addButton({ title: action.title }).on('click', action.run)
	buildFolder(pane, schema, params, '', onChange)
	const refresh = () => {
		refreshing = true
		try {
			pane.refresh()
		} finally {
			refreshing = false
		}
	}
	return { pane, fps, refresh }
}
