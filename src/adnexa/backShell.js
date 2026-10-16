// The back shell (pure): closes the skin patch behind, so the posterior
// structures of the eye (the globe past the lids, the conjunctiva and the
// palpebral conjunctiva, which reach behind the face) never show from the
// side. World millimeters at primary gaze, as src/adnexa/lidGeometry.js.
//
// From the patch's edge (the lid mesh's outer row, on the ellipse LID_PATCH in
// the front plane) a flat band runs straight back `shell.band` mm: the cut edge
// of the patch. From the band's back edge a dome bulges behind the edge's
// membrane, the smoothest surface through the edge (harmonic in the ellipse's
// normalized coordinates). The dome's profile is a spherical cap that leaves
// the band at an angle, so the band keeps an edge on both sides. It is as
// deep as it must be to pass `shell.clearance` behind everything it encloses:
// the globe, whose mesh reaches past the equator and turns with the gaze (so
// its whole back), and the lids, the conjunctiva and the palpebral
// conjunctiva, the parts that follow the gaze at either end of their travel.
import { LID_PATCH } from './lidGeometry'

// Half-angle of the dome's spherical cap: it leaves the band this far off the
// front plane, steeper with the depth.
const CAP_ANGLE = (50 * Math.PI) / 180
// The gaze pitch (degrees) at either end of the lids' follow
// (src/animation/animator.js: 0.9 of it on the upper lid, 0.35 on the lower).
const FOLLOW_PITCH = 35
// Lid vertices nearer the edge than this normalized radius stand on the band.
const EDGE_ZONE = 0.95
// Tessellation: rings from the edge to the pole, and columns of the inner
// rings (the edge ring keeps the lid mesh's columns).
const RINGS = 40
const COLUMNS = 128
// Distance from the margin (mm) the skin program reads on the shell: far from
// it, so nothing of the lids (wetness, the lash line, the fine lines) shows.
export const SHELL_MARGIN_DISTANCE = 60

const TAU = Math.PI * 2

// Normalized cap profile: 1 at the pole, 0 at the edge.
function cap(rho) {
	const s = Math.sin(CAP_ANGLE)
	const c = Math.cos(CAP_ANGLE)
	return (Math.sqrt(1 - s * s * rho * rho) - c) / (1 - c)
}

// The membrane through the edge: heights `z` at angles `theta` (normalized
// coordinates) extended inward as a harmonic function, a Fourier series in
// the angle whose terms fade as ρⁿ, corrected to the exact heights at the edge
// (the correction fades as ρ¹⁶).
function edgeMembrane(theta, z, harmonics = 32) {
	const order = theta.map((_, i) => i).sort((i, j) => theta[i] - theta[j])
	const angles = order.map((i) => theta[i])
	const heights = order.map((i) => z[i])
	const n = angles.length
	// The edge height at any angle, linear between the samples (cyclic).
	const edge = (angle) => {
		const t = angles[0] + ((((angle - angles[0]) % TAU) + TAU) % TAU)
		let lo = 0
		let hi = n
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1
			if (angles[mid] <= t) lo = mid
			else hi = mid
		}
		const a0 = angles[lo]
		const a1 = lo + 1 < n ? angles[lo + 1] : angles[0] + TAU
		const f = a1 > a0 ? (t - a0) / (a1 - a0) : 0
		return heights[lo] + (heights[(lo + 1) % n] - heights[lo]) * f
	}
	const samples = 512
	const cosines = new Float64Array(harmonics + 1)
	const sines = new Float64Array(harmonics + 1)
	for (let k = 0; k < samples; k++) {
		const angle = (k / samples) * TAU
		const height = edge(angle)
		for (let m = 0; m <= harmonics; m++) {
			cosines[m] += (2 / samples) * height * Math.cos(m * angle)
			sines[m] += (2 / samples) * height * Math.sin(m * angle)
		}
	}
	return (rho, angle) => {
		const c1 = Math.cos(angle)
		const s1 = Math.sin(angle)
		let cm = 1
		let sm = 0
		let power = 1
		let inside = cosines[0] / 2
		let atEdge = inside
		for (let m = 1; m <= harmonics; m++) {
			const c = cm * c1 - sm * s1
			sm = sm * c1 + cm * s1
			cm = c
			power *= rho
			const term = cosines[m] * cm + sines[m] * sm
			inside += power * term
			atEdge += term
		}
		return inside + rho ** 16 * (edge(angle) - atEdge)
	}
}

// Normalized radius and angle of (x, y) in the patch's ellipse.
function polar(x, y) {
	const u = x / LID_PATCH.width
	const v = y / LID_PATCH.height
	return [Math.hypot(u, v), Math.atan2(v, u)]
}

// The shell's dome for the patch's edge `rim` (points in loop order), the eye,
// the shell settings and the `parts` it encloses ({ positions, follow }: the
// lid meshes' data; `follow` = (upper share, follow weight), or none). Returns
// `depth`, how far (mm) the dome bulges behind the band, `point(rho, angle)`
// on it and `heightAt(x, y)`.
export function backShellSurface(rim, eye, shell, parts = []) {
	const count = rim.length / 3
	const theta = []
	const z = []
	for (let i = 0; i < count; i++) {
		theta.push(polar(rim[i * 3], rim[i * 3 + 1])[1])
		z.push(rim[i * 3 + 2])
	}
	const membrane = edgeMembrane(theta, z)
	// The depth that keeps each point `clearance` in front of the dome.
	let depth = 0
	const enclose = (x, y, pz, clearance, zone = 1) => {
		const [rho, angle] = polar(x, y)
		if (rho >= zone) return
		const needed = (membrane(rho, angle) - shell.band - pz + clearance) / cap(rho)
		if (needed > depth) depth = needed
	}
	// The globe's back, at any gaze.
	const R = eye.scleraRadius
	for (let r = 0; r < R; r += 0.5) {
		for (let k = 0; k < 64; k++) {
			const angle = (k / 64) * TAU
			enclose(r * Math.cos(angle), r * Math.sin(angle), -Math.sqrt(R * R - r * r), shell.clearance)
		}
	}
	// The lid meshes, those vertices that follow the gaze also at either end
	// of their travel (lid-follow.glsl). The lids' skin near the edge stands on
	// the band.
	const pitch = (FOLLOW_PITCH * Math.PI) / 180
	for (const { positions, follow } of parts) {
		for (let v = 0; v < positions.length / 3; v++) {
			const [x, y, pz] = positions.subarray(v * 3, v * 3 + 3)
			enclose(x, y, pz, shell.clearance, EDGE_ZONE)
			const weight = follow ? follow[v * 2 + 1] : 0
			if (weight === 0) continue
			const share = follow[v * 2]
			for (const sign of [-1, 1]) {
				const angle = -sign * pitch * (0.35 + 0.55 * share) * weight
				const c = Math.cos(angle)
				const s = Math.sin(angle)
				enclose(x, c * y - s * pz, s * y + c * pz, shell.clearance, EDGE_ZONE)
			}
		}
	}
	const point = (rho, angle) => [
		rho * LID_PATCH.width * Math.cos(angle),
		rho * LID_PATCH.height * Math.sin(angle),
		membrane(rho, angle) - shell.band - depth * cap(rho),
	]
	return {
		depth,
		point,
		// The dome's height under (x, y), inside the patch.
		heightAt: (x, y) => {
			const [rho, angle] = polar(x, y)
			return point(Math.min(rho, 1), angle)[2]
		},
	}
}

// Inward unit normal of the patch's ellipse at (x, y) on it.
function inward(x, y) {
	const { width, height } = LID_PATCH
	const nx = -x / (width * width)
	const ny = -y / (height * height)
	const length = Math.hypot(nx, ny) || 1
	return [nx / length, ny / length]
}

// Mesh data of the back shell: the band from the patch's edge `rim` (the lid
// mesh's `rim`) and the dome around `parts` (backShellSurface()), front faces
// outward. Attributes as the lid mesh's (src/adnexa/lidGeometry.js), for the
// skin program: `lid` = (0, 1, SHELL_MARGIN_DISTANCE, 0), `relief` = (the
// outward direction in the front plane, no grooves, mid-margin), `follow` = 0
// (it stays put), `ao` = 1; and `coords`, the skin's pattern coordinates
// (mm): the band and the dome unrolled into the front plane, the dome by the
// arc length along its meridians, so the pattern is not stretched where they
// turn away from the front, continuous from the patch's edge over the band and
// onto the dome.
export function createBackShell(rim, eye, shell, parts = []) {
	const surface = backShellSurface(rim, eye, shell, parts)
	const count = rim.length / 3
	// The edge's columns by angle, counter-clockwise seen from the front.
	const edge = []
	for (let i = 0; i < count; i++) {
		const [x, y, z] = rim.subarray(i * 3, i * 3 + 3)
		edge.push({ x, y, z, angle: polar(x, y)[1] })
	}
	edge.sort((a, b) => a.angle - b.angle)
	const vertices = 2 * count + count + (RINGS - 1) * COLUMNS + 1
	const positions = new Float32Array(vertices * 3)
	const coords = new Float32Array(vertices * 2)
	const relief = new Float32Array(vertices * 4)
	let v = 0
	const push = (position, coord, direction) => {
		positions.set(position, v * 3)
		coords.set(coord, v * 2)
		relief.set([direction[0], direction[1], 0, 0.5], v * 4)
		return v++
	}
	// The band's back edge in the skin coordinates: `band` inward of the edge.
	const backCoord = (x, y) => {
		const [ix, iy] = inward(x, y)
		return [x + ix * shell.band, y + iy * shell.band]
	}
	const outward = (x, y) => inward(x, y).map((c) => -c)
	// The band: its front ring on the edge, its back ring `band` behind.
	const front = []
	const back = []
	for (const p of edge) {
		front.push(push([p.x, p.y, p.z], [p.x, p.y], outward(p.x, p.y)))
		back.push(push([p.x, p.y, p.z - shell.band], backCoord(p.x, p.y), outward(p.x, p.y)))
	}
	// The dome: the edge ring (the band's back ring, its own vertices: the
	// edge between them stays sharp), the inner rings and the pole. Its skin
	// coordinates run from the pole to the band's back edge along each
	// meridian, by arc length.
	const rings = [
		edge.map((p) => push([p.x, p.y, p.z - shell.band], backCoord(p.x, p.y), outward(p.x, p.y))),
	]
	const inner = Array.from({ length: RINGS - 1 }, () => [])
	for (let j = 0; j < COLUMNS; j++) {
		const angle = (j / COLUMNS) * TAU
		// The meridian from the edge (k = 0) to the pole (k = RINGS), and the
		// arc length from the pole to each of its rings.
		const points = []
		for (let k = 0; k <= RINGS; k++) points.push(surface.point(1 - k / RINGS, angle))
		const lengths = new Float64Array(RINGS + 1)
		for (let k = RINGS - 1; k >= 0; k--) {
			const [ax, ay, az] = points[k]
			const [bx, by, bz] = points[k + 1]
			lengths[k] = lengths[k + 1] + Math.hypot(ax - bx, ay - by, az - bz)
		}
		const [ex, ey] = points[0]
		const end = backCoord(ex, ey)
		for (let k = 1; k < RINGS; k++) {
			const share = lengths[k] / lengths[0]
			inner[k - 1].push(push(points[k], [end[0] * share, end[1] * share], outward(ex, ey)))
		}
	}
	rings.push(...inner)
	const pole = push(surface.point(0, 0), [0, 0], [1, 0])

	const triangles = []
	// Outward faces: the band faces away from the patch's center, the dome
	// backward (clockwise seen from the front).
	for (let i = 0; i < count; i++) {
		const next = (i + 1) % count
		triangles.push(front[i], back[i], front[next], front[next], back[i], back[next])
	}
	const dome = (a, b, c) => triangles.push(a, c, b)
	// The edge ring onto the first inner ring: their columns differ, so they
	// are zipped by angle.
	zip(
		rings[0],
		edge.map((p) => p.angle),
		rings[1],
		Array.from({ length: COLUMNS }, (_, j) => (j / COLUMNS) * TAU),
		dome,
	)
	for (let k = 1; k < RINGS - 1; k++) {
		for (let j = 0; j < COLUMNS; j++) {
			const next = (j + 1) % COLUMNS
			const a = rings[k][j]
			const b = rings[k][next]
			const c = rings[k + 1][next]
			const d = rings[k + 1][j]
			dome(a, b, c)
			dome(a, c, d)
		}
	}
	const last = rings[RINGS - 1]
	for (let j = 0; j < COLUMNS; j++) dome(last[j], last[(j + 1) % COLUMNS], pole)

	const lid = new Float32Array(vertices * 4)
	for (let i = 0; i < vertices; i++) lid.set([0, 1, SHELL_MARGIN_DISTANCE, 0], i * 4)
	return {
		positions,
		coords,
		lid,
		relief,
		follow: new Float32Array(vertices * 2),
		ao: new Float32Array(vertices).fill(1),
		indices: new Uint32Array(triangles),
		depth: surface.depth,
		heightAt: surface.heightAt,
	}
}

// Triangles between an outer ring and an inner one, both counter-clockwise
// (seen from the front), their vertices at the given angles (radians): each
// triangle counter-clockwise.
function zip(outer, outerAngles, inner, innerAngles, emit) {
	const start = outerAngles[0]
	const relative = (angle) => (((angle - start) % TAU) + TAU) % TAU
	const a = [...outerAngles.map(relative), TAU]
	const outerSequence = [...outer, outer[0]]
	// The inner ring from its column at or just before the outer ring's first.
	const order = inner
		.map((_, j) => j)
		.sort((i, j) => relative(innerAngles[i]) - relative(innerAngles[j]))
	const lastInner = order[order.length - 1]
	const b = [relative(innerAngles[lastInner]) - TAU, ...order.map((j) => relative(innerAngles[j]))]
	const innerSequence = [inner[lastInner], ...order.map((j) => inner[j])]
	const n = outer.length
	const m = inner.length
	let i = 0
	let j = 0
	while (i < n || j < m) {
		if (j >= m || (i < n && a[i + 1] < b[j + 1])) {
			emit(outerSequence[i], outerSequence[i + 1], innerSequence[j])
			i++
		} else {
			emit(outerSequence[i], innerSequence[j + 1], innerSequence[j])
			j++
		}
	}
}
