// The back shell (pure): closes the skin patch behind, so the posterior
// structures of the eye (the globe past the lids, the conjunctiva and the
// palpebral conjunctiva, which reach behind the face) never show from the
// side. World millimeters at primary gaze, as src/adnexa/lidGeometry.js.
//
// From the patch's edge (the lid mesh's outer row, on the ellipse LID_PATCH in
// the front plane) a flat band runs straight back `shell.band` mm: the cut edge
// of the patch. From the band's back edge the dome follows the face the lids
// turn into (lidGeometry.js' `face`, smoothed, which bridges the eye), set
// back by a thickness that grows from nothing at the band toward the middle
// as a spherical cap: it leaves the band at an angle, so the band keeps an
// edge on both sides. The thickness is the least that keeps `shell.clearance`
// behind what can show: the lids, also as they follow the gaze, and the globe
// in front of its cut (GLOBE_CUT). What lies further back and never shows is
// cut or brought inside instead: the globe behind the cut (in its program),
// the conjunctiva's fornix and the palpebral conjunctiva's deep end
// (keepInside()).
import { LID_PATCH } from './lidGeometry'

// The plane behind which the globe is not drawn (eyeball-sclera-fragment.glsl),
// in front of its center by this share of its radius (2.4 mm by default),
// world z. The globe turns with the gaze, so its mesh reaches past the
// equator; behind the plane it lies under the conjunctiva, which leaves it at
// 0.96 of its radius (0.28 of it in front of the center), and never shows
// through the opening.
export const GLOBE_CUT = 0.2
// Half-angle of the thickness' spherical cap: the dome leaves the band this
// far off the face, more with the thickness.
const CAP_ANGLE = (50 * Math.PI) / 180
// The gaze pitch (degrees) at either end of the lids' follow
// (src/animation/animator.js: 0.9 of it on the upper lid, 0.35 on the lower):
// the eye that looks at the camera follows it up to its elevation limit.
const FOLLOW_PITCH = 60
// Lid vertices nearer the edge than this normalized radius stand on the band.
const EDGE_ZONE = 0.95
// The face is sampled on a grid this fine (mm), read bilinearly, and smoothed
// by a Gaussian this wide (mm): the dome follows the face's shape, not its
// every bump.
const FACE_STEP = 0.5
const FACE_SMOOTHING = 6
// Tessellation: rings from the edge to the pole, and columns of the inner
// rings (the edge ring keeps the lid mesh's columns).
const RINGS = 40
const COLUMNS = 128
// Distance from the margin (mm) the skin program reads on the shell: far from
// it, so nothing of the lids (wetness, the lash line, the fine lines) shows.
export const SHELL_MARGIN_DISTANCE = 60

const TAU = Math.PI * 2

// The turns about the X axis (radians) of vertex `v` at rest and at either
// end of the lids' follow (lid-follow.glsl), `follow` = (upper share, follow
// weight) per vertex.
function followTurns(follow, v) {
	const weight = follow ? follow[v * 2 + 1] : 0
	if (weight === 0) return [0]
	const turn = ((FOLLOW_PITCH * Math.PI) / 180) * (0.35 + 0.55 * follow[v * 2]) * weight
	return [0, turn, -turn]
}

// Normalized cap profile: 1 at the pole, 0 at the edge.
function cap(rho) {
	const s = Math.sin(CAP_ANGLE)
	const c = Math.cos(CAP_ANGLE)
	return (Math.sqrt(1 - s * s * rho * rho) - c) / (1 - c)
}

// Normalized radius and angle of (x, y) in the patch's ellipse.
function polar(x, y) {
	const u = x / LID_PATCH.width
	const v = y / LID_PATCH.height
	return [Math.hypot(u, v), Math.atan2(v, u)]
}

// The edge's height at any angle (normalized coordinates), linear between
// the points of `rim` (cyclic).
function edgeHeight(rim) {
	const count = rim.length / 3
	const samples = []
	for (let i = 0; i < count; i++) {
		samples.push([polar(rim[i * 3], rim[i * 3 + 1])[1], rim[i * 3 + 2]])
	}
	samples.sort((a, b) => a[0] - b[0])
	const first = samples[0][0]
	return (angle) => {
		const t = first + ((((angle - first) % TAU) + TAU) % TAU)
		let lo = 0
		let hi = count
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1
			if (samples[mid][0] <= t) lo = mid
			else hi = mid
		}
		const [a0, z0] = samples[lo]
		const [a1, z1] = lo + 1 < count ? samples[lo + 1] : [first + TAU, samples[0][1]]
		return z0 + ((z1 - z0) * (t - a0)) / (a1 - a0 || 1)
	}
}

// The face over the patch, sampled on a grid, smoothed (a separable Gaussian)
// and read bilinearly.
function smoothedFace(face) {
	const { width, height } = LID_PATCH
	const columns = Math.ceil((2 * width) / FACE_STEP) + 3
	const rows = Math.ceil((2 * height) / FACE_STEP) + 3
	const x0 = -width - FACE_STEP
	const y0 = -height - FACE_STEP
	let grid = new Float64Array(columns * rows)
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < columns; i++)
			grid[j * columns + i] = face(x0 + i * FACE_STEP, y0 + j * FACE_STEP)
	}
	const radius = Math.ceil((3 * FACE_SMOOTHING) / FACE_STEP)
	const kernel = []
	for (let k = -radius; k <= radius; k++) {
		kernel.push(Math.exp(-0.5 * ((k * FACE_STEP) / FACE_SMOOTHING) ** 2))
	}
	const total = kernel.reduce((sum, w) => sum + w, 0)
	// Clamped at the grid's border, which lies past the patch's edge.
	const blur = (source, di, dj) => {
		const out = new Float64Array(source.length)
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i < columns; i++) {
				let sum = 0
				for (let k = -radius; k <= radius; k++) {
					const ii = Math.min(Math.max(i + k * di, 0), columns - 1)
					const jj = Math.min(Math.max(j + k * dj, 0), rows - 1)
					sum += kernel[k + radius] * source[jj * columns + ii]
				}
				out[j * columns + i] = sum / total
			}
		}
		return out
	}
	grid = blur(blur(grid, 1, 0), 0, 1)
	return (x, y) => {
		const fx = Math.min(Math.max((x - x0) / FACE_STEP, 0), columns - 1.000001)
		const fy = Math.min(Math.max((y - y0) / FACE_STEP, 0), rows - 1.000001)
		const i = Math.floor(fx)
		const j = Math.floor(fy)
		const u = fx - i
		const v = fy - j
		const at = (di, dj) => grid[(j + dj) * columns + i + di]
		return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v
	}
}

// The shell's dome for the lid mesh's data `lid` ({ rim, face, positions,
// follow }: the patch's edge, points in loop order, the face, and the mesh),
// the eye and the shell settings. Returns `thickness`, the largest (mm)
// behind the face past the band, `point(rho, angle)` on the dome and
// `heightAt(x, y)`.
export function backShellSurface(lid, eye, shell) {
	const { width, height } = LID_PATCH
	const edge = edgeHeight(lid.rim)
	const face = smoothedFace(lid.face)
	// The smoothed face, brought to the edge (the skin there is the face, but
	// for its fine relief and the smoothing).
	const base = (x, y, rho, angle) =>
		face(x, y) + rho ** 6 * (edge(angle) - face(width * Math.cos(angle), height * Math.sin(angle)))
	// The thickness that keeps each point `clearance` in front of the dome.
	let thickness = 0
	const enclose = (x, y, z, zone = 1) => {
		const [rho, angle] = polar(x, y)
		if (rho >= zone) return
		const needed = (base(x, y, rho, angle) - shell.band - z + shell.clearance) / cap(rho)
		if (needed > thickness) thickness = needed
	}
	// The globe in front of its cut, at any gaze (it turns about its center):
	// its lowest is the disk of the cut, densest along its rim, where the dome
	// comes nearest.
	const R = eye.scleraRadius
	const cut = GLOBE_CUT * R
	const disk = Math.sqrt(R * R - cut * cut)
	const rings = Math.ceil(disk / 0.5)
	for (let i = 0; i <= rings; i++) {
		const r = (disk * i) / rings
		const count = i === rings ? 512 : 64
		for (let k = 0; k < count; k++) {
			const angle = (k / count) * TAU
			enclose(r * Math.cos(angle), r * Math.sin(angle), cut)
		}
	}
	// The lids, the vertices that follow the gaze also at either end of their
	// travel. Their skin near the edge stands on the band.
	const { positions, follow } = lid
	for (let v = 0; v < positions.length / 3; v++) {
		const [x, y, z] = positions.subarray(v * 3, v * 3 + 3)
		for (const angle of followTurns(follow, v)) {
			const c = Math.cos(angle)
			const s = Math.sin(angle)
			enclose(x, c * y - s * z, s * y + c * z, EDGE_ZONE)
		}
	}
	const point = (rho, angle) => {
		const x = rho * width * Math.cos(angle)
		const y = rho * height * Math.sin(angle)
		return [x, y, base(x, y, rho, angle) - shell.band - thickness * cap(rho)]
	}
	return {
		thickness,
		point,
		// The dome's height under (x, y), inside the patch.
		heightAt: (x, y) => {
			const [rho, angle] = polar(x, y)
			return point(Math.min(rho, 1), angle)[2]
		},
	}
}

// Brings a hidden part (the conjunctiva's or the palpebral conjunctiva's mesh
// data, { positions, follow, depth? }) inside the shell `surface`: every vertex
// raised until it stands `clearance` in front of the dome, also at either end
// of the lids' follow. Only what lies under the lids moves: the fornix past
// the globe's outline and the palpebral conjunctiva's deep end. `depth` (into
// the sac) shrinks with the rise. In place; returns `part`.
export function keepInside(part, surface, clearance) {
	const { positions, follow, depth } = part
	for (let v = 0; v < positions.length / 3; v++) {
		const [x, y, z] = positions.subarray(v * 3, v * 3 + 3)
		const turns = followTurns(follow, v)
		let rise = 0
		// A rise lifts a turned vertex by its cosine and slides it along the
		// dome: a few steps settle it.
		for (let step = 0; step < 8; step++) {
			let short = 0
			for (const angle of turns) {
				const c = Math.cos(angle)
				const s = Math.sin(angle)
				const ty = c * y - s * (z + rise)
				const tz = s * y + c * (z + rise)
				short = Math.max(short, (surface.heightAt(x, ty) + clearance - tz) / c)
			}
			if (short <= 1e-4) break
			rise += short
		}
		if (rise === 0) continue
		positions[v * 3 + 2] = z + rise
		if (depth) depth[v] = Math.max(0, depth[v] - rise)
	}
	return part
}

// Inward unit normal of the patch's ellipse at (x, y) on it.
function inward(x, y) {
	const { width, height } = LID_PATCH
	const nx = -x / (width * width)
	const ny = -y / (height * height)
	const length = Math.hypot(nx, ny) || 1
	return [nx / length, ny / length]
}

// Mesh data of the back shell: the band from the patch's edge (the lid mesh's
// `rim`) and the dome `surface` (backShellSurface()), front faces outward. Attributes as the lid mesh's (src/adnexa/lidGeometry.js), for the
// skin program: `lid` = (0, 1, SHELL_MARGIN_DISTANCE, 0), `relief` = (the
// outward direction in the front plane, no grooves, mid-margin), `follow` = 0
// (it stays put), `ao` = 1; and `coords`, the skin's pattern coordinates
// (mm): the band and the dome unrolled into the front plane, the dome by the
// arc length along its meridians, so the pattern is not stretched where they
// turn away from the front, continuous from the patch's edge over the band and
// onto the dome.
export function createBackShell(lid, surface, shell) {
	const { rim } = lid
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

	const profile = new Float32Array(vertices * 4)
	for (let i = 0; i < vertices; i++) profile.set([0, 1, SHELL_MARGIN_DISTANCE, 0], i * 4)
	return {
		positions,
		coords,
		lid: profile,
		relief,
		follow: new Float32Array(vertices * 2),
		ao: new Float32Array(vertices).fill(1),
		indices: new Uint32Array(triangles),
		thickness: surface.thickness,
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
