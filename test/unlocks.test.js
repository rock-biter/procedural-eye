import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KONAMI, UNLOCKS, createSequence, parseUnlocks } from '../src/ui/unlocks'

test('?unlock= names what it gives, all of it without a list, the Rinnegan with the Sharingan', () => {
	assert.deepEqual([...parseUnlocks(null)], [])
	assert.deepEqual([...parseUnlocks('')].sort(), [...UNLOCKS].sort())
	assert.deepEqual([...parseUnlocks('all')].sort(), [...UNLOCKS].sort())
	assert.deepEqual([...parseUnlocks('Tone')], ['tone'])
	assert.deepEqual([...parseUnlocks('sharingan, nope')], ['sharingan'])
	assert.deepEqual([...parseUnlocks('rinnegan')].sort(), ['rinnegan', 'sharingan'])
})

test('the Konami code matches only its whole sequence, also after a false start', () => {
	const konami = createSequence()
	const feed = (keys) => keys.map((key) => konami(key))
	assert.deepEqual(feed(['ArrowUp', 'ArrowUp', 'ArrowUp']), [false, false, false])
	// Three ups then the rest: the last two ups start it.
	const rest = KONAMI.slice(2).map((key) => (key.length === 1 ? key.toUpperCase() : key))
	assert.deepEqual(feed(rest), [...rest.slice(0, -1).map(() => false), true])
	// It starts again after a match.
	assert.equal(konami('a'), false)
	assert.deepEqual(feed(KONAMI.slice(0, 9)).includes(true), false)
	assert.equal(konami('x'), false)
	assert.deepEqual(feed([...KONAMI]).at(-1), true)
})
