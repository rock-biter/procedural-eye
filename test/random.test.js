import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hash01, hashSeed, pcg } from '../src/random'

// pcg() is the twin of pcgHash() in src/shaders/common.glsl: these vectors are
// the values both must give (Jarzynski & Olano 2020, the 32-bit PCG hash).
const VECTORS = [
	[0, 129708002],
	[1, 2831084092],
	[2, 2055130248],
	[255, 2547402013],
	[12345, 4099845390],
	[0x7fffffff, 3919530446],
	[0x80000000, 566699590],
	[0xffffffff, 3861530882],
]

// The same hash in exact integer arithmetic (BigInt, modulo 2³²).
function referencePcg(value) {
	const mask = (1n << 32n) - 1n
	const state = (BigInt(value >>> 0) * 747796405n + 2891336453n) & mask
	const word = (((state >> ((state >> 28n) + 4n)) ^ state) * 277803737n) & mask
	return Number((word >> 22n) ^ word)
}

test('pcg gives the known vectors', () => {
	for (const [input, output] of VECTORS) assert.equal(pcg(input), output, `pcg(${input})`)
})

test('pcg matches the hash in exact integer arithmetic', () => {
	let value = 1
	for (let i = 0; i < 2000; i++) {
		value = (Math.imul(value, 1664525) + 1013904223) >>> 0
		assert.equal(pcg(value), referencePcg(value), `pcg(${value})`)
	}
})

test('pcg wraps its input to 32 bits and returns an unsigned integer', () => {
	assert.equal(pcg(-1), pcg(0xffffffff))
	assert.equal(pcg(2 ** 32 + 5), pcg(5))
	for (const [input] of VECTORS) {
		const output = pcg(input)
		assert.ok(Number.isInteger(output) && output >= 0 && output < 2 ** 32)
	}
})

test('hash01 chains pcg over its three integers into [0, 1)', () => {
	const expected = (a, b, c) =>
		referencePcg((referencePcg((referencePcg(a) + b) >>> 0) + c) >>> 0) / 4294967296
	for (const [a, b, c] of [
		[0, 0, 0],
		[1, 2, 3],
		[42, 7, 0],
		[0xffffffff, 0xffffffff, 0xffffffff],
	]) {
		const value = hash01(a, b, c)
		assert.equal(value, expected(a, b, c))
		assert.ok(value >= 0 && value < 1)
	}
	assert.equal(hash01(5), hash01(5, 0, 0))
})

test('hashSeed is FNV-1a', () => {
	assert.equal(hashSeed(''), 0x811c9dc5)
	assert.equal(hashSeed('a'), 0xe40c292c)
	assert.equal(hashSeed(1), hashSeed('1'))
})
