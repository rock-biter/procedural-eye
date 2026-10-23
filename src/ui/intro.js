// The intro (main.js): the page starts black. A black mask over the image
// opens with a sharp diagonal cut from the bottom left to the top right as
// the camera pulls back from a little closer and turns clockwise into its
// framing, and the iris shuffles through random eyes like a slot machine's
// reel, fast then slower, to stop on the page's own; meanwhile the HUD's
// layers come in from the center outward, each circle's buttons a moment
// after it, the frame draws its sides around the page, and last the texts at
// the corners rise line by line out of their masks, with Snapshot; as it
// ends, the eye blinks for the first time. One GSAP
// timeline holds it all, a part of its own for each (`reveal`, `camera`,
// `shuffle`, `hud`, `frame`, `texts`), placed and timed by INTRO. Nothing
// waits for a preloader: the intro starts on the first frames of the image,
// once the fonts the texts are split in have loaded and the shuffle's irises
// are prepared.
import { gsap } from 'gsap'
import {
	clockwise,
	frameBracketClip,
	frameLineClip,
	framingBetween,
	maskedLine,
	outwardRanks,
	reelEase,
	revealPolygon,
} from './introLayout'
import { splitLines } from './splitLines'

// The intro's timeline, in seconds from its start. Each part starts at its
// `at` and takes its `duration` with its GSAP `ease`; the rest is relative to
// them. `scale` sets the length of the whole: every time below is multiplied
// by it (0.8 plays the intro a fifth faster, parts, staggers, the shuffle's
// reel and the blink alike). Left unfrozen, so it can be tried out from the
// console (window.__EYE__.getIntroConfig()) and replayed (replayIntro()).
export const INTRO = {
	scale: 0.8,
	// The black mask over the image opens with a straight, sharp cut that
	// travels along `angle` (degrees counterclockwise from the right: 45 from
	// the bottom left corner to the top right), square to it.
	reveal: { at: 0.15, duration: 1.5, ease: 'power3.inOut', angle: 45 },
	// The camera starts `zoom` of the zoom knob's travel closer (toward +),
	// the image turned `turn` degrees counterclockwise, and glides to its
	// framing, turning clockwise into place. Whatever moves the camera's
	// distance meanwhile (the wheel, the knob, a zoom button) takes it over;
	// the turn goes on.
	camera: { at: 0, duration: 3.6, ease: 'power2.out', zoom: 0.3, turn: 14 },
	// The iris shuffles through `count` random eyes (drawn at load, main.js)
	// and stops on the page's own, each shown at once: a reel turning through
	// them and slowing down steadily, `slowdown` times slower at the end than
	// at the start (each eye shows a little longer than the one before), the
	// page's eye coming in at the end. `ease`, a GSAP ease's name, replaces
	// that slowdown.
	shuffle: { at: 0.8, duration: 1.4, count: 16, slowdown: 10, ease: null },
	// The HUD's layers from the center outward (the tones' arcs, the inner
	// zoom ring, the central circle, the aperture knob's track, the spinning
	// circle, the readouts, the zoom's wider circle on phones, the outer zoom
	// ring), each `stagger` after the one inside it: growing from `scale` and
	// turning from `turn` degrees (negative: counterclockwise, so they turn
	// clockwise into place, with the image) as they fade in.
	hud: { at: 0.5, duration: 1.6, stagger: 0.08, ease: 'expo.out', scale: 0.82, turn: -24 },
	// The buttons and knobs on each circle, `delay` after their circle starts,
	// `stagger` apart in clockwise order from `start` (degrees clockwise from
	// the right: −90 is the top), popping in from `scale` as they fade in.
	buttons: {
		delay: 0.3,
		duration: 0.8,
		stagger: 0.045,
		ease: 'back.out(1.7)',
		scale: 0,
		start: -90,
	},
	// The readouts by the circle (the zoom's value and the f-number, the
	// camera angles), `delay` after their layer, slide out of their masks away
	// from the center (on phones, as the texts at the corners), with the
	// texts' margin.
	readouts: { delay: 0.35, duration: 0.8, ease: 'expo.out' },
	// The frame: each side drawn from one end to the other, clockwise (the
	// top from the left, the right side from the top, the bottom from the
	// right, the left side from the bottom); the crosses at the corners pop in
	// as the sides start, turning clockwise from `crosses.turn` degrees, and
	// the brackets at the middle of the sides show as their side's line
	// reaches `brackets.at` of its length (in time).
	frame: {
		at: 1,
		duration: 1.2,
		ease: 'power3.inOut',
		crosses: { duration: 0.6, ease: 'back.out(2)', turn: -90 },
		brackets: { at: 0.5, duration: 0.35, ease: 'power2.out' },
	},
	// The texts at the corners, line by line, each sliding its height out of
	// its mask (and `margin` px past its other sides for the ink): those in
	// the top half of the window from above, top line first, those in the
	// bottom half from below, bottom line first, `stagger` apart.
	texts: { at: 1.9, duration: 0.9, stagger: 0.07, ease: 'expo.out', margin: 6 },
	// Snapshot among the bottom lines: its corners close in from `scale` of
	// its size as it fades in, and its word rises out of its mask `label` s
	// after.
	snapshot: { duration: 1, ease: 'expo.out', scale: 1.35, label: 0.1 },
	// The eye's first blink, `delay` s after the rest of the intro has ended
	// (negative: before): until then the eye does not blink.
	blink: { delay: -0.6 },
}

// The intro over the page main.js builds: `hud` (createHud()), `frame` (the
// frame's element), `texts` (the texts at the corners split into their
// lines: the title, the line about the project, the credit line), `lines`
// (those of a line each: More info, the viewport size, the frame rate, which
// change their text), `snapshot`, and `camera` (main.js): framing(zoom), the
// framing the camera ends on and the one `zoom` of the zoom knob's travel
// closer it starts from ({ from, to }, each { distance, sensor }), set(framing),
// which moves the camera there and returns the distance it took, distance(),
// the camera's distance now, and turn(degrees), the image's turn about the
// line of sight; `irises` (main.js), if given: eyes(), the reel's eyes
// before the page's (deep partials of the params), current(), the page's,
// show(eye), which switches to it at once and returns its token, and
// token(), the token of the eye the page heads for; `blinks` (main.js), if
// given: hold(), which keeps the eye from blinking, and first(), which lets
// it blink again, with a blink now. `dev` keeps the timeline
// once it ends and loads GSDevTools to scrub it. onEnd(), if given, hears its
// end (also skipped, or kept with `dev`). Returns hold(), which hides
// the interface and covers the image until play() (at load), play(), which
// builds the timeline and plays it, replay(), which builds it again from the
// page as it is and plays it, and `timeline`.
export function createIntro({
	hud,
	frame,
	texts,
	lines,
	snapshot,
	camera,
	irises = null,
	blinks = null,
	dev = false,
	onEnd = () => {},
}) {
	const root = document.documentElement
	const mask = document.createElement('div')
	mask.className = 'intro-mask'
	mask.hidden = true
	mask.setAttribute('aria-hidden', 'true')
	document.body.append(mask)

	let timeline = null
	// The current build's clean-up: the props its tweens set on each element,
	// the splits to revert and whether it has ended.
	let props = new Map()
	let reverts = []
	let ended = true
	let devTools = null

	const touch = (element, names) => props.set(element, names)

	// The black mask: the part of the window ahead of its cut.
	const revealPart = () => {
		const { angle, duration, ease } = INTRO.reveal
		const state = { progress: 0 }
		const show = () => {
			const points = revealPolygon(window.innerWidth, window.innerHeight, angle, state.progress)
			mask.style.visibility = points.length ? '' : 'hidden'
			if (points.length)
				mask.style.clipPath = `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(', ')})`
		}
		show()
		return gsap
			.timeline({ id: 'reveal' })
			.to(state, { progress: 1, duration, ease, onUpdate: show })
	}

	// The camera, from closer and turned to its framing. Once something else
	// sets its distance, the zoom is theirs.
	const cameraPart = () => {
		const { zoom, turn, duration, ease } = INTRO.camera
		const { from, to } = camera.framing(zoom)
		const state = { t: 0 }
		let distance = null
		let yielded = false
		const show = () => {
			camera.turn(-turn * (1 - state.t))
			if (yielded) return
			if (distance !== null && camera.distance() !== distance) {
				yielded = true
				return
			}
			distance = camera.set(framingBetween(from, to, state.t))
		}
		show()
		return gsap.timeline({ id: 'camera' }).to(state, { t: 1, duration, ease, onUpdate: show })
	}

	// The reel of irises, through the random eyes to the page's: the eye at
	// the reel's whole position, switched as it reaches one. Once something
	// else changes the iris (Random eye, a preset), the iris is theirs.
	const shufflePart = () => {
		const part = gsap.timeline({ id: 'shuffle' })
		if (!irises) return part
		const { duration, slowdown } = INTRO.shuffle
		const ease = INTRO.shuffle.ease ?? reelEase(slowdown)
		const reel = [...irises.eyes(), irises.current()]
		const state = { position: 0 }
		let shown = -1
		let token = null
		let yielded = false
		const show = () => {
			const index = Math.min(Math.floor(state.position), reel.length - 1)
			if (yielded || index === shown) return
			if (token !== null && irises.token() !== token) {
				yielded = true
				return
			}
			shown = index
			token = irises.show(reel[index])
		}
		show()
		return part.to(state, { position: reel.length - 1, duration, ease, onUpdate: show })
	}

	// The HUD's layers from the center outward, with their buttons and
	// readouts.
	const hudPart = () => {
		const part = gsap.timeline({ id: 'hud' })
		const laid = hud.introLayers()
		if (!laid) return part
		const { stagger, duration, ease, scale, turn } = INTRO.hud
		const [ox, oy] = laid.origin
		const box = hud.element.getBoundingClientRect()
		// A shown element's center about the circles' center (px).
		const offset = (element) => {
			const rect = element.getBoundingClientRect()
			return {
				x: rect.left + rect.width / 2 - box.left - ox,
				y: rect.top + rect.height / 2 - box.top - oy,
			}
		}
		const shown = (element) => element.getClientRects().length > 0
		const buttons = new Map()
		const readouts = []
		for (const { layer, rank } of outwardRanks(laid.layers)) {
			const at = rank * stagger
			for (const element of layer.elements ?? []) {
				// The SVG groups turn about the circles' center in the ring's
				// coordinates, the wrappers about their box's, the same point.
				const origin =
					element instanceof SVGElement
						? { svgOrigin: `${ox} ${oy}` }
						: { transformOrigin: '50% 50%' }
				part.from(element, { scale, rotation: turn, opacity: 0, duration, ease, ...origin }, at)
				touch(element, 'transform,opacity')
			}
			const list = buttons.get(rank) ?? []
			for (const element of layer.buttons ?? [])
				if (shown(element)) list.push({ element, ...offset(element) })
			buttons.set(rank, list)
			for (const element of layer.readouts ?? [])
				if (shown(element)) readouts.push({ element, at, ...offset(element) })
		}
		const pop = INTRO.buttons
		for (const [rank, list] of buttons) {
			clockwise(list, pop.start).forEach(({ element }, i) => {
				const at = rank * stagger + pop.delay + i * pop.stagger
				part.from(
					element,
					{ scale: pop.scale, opacity: 0, duration: pop.duration, ease: pop.ease },
					at,
				)
				touch(element, 'transform,opacity')
			})
		}
		// The readouts on the horizontal slide outward, the others as the
		// texts at the corners.
		const slide = INTRO.readouts
		for (const { element, at, x, y } of readouts) {
			const side = Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'left' : 'right') : vertical(element)
			const line = maskedLine(side, element.offsetWidth, element.offsetHeight, INTRO.texts.margin)
			part.fromTo(
				element,
				line.from,
				{ ...line.to, duration: slide.duration, ease: slide.ease },
				at + slide.delay,
			)
			touch(element, 'transform,clipPath')
		}
		return part
	}

	// The frame's sides, crosses and brackets.
	const framePart = () => {
		const { duration, ease, crosses, brackets } = INTRO.frame
		const part = gsap.timeline({ id: 'frame' })
		for (const side of ['top', 'right', 'bottom', 'left']) {
			const halves = ['start', 'end'].map((end) => [
				end,
				frame.querySelector(`.frame-${side}.frame-${end}`),
			])
			const state = { progress: 0 }
			const show = () => {
				for (const [end, line] of halves)
					line.style.clipPath = frameLineClip(side, end, state.progress)
			}
			show()
			part.to(state, { progress: 1, duration, ease, onUpdate: show }, 0)
			for (const [, line] of halves) touch(line, 'clipPath')
		}
		const corners = frame.querySelectorAll('.frame-cross')
		part.from(
			corners,
			{
				scale: 0,
				rotation: crosses.turn,
				opacity: 0,
				duration: crosses.duration,
				ease: crosses.ease,
				transformOrigin: '50% 50%',
			},
			0,
		)
		for (const corner of corners) touch(corner, 'transform,opacity')
		for (const side of ['left', 'right']) {
			const bracket = frame.querySelector(`.frame-bracket-${side}`)
			const state = { progress: 0 }
			const show = () => (bracket.style.clipPath = frameBracketClip(side, state.progress))
			show()
			part.to(
				state,
				{ progress: 1, duration: brackets.duration, ease: brackets.ease, onUpdate: show },
				duration * brackets.at,
			)
			touch(bracket, 'clipPath')
		}
		return part
	}

	// The texts at the corners, line by line, with Snapshot.
	const textsPart = () => {
		const { duration, stagger, ease, margin } = INTRO.texts
		const part = gsap.timeline({ id: 'texts' })
		// Every line with its box and the side it comes from.
		const entries = []
		const add = (element, side, kind = 'line') => {
			const rect = element.getBoundingClientRect()
			entries.push({ element, side, kind, top: rect.top, bottom: rect.bottom })
		}
		for (const text of texts) {
			const split = splitLines(text)
			if (!split) continue
			reverts.push(split.revert)
			const side = vertical(text)
			for (const line of split.lines) add(line, side)
		}
		for (const line of lines) {
			if (line.getClientRects().length === 0) continue
			add(line, vertical(line))
			touch(line, 'transform,clipPath')
		}
		const label = splitLines(snapshot)
		if (label) reverts.push(label.revert)
		add(snapshot, 'below', 'snapshot')
		touch(snapshot, 'transform,opacity')

		const lineIn = (element, side, at) => {
			const line = maskedLine(side, element.offsetWidth, element.offsetHeight, margin)
			part.fromTo(element, line.from, { ...line.to, duration, ease }, at)
		}
		const top = entries.filter((entry) => entry.side === 'above').sort((a, b) => a.top - b.top)
		const bottom = entries
			.filter((entry) => entry.side === 'below')
			.sort((a, b) => b.bottom - a.bottom)
		for (const group of [top, bottom]) {
			group.forEach(({ element, side, kind }, i) => {
				const at = i * stagger
				if (kind === 'line') return lineIn(element, side, at)
				const shot = INTRO.snapshot
				part.from(
					element,
					{ scale: shot.scale, opacity: 0, duration: shot.duration, ease: shot.ease },
					at,
				)
				for (const line of label?.lines ?? []) lineIn(line, 'below', at + shot.label)
			})
		}
		return part
	}

	// Ends the build: its props cleared, its splits reverted, the mask gone.
	const end = () => {
		if (ended) return
		ended = true
		for (const [element, names] of props) gsap.set(element, { clearProps: names })
		for (const revert of reverts) revert()
		props = new Map()
		reverts = []
		mask.hidden = true
		root.classList.remove('intro-running')
		camera.turn(0)
		window.removeEventListener('resize', skip)
	}
	// A resize moves what the timeline measured: it ends at once.
	const skip = () => timeline?.progress(1)

	const build = () => {
		ended = false
		mask.hidden = false
		// The parts at the times of INTRO, played `scale` times as long in the
		// timeline main.js and GSDevTools see (whose speed is their own).
		const parts = gsap.timeline()
		parts
			.add(revealPart(), INTRO.reveal.at)
			.add(cameraPart(), INTRO.camera.at)
			.add(shufflePart(), INTRO.shuffle.at)
			.add(hudPart(), INTRO.hud.at)
			.add(framePart(), INTRO.frame.at)
			.add(textsPart(), INTRO.texts.at)
		// The eye blinks first as the rest ends.
		blinks?.hold()
		parts.call(() => blinks?.first(), [], parts.duration() + INTRO.blink.delay)
		parts.timeScale(1 / INTRO.scale)
		const complete = () => {
			if (!dev) end()
			onEnd()
		}
		return gsap.timeline({ id: 'intro', paused: true, onComplete: complete }).add(parts)
	}

	const start = async () => {
		timeline = build()
		// The parts' first states are set: the interface can show.
		root.classList.remove('intro-pending')
		root.classList.add('intro-running')
		window.addEventListener('resize', skip)
		timeline.play()
		if (!dev) return
		const { GSDevTools } = await import('gsap/GSDevTools')
		gsap.registerPlugin(GSDevTools)
		devTools?.kill()
		devTools = GSDevTools.create({ animation: timeline, id: 'intro' })
	}

	return {
		hold() {
			root.classList.add('intro-pending')
			mask.hidden = false
			blinks?.hold()
		},
		// Two frames after the call, so the image the mask opens on is drawn.
		play() {
			requestAnimationFrame(() => requestAnimationFrame(start))
		},
		replay() {
			if (timeline) {
				timeline.progress(1)
				end()
				timeline.kill()
			}
			start()
		},
		// The GSAP timeline of the last build (null before the first), its
		// times those of INTRO times `scale`: seek, pause or slow it from the
		// console to look at a moment of it.
		get timeline() {
			return timeline
		},
	}
}

// The side a text comes in from: above in the top half of the window, below
// in the bottom half.
function vertical(element) {
	const rect = element.getBoundingClientRect()
	return rect.top + rect.height / 2 < window.innerHeight / 2 ? 'above' : 'below'
}
