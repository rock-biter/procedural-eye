// The development tools, loaded only on request (main.js: ?debug, ?dev,
// ?stats, ?gui=0, ?photo=, ?preset=, ?view=, ?meshtree=1, ?intro=dev or
// #debug), so a plain page neither downloads nor runs them:
// - window.__EYE__, the console API the capture and brand scripts drive, and
//   window.__EYE_APP__ (the app itself) with ?debug;
// - the frame telemetry (src/debug/frameStats.js) and the benchmarks;
// - the presets (src/params/presets.js);
// - the panel while the URL ends in #debug (src/debug/panel.js), the mesh tree
//   with ?meshtree=1 (src/debug/meshTree.js), the sound meter, and the frame
//   rate with the adaptive resolution over the image with ?stats.
import { cloneParams, createParams, setValue } from '../params/params'
import { PARAM_SCHEMA } from '../params/paramSchema'
import { PRESETS } from '../params/presets'
import { PATTERN_NAMES, patternIndex, pickPattern } from '../eye/sharinganPatterns'
import FrameStats from './frameStats'

// `context` (main.js): { app, urlParams, panelState, fitScreen, actions, ui,
// hooks }. `actions` holds main.js's own glides (randomEye, zoom, zoom and
// aperture levels, skinTone), savePng and download; `ui`, with the interface
// only, { audio, ambience, intro, INTRO, checklist }; `hooks`, the calls main.js makes
// into the tools (refreshPanel, onRandomEye), set here.
export function installDevTools(context) {
	const { app, urlParams, panelState, fitScreen, actions, ui, hooks } = context

	// Every rendered frame, timed: the app's renders go through renderSample().
	const stats = new FrameStats(app.setup.renderer)
	const renderSample = app.renderSample.bind(app)
	app.renderSample = (sample, shown) => {
		stats.beginFrame()
		renderSample(sample, shown)
		stats.endFrame()
	}
	const getRenderStats = () => ({
		...stats.getStats(),
		adaptivePixelRatio: app.setup.adaptivePixelRatio.getStats(),
	})

	// Glides to the preset `name`: its overrides on the defaults, the viewer's
	// volume kept (sound.volume, the slider by the sound toggle).
	const loadPreset = (name, duration = panelState.transition) => {
		if (!PRESETS[name]) return false
		const target = fitScreen(createParams(PARAM_SCHEMA, PRESETS[name].params))
		setValue(PARAM_SCHEMA, target, 'sound.volume', app.targetParams.sound.volume)
		app.transitionTo(target, duration)
		return true
	}

	window.__EYE__ = {
		params: app.params,
		getAccumulation: () => ({
			samples: app.samples,
			target: app.params.quality.photoSamples,
			converged: app.converged,
		}),
		getRenderStats,
		getState: () => app.getState(),
		getParams: () => cloneParams(app.params),
		// A full params object to glide to.
		transitionTo: (target, duration) => app.transitionTo(cloneParams(target), duration),
		getTargetParams: () => cloneParams(app.targetParams),
		isTransitioning: () => app.transition !== null,
		setParams: (overrides) => app.setParams(overrides),
		capture: () => app.capture(),
		captureBlob: () => app.captureBlob(),
		toggleFrozen: () => app.toggleFrozen(),
		isFrozen: () => app.frozen,
		// Blinks now; false while the blink's frames are not built yet.
		blink: () => app.blink(),
		isBlinkReady: () => app.lidBlink.ready,
		// The volume cannon's glitch, now; resolves at its peak.
		glitch: () => app.terminator.trigger(),
		isGlitching: () => app.terminator.active,
		// The Sharingan (src/eye/sharingan.js), locked or not: the pattern
		// `name`, or the next the HUD's button would pick; off; the one shown
		// (null for none); the names; whether it moves.
		sharingan: (name) => {
			const current = patternIndex(app.sharingan.name)
			const next =
				name ?? PATTERN_NAMES[pickPattern(current, Math.random, app.params.sharingan.rinnegan)]
			app.sharingan.show(next, app.params)
			return next
		},
		sharinganOff: () => app.sharingan.hide(app.params),
		getSharingan: () => app.sharingan.name,
		getSharinganNames: () => [...PATTERN_NAMES],
		isSharinganMoving: () => app.sharingan.moving(),
		measure: (frames) => measure(app, stats, getRenderStats, frames),
		measureSync: (frames) => measureSync(app, frames),
		getCompileMs: () => app.compileMs,
		// The skin's relief: baked (outside #debug) or per pixel; the last
		// bake's time.
		setSkinBaked: (baked) => app.setSkinBaked(Boolean(baked)),
		isSkinBaked: () => app.lids.baked,
		getSkinBakeMs: () => app.skinBakeMs,
		getEyeGeometry: () => ({ apexZ: app.eye.apexZ, focusDepth: app.focusDepth }),
		getPresetNames: () => Object.keys(PRESETS),
		getPresetInfo: (name) => {
			const preset = PRESETS[name]
			return preset ? { label: preset.label, references: preset.references ?? [] } : null
		},
		loadPreset,
		...actions.api,
	}
	if (urlParams.has('debug')) window.__EYE_APP__ = app
	hooks.onRandomEye = (ancestry, features) => console.log('Random eye', ancestry, features)

	if (ui) {
		const { audio, ambience, intro, INTRO, checklist } = ui
		ui.audio.enableMeter()
		Object.assign(window.__EYE__, {
			getSoundStats: () => ({ ...audio.stats(), musicSpeed: ambience.rate }),
			replayIntro: () => intro.replay(),
			getIntro: () => intro.timeline,
			getIntroConfig: () => INTRO,
			// The checklist (desktop only): its progress, the task shown done,
			// or everything forgotten, as its Reset does.
			getChecklist: () => checklist.state(),
			completeTask: () => checklist.complete(),
			resetChecklist: () => checklist.reset(),
		})
		// The panel shows while the URL ends in #debug: built the first time,
		// then hidden and shown again as the hash changes.
		let panel = null
		const updatePanel = async () => {
			const shown = window.location.hash === '#debug'
			if (shown)
				panel ??= import('./panel').then(({ createPanel }) => createPanel(context, loadPreset))
			if (panel) (await panel).pane.hidden = !shown
		}
		window.addEventListener('hashchange', updatePanel)
		updatePanel()
	}

	// ?stats: the frame rate and the adaptive resolution at the top left, read
	// twice a second, to follow a phone over minutes (a GPU slowing down as it
	// warms up, a power saving mode capping the frame rate).
	if (urlParams.has('stats')) showStats(app, getRenderStats)

	// ?meshtree=1: the scene graph at the left, each object's visible and each
	// mesh's wireframe, with the frame's draw calls and the scene's vertices.
	if (urlParams.get('meshtree') === '1') {
		import('./meshTree').then(({ createMeshTree }) =>
			createMeshTree({
				scene: app.setup.scene,
				onChange: () => app.refreshScene(),
				drawCalls: () => stats.drawCalls,
			}),
		)
	}
}

function showStats(app, getRenderStats) {
	const overlay = document.createElement('pre')
	Object.assign(overlay.style, {
		position: 'fixed',
		left: 'calc(8px + env(safe-area-inset-left, 0px))',
		top: 'calc(8px + env(safe-area-inset-top, 0px))',
		zIndex: 1000,
		margin: 0,
		padding: '6px 8px',
		font: '11px/1.4 ui-monospace, monospace',
		color: '#fff',
		background: 'rgba(0, 0, 0, 0.6)',
		pointerEvents: 'none',
	})
	document.body.append(overlay)
	const ms = (value) => (value === undefined ? '-' : value.toFixed(1))
	setInterval(() => {
		const stats = getRenderStats()
		const adaptive = stats.adaptivePixelRatio
		const frame = stats.frame ?? {}
		overlay.textContent = [
			`${Math.round(performance.now() / 1000)} s · ${app.setup.mobile ? 'mobile' : 'desktop'}`,
			`${frame.p50 ? Math.round(1000 / frame.p50) : '-'} fps · frame ${ms(frame.p50)} / p95 ${ms(frame.p95)} ms`,
			`cpu ${ms(stats.cpu?.p50)} · gpu ${ms(stats.gpu?.p50)} ms`,
			`ratio ${adaptive.ratio} [${adaptive.min}, ${adaptive.max}]${adaptive.trying ? ' trying' : ''} · ${adaptive.changes} changes`,
			`window ${adaptive.lastMeanMs ?? '-'} ms · ${stats.drawingBuffer.join('×')} px`,
		].join('\n')
	}, 500)
}

// Wall-clock time of `frames` interactive frames, each finished with a
// synchronous one-pixel read: on ANGLE-Metal the timer queries are not
// reliable, a forced completion is. Returns { meanMs, medianMs, minMs, maxMs,
// samples }.
function measureSync(app, frames = 30) {
	const renderer = app.setup.renderer
	const times = []
	// Reading the canvas would wait for the display; the scene buffer is
	// offscreen and written every frame, kept or not.
	const pixel = new Uint16Array(4)
	const render = () => {
		app.renderInteractive()
		renderer.readRenderTargetPixels(app.post.composer.inputBuffer, 0, 0, 1, 1, pixel)
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

// Renders `frames` interactive frames back to back, one per animation frame
// (no accumulation), in place of the app's loop, and resolves with the frame
// statistics, GPU time included where available.
function measure(app, stats, getRenderStats, frames = 120) {
	// Starts the GPU timer.
	stats.getStats()
	return new Promise((resolve) => {
		const loop = app.frame
		let remaining = frames
		const measuring = (time) => {
			// The loop's clock goes on, so the next interval it measures is one frame.
			app.lastTime = time
			app.renderInteractive()
			if (--remaining > 0) {
				requestAnimationFrame(measuring)
				return
			}
			app.frame = loop
			requestAnimationFrame(loop)
			// The last GPU queries resolve a few frames later.
			setTimeout(() => resolve({ ...getRenderStats(), compileMs: app.compileMs }), 300)
		}
		// The loop's next frame schedules app.frame: from then on, this one.
		app.frame = measuring
	})
}
