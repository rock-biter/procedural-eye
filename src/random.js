// Deterministic randomness for the pure generators. pcg() is the twin of
// pcgHash() in src/shaders/common.glsl (Jarzynski & Olano 2020), so CPU code
// and shaders draw the same numbers from the same seeds.
import Alea from 'alea'

// FNV-1a hash of a seed string.
export function hashSeed(seed) {
	let hash = 0x811c9dc5
	const text = String(seed)
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

// PCG hash of a 32-bit unsigned integer.
export function pcg(v) {
	const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
	const word = Math.imul((state >>> ((state >>> 28) + 4)) ^ state, 277803737) >>> 0
	return ((word >>> 22) ^ word) >>> 0
}

// PCG hash of up to three integers, as [0, 1) float (pcgHash01 in GLSL).
export function hash01(a, b = 0, c = 0) {
	return pcg((pcg((pcg(a >>> 0) + (b >>> 0)) >>> 0) + (c >>> 0)) >>> 0) / 4294967296
}

// Seeded stream of [0, 1) numbers for the CPU generators.
export function createRandom(seed) {
	return new Alea(String(seed))
}

// The key of `table` ([key, weight] pairs) at `value` in [0, 1) of the total weight.
export function pickWeighted(table, value) {
	let total = 0
	for (const [, weight] of table) total += weight
	let threshold = value * total
	for (const [type, weight] of table) {
		threshold -= weight
		if (threshold < 0) return type
	}
	return table[table.length - 1][0]
}

// Standard normal sample from two uniforms (Box-Muller).
export function gaussian(u1, u2) {
	return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2)
}
