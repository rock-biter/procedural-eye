import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EYE, SHOTS, createShotLog, terminatorEye, terminatorLog } from '../src/ui/consoleArt'
import { createRandom } from '../src/random'

test("the T-800's eye is round in the console's cells, its core in the middle", () => {
	const eye = terminatorEye()
	const radius = EYE.chrome[0]
	const middle = (eye.length - 1) / 2
	eye.forEach((row, i) => {
		assert.equal(row.length, eye[0].length)
		// The chrome ring's outer edge on each row: a circle of the radius in
		// rows, `aspect` times as wide in columns, within a cell.
		const first = row.findIndex((part) => part !== 'space')
		const half = (row.length - 1) / 2 - first
		const y = i - middle
		assert.ok(Math.abs(half - EYE.aspect * Math.sqrt(radius ** 2 - y ** 2)) <= 1, `row ${i}`)
		assert.equal(row[(row.length - 1) / 2 - half], row[(row.length - 1) / 2 + half])
	})
	assert.equal(eye.length, 2 * Math.floor(radius) + 1)
	assert.equal(eye[middle][(eye[0].length - 1) / 2], 'core')
	const parts = new Set(eye.flat())
	for (const part of ['light', 'shade', 'tooth', 'rim', 'red', 'glow', 'core', 'highlight'])
		assert.ok(parts.has(part), part)
})

test('the console draws a black rectangle of styled runs, with the warnings', () => {
	const [format, ...styles] = terminatorLog()
	assert.equal(format.split('%c').length - 1, styles.length)
	assert.ok(styles.every((style) => style.includes('background:#')))
	const lines = format.replaceAll('%c', '').split('\n')
	assert.ok(lines.every((line) => line.length === lines[0].length))
	assert.ok(format.includes("I'LL BE BACK."))
	assert.ok(format.includes('DO NOT MISTREAT THE VOLUME'))
	assert.ok(!format.replaceAll('%c', '').includes('%'))
})

test('the shots are numbered, the first told, then every line once before any again', () => {
	const log = createShotLog(createRandom('shots'))
	const shot = () =>
		log
			.next()[0]
			.match(/SHOT (\d+) · (.*?) {2}$/)
			.slice(1)
	assert.equal(log.line, null)
	assert.deepEqual(shot(), ['1', 'I TOLD YOU NOT TO LET GO.'])
	assert.equal(log.line, 'I TOLD YOU NOT TO LET GO.')
	const lines = []
	for (let i = 0; i < SHOTS.length * 3; i++) {
		const [count, line] = shot()
		assert.equal(Number(count), i + 2)
		assert.equal(log.line, line)
		lines.push(line)
	}
	for (let turn = 0; turn < 3; turn++) {
		const lap = lines.slice(turn * SHOTS.length, (turn + 1) * SHOTS.length)
		assert.deepEqual([...lap].sort(), [...SHOTS].sort())
	}
	lines.slice(1).forEach((line, i) => assert.notEqual(line, lines[i]))
})
