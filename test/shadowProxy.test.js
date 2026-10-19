import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateLashes, LASH_SIDES, lashTubes } from '../src/adnexa/lashGenerator'
import {
	createConjunctivaMesh,
	createLidMesh,
	createPalpebralMesh,
} from '../src/adnexa/lidGeometry'
import { lashShadowProxy, lidShadowProxy, proxyAttribute } from '../src/adnexa/shadowProxy'
import { createEyeGeometry } from '../src/eye/eyeProfile'
import { createDefaults } from '../src/params/params'
import { BASE_PARAM_SCHEMA } from '../src/params/paramSchema'

const params = createDefaults(BASE_PARAM_SCHEMA)
const eye = createEyeGeometry(params)

test('the lids cast their shadow with under half their vertices, every row of the skin kept', () => {
	// As src/adnexa/lids.js merges them.
	const ring = createLidMesh(params.lids, eye, 1)
	const fornix = createConjunctivaMesh(params.lids, eye, 1)
	const curtain = createPalpebralMesh(params.lids, eye, 1, { layout: ring.layout })
	const columns = ring.rim.length / 3
	const rows = ring.positions.length / 3 / columns
	const first = ring.positions.length / 3
	const curtainFirst = first + fornix.positions.length / 3
	const curtainRows = curtain.positions.length / 3 / columns
	const proxy = lidShadowProxy({
		ring: { columns, rows, layout: ring.layout },
		conjunctiva: { first, columns: fornix.around, rows: fornix.across },
		curtain: { first: curtainFirst, rows: curtainRows },
	})
	const vertices = curtainFirst + curtain.positions.length / 3
	const count = proxy.sources.length / 2
	assert.ok(count < vertices / 2, `${count} of ${vertices} vertices`)
	// Each of its vertices is one of the mesh's.
	for (let v = 0; v < count; v++) {
		assert.equal(proxy.sources[v * 2], proxy.sources[v * 2 + 1])
		assert.equal(proxy.weights[v * 2], 1)
	}
	for (const index of proxy.indices) assert.ok(index < count)
	const kept = new Set(proxy.sources)
	// Every other column: the posterior margin, every row of the skin (it bends
	// as the lids follow the gaze) and the curtain's top (the margin it hangs
	// from) are all there.
	const skin = ring.layout.strip + ring.layout.edge
	for (let i = 0; i < columns; i += 2) {
		assert.ok(kept.has(i * rows), `margin ${i}`)
		for (let j = skin; j < rows; j++) assert.ok(kept.has(i * rows + j), `skin ${i}, ${j}`)
		assert.ok(kept.has(curtainFirst + i * curtainRows), `curtain ${i}`)
	}
	// And the conjunctiva, every other column of it.
	for (let i = 0; i < fornix.around; i += 2) assert.ok(kept.has(first + i * fornix.across))
})

test("the lashes cast their shadow with 3-sided tubes on every other ring, as wide as the lashes'", () => {
	const lashes = generateLashes(params, eye)
	const tubes = lashTubes(lashes)
	const proxy = lashShadowProxy(
		lashes.map((lash) => lash.points.length),
		LASH_SIDES,
	)
	const positions = proxyAttribute(proxy, tubes.positions, 3)
	assert.ok(positions.length < tubes.positions.length / 3)
	const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
	// Every other ring and the tip's: 3 corners 120° apart around the lash's
	// centerline, 1.21 times the tube's radius off it, so the proxy's width
	// averaged over its directions is the tube's.
	let ring = 0
	let vertex = 0
	for (const lash of lashes) {
		const rings = lash.points.length
		const kept = []
		for (let k = 0; k < rings; k += 2) kept.push(k)
		if (kept.at(-1) !== rings - 1) kept.push(rings - 1)
		for (const k of kept) {
			const center = lash.points[k]
			const radius = distance(tubes.positions.subarray((ring + k) * LASH_SIDES * 3), center)
			const corners = [0, 1, 2].map((c) =>
				positions.subarray((vertex + c) * 3, (vertex + c) * 3 + 3),
			)
			for (const corner of corners) {
				assert.ok(Math.abs(distance(corner, center) - 1.209 * radius) < 1e-3 * radius + 1e-6)
			}
			const side = distance(corners[0], corners[1])
			assert.ok(Math.abs(distance(corners[1], corners[2]) - side) < 1e-5)
			assert.ok(Math.abs(side - 1.209 * radius * Math.sqrt(3)) < 1e-3 * radius + 1e-6)
			vertex += 3
		}
		ring += rings
	}
	assert.equal(vertex, positions.length / 3)
	// The blink's frames move the proxy as they move the lashes: a frame of the
	// tubes gives the proxy's frame.
	const moved = tubes.positions.map((value, i) => value + (i % 3 === 1 ? -2 : 0))
	const frame = proxyAttribute(proxy, moved, 3)
	for (let i = 0; i < frame.length; i++) {
		assert.ok(Math.abs(frame[i] - (positions[i] + (i % 3 === 1 ? -2 : 0))) < 1e-5)
	}
})
