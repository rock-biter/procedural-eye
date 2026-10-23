// The checklist of a desktop page (main.js), under the line about the
// project: its title, then the tasks done, dimmed, the one to do, and a dot
// for each one after it (style.css). Done, a task dims and the next one
// comes in under it, its text scrambling into place (GSAP's
// ScrambleTextPlugin), as the title and the first task do when it shows; a
// counted task shows its count beside it. Where its height runs out, the
// tasks done first leave at the top, fading. `compact` (phones and tablets)
// shows the task to do alone: done, it scrambles out before the next one
// comes in. Reset, beside the title once a task is done, scrambles the tasks
// out from the last to the first and starts again. With reduced motion the
// texts show and go at once.
import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin)

export const CHECKLIST = Object.freeze({
	title: 'Eye exam',
	// A text coming in: `duration` s, its characters settling from
	// `revealDelay` s on, the others drawn from `chars`, changing `speed`
	// times as often as GSAP's default.
	scramble: Object.freeze({
		duration: 1.2,
		revealDelay: 0.3,
		speed: 0.5,
		chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/<>',
	}),
	// A task going on a reset: `duration` s, each `stagger` s after the one
	// below it.
	scrambleOut: Object.freeze({ duration: 0.5, stagger: 0.08 }),
	// The narrowest and the shortest room (px) it shows in, the gap (px) it
	// keeps from the HUD's skin tones and above the camera's angles, and half
	// their line's height (main.js).
	minWidth: 160,
	minHeight: 64,
	gap: 16,
	readout: 9,
})

// `tasks` (src/ui/checklistTasks.js) and `progress` (createProgress() of
// them); onChange(state) hears each step, to keep it, and onReset() a reset
// as it starts again. Returns the element, `resetButton`, show(), which
// brings it in (once: main.js, as the intro ends), report(id, key)
// (createProgress()), heard only while it shows and is not resetting
// (counting(); nor while a compact one's task leaves, after which it tells
// onChange()), complete(), which does the task to do, and reset(), Reset's
// (both the console's too, src/debug/devTools.js), setDone(id, done), any
// task done or not (the panel of #debug), and fit(width, height),
// the room it has beside the HUD (px; too narrow or too short, it hides).
export function createChecklist({
	tasks,
	progress,
	compact = false,
	onChange = () => {},
	onReset = () => {},
}) {
	const motionless = window.matchMedia('(prefers-reduced-motion: reduce)')
	const element = document.createElement('section')
	// Cramped until the first fit().
	element.className = 'checklist cramped'
	element.setAttribute('aria-label', CHECKLIST.title)
	const head = document.createElement('div')
	head.className = 'checklist-head'
	const title = document.createElement('h2')
	title.className = 'checklist-title'
	// Reset, a link's look; it blurs itself after a click, as the HUD buttons
	// do.
	const resetButton = document.createElement('button')
	resetButton.type = 'button'
	resetButton.className = 'checklist-reset'
	resetButton.innerHTML = '<span class="swap-underline">Reset</span>'
	resetButton.addEventListener('click', () => {
		resetButton.blur()
		reset()
	})
	head.append(title, resetButton)
	const list = document.createElement('ol')
	list.className = 'checklist-tasks'
	list.setAttribute('aria-live', 'polite')
	const dots = document.createElement('div')
	dots.className = 'checklist-dots'
	dots.setAttribute('aria-hidden', 'true')
	element.append(head, list, dots)

	const scramble = (target, text) => {
		gsap.killTweensOf(target)
		if (motionless.matches) {
			target.textContent = text
			return
		}
		const { duration, revealDelay, speed, chars } = CHECKLIST.scramble
		target.textContent = ''
		gsap.to(target, {
			duration,
			scrambleText: { text, chars, revealDelay, speed },
			onComplete: clip,
		})
	}
	// Whether the first tasks have left at the top (style.css fades it).
	const clip = () => {
		const first = list.firstElementChild
		const clipped = first && first.getBoundingClientRect().top < list.getBoundingClientRect().top
		list.classList.toggle('clipped', Boolean(clipped))
	}
	const entry = (task, done) => {
		const item = document.createElement('li')
		item.className = done ? 'checklist-task done' : 'checklist-task'
		const text = document.createElement('span')
		text.className = 'checklist-text'
		text.textContent = task.text
		item.append(text)
		return item
	}
	// The task to do, its text scrambling in, and its count, if any.
	let current = null
	const showCount = () => {
		const count = current?.querySelector('.checklist-count')
		if (count) count.textContent = `${progress.count()}/${progress.total()}`
	}
	const addCurrent = () => {
		const task = progress.current()
		current = task && entry(task, false)
		if (current) {
			list.append(current)
			scramble(current.firstElementChild, task.text)
			if (task.counted) {
				const count = document.createElement('span')
				count.className = 'checklist-count'
				current.append(count)
				showCount()
			}
		}
		// The tasks after it, a hidden one only once one shows.
		const done = new Set(progress.done().map(({ id }) => id))
		const left = tasks.filter(
			(other) => other !== task && !done.has(other.id) && (!other.hidden || task?.hidden),
		).length
		dots.replaceChildren(...Array.from({ length: left }, () => document.createElement('span')))
		resetButton.hidden = progress.done().length === 0
	}

	let shown = false
	let cramped = true
	let resetting = false
	let leaving = false
	const counting = () => shown && !cramped && !resetting && !leaving
	// A task's text scrambling out to nothing on `timeline` from `at` s, the
	// task fading.
	const scrambleOut = (timeline, item, at) => {
		const { duration } = CHECKLIST.scrambleOut
		const { chars, speed } = CHECKLIST.scramble
		const text = item.querySelector('.checklist-text')
		gsap.killTweensOf(text)
		timeline.to(text, { duration, scrambleText: { text: '', chars, speed } }, at)
		timeline.to(item, { opacity: 0, duration: duration / 2 }, at + duration / 2)
	}
	// The tasks scramble out, the last first, the dots fading with them; then
	// the first task comes in again.
	const reset = () => {
		if (!shown || resetting || leaving) return
		resetting = true
		const again = () => {
			progress.reset()
			onReset()
			gsap.set(dots, { clearProps: 'opacity' })
			list.replaceChildren()
			addCurrent()
			clip()
			resetting = false
			onChange(progress.state())
		}
		if (motionless.matches) return again()
		const { duration, stagger } = CHECKLIST.scrambleOut
		const timeline = gsap.timeline({ onComplete: again })
		timeline.to(dots, { opacity: 0, duration }, 0)
		;[...list.children].reverse().forEach((item, i) => scrambleOut(timeline, item, i * stagger))
	}
	const step = (result) => {
		if (result === 'counted') showCount()
		if (result === 'done') {
			current.querySelector('.checklist-count')?.remove()
			if (compact) return leave()
			current.classList.add('done')
			addCurrent()
			clip()
		}
		if (result) onChange(progress.state())
	}
	// A compact list's task done leaves before the next one comes in.
	const leave = () => {
		const next = () => {
			list.replaceChildren()
			addCurrent()
			leaving = false
			onChange(progress.state())
		}
		if (motionless.matches) return next()
		leaving = true
		const timeline = gsap.timeline({ onComplete: next })
		scrambleOut(timeline, current, 0)
	}

	return {
		element,
		resetButton,
		show() {
			if (shown) return
			shown = true
			element.classList.add('shown')
			list.replaceChildren(...(compact ? [] : progress.done().map((task) => entry(task, true))))
			scramble(title, CHECKLIST.title)
			addCurrent()
			clip()
		},
		counting,
		// Marks the task `id` done or not (the panel of #debug): the task
		// shown done as a report would do it; any other one, the list drawn
		// again at once.
		setDone(id, done) {
			if (!shown || resetting || leaving) return
			if (done && progress.current()?.id === id) return this.complete()
			if (!progress.set(id, done)) return
			gsap.killTweensOf(list.querySelectorAll('.checklist-text'))
			list.replaceChildren(...(compact ? [] : progress.done().map((task) => entry(task, true))))
			addCurrent()
			clip()
			onChange(progress.state())
		},
		// What the report did: 'done', 'counted' or null (progress.report()).
		report(id, key) {
			if (!counting()) return null
			const result = progress.report(id, key)
			step(result)
			return result
		},
		complete() {
			const task = progress.current()
			if (!shown || resetting || leaving || !task) return
			let result = null
			for (let key = 0; result !== 'done'; key++) result = progress.report(task.id, `skip-${key}`)
			step(result)
		},
		reset,
		fit(width, height) {
			cramped = width < CHECKLIST.minWidth || height < CHECKLIST.minHeight
			element.classList.toggle('cramped', cramped)
			element.style.setProperty('--checklist-room', `${Math.floor(Math.max(width, 0))}px`)
			element.style.setProperty('--checklist-height', `${Math.floor(Math.max(height, 0))}px`)
			clip()
		},
	}
}
