// The HUD's flat reticles sit on the central ring. Two segmented rings
// follow the camera's zoom; the controls keep their native pointer and
// keyboard behavior, with brackets revealing hover and selection.
import {
	HUD,
	apertureArcScale,
	apertureLens,
	apertureTrackArc,
	apertureFollowTurn,
	circleDashes,
	hudLayerRadii,
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
	zoomTrackArc,
	zoomValueRadius,
} from './hudLayout'
import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import { follow } from '../camera/orbitMotion'
import { clamp01 } from '../math'
import bracketAsset from './assets/bracket.svg?url'

const SVG_NS = 'http://www.w3.org/2000/svg'

gsap.registerPlugin(TextPlugin)

// Icons on a 24 px grid, stroked: a plus, a minus, and an eye for Random eye
// (a filled dot, the pupil, under a flattened arc, the upper lid: wide and
// low, its ends a little above the pupil's middle and meeting at an angle,
// like the canthi, so it reads as an eye, not as a wifi sign); and filled,
// a tomoe for the Sharingan (the magatama of a yin-yang: its head the upper
// small disc, its tail down the big one's right side, turned a little, then
// its box, 15 × 15.3 around (12.9, 11.24), moved to the middle and scaled
// to 0.85).
const ICONS = {
	plus: '<path d="M6 12h12M12 6v12"/>',
	minus: '<path d="M6 12h12"/>',
	eye: '<path d="M3 13.5C6.5 6.5 17.5 6.5 21 13.5"/><circle class="icon-fill" cx="12" cy="14.5" r="2.75"/>',
	tomoe:
		'<path class="icon-fill" transform="translate(12 12) scale(0.85) translate(-12.9 -11.24) rotate(-35 12 12)" d="M12 3.6A8.4 8.4 0 0 1 12 20.4A4.2 4.2 0 0 0 12 12A4.2 4.2 0 0 1 12 3.6Z"/>',
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
const ACTIVE_HOLD = { zoom: 700, aperture: 700, tone: 1300, random: 1000, camera: 700 }
// How far (px) a readout keeps from the HUD box's sides, or it hides.
const READOUT_MARGIN = 4
// A press that moves less than this (px) is a click.
const CLICK_SLOP = 4
// How long (s) the camera glides when a dragged knob snaps to an end, and
// how long (ms) the rings and brackets take to spring back (style.css).
const SNAP_GLIDE = 0.25
const SPRING_BACK = 600

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

// The dashes of a circle of `radius` px (circleDashes()).
const dashes = (radius) => circleDashes(radius).join(' ')

// Centers `element` and its cut in the circle's line, if any, at `angle` on a
// circle.
function place(element, cut, angle, { cx, cy, radius }) {
	const x = cx + radius * Math.cos(angle)
	const y = cy + radius * Math.sin(angle)
	element.style.left = `${x}px`
	element.style.top = `${y}px`
	element.style.setProperty('--hud-angle', `${angle - Math.PI / 2}rad`)
	cut?.setAttribute('cx', x)
	cut?.setAttribute('cy', y)
}

// `tones`: [{ name, label, color }], and `secretTone`, if given, one more
// (main.js): its button one spacing past the deepest, turning with them,
// never seen, pressed or not, without a cut in the circle, and pressable only
// once unlockSecret(true). `onSharingan`, if given (a desktop's), gives
// it the Sharingan's button below Random eye, which shows once
// unlockSharingan(true).
// onTone(name), onZoom('in' | 'out',
// duration), onZoomLevel(level, including elastic overshoot),
// onZoomWheel(deltaY) (the wheel over the knob) and onRandom() run the
// controls; getZoomElasticity() reads the current drag extension.
// (onZoom without a duration glides over the zoom's own). The aperture knob
// (desktop only) likewise: onApertureLevel(level), onApertureWheel(deltaY),
// onAperture(end, duration) (a glide to the widest f-number, end 0, or the
// narrowest, 1) and getApertureElasticity(). Returns the
// element, mount() (once it is in the page), reserveBottom(height), the
// bottom of the box the zoom's circle keeps clear of, pressTone(color), which presses
// the tone of `color` (none for another color), and showZoomLevel(level),
// where the knob goes (at an end, its button shows in full) and the two
// segmented rings' sizes and turns, and showZoomValue(text), the zoom's
// value by the knob; showApertureLevel(level), where the aperture knob goes
// and the tones' arcs' size, and showApertureValue(text), the f-number by
// the zoom's value; introLayers(), its layers for the intro
// (src/ui/intro.js); circle(), its circle in the window ({ x, y, radius,
// split }, px; null before the first layout). onCue(name, detail), if given, hears the controls for the
// sound design (src/audio/cameraFoley.js): 'press' and 'hover' of a button
// or knob, 'tap' of a knob, 'random' and 'sharingan'; `detail.element` is
// the control, `detail.control` its name.
export function createHud({
	tones,
	secretTone = null,
	onTone,
	onZoom,
	onZoomLevel,
	onZoomWheel,
	getZoomElasticity = () => 0,
	onAperture,
	onApertureLevel,
	onApertureWheel,
	getApertureElasticity = () => 0,
	onRandom,
	onSharingan = null,
	onCue = () => {},
}) {
	const element = document.createElement('div')
	element.className = 'hud'
	element.style.setProperty('--hud-button', `${HUD.button}px`)
	element.style.setProperty('--hud-knob', `${HUD.knob}px`)
	element.style.setProperty('--hud-aperture-hit', `${HUD.aperture.hit}px`)
	element.style.setProperty('--hud-aperture-grow', HUD.aperture.grow)
	element.style.setProperty('--hud-aperture-pulse', HUD.aperture.pulse)
	element.style.setProperty('--tone-scale', HUD.toneScale)

	// The circle, cut around each button by a mask, and the zoom's wider
	// circle of a split HUD (HUD.split), cut by the same mask.
	const ring = svgElement('svg', { class: 'hud-ring', 'aria-hidden': 'true' })
	const mask = svgElement('mask', { id: 'hud-ring-cuts' })
	mask.append(svgElement('rect', { width: '100%', height: '100%', fill: '#fff' }))
	const line = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	const zoomLine = svgElement('circle', { class: 'hud-line', mask: 'url(#hud-ring-cuts)' })
	// The sliders' tracks, white (style.css): the zoom's circle between its
	// buttons, drawn again over it with its dashes and cuts, and the dashed
	// arc that marks the aperture knob's track, end to end, under the knob
	// (desktop only), cut around it by the same mask.
	const zoomTrackLine = svgElement('path', {
		class: 'hud-line hud-zoom-track',
		mask: 'url(#hud-ring-cuts)',
	})
	const apertureLine = svgElement('path', {
		class: 'hud-line hud-aperture-track',
		mask: 'url(#hud-ring-cuts)',
	})
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
	// Each ring's paths for the HUD's circle of `radius` px, split or not,
	// redrawn when either changes.
	const drawOrbits = (radius, split) => {
		for (const asset of orbitAssets) {
			if (asset.radius === radius && asset.split === split) continue
			Object.assign(asset, { radius, split })
			const { reach, paths } = orbitArt(asset.kind, radius, HUD, split)
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
	// The intro (src/ui/intro.js) brings the HUD in layer by layer: each in a
	// group of its own (introLayers()), the segmented rings each in a wrapper
	// across the box (below).
	const layer = (...children) => {
		const group = svgElement('g')
		group.append(...children)
		return group
	}
	const lineLayer = layer(line)
	const zoomLayer = layer(zoomLine, zoomTrackLine)
	const apertureLayer = layer(apertureLine)
	const spinLayer = layer(spinGroup)
	const arcsLayer = layer(...arcs)
	ring.append(mask, lineLayer, zoomLayer, apertureLayer, spinLayer, arcsLayer)
	const cut = () => {
		const circle = svgElement('circle', { class: 'hud-cut' })
		mask.append(circle)
		return circle
	}

	// A button's or knob's cues: a mouse entering it and, for a button, a
	// press (pointerdown, or a click from the keyboard, which has no pointer).
	const sounding = (element, control, press = true) => {
		element.addEventListener('pointerenter', (event) => {
			if (event.pointerType === 'mouse') onCue('hover', { control, element })
		})
		if (!press) return
		element.addEventListener('pointerdown', (event) => {
			if (event.button === 0) onCue('press', { control, element })
		})
		element.addEventListener('click', (event) => {
			if (event.detail === 0) onCue('press', { control, element })
		})
	}

	const toneGroup = group('Skin tone')
	const toneButtons = tones.map((tone) => {
		const button = hudButton('skin', `${tone.label} skin`, '<span class="tone-fill"></span>', () =>
			onTone(tone.name),
		)
		button.style.setProperty('--tone', tone.color)
		sounding(button, 'tone')
		return button
	})
	toneGroup.append(...toneButtons)
	// The hidden tone: out of the keyboard's way and of assistive technology,
	// but a mouse over it, once unlocked, hears its tick (style.css hides it).
	const secretButton =
		secretTone &&
		hudButton('skin skin-secret', `${secretTone.label} skin`, '', () => onTone(secretTone.name))
	if (secretButton) {
		secretButton.tabIndex = -1
		secretButton.setAttribute('aria-hidden', 'true')
		sounding(secretButton, 'tone')
		toneGroup.append(secretButton)
	}

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
	const knob = trackKnob({
		className: 'zoom-level',
		marker: '<span class="zoom-marker"></span>',
		label: 'Zoom level',
		title: 'Zoom: drag, scroll or click',
		onLevel: onZoomLevel,
		onWheel: onZoomWheel,
		getElasticity: getZoomElasticity,
		stretch: HUD.zoom.stretch,
		snapEnd: (level, { track, radius }) => knobSnap(knobAngle(level, track), track, radius),
		onSnap: (end) => onZoom(end === 1 ? 'in' : 'out', SNAP_GLIDE),
		onCue: (name) => onCue(name, { control: 'zoom', element: knob.element }),
		cut: cut(),
	})
	knob.cut.style.r = `${HUD.marker / 2 + HUD.gap}px`
	zoomGroup.append(zoomIn, knob.element, zoomOut)
	sounding(zoomIn, 'zoom-in')
	sounding(zoomOut, 'zoom-out')
	sounding(knob.element, 'zoom', false)

	// The aperture knob of a desktop HUD (HUD.aperture): a convex lens in
	// profile across the circle, between the zoom's circle and the spinning
	// circle, that
	// slides between + and −, from the widest f-number by − to the narrowest
	// by +. Released past an end it springs back there;
	// along its track it stays where it is let go. It shows only on a HUD
	// that is not split, under a mouse (the HUD's `with-aperture` class).
	const apertureGroup = group('Aperture')
	const apertureKnob = trackKnob({
		className: 'aperture-level',
		marker: '<svg class="aperture-marker"><path/></svg>',
		label: 'Aperture (f-number)',
		title: 'Aperture: drag, scroll or click',
		onLevel: onApertureLevel,
		onWheel: onApertureWheel,
		getElasticity: getApertureElasticity,
		stretch: HUD.aperture.stretch,
		snapEnd: (level) => (level < 0 ? 0 : level > 1 ? 1 : null),
		onSnap: (end) => onAperture(end, SNAP_GLIDE),
		onCue: (name) => onCue(name, { control: 'aperture', element: apertureKnob.element }),
		// Its cut in the dashed arc of its track, as the zoom knob's in the
		// circle: the lens's half width and the gap (none without the knob).
		cut: cut(),
	})
	apertureGroup.append(apertureKnob.element)
	sounding(apertureKnob.element, 'aperture', false)
	const apertureMarker = apertureKnob.element.firstElementChild
	// Its lens, `length` px across the circle, centered in its hit area, as
	// long as the lens hovered.
	const drawApertureLens = (length) => {
		const { hit, grow } = HUD.aperture
		const height = length * grow
		apertureKnob.element.style.height = `${height}px`
		apertureMarker.setAttribute('viewBox', `${-hit / 2} ${-height / 2} ${hit} ${height}`)
		apertureMarker.firstElementChild.setAttribute('d', apertureLens(length))
	}
	const coarse = window.matchMedia('(pointer: coarse)')

	// Two readouts between the spinning circle and the outer zoom ring, on
	// the horizontal (main.js gives their text, formatted): the zoom's value
	// on the middle of the knob's track, with the f-number beside it on a
	// desktop HUD, the camera's polar angles opposite.
	const motionless = window.matchMedia('(prefers-reduced-motion: reduce)')
	const zoomReadout = readout('hud-zoom-value', motionless, ['hud-magnification', 'hud-f-number'])
	const [zoomValue, fNumberValue] = zoomReadout.texts
	const cameraAngles = readout('hud-camera-angles', motionless)

	const random = hudButton('random-eye', 'Random eye', icon('eye'), () => {
		spinTurns++
		placeSpin()
		activate('random')
		onCue('random', { control: 'random', element: random })
		onRandom()
	})
	sounding(random, 'random')

	// The Sharingan's button (main.js): hidden, out of the keyboard's way
	// and without a cut in the circle until unlocked. A click turns the
	// spinning circle as Random eye's does.
	const sharingan =
		onSharingan &&
		hudButton('sharingan', 'Sharingan', icon('tomoe'), () => {
			spinTurns++
			placeSpin()
			activate('random')
			onCue('sharingan', { control: 'sharingan', element: sharingan })
			onSharingan()
		})
	if (sharingan) {
		sharingan.tabIndex = -1
		sharingan.setAttribute('aria-hidden', 'true')
		sounding(sharingan, 'sharingan')
	}

	// The HUD's layers take the accent while their control is in use, as if
	// they lit up (style.css eases the color from white and back): the zoom
	// rings, the zoom value and the knob's marker while the zoom moves or the
	// knob is held, the aperture knob's lens, the f-number and the arcs
	// (which it scales, on a HUD with the knob) while the f-number moves or
	// the knob is held, the
	// arcs as a new tone is pressed, the spinning circle at a click on Random
	// eye, the camera angles while the camera orbits. Each stays lit
	// `ACTIVE_HOLD` ms past the control's last move; an element two lit
	// layers share (the arcs) stays lit while either does.
	const layers = {
		zoom: () => [
			...orbitAssets.map(({ wrapper }) => wrapper),
			zoomValue.element,
			knob.element.firstElementChild,
		],
		aperture: () => [apertureMarker, fNumberValue.element, ...(placed?.aperture ? arcs : [])],
		tone: () => arcs,
		random: () => [spin, spinTeeth],
		camera: () => [cameraAngles.texts[0].element],
	}
	const activeTimers = {}
	const lit = {}
	const activate = (name) => {
		const elements = [...new Set([...(lit[name] ?? []), ...layers[name]()])]
		for (const element of elements) element.classList.add('active')
		lit[name] = elements
		clearTimeout(activeTimers[name])
		activeTimers[name] = setTimeout(() => {
			delete lit[name]
			const held = new Set(Object.values(lit).flat())
			for (const element of elements) if (!held.has(element)) element.classList.remove('active')
		}, ACTIVE_HOLD[name])
	}

	const orbitLayers = orbitAssets.map(({ wrapper }) => {
		const box = document.createElement('div')
		box.className = 'hud-layer'
		box.append(wrapper)
		return box
	})
	element.append(
		...orbitLayers,
		ring,
		zoomReadout.element,
		cameraAngles.element,
		toneGroup,
		zoomGroup,
		apertureGroup,
		random,
		...(sharingan ? [sharingan] : []),
	)

	// Each button with its angle on the circle and its cut in the line.
	// The tones' angles are their group's, turned (`toneShift`); the zoom's
	// buttons lie on the zoom's circle (`zoom`).
	const toneItems = [...toneButtons, ...(secretButton ? [secretButton] : [])].map((button, i) => ({
		button,
		angle: (angles, toned) => toned[i],
	}))
	const items = [
		...toneItems,
		{ button: zoomIn, angle: (angles) => angles.zoomIn, zoom: true, follow: 'zoom' },
		{ button: zoomOut, angle: (angles) => angles.zoomOut, zoom: true, follow: 'zoom' },
		{ button: random, angle: (angles) => angles.random, follow: 'random' },
		...(sharingan
			? [{ button: sharingan, angle: (angles) => angles.sharingan, follow: 'random' }]
			: []),
	]

	// The tone group turns along the circle to bring the pressed tone to its
	// center, on the horizontal (toneSteps()), gliding there with an elastic
	// settle (GSAP). The first press, and any with reduced motion, sets it.
	const toneShift = { steps: 0 }
	// The tones' angles turned `toneShift`, the hidden tone's one spacing
	// past the deepest.
	const turnedTones = (angles, radius) => {
		const slots = secretButton
			? [...angles.tones, angles.tones.at(-1) - HUD.tones.spacing / radius]
			: angles.tones
		return turnTones(slots, radius, toneShift.steps)
	}
	let toneTarget = null
	let placedAngles = null
	const placeTones = () => {
		if (!placed || !placedAngles) return
		const toned = turnedTones(placedAngles, placed.radius)
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
	for (const item of items) item.cut = item.button === secretButton ? null : cut()
	const cutRadius = (item) => {
		if (!item.cut) return
		const pressed = item.button.getAttribute('aria-pressed') === 'true'
		const tone = item.button.classList.contains('skin')
		const scale = tone && !pressed ? HUD.toneScale : 1
		const hidden = item.button === sharingan && !sharingan.classList.contains('unlocked')
		item.cut.style.r = hidden ? '0px' : `${(HUD.reticle / 2) * scale + HUD.gap}px`
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
	// Past an end, the aperture knob drags the layers about it along, each
	// about the center its share of the marker's turn past the end
	// (apertureFollowTurn()), and they follow it back as it springs back: the
	// dashed arc of its track, the zoom slider as a block (its buttons and
	// their cuts, its knob, its white track and the dashes of the circle it
	// lies on), the tones' three arcs as a block (a rotation in their
	// transform, apart from the dash offsets their tone glides ease) and
	// Random eye.
	let apertureTrackAngles = null
	const dragged = { track: 0, zoom: 0, arcs: 0, random: 0 }
	const followAperture = (force = false) => {
		if (!placed) return
		const level = placed.aperture && apertureTrackAngles ? apertureKnob.level : null
		const layers = Object.keys(dragged)
		const turns = layers.map((layer) =>
			level === null ? 0 : apertureFollowTurn(level, apertureTrackAngles, layer),
		)
		if (!force && layers.every((layer, i) => dragged[layer] === turns[i])) return
		layers.forEach((layer, i) => (dragged[layer] = turns[i]))
		placeApertureLine()
		const zoomCircle = { ...placed, radius: placed.zoomRadius }
		for (const item of items) {
			if (!item.follow) continue
			const angle = item.angle(placedAngles) + dragged[item.follow]
			place(item.button, item.cut, angle, item.zoom ? zoomCircle : placed)
		}
		knob.setTurn(dragged.zoom)
		arcs.forEach((_, i) => transformArc(i))
		const zoomRing = placed.split ? zoomLine : line
		zoomRing.style.strokeDashoffset = `${-dragged.zoom * placed.zoomRadius}px`
		placeZoomTrack()
	}
	// The dashed arc of the aperture's track, drawn turned (not by a
	// transform, which would turn the mask's cuts with it; its dashes depend
	// only on its length).
	let apertureRing = null
	const placeApertureLine = () => {
		if (!placed.aperture || !apertureTrackAngles) return
		const [from, to] = apertureTrackAngles
		const turned = [from + dragged.track, to + dragged.track]
		const trackArc = apertureTrackArc(placed, apertureRing, turned)
		apertureLine.setAttribute('d', trackArc.d)
		apertureLine.setAttribute('stroke-dasharray', trackArc.dashArray.join(' '))
	}
	// The zoom's white track, between its buttons, turned with them and the
	// circle's dashes.
	const placeZoomTrack = () => {
		const zoomCircle = { ...placed, radius: placed.zoomRadius }
		const zoomTrack = zoomTrackArc(zoomCircle, zoomCircle.radius, placed.track, dragged.zoom)
		zoomTrackLine.setAttribute('d', zoomTrack.d)
		zoomTrackLine.setAttribute('stroke-dasharray', zoomTrack.dashArray.join(' '))
		zoomTrackLine.style.strokeDashoffset = `${zoomTrack.dashOffset}px`
	}
	// The arcs also grow and shrink with the aperture about the center
	// (apertureArcScale(); on a HUD without the knob they keep their size),
	// their line kept 2 px wide (--arc-scale, style.css), and turn with the
	// aperture knob past an end (`dragged.arcs`), on top of their sway.
	let arcScale = 1
	const transformArc = (i) => {
		if (!placed) return
		const { cx, cy } = placed
		const degrees = ((sway.arcs[i] + dragged.arcs) * 180) / Math.PI
		arcs[i].setAttribute(
			'transform',
			`translate(${cx} ${cy}) rotate(${degrees}) scale(${arcScale}) translate(${-cx} ${-cy})`,
		)
		arcs[i].style.setProperty('--arc-scale', arcScale)
	}
	let aperture = null
	const scaleArcs = () => {
		const scale =
			placed?.aperture && aperture !== null
				? apertureArcScale(aperture, getApertureElasticity())
				: 1
		if (scale === arcScale) return
		arcScale = scale
		arcs.forEach((_, i) => transformArc(i))
	}
	let swayTime = null
	const stepSway = (time) => {
		requestAnimationFrame(stepSway)
		const dt = swayTime === null ? 0 : Math.min((time - swayTime) / 1000, 0.1)
		swayTime = time
		// They land within 1e-4 rad (a twentieth of a pixel out at 500 px),
		// so the layers stop being redrawn a second or two sooner.
		const toward = (current, layer) =>
			follow(current, still.matches ? 0 : swayTurn(layer, mouse), dt, layer.lag, 1e-4)
		let rings = false
		for (const kind of ['inner', 'outer']) {
			const turn = toward(sway[kind], HUD.sway[kind])
			if (turn !== sway[kind]) rings = true
			sway[kind] = turn
		}
		if (rings) placeOrbit()
		const spinTurn = toward(sway.spin, HUD.sway.spin)
		if (spinTurn !== sway.spin) rotate(spinGroup, (sway.spin = spinTurn))
		for (let i = 0; i < arcs.length; i++) {
			const turn = toward(sway.arcs[i], HUD.sway.arcs[i])
			if (turn === sway.arcs[i]) continue
			sway.arcs[i] = turn
			transformArc(i)
		}
	}

	// Both segmented rings for the current layout and zoom level.
	let placed = null
	let level = null
	const placeOrbit = () => {
		if (!placed || level === null) return
		const { cx, cy, radius, split } = placed
		drawOrbits(radius, split)
		for (const asset of orbitAssets) {
			const ring = orbitRing(radius, level, asset.kind, stretching, HUD, split)
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

	// The aperture drag's elasticity the layout last took (hudLayout()).
	let laidElasticity = null
	// The height (px) at the bottom of the HUD's box that the zoom's circle of
	// a split HUD keeps clear of (reserveBottom()).
	let bottom = 0
	const layout = () => {
		const { clientWidth: width, clientHeight: height } = element
		laidElasticity = getApertureElasticity()
		const knobbed = coarse.matches ? null : { elasticity: laidElasticity }
		const fit = hudLayout(width, height, tones.length, HUD, {
			bottom,
			aperture: knobbed,
			sharingan: Boolean(sharingan),
		})
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
		const toned = turnedTones(angles, radius)
		for (const item of items) {
			place(item.button, item.cut, item.angle(angles, toned), item.zoom ? zoomCircle : circle)
			cutRadius(item)
		}
		placedAngles = angles
		knob.setTrack({ ...zoomCircle, track: angles.track })
		const withAperture = fit.aperture !== null
		element.classList.toggle('with-aperture', withAperture)
		if (withAperture) {
			const { radius: ring, length, track } = fit.aperture
			apertureKnob.setTrack({ ...circle, radius: ring, track })
			drawApertureLens(length)
			apertureTrackAngles = track
			apertureRing = ring
		}
		const apertureCut = withAperture ? HUD.aperture.width / 2 + HUD.gap : 0
		apertureKnob.cut.style.r = `${apertureCut}px`
		const middle = (angles.track[0] + angles.track[1]) / 2
		const reach = zoomValueRadius(radius, HUD, split)
		zoomReadout.place(circle, reach, middle, width)
		const drop = split ? HUD.split.readouts.drop : 0
		cameraAngles.place(circle, reach - drop, middle + Math.PI, width)
		placed = {
			...circle,
			zoomRadius: zoomCircle.radius,
			split,
			track: angles.track,
			aperture: withAperture,
		}
		followAperture(true)
		placeSpin()
		placeArcs()
		// The sway turns about the center, which moved with the layout.
		rotate(spinGroup, sway.spin)
		scaleArcs()
		arcs.forEach((_, i) => transformArc(i))
		placeOrbit()
		placeZoomSymbols()
	}
	new ResizeObserver(layout).observe(element)
	coarse.addEventListener('change', layout)

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
			// The hidden tone turns the group to bring its empty slot to the
			// center (a split HUD's stays, clear of the checklist above it); the
			// arcs light up where they are.
			if (secretButton && color === secretTone.color) {
				if (placed?.split) activate('tone')
				else turnToTone(tones.length)
				return
			}
			// A color of no tone leaves the tones and the arcs where they are.
			const tone = tones.findIndex((candidate) => candidate.color === color)
			if (tone < 0) return
			turnToTone(tone)
			if (tone === arcTone) return
			arcTone = tone
			placeArcs()
		},
		// Whether the hidden tone can be pressed (main.js: once every other
		// tone has been worn).
		unlockSecret(unlocked) {
			secretButton?.classList.toggle('unlocked', unlocked)
		},
		// Whether the Sharingan's button shows (main.js: once the checklist is
		// done). `reveal`: it awakens, its cut in the circle opening: two
		// rings ripple out from it in the accent, the tomoe spins in two turns
		// from nothing, the brackets close in, the icon glows in the accent for
		// a moment and the spinning circle turns (otherwise, and with reduced
		// motion, it shows at once).
		unlockSharingan(unlocked, reveal = false) {
			if (!sharingan || sharingan.classList.contains('unlocked') === unlocked) return
			sharingan.classList.toggle('unlocked', unlocked)
			sharingan.tabIndex = unlocked ? 0 : -1
			if (unlocked) sharingan.removeAttribute('aria-hidden')
			else sharingan.setAttribute('aria-hidden', 'true')
			const item = items.find((entry) => entry.button === sharingan)
			const glyph = sharingan.firstElementChild
			gsap.killTweensOf(glyph)
			if (!unlocked || !reveal || motionless.matches) {
				sharingan.classList.remove('engaged', 'awakening')
				item.cut.classList.add('instant')
				cutRadius(item)
				item.cut.getBoundingClientRect()
				item.cut.classList.remove('instant')
				return
			}
			cutRadius(item)
			spinTurns++
			placeSpin()
			activate('random')
			sharingan.classList.add('engaged', 'awakening')
			const { awaken } = HUD.sharingan
			for (let i = 0; i < 2; i++) {
				const ripple = document.createElement('span')
				ripple.className = 'hud-ripple'
				sharingan.append(ripple)
				gsap.fromTo(
					ripple,
					{ scale: 0.3, opacity: 1 },
					{
						scale: awaken.ripple,
						opacity: 0,
						duration: 1.1,
						delay: i * 0.18,
						ease: 'power2.out',
						onComplete: () => ripple.remove(),
					},
				)
			}
			gsap.fromTo(
				glyph,
				{ opacity: 0, scale: 0, rotate: -720 },
				{
					opacity: 1,
					scale: 1,
					rotate: 0,
					duration: awaken.spin,
					ease: 'back.out(1.4)',
					clearProps: 'opacity,scale,rotate,transform',
				},
			)
			gsap.delayedCall(awaken.glow, () => sharingan.classList.remove('engaged', 'awakening'))
		},
		circle() {
			if (!placed) return null
			const box = element.getBoundingClientRect()
			const { cx, cy, radius, split } = placed
			return { x: box.left + cx, y: box.top + cy, radius, split }
		},
		// The zoom's value as text (main.js formats it).
		showZoomValue: (text) => zoomValue.show(text),
		// Whether a right-drag over the image holds the aperture (main.js): the
		// knob shows it past an end, lit, as under its own drag.
		holdAperture(value) {
			apertureKnob.held = value
			if (value) activate('aperture')
		},
		// The f-number as text (main.js formats it), also the knob's value
		// for assistive technology.
		showApertureValue(text) {
			fNumberValue.show(text)
			if (apertureKnob.element.getAttribute('aria-valuetext') !== text)
				apertureKnob.element.setAttribute('aria-valuetext', text)
		},
		// The aperture knob at `shown` (its level: past an end while dragged
		// or springing back) and the tones' arcs scaled with it; the knob's arc
		// and the f-number light up as it moves or while it is held.
		showApertureLevel(shown) {
			// Its track keeps clear of + and − for the drag's elasticity.
			if (getApertureElasticity() !== laidElasticity) layout()
			apertureKnob.show(shown)
			followAperture()
			if (apertureKnob.dragging) activate('aperture')
			if (aperture !== null && Math.abs(shown - aperture) < 1e-4) return
			if (aperture !== null) activate('aperture')
			aperture = shown
			scaleArcs()
		},
		// The camera's polar angles as text (main.js formats them).
		// `orbiting`: the camera's orbit moved (not the mouse parallax alone).
		showCameraAngles(text, orbiting) {
			cameraAngles.show(text)
			if (orbiting) activate('camera')
		},
		// The HUD's layers for the intro (src/ui/intro.js), each with its radius
		// (px, hudLayerRadii()), its elements (the groups of the circle's parts,
		// the wrappers of the segmented rings) and the buttons, knobs and
		// readouts on it; `origin`, the circles' center in the HUD's box. Null
		// before the first layout.
		introLayers() {
			if (!placed) return null
			const radii = hudLayerRadii(placed.radius, HUD, placed.split)
			const [innerRing, outerRing] = orbitLayers
			return {
				origin: [placed.cx, placed.cy],
				layers: [
					{ radius: radii.arcs, elements: [arcsLayer] },
					{ radius: radii.inner, elements: [innerRing] },
					{
						radius: radii.line,
						elements: [lineLayer],
						buttons: [
							...toneButtons,
							random,
							...(sharingan?.classList.contains('unlocked') ? [sharingan] : []),
						],
					},
					{
						radius: radii.zoom,
						elements: [zoomLayer],
						buttons: [zoomIn, knob.element, zoomOut],
					},
					{ radius: radii.aperture, elements: [apertureLayer], buttons: [apertureKnob.element] },
					{ radius: radii.spin, elements: [spinLayer] },
					{ radius: radii.readouts, readouts: [zoomReadout.element, cameraAngles.element] },
					{ radius: radii.outer, elements: [outerRing] },
				],
			}
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

// A readout of the HUD: small texts side by side (`parts`, the class of
// each; `texts`, their show(text)), the first also its show(). place()
// centers it `reach` px from the circle's center at `angle`; where it would
// leave a box `width` px wide (a phone's circle), it hides.
function readout(className, motionless, parts = ['hud-readout-text']) {
	const element = document.createElement('div')
	element.className = `hud-readout ${className}`
	element.setAttribute('aria-hidden', 'true')
	// The last placement, redone once there is text to measure.
	let placement = null
	const place = (circle, reach, angle, width) => {
		placement = [circle, reach, angle, width]
		const x = circle.cx + reach * Math.cos(angle)
		const half = element.offsetWidth / 2 + READOUT_MARGIN
		element.style.left = `${x}px`
		element.style.top = `${circle.cy + reach * Math.sin(angle)}px`
		element.classList.toggle('hidden', x - half < 0 || x + half > width)
	}
	const texts = parts.map((part) => {
		const span = document.createElement('span')
		span.className = part
		element.append(span)
		return typedText(span, motionless, () => placement && place(...placement))
	})
	return { element, texts, show: texts[0].show, place }
}

// Text that GSAP's TextPlugin retypes whenever it changes, one tween at a
// time, each to the latest text, so a gliding value reads as a running
// counter that settles. With `motionless` (reduced motion) it switches at
// once. `onFirst()` runs as it shows its first text.
function typedText(element, motionless, onFirst) {
	let shown = null
	let next = null
	let typing = false
	const type = () => {
		if (typing || next === shown) return
		const text = next
		if (shown === null || motionless.matches) {
			const first = shown === null
			element.textContent = shown = text
			if (first) onFirst()
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
	return {
		element,
		show(text) {
			next = text
			type()
		},
	}
}

// A knob that slides along an arc of a circle, from level 0 at the track's
// second angle to 1 at its first: the zoom knob, a small square marker from
// zoom out to zoom in, over the zoom's buttons, so the pointer always
// reaches it, and the aperture knob, a lens in profile across the circle
// outside it, between them.
// `marker`: its
// HTML. `onLevel(level)` sets the level (past an end, resisted, while
// dragged, `getElasticity()`); `onWheel(deltaY)`, if given, takes the wheel
// over the knob (else it sets the level at once). A drag released where
// `snapEnd(level, circle)` gives an end (0 or 1, else null) glides there,
// `onSnap(end)`. Past an end the marker runs `stretch` times as far as the
// level (knobLevel()). `cut`: its circle in the mask of the HUD's line, if
// any. `onCue(name)` hears a 'tap' (a click).
function trackKnob({
	className,
	marker: markerHtml,
	label,
	title,
	onLevel,
	onWheel,
	onSnap,
	snapEnd,
	getElasticity = () => 0,
	stretch,
	cut = null,
	onCue = () => {},
}) {
	const element = document.createElement('div')
	element.className = `hud-button ${className}`
	element.innerHTML = markerHtml
	element.tabIndex = 0
	element.title = title
	element.setAttribute('role', 'slider')
	element.setAttribute('aria-label', label)
	element.setAttribute('aria-valuemin', '0')
	element.setAttribute('aria-valuemax', '100')

	// The circle and the track on it (set by the layout), and the level
	// shown. Past an end the marker runs further than the level (knobLevel()).
	let circle = null
	let shown = null
	const marker = () => knobLevel(shown, getElasticity(), stretch)
	// A turn of the whole track about the circle's center (radians), as
	// another knob drags it along (setTurn()).
	let turn = 0
	const update = () => {
		if (!circle || shown === null) return
		place(element, cut, knobAngle(marker(), circle.track) + turn, circle)
	}
	const set = (level) => onLevel(clamp01(level))

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
		if (event.animationName.endsWith('-bounce')) element.classList.remove('pulse')
	})

	// The level and the marker share the resisted level; no snap interrupts
	// a held drag. Recovery follows the level back from outside the track.
	let drag = null
	let recovering = false
	// Held from outside (a right-drag over the image, `held`): the marker
	// shows the level past an end as under a drag of its own.
	let held = false
	element.addEventListener('pointerdown', (event) => {
		if (!circle || drag || event.button !== 0) return
		element.setPointerCapture(event.pointerId)
		const { pointerId: id, clientX: x, clientY: y } = event
		const angle = pointerAngle(event)
		const level = shown ?? 0
		// Measured from the pull the level resists (past an end, beyond the
		// marker), so grabbing a returning marker holds the level there.
		const offset = angle - knobAngle(pullLevel(level, getElasticity()), circle.track)
		drag = { id, x, y, offset, angle, level, moved: false }
		recovering = false
		// Grabbing a returning marker stops its glide at this point.
		onLevel(level)
	})
	element.addEventListener('pointermove', (event) => {
		if (drag?.id !== event.pointerId) return
		const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y)
		if (!drag.moved && distance < CLICK_SLOP) return
		drag.moved = true
		element.classList.add('dragging')
		drag.angle = pointerAngle(event)
		drag.level = trackLevel(drag.angle - drag.offset, circle.track, getElasticity())
		onLevel(drag.level)
	})
	const release = (event, click) => {
		if (drag?.id !== event.pointerId) return
		const { moved, level } = drag
		drag = null
		element.classList.remove('dragging')
		if (moved || level < 0 || level > 1) {
			const end = snapEnd(level, circle)
			if (end !== null) {
				recovering = level < 0 || level > 1
				onSnap(end)
			}
		} else if (click) {
			pulse()
			onCue('tap')
		}
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
		cut,
		// Where the marker sits, and whether a drag holds it.
		get level() {
			return shown === null ? null : marker()
		},
		get dragging() {
			return drag !== null || held
		},
		// Whether a drag from outside holds the level; let go past an end, the
		// marker follows it back, as after a drag of its own.
		set held(value) {
			if (!value && held && shown !== null && (shown < 0 || shown > 1)) recovering = true
			held = value
			element.classList.toggle('dragging', value)
		},
		setTrack(value) {
			if (drag) release({ pointerId: drag.id }, false)
			circle = value
			update()
		},
		setTurn(value) {
			if (value === turn) return
			turn = value
			update()
		},
		show(level) {
			if (level >= 0 && level <= 1) recovering = false
			if (!drag && !held && !recovering) level = clamp01(level)
			if (shown !== null && Math.abs(level - shown) < 1e-4) return
			shown = level
			element.setAttribute('aria-valuenow', String(Math.round(clamp01(level) * 100)))
			update()
		},
	}
}
