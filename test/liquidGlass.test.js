import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GLASS, glassDisplacement } from '../src/ui/liquidGlass'

const texel = ({ data, columns }, column, row) => {
	const i = (row * columns + column) * 4
	return [data[i] - 128, data[i + 1] - 128]
}

test('the glass bends the rim toward the axis and leaves the middle and the corners', () => {
	const map = glassDisplacement(120, 44, GLASS)
	assert.equal(map.columns, 120)
	assert.equal(map.rows, 44)
	assert.deepEqual(texel(map, 60, 22), [0, 0], 'middle')
	assert.deepEqual(texel(map, 0, 0), [0, 0], 'corner, outside the pill')
	const [, top] = texel(map, 60, 0)
	const [, bottom] = texel(map, 60, 43)
	const [left] = texel(map, 0, 22)
	const [right] = texel(map, 119, 22)
	// The outer texels sit half a pixel inside the rim.
	assert.ok(top > 64 && bottom < -64, `top ${top}, bottom ${bottom}`)
	assert.ok(left > 64 && right < -64, `left ${left}, right ${right}`)
})

test('the bend fades across the bevel', () => {
	const map = glassDisplacement(44, 44, GLASS)
	const offsets = [0, 2, 5, 10, GLASS.bezel].map((row) => texel(map, 22, row)[1])
	for (let i = 1; i < offsets.length; i++) assert.ok(offsets[i] <= offsets[i - 1], `${offsets}`)
	assert.equal(offsets.at(-1), 0)
})
