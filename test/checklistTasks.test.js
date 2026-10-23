import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TASKS, createProgress } from '../src/ui/checklistTasks'

const counts = { titles: 3, shots: 2, uchiha: 4 }

test('the tasks are short, named once, the controls first, then the achievements', () => {
	assert.equal(new Set(TASKS.map((task) => task.id)).size, TASKS.length)
	for (const task of TASKS) assert.ok(task.text.length <= 32, task.id)
	const first = TASKS.findIndex((task) => task.achievement)
	assert.ok(first > 0)
	assert.ok(TASKS.slice(first).every((task) => task.achievement))
	assert.deepEqual(
		TASKS.filter((task) => task.counted).map((task) => task.id),
		['titles', 'shots', 'uchiha'],
	)
	// Phones and tablets leave out what only a desktop has.
	assert.deepEqual(
		TASKS.filter((task) => task.desktop).map((task) => task.id),
		['focus', 'photo', 'titles', 'shots', 'uchiha', 'rinnegan'],
	)
	// The Sharingan's tasks come last, hidden until the rest is done.
	assert.deepEqual(
		TASKS.filter((task) => task.hidden).map((task) => task.id),
		['uchiha', 'rinnegan'],
	)
	assert.ok(TASKS.slice(-2).every((task) => task.hidden))
})

test('only the task shown can be done, one after the other', () => {
	const progress = createProgress(TASKS, { counts })
	assert.equal(progress.current().id, 'iris')
	assert.equal(progress.report('tone'), null)
	assert.equal(progress.report('iris'), 'done')
	assert.equal(progress.report('iris'), null)
	assert.equal(progress.current().id, 'tone')
	assert.deepEqual(
		progress.done().map((task) => task.id),
		['iris'],
	)
	for (const task of TASKS.slice(1)) {
		if (!task.counted) assert.equal(progress.report(task.id), 'done')
		else for (let key = 0; key < counts[task.id]; key++) progress.report(task.id, key)
	}
	assert.equal(progress.current(), null)
	assert.equal(progress.done().length, TASKS.length)
	assert.equal(progress.report('iris'), null)
})

test('a counted task needs as many different keys as it is given', () => {
	const tasks = TASKS.filter((task) => task.id === 'titles')
	const progress = createProgress(tasks, { counts })
	assert.equal(progress.total(), 3)
	assert.equal(progress.report('titles'), null)
	assert.equal(progress.report('titles', 0), 'counted')
	assert.equal(progress.report('titles', 0), null)
	assert.equal(progress.report('titles', 2), 'counted')
	assert.equal(progress.count(), 2)
	assert.equal(progress.report('titles', 1), 'done')
	assert.equal(progress.total(), 0)
})

test('the progress comes back from its state, whatever the order of the tasks', () => {
	const progress = createProgress(TASKS, { counts })
	progress.report('iris')
	progress.report('tone')
	const saved = JSON.parse(JSON.stringify(progress.state()))
	const again = createProgress(TASKS, { counts, saved })
	assert.equal(again.current().id, 'framing')
	const reordered = [...TASKS].reverse()
	assert.deepEqual(
		createProgress(reordered, { counts, saved })
			.done()
			.map((task) => task.id),
		['iris', 'tone'],
	)

	// The keys a counted task heard come back for it only.
	const titles = TASKS.filter((task) => ['titles', 'shots'].includes(task.id))
	const counting = createProgress(titles, { counts })
	counting.report('titles', 1)
	const heard = JSON.parse(JSON.stringify(counting.state()))
	assert.equal(createProgress(titles, { counts, saved: heard }).count(), 1)
	assert.equal(createProgress([...titles].reverse(), { counts, saved: heard }).count(), 0)

	// Ids no task has, and states that are not one, start afresh.
	assert.deepEqual(createProgress(TASKS, { saved: { done: ['gone', 'iris'] } }).state().done, [
		'iris',
	])
	for (const saved of [null, {}, { done: 'iris' }, { seen: 3 }, []])
		assert.equal(createProgress(TASKS, { counts, saved }).current().id, 'iris')
})

test('a reset starts again from the first task', () => {
	const progress = createProgress(TASKS, { counts })
	for (const task of TASKS.slice(0, 8)) progress.report(task.id)
	progress.report('titles', 0)
	progress.reset()
	assert.equal(progress.current().id, 'iris')
	assert.equal(progress.done().length, 0)
	assert.deepEqual(progress.state(), { done: [], seen: { task: 'iris', keys: [] } })
})

test('the panel marks any task done or not, the keys kept only for the task still shown', () => {
	const progress = createProgress(TASKS, { counts })
	assert.equal(progress.set('nope', true), false)
	assert.equal(progress.set('tone', true), true)
	assert.equal(progress.set('tone', true), false)
	assert.equal(progress.current().id, 'iris')
	assert.equal(progress.set('iris', true), true)
	assert.equal(progress.current().id, 'framing')
	for (const task of TASKS.slice(2, 8)) progress.set(task.id, true)
	assert.equal(progress.current().id, 'titles')
	assert.equal(progress.report('titles', 0), 'counted')
	// Another task cleared before it: the keys go with the task shown.
	progress.set('iris', false)
	assert.equal(progress.current().id, 'iris')
	assert.equal(progress.count(), 0)
	assert.deepEqual(progress.state().seen, { task: 'iris', keys: [] })
	assert.equal(progress.set('iris', false), false)
})
