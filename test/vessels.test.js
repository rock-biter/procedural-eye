import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateVessels, SCLERA_PSI } from '../src/sclera/vesselGenerator'

const settings = { seed: 4, conjunctival: 20, episcleral: 10, tortuosity: 1 }

test('the vessel network is seeded, stays on the visible sclera and has both layers', () => {
	const a = generateVessels(settings, 12)
	const b = generateVessels(settings, 12)
	assert.deepEqual(a, b)
	assert.notDeepEqual(a, generateVessels({ ...settings, seed: 5 }, 12))
	const deep = a.filter((s) => s.depth === 1)
	const superficial = a.filter((s) => s.depth === 0)
	assert.ok(deep.length > 0 && superficial.length > 0)
	for (const s of a) {
		assert.ok(s.psi1 > SCLERA_PSI.min - 0.05 && s.psi1 < SCLERA_PSI.max + 0.05, `ψ ${s.psi1}`)
		assert.ok(s.width > 0 && s.width < 0.2)
	}
	// Episcleral vessels are wider on average than conjunctival ones.
	const mean = (list) => list.reduce((sum, s) => sum + s.width, 0) / list.length
	assert.ok(mean(deep) > mean(superficial))
})
