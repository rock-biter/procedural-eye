import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	PALETTE,
	PATTERNS,
	PATTERN_NAMES,
	PATTERN_TEXELS,
	SHAPE_TERMS,
	SHAPE_TEXELS,
	SHARINGAN_COPIES,
	SHARINGAN_PUPIL,
	SHARINGAN_SHAPES,
	glide,
	glideDone,
	glideValue,
	packPatterns,
	paintPattern,
	patternIndex,
	pickPattern,
	shapeBounds,
	shapeDistance,
} from '../src/eye/sharinganPatterns'
import { createRandom } from '../src/random'

const at = (r, angle) => [
	r * Math.cos((angle * Math.PI) / 180),
	r * Math.sin((angle * Math.PI) / 180),
]
// The palette entry painted most at (x, y).
const colorAt = (pattern, x, y) => {
	const weights = paintPattern(pattern, x, y, 1e-4)
	return weights.indexOf(Math.max(...weights))
}

test('the eighteen Sharingan of the reference and the Rinnegan, each named once', () => {
	const sharingan = PATTERNS.filter((pattern) => !pattern.rinnegan)
	assert.equal(sharingan.length, 18)
	assert.deepEqual(
		PATTERNS.filter((pattern) => pattern.rinnegan).map((pattern) => pattern.name),
		['rinnegan'],
	)
	assert.equal(new Set(PATTERN_NAMES).size, PATTERNS.length)
	for (const name of ['tomoe-1', 'tomoe-2', 'tomoe-3', 'itachi', 'sasuke-eternal', 'madara'])
		assert.ok(PATTERN_NAMES.includes(name), name)
	assert.equal(patternIndex('itachi'), PATTERN_NAMES.indexOf('itachi'))
	assert.equal(patternIndex(null), -1)
})

test('every pattern fits the shader: shapes, terms and copies within their bounds', () => {
	for (const pattern of PATTERNS) {
		assert.ok(pattern.shapes.length <= SHARINGAN_SHAPES, pattern.name)
		for (const shape of pattern.shapes) {
			assert.ok(shape.terms.length >= 1 && shape.terms.length <= SHAPE_TERMS, pattern.name)
			assert.ok(shape.count >= 1 && shape.count <= SHARINGAN_COPIES, pattern.name)
			assert.ok(Object.values(PALETTE).includes(shape.color), pattern.name)
		}
	}
})

test('the packed rows hold each pattern as paintPattern() reads it', () => {
	const data = packPatterns()
	assert.equal(data.length, PATTERNS.length * PATTERN_TEXELS * 4)
	PATTERNS.forEach((pattern, row) => {
		const base = row * PATTERN_TEXELS * 4
		assert.equal(data[base], pattern.shapes.length)
		assert.equal(data[base + 1], pattern.base)
		assert.equal(data[base + 2], pattern.rinnegan ? 1 : 0)
		pattern.shapes.forEach((shape, i) => {
			const offset = base + (1 + SHAPE_TEXELS * i) * 4
			let code = data[offset]
			assert.ok(Number.isInteger(code))
			assert.equal(code % 8, shape.color)
			code = Math.floor(code / 8)
			for (let k = 0; k < SHAPE_TERMS; k++) {
				const term = shape.terms[k]
				assert.equal(code % 8, term ? term.kind : 0)
				code = Math.floor(code / 8)
				if (term) {
					const texel = Array.from(data.subarray(offset + 4 * (k + 2), offset + 4 * (k + 3)))
					const expected = [term.a, term.b, term.c, term.width].map(Math.fround)
					assert.deepEqual(texel, expected)
				}
			}
			assert.equal(data[offset + 1], shape.count)
		})
	})
})

test('the tomoe patterns have as many tomoe on their ring, in red, inside a dark rim', () => {
	for (const count of [1, 2, 3]) {
		const pattern = PATTERNS[patternIndex(`tomoe-${count}`)]
		// Around the ring, the runs of ink (the tomoe's heads and tails).
		let runs = 0
		let last = colorAt(pattern, ...at(0.52, 0))
		const first = last
		for (let angle = 1; angle <= 360; angle++) {
			const color = colorAt(pattern, ...at(0.6, angle))
			if (color === PALETTE.ink && last !== PALETTE.ink) runs++
			last = color
		}
		if (first === PALETTE.ink && last === PALETTE.ink) runs = Math.max(runs, 1)
		assert.equal(runs, count, `tomoe-${count}`)
		assert.equal(colorAt(pattern, ...at(0.35, 0)), PALETTE.red)
		assert.equal(colorAt(pattern, ...at(0.99, 45)), PALETTE.ink)
	}
})

test('the Rinnegan is lavender, violet around the pupil, ringed', () => {
	const rinnegan = PATTERNS[patternIndex('rinnegan')]
	assert.equal(rinnegan.base, PALETTE.lavender)
	assert.equal(colorAt(rinnegan, ...at(SHARINGAN_PUPIL + 0.05, 235)), PALETTE.violet)
	assert.equal(colorAt(rinnegan, ...at(0.64, 235)), PALETTE.lavender)
	assert.equal(colorAt(rinnegan, ...at(0.74, 235)), PALETTE.ink)
})

test('every shape lies within its bounds, which the shader skips it outside', () => {
	for (const pattern of PATTERNS) {
		for (const shape of pattern.shapes) {
			const [low, high] = shapeBounds(shape)
			for (let r = 0; r <= 1.1; r += 0.01) {
				if (r >= low && r <= high) continue
				for (let angle = 0; angle < 360; angle += 2)
					assert.ok(shapeDistance(shape, ...at(r, angle)) >= -1e-9, `${pattern.name} at ${r}`)
			}
		}
	}
})

test('a shape repeats around the center: every copy as near as the first', () => {
	const shape = PATTERNS[patternIndex('tomoe-3')].shapes[1]
	for (const angle of [10, 130, 250]) {
		const d = shapeDistance(shape, ...at(0.6, angle))
		assert.ok(Math.abs(d - shapeDistance(shape, ...at(0.6, angle + 120))) < 1e-9)
	}
})

test('the button never picks the pattern shown, and the Rinnegan with its odds', () => {
	const random = createRandom('sharingan')
	const rinnegan = patternIndex('rinnegan')
	let current = -1
	let rinnegans = 0
	const draws = 20000
	for (let i = 0; i < draws; i++) {
		const next = pickPattern(current, random, 0.02)
		assert.notEqual(next, current)
		assert.ok(next >= 0 && next < PATTERNS.length)
		if (next === rinnegan) rinnegans++
		current = next
	}
	assert.ok(Math.abs(rinnegans / draws - 0.02) < 0.006, `${rinnegans}`)
	assert.notEqual(
		pickPattern(rinnegan, () => 0, 1),
		rinnegan,
	)
	assert.equal(
		pickPattern(0, () => 0, 1),
		rinnegan,
	)
})

test('a glide runs from its start to its target over its duration, then holds', () => {
	const g = glide(2, 5, 1, 'out')
	assert.equal(glideValue(g), 2)
	assert.ok(!glideDone(g))
	let last = 2
	for (let i = 1; i <= 10; i++) {
		g.time = i / 10
		const value = glideValue(g)
		assert.ok(value >= last && value <= 5)
		last = value
	}
	assert.equal(glideValue(g), 5)
	assert.ok(glideDone(g))
	g.time = 4
	assert.equal(glideValue(g), 5)
	const instant = glide(1, 3, 0)
	assert.ok(glideDone(instant))
	assert.equal(glideValue(instant), 3)
})
