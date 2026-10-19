// Shadow proxies (pure): lighter stand-ins for the casters of the key light's
// shadow and the light shafts' (the lids and the lashes,
// src/lighting/keyShadow.js), drawn only in the shadow passes. The shadow
// map's texels are 0.04 mm (accumulation samples) and 0.08 mm (interactive
// frames), so the casters need not be as fine as the meshes the camera sees.
// Each proxy vertex is a fixed blend of at most two of its mesh's vertices:
// the blink's frames of the mesh give the proxy's (proxyAttribute()), and its
// vertices follow the gaze as theirs do.
//
// A proxy: `sources` and `weights`, two of each per vertex, and `indices`,
// its triangles (the shadow passes draw both sides, so their winding does
// not matter).

// The lashes' proxy tube has 3 sides out of the tube's, its corners pushed
// out so that its width, averaged over the directions it is seen from (its
// perimeter over π), is the tube's: 3√3 R / π = 2 r, R = 1.21 r.
const LASH_SPREAD = (2 * Math.PI) / (3 * Math.sqrt(3))

function createBuilder() {
	const sources = []
	const weights = []
	return {
		indices: [],
		get count() {
			return sources.length / 2
		},
		// A vertex: `a`, or a blend of `a` and `b`.
		add(a, b = a, wa = 1, wb = 0) {
			sources.push(a, b)
			weights.push(wa, wb)
			return sources.length / 2 - 1
		},
		build() {
			return {
				sources: Int32Array.from(sources),
				weights: Float32Array.from(weights),
				indices: Uint32Array.from(this.indices),
			}
		},
	}
}

// The vertices of a grid kept at `columns` × `rows` (column-major from vertex
// `first`, `height` rows per column, cyclic around), and its quads.
function addGrid(builder, first, height, columns, rows) {
	const base = builder.count
	for (const i of columns) for (const j of rows) builder.add(first + i * height + j)
	const n = rows.length
	for (let a = 0; a < columns.length; a++) {
		const b = (a + 1) % columns.length
		for (let r = 0; r < n - 1; r++) {
			const [p, q] = [base + a * n + r, base + b * n + r]
			builder.indices.push(p, q, q + 1, p, q + 1, p + 1)
		}
	}
}

// Every other one of `from` to `to` (excluded), and the last.
function everyOther(from, to) {
	const kept = []
	for (let i = from; i < to; i += 2) kept.push(i)
	if (kept.at(-1) !== to - 1) kept.push(to - 1)
	return kept
}

// Every other one of `count` around a loop (the last one meets the first).
function aroundEveryOther(count) {
	return Array.from({ length: Math.ceil(count / 2) }, (_, k) => k * 2)
}

// The lid mesh's proxy (src/adnexa/lids.js merges the ring, the conjunctiva and
// the palpebral conjunctiva). `ring`: its columns, rows and layout
// (src/adnexa/lidGeometry.js lidLayout()); `conjunctiva`, `curtain`: their first
// vertex, columns and rows. Every other column of the ring (the curtain's,
// which hang from its posterior margin, the same): the lids then stray about
// 4 times as far from the surface as the mesh along the margin (36 µm), under
// a texel of the shadow map. Its intermarginal strip by its ends (it is
// straight) and every other row of the anterior edge, which turn with the
// gaze as a whole; every row of the skin: as the lids follow the gaze, their
// turn fades out across them (lid-follow.glsl), which bends the skin far more
// than at rest, and rows any sparser cast a lighter shadow on the eye looking
// up. Every other column and row of the conjunctiva (it shadows the globe as
// the upper lid lifts off it), the curtain by its top, its bottom and a row
// between.
export function lidShadowProxy({ ring, conjunctiva, curtain }) {
	const builder = createBuilder()
	const { strip, edge } = ring.layout
	const skin = strip + edge
	const rows = [
		0,
		...everyOther(strip, skin),
		...Array.from({ length: ring.rows - skin }, (_, k) => skin + k),
	]
	const columns = aroundEveryOther(ring.columns)
	addGrid(builder, 0, ring.rows, columns, rows)
	addGrid(
		builder,
		conjunctiva.first,
		conjunctiva.rows,
		aroundEveryOther(conjunctiva.columns),
		everyOther(0, conjunctiva.rows),
	)
	addGrid(builder, curtain.first, curtain.rows, columns, [
		0,
		Math.floor(curtain.rows / 2),
		curtain.rows - 1,
	])
	return builder.build()
}

// The lashes' proxy (src/adnexa/lashGenerator.js lashTubes(): per lash,
// `rings[n]` rings of `sides` vertices, one after the other): every other
// ring (and the tip's), 3 of the sides, pushed out (LASH_SPREAD) as blends of
// each side's vertex and the one opposite it.
export function lashShadowProxy(rings, sides) {
	const builder = createBuilder()
	const corners = [0, 1, 2].map((k) => Math.round((k * sides) / 3))
	const wa = (1 + LASH_SPREAD) / 2
	const wb = (1 - LASH_SPREAD) / 2
	let first = 0
	for (const count of rings) {
		const kept = everyOther(0, count)
		const base = builder.count
		for (const k of kept) {
			for (const j of corners) {
				const a = first + k * sides + j
				builder.add(a, first + k * sides + ((j + sides / 2) % sides), wa, wb)
			}
		}
		for (let r = 0; r < kept.length - 1; r++) {
			for (let c = 0; c < 3; c++) {
				const p = base + r * 3 + c
				const q = base + r * 3 + ((c + 1) % 3)
				builder.indices.push(p, q, q + 3, p, q + 3, p + 3)
			}
		}
		first += count * sides
	}
	return builder.build()
}

// An attribute of the mesh (`array`, `itemSize` values per vertex) on the
// proxy's vertices.
export function proxyAttribute(proxy, array, itemSize) {
	const count = proxy.sources.length / 2
	const out = new Float32Array(count * itemSize)
	for (let v = 0; v < count; v++) {
		const a = proxy.sources[v * 2] * itemSize
		const b = proxy.sources[v * 2 + 1] * itemSize
		const wa = proxy.weights[v * 2]
		const wb = proxy.weights[v * 2 + 1]
		for (let c = 0; c < itemSize; c++) {
			out[v * itemSize + c] = array[a + c] * wa + array[b + c] * wb
		}
	}
	return out
}
