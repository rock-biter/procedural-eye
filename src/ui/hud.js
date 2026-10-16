// The HUD around the eye: a dashed circle centered on the page with every
// button on it, round glass of one size (src/ui/hudLayout.js places them).
// The skin tones in the bottom-left quadrant; at the right zoom in and zoom
// out, with the zoom knob between them, then Random eye below. The knob is a
// slider along the circle, from zoom out to zoom in, over them: it shows
// the zoom level, and dragging it along the arc, the wheel or the arrow keys
// over it zoom; a click pulses it. The circle's line stops short of each
// button and of the knob, and only they take the pointer, so drags across
// the rest still orbit the camera.
import { HUD, hudLayout, knobAngle, knobSnap, orbitRing, trackLevel } from './hudLayout'
import { GLASS, liquidGlass } from './liquidGlass'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Stroked icons on a 24 px grid: a plus, a minus and two crossing arrows.
const ICONS = {
	plus: 'M6 12h12M12 6v12',
	minus: 'M6 12h12',
	shuffle: 'M3 7h3c4 0 6 10 10 10h5M3 17h3c4 0 6-10 10-10h5M18 4l3 3-3 3M18 14l3 3-3 3',
}
const icon = (name) =>
	`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`

// The knob's glass: a bevel and a bend scaled to its size.
const KNOB_GLASS = { ...GLASS, bezel: 6, maxOffset: 4 }

// The level's steps for the arrow keys and Page Up / Page Down, and per
// wheel unit.
const KEY_STEPS = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }
const PAGE_STEPS = { PageUp: 0.25, PageDown: -0.25 }
const LEVEL_PER_WHEEL_UNIT = 0.0012
// A press that moves less than this (px) is a click.
const CLICK_SLOP = 4
// How long (s) the camera glides when a dragged knob snaps to an end.
const SNAP_GLIDE = 0.25

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

// A round glass button; it blurs itself after a click, because Space toggles
// photo mode only when the page has the focus.
function glassButton(className, label, content, run) {
	const button = document.createElement('button')
	button.type = 'button'
	button.className = `glass hud-button ${className}`
	button.setAttribute('aria-label', label)
	button.title = label
	button.innerHTML = content
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
function place(element, cut, angle, { cx, cy, radius }) {
	const x = cx + radius * Math.cos(angle)
	const y = cy + radius * Math.sin(angle)
	element.style.left = `${x}px`
	element.style.top = `${y}px`
	cut.setAttribute('cx', x)
	cut.setAttribute('cy', y)
}

// `tones`: [{ name, label, color }]; onTone(name), onZoom('in' | 'out',
// duration), onZoomLevel(level in [0, 1]) and onRandom() run the controls
// (onZoom without a duration glides over the zoom's own). Returns the
// element, mount() (once it is in the page), pressTone(color), which presses
// the tone of `color` (none for another color), and showZoomLevel(level),
// where the knob goes (at an end, its button shows in full) and the second
// circle's size and turn.
export function createHud({ tones, onTone, onZoom, onZoomLevel, onRandom }) {
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
	// The second circle: inside the circle zoomed in, it grows past it as the
	// camera zooms out and turns with the zoom, against the knob (hudLayout.js
	// orbitRing()). It is not cut around the buttons, and runs on past the
	// HUD's box to the window's edges.
	const orbit = svgElement('circle', { class: 'hud-line hud-orbit' })
	ring.append(mask, line, orbit)
	const cut = () => {
		const circle = svgElement('circle', { class: 'hud-cut' })
		mask.append(circle)
		return circle
	}

	const toneGroup = group('Skin tone')
	const toneButtons = tones.map((tone) => {
		const button = glassButton('skin', `${tone.label} skin`, '<span></span>', () =>
			onTone(tone.name),
		)
		button.style.setProperty('--tone', tone.color)
		return button
	})
	toneGroup.append(...toneButtons)

	const zoomGroup = group('Zoom')
	const zoomIn = glassButton('zoom-in', 'Zoom in', icon('plus'), () => onZoom('in'))
	const zoomOut = glassButton('zoom-out', 'Zoom out', icon('minus'), () => onZoom('out'))
	const knob = zoomKnob({
		onZoomLevel,
		onSnap: (end) => onZoom(end === 1 ? 'in' : 'out', SNAP_GLIDE),
		cut: cut(),
	})
	zoomGroup.append(zoomIn, knob.element, zoomOut)

	const random = glassButton('random-eye', 'Random eye', icon('shuffle'), onRandom)

	element.append(ring, toneGroup, zoomGroup, random)

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
		const scale = item.button.classList.contains('skin') && !pressed ? HUD.toneScale : 1
		item.cut.style.r = `${(HUD.button / 2) * scale + HUD.gap}px`
	}

	// The second circle for the circle the layout set and the zoom level shown.
	let placed = null
	let level = null
	const placeOrbit = () => {
		if (!placed || level === null) return
		const { cx, cy, radius, track } = placed
		const ring = orbitRing(radius, level, track)
		orbit.setAttribute('cx', cx)
		orbit.setAttribute('cy', cy)
		orbit.setAttribute('r', ring.radius)
		orbit.setAttribute('stroke-dasharray', ring.dashArray.join(' '))
		orbit.setAttribute('stroke-dashoffset', ring.dashOffset)
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
		// A whole number of dash periods around the circle, so it has no seam.
		const circumference = 2 * Math.PI * radius
		const period = circumference / Math.max(1, Math.round(circumference / HUD.dashPeriod))
		line.setAttribute('stroke-dasharray', `${HUD.dash} ${period - HUD.dash}`)
		for (const item of items) {
			place(item.button, item.cut, item.angle(angles), circle)
			cutRadius(item)
		}
		knob.setTrack({ ...circle, track: angles.track })
		placed = { ...circle, track: angles.track }
		placeOrbit()
	}
	new ResizeObserver(layout).observe(element)

	return {
		element,
		mount() {
			layout()
			liquidGlass(items.map((item) => item.button))
			liquidGlass([knob.element], KNOB_GLASS)
		},
		pressTone(color) {
			toneButtons.forEach((button, i) =>
				button.setAttribute('aria-pressed', String(tones[i].color === color)),
			)
			for (const item of items) cutRadius(item)
		},
		showZoomLevel(shown) {
			knob.show(shown)
			zoomIn.classList.toggle('at-level', endOf(shown) === 1)
			zoomOut.classList.toggle('at-level', endOf(shown) === 0)
			if (level !== null && Math.abs(shown - level) < 1e-4) return
			level = shown
			placeOrbit()
		},
	}
}

// The zoom knob: a small empty glass button that slides along the circle
// from zoom out (level 0) to zoom in (level 1), over the two buttons, so the
// pointer always reaches it.
function zoomKnob({ onZoomLevel, onSnap, cut }) {
	const element = document.createElement('div')
	element.className = 'glass hud-button zoom-level'
	element.tabIndex = 0
	element.title = 'Zoom: drag, scroll or click'
	element.setAttribute('role', 'slider')
	element.setAttribute('aria-label', 'Zoom level')
	element.setAttribute('aria-valuemin', '0')
	element.setAttribute('aria-valuemax', '100')
	cut.style.r = `${HUD.knob / 2 + HUD.gap}px`

	// The circle and the track on it (set by the layout), and the level shown.
	let circle = null
	let shown = null
	const update = () => {
		if (circle && shown !== null) place(element, cut, knobAngle(shown, circle.track), circle)
	}
	const set = (level) => onZoomLevel(clamp01(level))
	// The end the knob sits at, or null.
	const atEnd = () => (shown === null ? null : endOf(shown))

	// The pointer's angle about the circle's center, near the track.
	const pointerAngle = (event) => {
		const box = element.parentElement.getBoundingClientRect()
		const dx = event.clientX - box.left - circle.cx
		const dy = event.clientY - box.top - circle.cy
		const [zoomIn, zoomOut] = circle.track
		return near(Math.atan2(dy, dx), (zoomIn + zoomOut) / 2)
	}

	// A click: the glass bounces and a ring spreads from it.
	const pulse = () => {
		element.classList.remove('pulse')
		void element.offsetWidth
		element.classList.add('pulse')
	}
	element.addEventListener('animationend', (event) => {
		if (event.target === element) element.classList.remove('pulse')
	})

	// A drag keeps the knob where it was grabbed, under the pointer; within
	// HUD.zoom.snap px of an end it snaps there, the camera gliding.
	let drag = null
	element.addEventListener('pointerdown', (event) => {
		if (!circle) return
		element.setPointerCapture(event.pointerId)
		const { pointerId: id, clientX: x, clientY: y } = event
		const offset = pointerAngle(event) - knobAngle(shown ?? 0, circle.track)
		drag = { id, x, y, offset, moved: false, snapped: atEnd() }
	})
	element.addEventListener('pointermove', (event) => {
		if (drag?.id !== event.pointerId) return
		const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y)
		if (!drag.moved && distance < CLICK_SLOP) return
		drag.moved = true
		element.classList.add('dragging')
		const angle = pointerAngle(event) - drag.offset
		const end = knobSnap(angle, circle.track, circle.radius)
		if (end === null) set(trackLevel(angle, circle.track))
		else if (end !== drag.snapped) onSnap(end)
		drag.snapped = end
	})
	const release = (event, click) => {
		if (drag?.id !== event.pointerId) return
		if (click && !drag.moved) pulse()
		drag = null
		element.classList.remove('dragging')
		element.blur()
	}
	element.addEventListener('pointerup', (event) => release(event, true))
	element.addEventListener('pointercancel', (event) => release(event, false))
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
		setTrack(value) {
			circle = value
			update()
		},
		show(level) {
			if (shown !== null && Math.abs(level - shown) < 1e-4) return
			shown = level
			element.setAttribute('aria-valuenow', String(Math.round(level * 100)))
			// At either end, over + or −, its glass lightens.
			element.classList.toggle('at-end', atEnd() !== null)
			update()
		},
	}
}
