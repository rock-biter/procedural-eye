// The HUD around the eye: a dashed circle centered on the page with every
// button on it, round glass of one size (src/ui/hudLayout.js places them).
// The skin tones in the bottom-left quadrant; in the bottom-right one zoom
// in, the zoom level and zoom out, then Random eye below them. The zoom level
// is a gauge and a slider: drag it toward + or −, or use the wheel or the
// arrow keys over it; a click pulses it. The circle's line stops short of
// each button, and only the buttons take the pointer, so drags across the
// rest still orbit the camera.
import { HUD, hudAngles, hudRadius } from './hudLayout'
import { liquidGlass } from './liquidGlass'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Stroked icons on a 24 px grid: a plus, a minus and two crossing arrows.
const ICONS = {
	plus: 'M6 12h12M12 6v12',
	minus: 'M6 12h12',
	shuffle: 'M3 7h3c4 0 6 10 10 10h5M3 17h3c4 0 6-10 10-10h5M18 4l3 3-3 3M18 14l3 3-3 3',
}
const icon = (name) =>
	`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`

// The level's gauge: a 270° arc open at the bottom, filled clockwise from
// its lower left end (pathLength 100: the arc is GAUGE long), with a knob at
// the end of the fill.
const GAUGE = 75
const GAUGE_RADIUS = 12
const GAUGE_ARC = `cx="22" cy="22" r="${GAUGE_RADIUS}" pathLength="100" transform="rotate(135 22 22)"`

// The level's steps for the arrow keys and Page Up / Page Down, and per
// wheel unit.
const KEY_STEPS = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }
const PAGE_STEPS = { PageUp: 0.25, PageDown: -0.25 }
const LEVEL_PER_WHEEL_UNIT = 0.0012
// A press that moves less than this (px) is a click.
const CLICK_SLOP = 4

const clamp01 = (value) => Math.min(Math.max(value, 0), 1)

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

// `tones`: [{ name, label, color }]; onTone(name), onZoom('in' | 'out'),
// onZoomLevel(level in [0, 1]) and onRandom() run the buttons. Returns the
// element, pressTone(color), which presses the tone of `color` (none for
// another color), and showZoomLevel(level), which the gauge shows.
export function createHud({ tones, onTone, onZoom, onZoomLevel, onRandom }) {
	const element = document.createElement('div')
	element.className = 'hud'
	element.style.setProperty('--hud-button', `${HUD.button}px`)
	element.style.setProperty('--tone-scale', HUD.toneScale)

	// The circle, cut around each button by a mask.
	const ring = svgElement('svg', { class: 'hud-ring', 'aria-hidden': 'true' })
	const mask = svgElement('mask', { id: 'hud-ring-cuts' })
	mask.append(svgElement('rect', { width: '100%', height: '100%', fill: '#fff' }))
	const line = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	ring.append(mask, line)

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
	const level = zoomSlider(onZoomLevel)
	zoomGroup.append(zoomIn, level.element, zoomOut)

	const random = glassButton('random-eye', 'Random eye', icon('shuffle'), onRandom)

	element.append(ring, toneGroup, zoomGroup, random)

	// Each button with its angle on the circle and its scale; the mask holds
	// a cut for each.
	const items = [
		...toneButtons.map((button, i) => ({ button, angle: (angles) => angles.tones[i] })),
		{ button: zoomIn, angle: (angles) => angles.zoomIn },
		{ button: level.element, angle: (angles) => angles.zoomLevel },
		{ button: zoomOut, angle: (angles) => angles.zoomOut },
		{ button: random, angle: (angles) => angles.random },
	]
	for (const item of items) {
		item.cut = svgElement('circle', { class: 'hud-cut' })
		mask.append(item.cut)
	}
	const scaleOf = (button) =>
		button.classList.contains('skin') && button.getAttribute('aria-pressed') !== 'true'
			? HUD.toneScale
			: 1
	const cutRadius = (item) => {
		item.cut.style.r = `${(HUD.button / 2) * scaleOf(item.button) + HUD.gap}px`
	}

	const layout = () => {
		const { clientWidth: width, clientHeight: height } = element
		const radius = hudRadius(width, height)
		if (radius <= 0) return
		const angles = hudAngles(radius, tones.length)
		const [cx, cy] = [width / 2, height / 2]
		line.setAttribute('cx', cx)
		line.setAttribute('cy', cy)
		line.setAttribute('r', radius)
		// A whole number of dash periods around the circle, so it has no seam.
		const circumference = 2 * Math.PI * radius
		const period = circumference / Math.max(1, Math.round(circumference / HUD.dashPeriod))
		line.setAttribute('stroke-dasharray', `${HUD.dash} ${period - HUD.dash}`)
		const places = new Map()
		for (const item of items) {
			const angle = item.angle(angles)
			const x = cx + radius * Math.cos(angle)
			const y = cy + radius * Math.sin(angle)
			places.set(item.button, { x, y })
			item.button.style.left = `${x}px`
			item.button.style.top = `${y}px`
			item.cut.setAttribute('cx', x)
			item.cut.setAttribute('cy', y)
			cutRadius(item)
		}
		// The slider's axis points from zoom out to zoom in.
		const from = places.get(zoomOut)
		const to = places.get(zoomIn)
		const length = Math.hypot(to.x - from.x, to.y - from.y)
		level.axis = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
	}
	new ResizeObserver(layout).observe(element)

	return {
		element,
		// Call once the element is in the page.
		mount() {
			layout()
			liquidGlass(items.map((item) => item.button))
		},
		pressTone(color) {
			toneButtons.forEach((button, i) =>
				button.setAttribute('aria-pressed', String(tones[i].color === color)),
			)
			for (const item of items) cutRadius(item)
		},
		showZoomLevel: (value) => level.show(value),
	}
}

// The zoom level: a glass gauge that is also a slider along the circle.
function zoomSlider(onZoomLevel) {
	const element = document.createElement('div')
	element.className = 'glass hud-button zoom-level'
	element.tabIndex = 0
	element.title = 'Zoom: drag, scroll or click'
	element.setAttribute('role', 'slider')
	element.setAttribute('aria-label', 'Zoom level')
	element.setAttribute('aria-valuemin', '0')
	element.setAttribute('aria-valuemax', '100')
	element.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="zoom-track" ${GAUGE_ARC} stroke-dasharray="${GAUGE} 100"/><circle class="zoom-value" ${GAUGE_ARC}/><circle class="zoom-knob" r="2.75"/></svg>`
	const value = element.querySelector('.zoom-value')
	const knob = element.querySelector('.zoom-knob')

	const slider = {
		element,
		// The unit vector of the drag that zooms in (set by the layout).
		axis: { x: 0, y: -1 },
		level: null,
		show(level) {
			if (slider.level !== null && Math.abs(level - slider.level) < 1e-4) return
			slider.level = level
			value.setAttribute('stroke-dasharray', `${GAUGE * level} 100`)
			const angle = ((135 + (GAUGE / 100) * 360 * level) * Math.PI) / 180
			knob.setAttribute('cx', 22 + GAUGE_RADIUS * Math.cos(angle))
			knob.setAttribute('cy', 22 + GAUGE_RADIUS * Math.sin(angle))
			element.setAttribute('aria-valuenow', String(Math.round(level * 100)))
		},
	}
	const set = (level) => onZoomLevel(clamp01(level))

	// A click: the glass swells and a ring spreads from it.
	const pulse = () => {
		element.classList.remove('pulse')
		void element.offsetWidth
		element.classList.add('pulse')
	}
	element.addEventListener('animationend', (event) => {
		if (event.target === element) element.classList.remove('pulse')
	})

	let drag = null
	element.addEventListener('pointerdown', (event) => {
		element.setPointerCapture(event.pointerId)
		const { pointerId: id, clientX: x, clientY: y } = event
		drag = { id, x, y, level: slider.level ?? 0, moved: false }
		element.classList.add('dragging')
	})
	element.addEventListener('pointermove', (event) => {
		if (drag?.id !== event.pointerId) return
		const dx = event.clientX - drag.x
		const dy = event.clientY - drag.y
		if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return
		drag.moved = true
		const along = dx * slider.axis.x + dy * slider.axis.y
		set(drag.level + along / HUD.zoomTravel)
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
			set((slider.level ?? 0) - event.deltaY * LEVEL_PER_WHEEL_UNIT)
		},
		{ passive: false },
	)
	element.addEventListener('keydown', (event) => {
		const step = KEY_STEPS[event.key] ?? PAGE_STEPS[event.key]
		const to =
			event.key === 'Home' ? 0 : event.key === 'End' ? 1 : step && (slider.level ?? 0) + step
		if (to === undefined) return
		event.preventDefault()
		set(to)
	})
	return slider
}
