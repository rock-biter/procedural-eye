// The collapsed panel of #debug (src/debug/devTools.js): the presets, the
// actions, every parameter, the random ancestry and the transition length,
// in the `sound` folder any sound of the foley on demand, and, with the
// interface, an `achievements` folder: the checklist's tasks to tick off or
// clear one by one, the animations they bring to play again, and the
// `sharingan` and `shockwave` groups.
import { SOUNDS } from '../audio/soundBank'
import { allValues } from '../params/params'
import { PARAM_SCHEMA } from '../params/paramSchema'
import { ANCESTRIES } from '../params/populationPriors'
import { PRESETS } from '../params/presets'
import { addGroupFolder, createGui } from './gui'

// The groups the `achievements` folder holds instead of the panel's top.
const ACHIEVEMENT_GROUPS = ['sharingan', 'shockwave']

// `context`: main.js's (src/debug/devTools.js), `loadPreset` its own.
export function createPanel(context, loadPreset) {
	const { app, panelState, actions, ui, hooks } = context
	const checklist = ui?.checklist
	const gui = createGui({
		schema: PARAM_SCHEMA,
		params: app.params,
		presets: PRESETS,
		skip: checklist ? ACHIEVEMENT_GROUPS : [],
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
	if (checklist) addAchievements(gui, checklist, app)
	// The camera notifies on every pointer move of a drag and every frame of a
	// glide: one refresh per animation frame.
	let queued = false
	app.listeners.add((path) => {
		if (queued || (path !== 'camera' && path !== '*')) return
		queued = true
		requestAnimationFrame(() => {
			queued = false
			gui.refresh()
		})
	})
	hooks.refreshPanel = () => gui.refresh()
	return gui
}

// The `achievements` folder: a box per task of the checklist, ticked when it
// is done (ticking the task shown does it as its report would, with its
// sound and, the last one, the Sharingan's awakening; ticking or clearing
// any other draws the list again), Reset, the awakening and its parts played
// again, and the groups of its animations.
function addAchievements(gui, checklist, app) {
	// Under the actions, above the groups.
	const index = gui.pane.children.findIndex((child) => child.title === 'eye')
	const folder = gui.pane.addFolder({ title: 'achievements', expanded: false, index })
	const done = Object.fromEntries(checklist.tasks.map(({ id }) => [id, false]))
	let syncing = false
	const boxes = checklist.tasks.map(({ id, text, achievement, hidden }) =>
		folder
			.addBinding(done, id, { label: `${hidden ? '◦ ' : achievement ? '★ ' : ''}${text}` })
			.on('change', (event) => {
				if (syncing) return
				checklist.setDone(id, event.value)
				sync()
			}),
	)
	const sync = () => {
		const ids = new Set(checklist.state().done)
		for (const id of Object.keys(done)) done[id] = ids.has(id)
		syncing = true
		try {
			for (const box of boxes) box.refresh()
		} finally {
			syncing = false
		}
	}
	checklist.subscribe(sync)
	sync()
	for (const [title, run] of [
		['Do the task shown', () => checklist.complete()],
		['Reset', () => checklist.reset()],
		['Play the awakening again', () => checklist.replayAwakening()],
		['Shockwave', () => checklist.shockwave()],
		["Rinnegan's hint", () => checklist.hint()],
		['Achievement sound', () => checklist.achievementSound()],
	])
		folder.addButton({ title }).on('click', run)
	for (const key of ACHIEVEMENT_GROUPS)
		addGroupFolder(folder, PARAM_SCHEMA, app.params, key, (path) => app.onParamChange(path))
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
