// The HUD's flat reticles sit on the central ring. Two segmented rings
// follow the camera's zoom; the controls keep their native pointer and
// keyboard behavior, with brackets revealing hover and selection.
import {
	HUD,
	hudLayout,
	knobAngle,
	knobLevel,
	knobSnap,
	orbitRing,
	pullLevel,
	spinRing,
	toneArcs,
	trackLevel,
} from './hudLayout'
import bracketAsset from './assets/bracket.svg?url'
import innerRingAsset from './assets/zoom-ring-inner.svg?url'
import outerRingAsset from './assets/zoom-ring-outer.svg?url'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Stroked icons on a 24 px grid: a plus, a minus and two crossing arrows.
const ICONS = {
	plus: 'M6 12h12M12 6v12',
	minus: 'M6 12h12',
	shuffle: 'M3 7h3c4 0 6 10 10 10h5M3 17h3c4 0 6-10 10-10h5M18 4l3 3-3 3M18 14l3 3-3 3',
}
const icon = (name) =>
	`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`

// The level's steps for the arrow keys and Page Up / Page Down, and per
// wheel unit.
const KEY_STEPS = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }
const PAGE_STEPS = { PageUp: 0.25, PageDown: -0.25 }
const LEVEL_PER_WHEEL_UNIT = 0.0012
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
// photo mode only when the page has the focus.
function hudButton(className, label, content, run) {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = `hud-button ${className}`
	button.setAttribute('aria-label', label)
	button.title = label
	button.innerHTML = `<span class="hud-glyph"><span class="hud-reticle">${content}</span><img class="hud-bracket hud-bracket-start" src="${bracketAsset}" alt=""/><img class="hud-bracket hud-bracket-end" src="${bracketAsset}" alt=""/></span>`
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
// duration), onZoomLevel(level, including elastic overshoot) and onRandom()
// run the controls; getZoomElasticity() reads the current drag extension.
// (onZoom without a duration glides over the zoom's own). Returns the
// element, mount() (once it is in the page), pressTone(color), which presses
// the tone of `color` (none for another color), and showZoomLevel(level),
// where the knob goes (at an end, its button shows in full) and the two
// segmented rings' sizes and turns.
export function createHud({
	tones,
	onTone,
	onZoom,
	onZoomLevel,
	getZoomElasticity = () => 0,
	onRandom,
}) {
	const element = document.createElement('div')
	element.className = 'hud'
	element.style.setProperty('--hud-button', `${HUD.button}px`)
	element.style.setProperty('--hud-knob', `${HUD.knob}px`)
	element.style.setProperty('--tone-scale', HUD.toneScale)

	// The circle, cut around each button by a mask.
	const ring = svgElement('svg', { class: 'hud-ring', 'aria-hidden': 'true' })
	const mask = svgElement('mask', { id: 'hud-ring-cuts' })
	mask.append(svgElement('rect', { width: '100%', height: '100%', fill: '#fff' }))
	const line = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	// The rings' SVGs at their intrinsic size, centered on their circle (of
	// `radius` px at `cx`, `cy`): their wrappers turn and scale them about it.
	// Turned 0, each is symmetric about the horizontal: the inner one two
	// lines (a tick in, an arc over ±31°, a tick in), the outer one two arcs
	// over ±33.4° with a tick out from each on the horizontal.
	const orbitAssets = [
		{ kind: 'inner', src: innerRingAsset, cx: 410, cy: 410, radius: 409 },
		{ kind: 'outer', src: outerRingAsset, cx: 729.5, cy: 729.5, radius: 652.5 },
	].map((asset) => {
		const wrapper = document.createElement('div')
		wrapper.className = `hud-orbit hud-orbit-${asset.kind}`
		wrapper.setAttribute('aria-hidden', 'true')
		const image = document.createElement('img')
		image.src = asset.src
		image.alt = ''
		image.style.left = `${-asset.cx}px`
		image.style.top = `${-asset.cy}px`
		wrapper.append(image)
		return { ...asset, wrapper }
	})
	// The circle between the central ring and the outer zoom ring, which
	// each click on Random eye turns a little further (style.css eases it).
	const spin = svgElement('circle', { class: 'hud-line hud-spin' })
	let spinTurns = 0
	// Three arcs inside the inner zoom ring, which each skin tone turns to its
	// own places (style.css eases them).
	const arcs = [0, 1, 2].map(() => svgElement('circle', { class: 'hud-line hud-arc' }))
	let arcTone = 0
	let arcsPlaced = false
	ring.append(mask, line, spin, ...arcs)
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
	const zoomIn = hudButton('zoom-in', 'Zoom in', icon('plus'), () => {
		engage(zoomIn, 1)
		onZoom('in')
	})
	const zoomOut = hudButton('zoom-out', 'Zoom out', icon('minus'), () => {
		engage(zoomOut, 0)
		onZoom('out')
	})
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
		getZoomElasticity,
		onSnap: (end) => onZoom(end === 1 ? 'in' : 'out', SNAP_GLIDE),
		cut: cut(),
	})
	zoomGroup.append(zoomIn, knob.element, zoomOut)

	const random = hudButton('random-eye', 'Random eye', icon('shuffle'), () => {
		spinTurns++
		placeSpin()
		onRandom()
	})

	element.append(...orbitAssets.map(({ wrapper }) => wrapper), ring, toneGroup, zoomGroup, random)

	// Each button with its angle on the circle and its cut in the line.
	const items = [
		...toneButtons.map((button, i) => ({ button, angle: (angles) => angles.tones[i] })),
		{ button: zoomIn, angle: (angles) => angles.zoomIn },
		{ button: zoomOut, angle: (angles) => angles.zoomOut },
		{ button: random, angle: (angles) => angles.random },
	]
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
		const turned = spinRing(placed.radius, spinTurns)
		spin.setAttribute('r', turned.radius)
		spin.setAttribute('stroke-dasharray', turned.dashArray.join(' '))
		spin.style.strokeDashoffset = `${turned.dashOffset}px`
	}

	// The arcs for the layout and the tone pressed. Their first placement
	// does not animate.
	const placeArcs = () => {
		if (!placed) return
		const turned = toneArcs(placed.radius, arcTone)
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

	// Both segmented rings for the current layout and zoom level.
	let placed = null
	let level = null
	const placeOrbit = () => {
		if (!placed || level === null) return
		const { cx, cy, radius } = placed
		for (const asset of orbitAssets) {
			const ring = orbitRing(radius, level, asset.kind, stretching)
			asset.wrapper.style.left = `${cx}px`
			asset.wrapper.style.top = `${cy}px`
			asset.wrapper.style.transform = `rotate(${ring.turn}rad) scale(${ring.radius / asset.radius})`
		}
	}

	// Fade by arc distance so the approach feels the same on every screen,
	// also when the elastic drag crosses a button from the other side. While
	// the knob is dragged past an end, that button's brackets close in on its
	// reticle (--zoom-squeeze, 0 to 1, as far as the knob can stretch).
	const placeZoomSymbols = () => {
		if (!placed || knob.level === null) return
		const arc = placed.radius * Math.abs(placed.track[1] - placed.track[0])
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

	const layout = () => {
		const { clientWidth: width, clientHeight: height } = element
		const fit = hudLayout(width, height, tones.length)
		if (!fit) return
		const { radius, angles } = fit
		const circle = { cx: width / 2, cy: height / 2, radius }
		line.setAttribute('cx', circle.cx)
		line.setAttribute('cy', circle.cy)
		line.setAttribute('r', radius)
		line.setAttribute('stroke-dasharray', dashes(radius))
		spin.setAttribute('cx', circle.cx)
		spin.setAttribute('cy', circle.cy)
		for (const item of items) {
			place(item.button, item.cut, item.angle(angles), circle)
			cutRadius(item)
		}
		knob.setTrack({ ...circle, track: angles.track })
		placed = { ...circle, track: angles.track }
		placeSpin()
		placeArcs()
		placeOrbit()
		placeZoomSymbols()
	}
	new ResizeObserver(layout).observe(element)

	return {
		element,
		mount() {
			layout()
		},
		pressTone(color) {
			toneButtons.forEach((button, i) =>
				button.setAttribute('aria-pressed', String(tones[i].color === color)),
			)
			for (const item of items) cutRadius(item)
			// A color of no tone leaves the arcs where they are.
			const tone = tones.findIndex((candidate) => candidate.color === color)
			if (tone < 0 || tone === arcTone) return
			arcTone = tone
			placeArcs()
		},
		showZoomLevel(shown) {
			knob.show(shown)
			zoomIn.classList.toggle('at-level', endOf(shown) === 1)
			zoomOut.classList.toggle('at-level', endOf(shown) === 0)
			releaseEngaged(shown, level)
			const released = updateStretch()
			if (!released && level !== null && Math.abs(shown - level) < 1e-4) return
			level = shown
			placeOrbit()
			placeZoomSymbols()
		},
	}
}

// The zoom knob: a small square marker that slides along the circle
// from zoom out (level 0) to zoom in (level 1), over the two buttons, so the
// pointer always reaches it.
function zoomKnob({ onZoomLevel, onSnap, getZoomElasticity = () => 0, cut }) {
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
			set((shown ?? 0) - event.deltaY * LEVEL_PER_WHEEL_UNIT)
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
