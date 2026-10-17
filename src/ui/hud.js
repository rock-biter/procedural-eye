// The HUD's flat reticles sit on the central ring. Two segmented rings
// follow the camera's zoom; the controls keep their native pointer and
// keyboard behavior, with brackets revealing hover and selection.
import {
	HUD,
	hudLayout,
	knobAngle,
	knobLevel,
	knobSnap,
	orbitArt,
	orbitRing,
	pullLevel,
	spinRing,
	swayTurn,
	toneArcs,
	toneSteps,
	trackLevel,
	turnTones,
	zoomValueRadius,
} from './hudLayout'
import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import { follow } from '../camera/orbitMotion'
import bracketAsset from './assets/bracket.svg?url'

const SVG_NS = 'http://www.w3.org/2000/svg'

gsap.registerPlugin(TextPlugin)

// Icons on a 24 px grid, stroked: a plus, a minus, and an eye for Random eye
// (a filled dot, the pupil, under a flattened arc, the upper lid: wide and
// low, its ends a little above the pupil's middle and meeting at an angle,
// like the canthi, so it reads as an eye, not as a wifi sign).
const ICONS = {
	plus: '<path d="M6 12h12M12 6v12"/>',
	minus: '<path d="M6 12h12"/>',
	eye: '<path d="M3 13.5C6.5 6.5 17.5 6.5 21 13.5"/><circle class="icon-fill" cx="12" cy="14.5" r="2.75"/>',
}
const icon = (name) =>
	`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`

// The level's steps for the arrow keys and Page Up / Page Down, and per
// wheel unit.
const KEY_STEPS = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }
const PAGE_STEPS = { PageUp: 0.25, PageDown: -0.25 }
const LEVEL_PER_WHEEL_UNIT = 0.0012
// How long (ms) a layer stays in the accent past its control's last move:
// the arcs and the spinning circle past their glides.
const ACTIVE_HOLD = { zoom: 700, tone: 1300, random: 1000, camera: 700 }
// How far (px) a readout keeps from the HUD box's sides, or it hides.
const READOUT_MARGIN = 4
// A press that moves less than this (px) is a click.
const CLICK_SLOP = 4
// How long (s) the camera glides when a dragged knob snaps to an end, and
// how long (ms) the rings and brackets take to spring back (style.css).
const SNAP_GLIDE = 0.25
const SPRING_BACK = 600

const clamp01 = (value) => Math.min(Math.max(value, 0), 1)
// The end a zoom level sits at, 1 (zoom in) or 0 (zoom out), or null.
const endOf = (level) => (level >= 0.999 ? 1 : level <= 0.001 ? 0 : null)
// An angle within π of `center`.
const near = (angle, center) =>
	center + ((((angle - center + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI

function svgElement(name, attributes = {}) {
	const element = document.createElementNS(SVG_NS, name)
	for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
	return element
}

// A reticle button; it blurs itself after a click, because Space toggles
// photo mode only when the page has the focus. `content` sits inside the
// reticle and fades with it; `symbol`, over it, keeps its own opacity (the
// zoom buttons' + and −).
function hudButton(className, label, content, run, symbol = '') {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = `hud-button ${className}`
	button.setAttribute('aria-label', label)
	button.title = label
	const over = symbol && `<span class="hud-symbol">${symbol}</span>`
	button.innerHTML = `<span class="hud-glyph"><span class="hud-reticle">${content}</span>${over}<img class="hud-bracket hud-bracket-start" src="${bracketAsset}" alt=""/><img class="hud-bracket hud-bracket-end" src="${bracketAsset}" alt=""/></span>`
	button.addEventListener('click', () => {
		run()
		button.blur()
	})
	return button
}

function group(label) {
	const element = document.createElement('div')
	element.className = 'hud-group'
	element.setAttribute('role', 'group')
	element.setAttribute('aria-label', label)
	return element
}

// Centers `element` and its cut in the circle's line at `angle` on a circle.
// The dashes of a circle of `radius` px: HUD.dash px every about
// HUD.dashPeriod px, a whole number of periods around, so it has no seam.
function dashes(radius) {
	const circumference = 2 * Math.PI * radius
	const period = circumference / Math.max(1, Math.round(circumference / HUD.dashPeriod))
	return `${HUD.dash} ${period - HUD.dash}`
}

function place(element, cut, angle, { cx, cy, radius }) {
	const x = cx + radius * Math.cos(angle)
	const y = cy + radius * Math.sin(angle)
	element.style.left = `${x}px`
	element.style.top = `${y}px`
	element.style.setProperty('--hud-angle', `${angle - Math.PI / 2}rad`)
	cut.setAttribute('cx', x)
	cut.setAttribute('cy', y)
}

// `tones`: [{ name, label, color }]; onTone(name), onZoom('in' | 'out',
// duration), onZoomLevel(level, including elastic overshoot),
// onZoomWheel(deltaY) (the wheel over the knob) and onRandom() run the
// controls; getZoomElasticity() reads the current drag extension.
// (onZoom without a duration glides over the zoom's own). Returns the
// element, mount() (once it is in the page), reserveBottom(height), the
// bottom of the box the zoom's circle keeps clear of, pressTone(color), which presses
// the tone of `color` (none for another color), and showZoomLevel(level),
// where the knob goes (at an end, its button shows in full) and the two
// segmented rings' sizes and turns, and showZoomValue(text), the zoom's
// value by the knob.
export function createHud({
	tones,
	onTone,
	onZoom,
	onZoomLevel,
	onZoomWheel,
	getZoomElasticity = () => 0,
	onRandom,
}) {
	const element = document.createElement('div')
	element.className = 'hud'
	element.style.setProperty('--hud-button', `${HUD.button}px`)
	element.style.setProperty('--hud-knob', `${HUD.knob}px`)
	element.style.setProperty('--tone-scale', HUD.toneScale)

	// The circle, cut around each button by a mask, and the zoom's wider
	// circle of a split HUD (HUD.split), cut by the same mask.
	const ring = svgElement('svg', { class: 'hud-ring', 'aria-hidden': 'true' })
	const mask = svgElement('mask', { id: 'hud-ring-cuts' })
	mask.append(svgElement('rect', { width: '100%', height: '100%', fill: '#fff' }))
	const line = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	const zoomLine = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	// The two segmented zoom rings, each an SVG drawn about the center of its
	// wrapper (orbitArt()) at the layout's size, its dashes in px; the
	// wrappers sit on the HUD's center and turn about it. Their strokes take
	// the wrapper's color, so the rings take the accent when active
	// (style.css).
	const orbitAssets = ['inner', 'outer'].map((kind) => {
		const wrapper = document.createElement('div')
		wrapper.className = `hud-orbit hud-orbit-${kind}`
		wrapper.setAttribute('aria-hidden', 'true')
		const art = svgElement('svg', { class: 'hud-orbit-art' })
		wrapper.append(art)
		return { kind, wrapper, art, radius: null }
	})
	// Each ring's paths for the HUD's circle of `radius` px, redrawn when it
	// changes.
	const drawOrbits = (radius) => {
		for (const asset of orbitAssets) {
			if (asset.radius === radius) continue
			asset.radius = radius
			const { reach, paths } = orbitArt(asset.kind, radius)
			const half = Math.ceil(reach) + 1
			asset.art.setAttribute('viewBox', `${-half} ${-half} ${2 * half} ${2 * half}`)
			asset.art.style.left = asset.art.style.top = `${-half}px`
			asset.art.style.width = asset.art.style.height = `${2 * half}px`
			asset.art.replaceChildren(
				...paths.map(({ d, dashArray, opacity }) =>
					svgElement('path', {
						d,
						'stroke-dasharray': dashArray.join(' '),
						'stroke-opacity': opacity,
					}),
				),
			)
		}
	}
	// The circle between the central ring and the outer zoom ring, which
	// each click on Random eye turns a little further (style.css eases it).
	const spin = svgElement('circle', { class: 'hud-line hud-spin' })
	const spinTeeth = svgElement('circle', { class: 'hud-line hud-spin' })
	let spinTurns = 0
	// Three arcs inside the inner zoom ring, which each skin tone turns to its
	// own places (style.css eases them).
	const arcs = [0, 1, 2].map(() => svgElement('circle', { class: 'hud-line hud-arc' }))
	let arcTone = 0
	let arcsPlaced = false
	// The spinning circle and its teeth sway together.
	const spinGroup = svgElement('g')
	spinGroup.append(spin, spinTeeth)
	ring.append(mask, line, zoomLine, spinGroup, ...arcs)
	const cut = () => {
		const circle = svgElement('circle', { class: 'hud-cut' })
		mask.append(circle)
		return circle
	}

	const toneGroup = group('Skin tone')
	const toneButtons = tones.map((tone) => {
		const button = hudButton('skin', `${tone.label} skin`, '<span class="tone-fill"></span>', () =>
			onTone(tone.name),
		)
		button.style.setProperty('--tone', tone.color)
		return button
	})
	toneGroup.append(...toneButtons)

	const zoomGroup = group('Zoom')
	const zoomIn = hudButton(
		'zoom-in',
		'Zoom in',
		'',
		() => {
			engage(zoomIn, 1)
			onZoom('in')
		},
		icon('plus'),
	)
	const zoomOut = hudButton(
		'zoom-out',
		'Zoom out',
		'',
		() => {
			engage(zoomOut, 0)
			onZoom('out')
		},
		icon('minus'),
	)
	// A clicked zoom button stays engaged (its brackets shown) while the zoom
	// glides to its end, also once the pointer has left it; it lets go there
	// (at-level takes over), when the zoom turns back or a drag takes the knob.
	let engaged = null
	const engage = (button, end) => {
		for (const other of [zoomIn, zoomOut]) other.classList.toggle('engaged', other === button)
		engaged = { button, end }
	}
	const releaseEngaged = (shown, previous) => {
		if (!engaged) return
		const reached = endOf(shown) === engaged.end
		const back =
			previous !== null && (engaged.end === 1 ? shown < previous - 1e-4 : shown > previous + 1e-4)
		if (!reached && !back && !knob.dragging) return
		engaged.button.classList.remove('engaged')
		engaged = null
	}
	const knob = zoomKnob({
		onZoomLevel,
		onWheel: onZoomWheel,
		getZoomElasticity,
		onSnap: (end) => onZoom(end === 1 ? 'in' : 'out', SNAP_GLIDE),
		cut: cut(),
	})
	zoomGroup.append(zoomIn, knob.element, zoomOut)

	// Two readouts between the spinning circle and the outer zoom ring, on
	// the horizontal (main.js gives their text, formatted): the zoom's value
	// on the middle of the knob's track, the camera's polar angles opposite.
	const motionless = window.matchMedia('(prefers-reduced-motion: reduce)')
	const zoomValue = readout('hud-zoom-value', motionless)
	const cameraAngles = readout('hud-camera-angles', motionless)

	const random = hudButton('random-eye', 'Random eye', icon('eye'), () => {
		spinTurns++
		placeSpin()
		activate('random')
		onRandom()
	})

	// The HUD's layers take the accent while their control is in use, as if
	// they lit up (style.css eases the color from white and back): the zoom
	// rings, the zoom value and the knob's marker while the zoom moves or the
	// knob is held, the
	// arcs as a new tone is pressed, the spinning circle at a click on Random
	// eye, the camera angles while the camera orbits. Each stays lit
	// `ACTIVE_HOLD` ms past the control's last move.
	const layers = {
		zoom: () => [
			...orbitAssets.map(({ wrapper }) => wrapper),
			zoomValue.element,
			knob.element.firstElementChild,
		],
		tone: () => arcs,
		random: () => [spin, spinTeeth],
		camera: () => [cameraAngles.element],
	}
	const activeTimers = {}
	const activate = (name) => {
		const elements = layers[name]()
		for (const element of elements) element.classList.add('active')
		clearTimeout(activeTimers[name])
		activeTimers[name] = setTimeout(() => {
			for (const element of elements) element.classList.remove('active')
		}, ACTIVE_HOLD[name])
	}

	element.append(
		...orbitAssets.map(({ wrapper }) => wrapper),
		ring,
		zoomValue.element,
		cameraAngles.element,
		toneGroup,
		zoomGroup,
		random,
	)

	// Each button with its angle on the circle and its cut in the line.
	// The tones' angles are their group's, turned (`toneShift`); the zoom's
	// buttons lie on the zoom's circle (`zoom`).
	const items = [
		...toneButtons.map((button, i) => ({ button, angle: (angles, toned) => toned[i] })),
		{ button: zoomIn, angle: (angles) => angles.zoomIn, zoom: true },
		{ button: zoomOut, angle: (angles) => angles.zoomOut, zoom: true },
		{ button: random, angle: (angles) => angles.random },
	]
	const toneItems = items.slice(0, toneButtons.length)

	// The tone group turns along the circle to bring the pressed tone to its
	// center, on the horizontal (toneSteps()), gliding there with an elastic
	// settle (GSAP). The first press, and any with reduced motion, sets it.
	const toneShift = { steps: 0 }
	let toneTarget = null
	let placedAngles = null
	const placeTones = () => {
		if (!placed || !placedAngles) return
		const toned = turnTones(placedAngles.tones, placed.radius, toneShift.steps)
		for (const item of toneItems)
			place(item.button, item.cut, item.angle(placedAngles, toned), placed)
	}
	const turnToTone = (tone) => {
		const steps = toneSteps(tone, tones.length)
		if (steps === toneTarget) return
		const first = toneTarget === null
		toneTarget = steps
		if (!first) activate('tone')
		if (first || motionless.matches) {
			gsap.killTweensOf(toneShift)
			toneShift.steps = steps
			placeTones()
			return
		}
		gsap.to(toneShift, {
			steps,
			duration: 1,
			ease: 'elastic.out(1, 0.75)',
			overwrite: true,
			onUpdate: placeTones,
		})
	}
	for (const item of items) item.cut = cut()
	const cutRadius = (item) => {
		const pressed = item.button.getAttribute('aria-pressed') === 'true'
		const tone = item.button.classList.contains('skin')
		const scale = tone && !pressed ? HUD.toneScale : 1
		item.cut.style.r = `${(HUD.reticle / 2) * scale + HUD.gap}px`
	}

	// A drag stretches the knob, and with it the rings and the brackets, past
	// an end (`stretching`); released there, they spring back for SPRING_BACK
	// ms (the HUD's `springing` class eases them, style.css).
	let stretching = false
	let springTimer = 0
	const updateStretch = () => {
		if (knob.dragging === stretching) return false
		stretching = knob.dragging
		if (!stretching && (knob.level < 0 || knob.level > 1)) {
			element.classList.add('springing')
			clearTimeout(springTimer)
			springTimer = setTimeout(() => element.classList.remove('springing'), SPRING_BACK)
		}
		return true
	}

	// The spinning circle for the layout and the clicks so far.
	const placeSpin = () => {
		if (!placed) return
		const turned = spinRing(placed.radius, spinTurns, HUD, placed.split)
		spin.setAttribute('r', turned.radius)
		spin.setAttribute('stroke-dasharray', turned.dashArray.join(' '))
		spin.style.strokeDashoffset = `${turned.dashOffset}px`
		const { teeth } = turned
		spinTeeth.setAttribute('r', teeth.radius)
		spinTeeth.setAttribute('stroke-dasharray', teeth.dashArray.join(' '))
		spinTeeth.style.strokeWidth = `${teeth.width}px`
		spinTeeth.style.strokeDashoffset = `${teeth.dashOffset}px`
	}

	// The arcs for the layout and the tone pressed. Their first placement
	// does not animate.
	const placeArcs = () => {
		if (!placed) return
		const turned = toneArcs(placed.radius, arcTone, HUD, placed.split)
		arcs.forEach((arc, i) => {
			if (!arcsPlaced) arc.style.transition = 'none'
			arc.setAttribute('cx', placed.cx)
			arc.setAttribute('cy', placed.cy)
			arc.setAttribute('r', turned[i].radius)
			arc.setAttribute('stroke-dasharray', turned[i].dashArray.join(' '))
			arc.style.strokeDashoffset = `${turned[i].dashOffset}px`
		})
		if (!arcsPlaced) {
			arcsPlaced = true
			requestAnimationFrame(() => {
				for (const arc of arcs) arc.style.transition = ''
			})
		}
	}

	// Every layer but the central circle sways a little with the mouse, each
	// its own way and pace (HUD.sway, swayTurn()): the rings in their
	// wrappers' turn, the spinning circle and the arcs by a rotation about the
	// center, apart from the turns their dash offsets ease. Touch does not
	// move them, a mouse leaving the window lets them settle back, and with
	// reduced motion they stay still.
	const mouse = { x: 0, y: 0 }
	window.addEventListener('pointermove', (event) => {
		if (event.pointerType !== 'mouse') return
		mouse.x = (event.clientX / window.innerWidth) * 2 - 1
		mouse.y = 1 - (event.clientY / window.innerHeight) * 2
	})
	document.addEventListener('mouseout', (event) => {
		if (event.relatedTarget === null) mouse.x = mouse.y = 0
	})
	const still = window.matchMedia('(prefers-reduced-motion: reduce)')
	const sway = { inner: 0, outer: 0, spin: 0, arcs: [0, 0, 0] }
	const rotate = (element, turn) => {
		if (!placed) return
		const degrees = (turn * 180) / Math.PI
		element.setAttribute('transform', `rotate(${degrees} ${placed.cx} ${placed.cy})`)
	}
	let swayTime = null
	const stepSway = (time) => {
		requestAnimationFrame(stepSway)
		const dt = swayTime === null ? 0 : Math.min((time - swayTime) / 1000, 0.1)
		swayTime = time
		const toward = (current, layer) =>
			follow(current, still.matches ? 0 : swayTurn(layer, mouse), dt, layer.lag, 1e-5)
		let rings = false
		for (const kind of ['inner', 'outer']) {
			const turn = toward(sway[kind], HUD.sway[kind])
			if (turn !== sway[kind]) rings = true
			sway[kind] = turn
		}
		if (rings) placeOrbit()
		const spinTurn = toward(sway.spin, HUD.sway.spin)
		if (spinTurn !== sway.spin) rotate(spinGroup, (sway.spin = spinTurn))
		arcs.forEach((arc, i) => {
			const turn = toward(sway.arcs[i], HUD.sway.arcs[i])
			if (turn !== sway.arcs[i]) rotate(arc, (sway.arcs[i] = turn))
		})
	}

	// Both segmented rings for the current layout and zoom level.
	let placed = null
	let level = null
	const placeOrbit = () => {
		if (!placed || level === null) return
		const { cx, cy, radius } = placed
		drawOrbits(radius)
		for (const asset of orbitAssets) {
			const ring = orbitRing(radius, level, asset.kind, stretching)
			asset.wrapper.style.left = `${cx}px`
			asset.wrapper.style.top = `${cy}px`
			const turn = ring.turn + sway[asset.kind]
			asset.wrapper.style.transform = `rotate(${turn}rad)`
		}
	}

	// Fade by arc distance so the approach feels the same on every screen,
	// also when the elastic drag crosses a button from the other side. While
	// the knob is dragged past an end, that button's brackets close in on its
	// reticle (--zoom-squeeze, 0 to 1, as far as the knob can stretch).
	const placeZoomSymbols = () => {
		if (!placed || knob.level === null) return
		const arc = placed.zoomRadius * Math.abs(placed.track[1] - placed.track[0])
		const reach = HUD.zoom.stretch * getZoomElasticity()
		for (const [button, end] of [
			[zoomIn, 1],
			[zoomOut, 0],
		]) {
			const t = clamp01((Math.abs(knob.level - end) * arc) / HUD.button)
			button.style.setProperty('--zoom-symbol-visibility', t * t * (3 - 2 * t))
			const past = end === 1 ? knob.level - 1 : -knob.level
			const squeeze = stretching && reach > 0 ? clamp01(past / reach) : 0
			button.style.setProperty('--zoom-squeeze', squeeze)
			// Squeezed, the brackets follow the drag at once; back under the
			// end they ease out as any button's do.
			button.classList.toggle('squeezed', squeeze > 0)
		}
	}

	// The height (px) at the bottom of the HUD's box that the zoom's circle of
	// a split HUD keeps clear of (reserveBottom()).
	let bottom = 0
	const layout = () => {
		const { clientWidth: width, clientHeight: height } = element
		const fit = hudLayout(width, height, tones.length, HUD, { bottom })
		if (!fit) return
		const { radius, angles, split } = fit
		const circle = { cx: width / 2, cy: height / 2, radius }
		const zoomCircle = { ...circle, radius: fit.zoomRadius }
		line.setAttribute('cx', circle.cx)
		line.setAttribute('cy', circle.cy)
		line.setAttribute('r', radius)
		line.setAttribute('stroke-dasharray', dashes(radius))
		// style.css draws a split HUD's brackets closer, the inner one only.
		element.classList.toggle('split', split)
		zoomLine.style.display = split ? '' : 'none'
		zoomLine.setAttribute('cx', circle.cx)
		zoomLine.setAttribute('cy', circle.cy)
		zoomLine.setAttribute('r', zoomCircle.radius)
		zoomLine.setAttribute('stroke-dasharray', dashes(zoomCircle.radius))
		for (const element of [spin, spinTeeth]) {
			element.setAttribute('cx', circle.cx)
			element.setAttribute('cy', circle.cy)
		}
		const toned = turnTones(angles.tones, radius, toneShift.steps)
		for (const item of items) {
			place(item.button, item.cut, item.angle(angles, toned), item.zoom ? zoomCircle : circle)
			cutRadius(item)
		}
		placedAngles = angles
		knob.setTrack({ ...zoomCircle, track: angles.track })
		const middle = (angles.track[0] + angles.track[1]) / 2
		const reach = zoomValueRadius(radius, HUD, split)
		zoomValue.place(circle, reach, middle, width)
		const drop = split ? HUD.split.readouts.drop : 0
		cameraAngles.place(circle, reach - drop, middle + Math.PI, width)
		placed = { ...circle, zoomRadius: zoomCircle.radius, split, track: angles.track }
		placeSpin()
		placeArcs()
		// The sway turns about the center, which moved with the layout.
		rotate(spinGroup, sway.spin)
		arcs.forEach((arc, i) => rotate(arc, sway.arcs[i]))
		placeOrbit()
		placeZoomSymbols()
	}
	new ResizeObserver(layout).observe(element)

	return {
		element,
		mount() {
			layout()
			requestAnimationFrame(stepSway)
		},
		// Keep the zoom's circle of a split HUD above the bottom `height` px of
		// the HUD's box (main.js: the footer on phones).
		reserveBottom(height) {
			if (height === bottom) return
			bottom = height
			layout()
		},
		pressTone(color) {
			toneButtons.forEach((button, i) =>
				button.setAttribute('aria-pressed', String(tones[i].color === color)),
			)
			for (const item of items) cutRadius(item)
			// A color of no tone leaves the tones and the arcs where they are.
			const tone = tones.findIndex((candidate) => candidate.color === color)
			if (tone < 0) return
			turnToTone(tone)
			if (tone === arcTone) return
			arcTone = tone
			placeArcs()
		},
		// The zoom's value as text (main.js formats it).
		showZoomValue: (text) => zoomValue.show(text),
		// The camera's polar angles as text (main.js formats them).
		// `orbiting`: the camera's orbit moved (not the mouse parallax alone).
		showCameraAngles(text, orbiting) {
			cameraAngles.show(text)
			if (orbiting) activate('camera')
		},
		showZoomLevel(shown) {
			knob.show(shown)
			zoomIn.classList.toggle('at-level', endOf(shown) === 1)
			zoomOut.classList.toggle('at-level', endOf(shown) === 0)
			releaseEngaged(shown, level)
			const released = updateStretch()
			if (knob.dragging) activate('zoom')
			if (!released && level !== null && Math.abs(shown - level) < 1e-4) return
			if (level !== null) activate('zoom')
			level = shown
			placeOrbit()
			placeZoomSymbols()
		},
	}
}

// A readout of the HUD: small text that GSAP's TextPlugin retypes whenever
// it changes, one tween at a time, each to the latest text, so a gliding
// value reads as a running counter that settles. With `motionless` (reduced
// motion) it switches at once. place() centers it `reach` px from the
// circle's center at `angle`; where it would leave a box `width` px wide
// (a phone's circle), it hides.
function readout(className, motionless) {
	const element = document.createElement('div')
	element.className = `hud-readout ${className}`
	element.setAttribute('aria-hidden', 'true')
	let shown = null
	let next = null
	let typing = false
	// The last placement, redone once there is text to measure.
	let placement = null
	const type = () => {
		if (typing || next === shown) return
		const text = next
		if (shown === null || motionless.matches) {
			const first = shown === null
			element.textContent = shown = text
			if (first && placement) place(...placement)
			return
		}
		typing = true
		gsap.to(element, {
			duration: 0.15,
			ease: 'none',
			text: { value: text },
			onComplete: () => {
				shown = text
				typing = false
				type()
			},
		})
	}
	const place = (circle, reach, angle, width) => {
		placement = [circle, reach, angle, width]
		const x = circle.cx + reach * Math.cos(angle)
		const half = element.offsetWidth / 2 + READOUT_MARGIN
		element.style.left = `${x}px`
		element.style.top = `${circle.cy + reach * Math.sin(angle)}px`
		element.classList.toggle('hidden', x - half < 0 || x + half > width)
	}
	return {
		element,
		show(text) {
			next = text
			type()
		},
		place,
	}
}

// The zoom knob: a small square marker that slides along the circle
// from zoom out (level 0) to zoom in (level 1), over the two buttons, so the
// pointer always reaches it.
// `onWheel(deltaY)`, if given, takes the wheel over the knob (else it sets
// the level at once).
function zoomKnob({ onZoomLevel, onWheel, onSnap, getZoomElasticity = () => 0, cut }) {
	const element = document.createElement('div')
	element.className = 'hud-button zoom-level'
	element.innerHTML = '<span class="zoom-marker"></span>'
	element.tabIndex = 0
	element.title = 'Zoom: drag, scroll or click'
	element.setAttribute('role', 'slider')
	element.setAttribute('aria-label', 'Zoom level')
	element.setAttribute('aria-valuemin', '0')
	element.setAttribute('aria-valuemax', '100')
	cut.style.r = `${HUD.marker / 2 + HUD.gap}px`

	// The circle and the track on it (set by the layout), and the camera's
	// zoom level shown. Past an end the marker runs further than the camera
	// (knobLevel()).
	let circle = null
	let shown = null
	const marker = () => knobLevel(shown, getZoomElasticity())
	const update = () => {
		if (circle && shown !== null) place(element, cut, knobAngle(marker(), circle.track), circle)
	}
	const set = (level) => onZoomLevel(clamp01(level))

	// The pointer's angle about the circle's center, near the track.
	const pointerAngle = (event) => {
		const box = element.parentElement.getBoundingClientRect()
		const dx = event.clientX - box.left - circle.cx
		const dy = event.clientY - box.top - circle.cy
		const [zoomIn, zoomOut] = circle.track
		return near(Math.atan2(dy, dx), drag?.angle ?? (zoomIn + zoomOut) / 2)
	}

	// A click briefly pulses the square marker.
	const pulse = () => {
		element.classList.remove('pulse')
		void element.offsetWidth
		element.classList.add('pulse')
	}
	element.addEventListener('animationend', (event) => {
		if (event.animationName === 'zoom-bounce') element.classList.remove('pulse')
	})

	// The camera and marker share the resisted level; no snap interrupts a
	// held drag. Recovery follows the camera back from outside the track.
	let drag = null
	let recovering = false
	element.addEventListener('pointerdown', (event) => {
		if (!circle || drag || event.button !== 0) return
		element.setPointerCapture(event.pointerId)
		const { pointerId: id, clientX: x, clientY: y } = event
		const angle = pointerAngle(event)
		const level = shown ?? 0
		// Measured from the pull the camera's level resists (past an end, beyond
		// the marker), so grabbing a returning marker holds the camera there.
		const offset = angle - knobAngle(pullLevel(level, getZoomElasticity()), circle.track)
		drag = { id, x, y, offset, angle, level, moved: false }
		recovering = false
		// Grabbing a returning marker stops its camera glide at this point.
		onZoomLevel(level)
	})
	element.addEventListener('pointermove', (event) => {
		if (drag?.id !== event.pointerId) return
		const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y)
		if (!drag.moved && distance < CLICK_SLOP) return
		drag.moved = true
		element.classList.add('dragging')
		drag.angle = pointerAngle(event)
		drag.level = trackLevel(drag.angle - drag.offset, circle.track, getZoomElasticity())
		onZoomLevel(drag.level)
	})
	const release = (event, click) => {
		if (drag?.id !== event.pointerId) return
		const { moved, level } = drag
		drag = null
		element.classList.remove('dragging')
		if (moved || level < 0 || level > 1) {
			const end = knobSnap(knobAngle(level, circle.track), circle.track, circle.radius)
			if (end !== null) {
				recovering = level < 0 || level > 1
				onSnap(end)
			}
		} else if (click) pulse()
		element.blur()
	}
	element.addEventListener('pointerup', (event) => release(event, true))
	element.addEventListener('pointercancel', (event) => release(event, false))
	element.addEventListener('lostpointercapture', (event) => release(event, false))
	element.addEventListener(
		'wheel',
		(event) => {
			event.preventDefault()
			if (onWheel) onWheel(event.deltaY)
			else set((shown ?? 0) - event.deltaY * LEVEL_PER_WHEEL_UNIT)
		},
		{ passive: false },
	)
	element.addEventListener('keydown', (event) => {
		const step = KEY_STEPS[event.key] ?? PAGE_STEPS[event.key]
		const to = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : step && (shown ?? 0) + step
		if (to === undefined) return
		event.preventDefault()
		set(to)
	})

	return {
		element,
		// Where the marker sits, and whether a drag holds it.
		get level() {
			return shown === null ? null : marker()
		},
		get dragging() {
			return drag !== null
		},
		setTrack(value) {
			if (drag) release({ pointerId: drag.id }, false)
			circle = value
			update()
		},
		show(level) {
			if (level >= 0 && level <= 1) recovering = false
			if (!drag && !recovering) level = clamp01(level)
			if (shown !== null && Math.abs(level - shown) < 1e-4) return
			shown = level
			element.setAttribute('aria-valuenow', String(Math.round(clamp01(level) * 100)))
			update()
		},
	}
}
