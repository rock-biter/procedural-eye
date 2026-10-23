// The checklist of a desktop page (src/ui/checklist.js, main.js; pure): first
// tasks that show the controls one by one, then achievements that only hint
// at what to do. One task shows at a time and only it can be done: what a
// later one asks for does not count before it shows. A counted task
// (`counted`) is done once it has heard as many different keys as main.js
// gives it (the tab's titles, the T-800's reports of the shots, the
// Sharingan); a desktop's (`desktop`) asks for what only a desktop has (the
// aperture knob, Space, the tabs' titles, the console, the Sharingan). A
// hidden one (`hidden`) shows, its dot too, only once every task before it
// is done: the Sharingan's, which that unlocks.
export const TASKS = Object.freeze(
	[
		{ id: 'iris', text: 'Change the iris' },
		{ id: 'tone', text: 'Change the skin tone' },
		{ id: 'framing', text: 'Change the framing' },
		{ id: 'focus', text: 'Adjust the focus', desktop: true },
		{ id: 'volume', text: 'Set the volume' },
		{ id: 'snapshot', text: 'Take a snapshot' },
		{ id: 'eleven', text: 'Turn it up to eleven', achievement: true },
		{ id: 'photo', text: 'Give it some space', achievement: true, desktop: true },
		{
			id: 'titles',
			text: 'Look away. Again, and again',
			achievement: true,
			counted: true,
			desktop: true,
		},
		{ id: 'cannon', text: 'Do what you were told not to', achievement: true },
		{
			id: 'shots',
			text: 'Make it run out of words',
			achievement: true,
			counted: true,
			desktop: true,
		},
		{ id: 'secret', text: 'Wear every skin... what the hell!', achievement: true },
		{ id: 'blink', text: "Let's take another one", achievement: true },
		{
			id: 'uchiha',
			text: 'Meet the whole Uchiha clan',
			achievement: true,
			counted: true,
			desktop: true,
			hidden: true,
		},
		{
			id: 'rinnegan',
			text: 'See beyond the Sharingan',
			achievement: true,
			desktop: true,
			hidden: true,
		},
	].map((task) => Object.freeze(task)),
)

// The progress through `tasks`: `counts` holds the number of keys of each
// counted task ({ id: count }), `saved` a state() from before (anything else
// starts afresh; ids no task has are dropped, so a reordered or shortened
// list keeps what was done). Returns done(), the tasks done in the order they
// were done; current(), the first task not done, or null; count() and
// total(), the keys the current task has heard and needs (0 for one not
// counted); report(id, key), which returns 'done' when it completes the
// current task, 'counted' for a new key of a counted one, else null;
// reset(), back to the first task; and state(), to save.
export function createProgress(tasks, { counts = {}, saved = null } = {}) {
	const byId = new Map(tasks.map((task) => [task.id, task]))
	const done = [...new Set(Array.isArray(saved?.done) ? saved.done : [])].filter((id) =>
		byId.has(id),
	)
	const current = () => tasks.find((task) => !done.includes(task.id)) ?? null
	const total = () => {
		const task = current()
		return task?.counted ? Math.max(counts[task.id] ?? 1, 1) : 0
	}
	// The keys the current task has heard, kept only for the task they are
	// of.
	let keys = new Set(
		saved?.seen?.task === current()?.id && Array.isArray(saved.seen.keys) ? saved.seen.keys : [],
	)
	return {
		done: () => done.map((id) => byId.get(id)),
		current,
		count: () => keys.size,
		total,
		report(id, key) {
			const task = current()
			if (task?.id !== id) return null
			if (task.counted) {
				if (key === undefined || keys.has(key)) return null
				keys.add(key)
				if (keys.size < total()) return 'counted'
			}
			done.push(id)
			keys = new Set()
			return 'done'
		},
		reset() {
			done.length = 0
			keys = new Set()
		},
		state: () => ({ done: [...done], seen: { task: current()?.id ?? null, keys: [...keys] } }),
	}
}
