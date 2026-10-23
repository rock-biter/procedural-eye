// The checklist of a desktop page (main.js), under the line about the
// project: its title, then the tasks done, dimmed, the one to do, and a dot
// for each one after it (style.css). Done, a task dims and the next one
// comes in under it, its text scrambling into place (GSAP's
// ScrambleTextPlugin), as the title and the first task do when it shows; a
// counted task shows its count beside it. Where its height runs out, the
// tasks done first leave at the top, fading. With reduced motion the texts
// show at once.
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
	// The narrowest and the shortest room (px) it shows in, the gap (px) it
	// keeps from the HUD's skin tones and above the camera's angles, and half
	// their line's height (main.js).
	minWidth: 160,
	minHeight: 64,
	gap: 16,
	readout: 9,
})

// `tasks` (src/ui/checklistTasks.js) and `progress` (createProgress() of
// them); onChange(state) hears each step, to keep it. Returns the element,
// show(), which brings it in (once: main.js, as the intro ends),
// report(id, key) (createProgress()), heard only while it shows (counting()),
// complete(),
// which does the task to do (the console's, src/debug/devTools.js), and
// fit(width, height), the room it has beside the HUD (px; too narrow or too
// short, it hides).
export function createChecklist({ tasks, progress, onChange = () => {} }) {
	const motionless = window.matchMedia('(prefers-reduced-motion: reduce)')
	const element = document.createElement('section')
	// Cramped until the first fit().
	element.className = 'checklist cramped'
	element.setAttribute('aria-label', CHECKLIST.title)
	const title = document.createElement('h2')
	title.className = 'checklist-title'
	const list = document.createElement('ol')
	list.className = 'checklist-tasks'
	list.setAttribute('aria-live', 'polite')
	const dots = document.createElement('div')
	dots.className = 'checklist-dots'
	dots.setAttribute('aria-hidden', 'true')
	element.append(title, list, dots)

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
		const left = tasks.length - progress.done().length - (task ? 1 : 0)
		dots.replaceChildren(...Array.from({ length: left }, () => document.createElement('span')))
	}

	let shown = false
	let cramped = true
	const step = (result) => {
		if (result === 'counted') showCount()
		if (result === 'done') {
			current.classList.add('done')
			current.querySelector('.checklist-count')?.remove()
			addCurrent()
			clip()
		}
		if (result) onChange(progress.state())
	}

	return {
		element,
		show() {
			if (shown) return
			shown = true
			element.classList.add('shown')
			list.replaceChildren(...progress.done().map((task) => entry(task, true)))
			scramble(title, CHECKLIST.title)
			addCurrent()
			clip()
		},
		counting: () => shown && !cramped,
		report(id, key) {
			if (!shown || cramped) return
			step(progress.report(id, key))
		},
		complete() {
			const task = progress.current()
			if (!shown || !task) return
			let result = null
			for (let key = 0; result !== 'done'; key++) result = progress.report(task.id, `skip-${key}`)
			step(result)
		},
		fit(width, height) {
			cramped = width < CHECKLIST.minWidth || height < CHECKLIST.minHeight
			element.classList.toggle('cramped', cramped)
			element.style.setProperty('--checklist-room', `${Math.floor(Math.max(width, 0))}px`)
			element.style.setProperty('--checklist-height', `${Math.floor(Math.max(height, 0))}px`)
			clip()
		},
	}
}
