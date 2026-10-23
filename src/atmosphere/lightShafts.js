// The light shafts: a few blades of light crossing the air around the eye
// (src/lighting/shaftLight.js), as from a slatted source at a finite distance:
// the beams spread from it, so in perspective they fan out. Each beam is a
// Gaussian blade, thin across (σ), `elongation` times longer along its long
// side, centered in the beams' cross-section (the plane through the globe's
// center facing the source, along the frame's axes u and v, mm) and fading
// along its axis over the beams' reach. The cookie bakes their profile over
// that plane, seen from the source: the beams' light on whatever they cross
// (the skin, the eye, the dust motes). beamIntegral() gives a beam's density
// integrated along a ray, the light the air scatters toward the camera (twin
// of light-shafts.glsl).
import { DEG, clamp, lerp, vec3 } from '../math'
import { createRandom, gaussian, hash01 } from '../random'

export const MAX_SHAFTS = 12
// Floats per beam: its center in the cross-section (u, v, mm), σ across
// (mm), its intensity (the cookie's value on its axis) and the angle of its
// long side in the cross-section (radians from u toward v).
export const SHAFT_FLOATS = 5
// Texels per side of the cookie.
export const COOKIE_SIZE = 256

// The frame of the beams whose source lies along `toSource` (unit, from the
// globe's center): u level with the horizon, v up, and the beams' direction
// toward the eye.
export function shaftFrame(toSource) {
	const direction = vec3.scale(vec3.normalize(toSource), -1)
	let u = vec3.cross([0, 1, 0], direction)
	if (vec3.length(u) < 1e-6) u = [1, 0, 0]
	u = vec3.normalize(u)
	return { u, v: vec3.cross(direction, u), direction }
}

// `count` beams of `seed` (MAX_SHAFTS at most), SHAFT_FLOATS each: σ
// log-normal around `width` (`widthVariation` 0 keeps them equal), long sides
// along `angle` (degrees), turned at random as `alignment` goes to 0; centers
// scattered in a disc of radius `spread` around (`offsetX`, `offsetY`), or
// side by side across the long sides, like slats, as `alignment` goes to 1.
// Each beam draws the same numbers whatever the options, so a slider moves
// the beams without reshuffling them.
export function createShafts(
	seed,
	{
		count,
		width,
		widthVariation = 0.5,
		spread,
		offsetX = 0,
		offsetY = 0,
		angle = 0,
		alignment = 0,
	},
) {
	const random = createRandom(`shafts:${seed}`)
	const n = clamp(Math.round(count), 0, MAX_SHAFTS)
	const out = new Float32Array(n * SHAFT_FLOATS)
	const across = [-Math.sin(angle * DEG), Math.cos(angle * DEG)]
	for (let i = 0; i < n; i++) {
		const radius = spread * Math.sqrt(random())
		const turn = 2 * Math.PI * random()
		const jitter = random() - 0.5
		const size = gaussian(random(), random())
		const strength = random()
		const tilt = random() - 0.5
		// Evenly spaced across the long sides, a little irregular.
		const slot = n > 1 ? (2 * (i + 0.5 + 0.4 * jitter)) / n - 1 : 0
		const o = i * SHAFT_FLOATS
		out[o] = offsetX + lerp(radius * Math.cos(turn), spread * slot * across[0], alignment)
		out[o + 1] = offsetY + lerp(radius * Math.sin(turn), spread * slot * across[1], alignment)
		out[o + 2] = width * clamp(Math.exp(0.6 * widthVariation * size), 0.3, 3)
		out[o + 3] = 0.45 + 0.55 * strength
		out[o + 4] = (angle + tilt * 50 * (1 - alignment)) * DEG
	}
	return out
}

// The half side (mm) of the square the cookie covers: every beam out to
// three of its long σ.
export function cookieExtent(shafts, elongation = 1) {
	let extent = 1
	for (let o = 0; o < shafts.length; o += SHAFT_FLOATS) {
		const reach = 3 * shafts[o + 2] * Math.max(elongation, 1)
		extent = Math.max(extent, Math.abs(shafts[o]) + reach, Math.abs(shafts[o + 1]) + reach)
	}
	return extent
}

// The blades as the cookie sums them (bakeShaftCookie(), and its GPU twin,
// shaft-cookie-fragment.glsl), over `size`² texels on the square of half
// side `extent` (mm): each one's center (u, v, mm), intensity, the factors
// of its Gaussian across and along, the cosine and sine of its angle, and
// the texel box it fills ([i0, i1, j0, j1], within 3.5 of its long σ).
export function cookieBlades(shafts, elongation, size, extent) {
	const texel = (2 * extent) / size
	const index = (x) => (x + extent) / texel - 0.5
	const blades = []
	for (let o = 0; o < shafts.length; o += SHAFT_FLOATS) {
		const [u, v, sigma, intensity, angle] = shafts.subarray(o, o + SHAFT_FLOATS)
		const reach = 3.5 * sigma * Math.max(elongation, 1)
		const across = 1 / (2 * sigma * sigma)
		blades.push({
			u,
			v,
			intensity,
			across,
			along: across / (elongation * elongation),
			cos: Math.cos(angle),
			sin: Math.sin(angle),
			box: [
				Math.max(0, Math.floor(index(u - reach))),
				Math.min(size - 1, Math.ceil(index(u + reach))),
				Math.max(0, Math.floor(index(v - reach))),
				Math.min(size - 1, Math.ceil(index(v + reach))),
			],
		})
	}
	return blades
}

// The cookie: the beams' summed profile, Σ intensity · exp(−(a² / σ² + b² /
// (σ·elongation)²) / 2) across (a) and along (b) each blade, at the centers
// of `size`² texels over the square of half side `extent` (mm), rows along v;
// each beam only over its box (cookieBlades()). The app bakes it on the GPU
// (src/lighting/shaftLight.js); this is its twin.
export function bakeShaftCookie(
	shafts,
	elongation = 1,
	size = COOKIE_SIZE,
	extent = cookieExtent(shafts, elongation),
) {
	const out = new Float32Array(size * size)
	const texel = (2 * extent) / size
	for (const blade of cookieBlades(shafts, elongation, size, extent)) {
		const [i0, i1, j0, j1] = blade.box
		for (let j = j0; j <= j1; j++) {
			const dy = -extent + (j + 0.5) * texel - blade.v
			for (let i = i0; i <= i1; i++) {
				const dx = -extent + (i + 0.5) * texel - blade.u
				const a = -dx * blade.sin + dy * blade.cos
				const b = dx * blade.cos + dy * blade.sin
				out[j * size + i] += blade.intensity * Math.exp(-a * a * blade.across - b * b * blade.along)
			}
		}
	}
	return out
}

// The beams of `shafts` at `time` (s): each sways in the cross-section by up
// to `sway` (mm) and flickers down to 1 − `flicker` of its intensity, slowly
// (periods of about nine seconds over `speed`, each beam at its own rate and
// phases from `seed`), as if the air or what the light comes through moved.
// Without sway or flicker, or at speed 0, the beams as they are.
export function animateShafts(shafts, seed, { sway, flicker, speed }, time, out = shafts.slice()) {
	const omega = (2 * Math.PI * speed) / 9
	for (let i = 0, o = 0; o < shafts.length; i++, o += SHAFT_FLOATS) {
		const phase = (k) => 2 * Math.PI * hash01(seed >>> 0, i, k)
		const w = omega * (0.7 + 0.6 * hash01(seed >>> 0, i, 7)) * time
		const du = 0.6 * Math.sin(w + phase(1)) + 0.4 * Math.sin(1.9 * w + phase(2))
		const dv = 0.6 * Math.sin(1.3 * w + phase(3)) + 0.4 * Math.sin(2.3 * w + phase(4))
		const glow = 0.5 + 0.25 * Math.sin(1.7 * w + phase(5)) + 0.25 * Math.sin(3.1 * w + phase(6))
		out[o] = shafts[o] + sway * du
		out[o + 1] = shafts[o + 1] + sway * dv
		out[o + 2] = shafts[o + 2]
		out[o + 3] = shafts[o + 3] * (1 - flicker * (1 - glow))
		out[o + 4] = shafts[o + 4]
	}
	return out
}

// A beam in world space: its center (in the cross-section), its axis from
// the source (unit) and the source's distance to the center, its thin side
// (unit, across the axis), its σ across and its intensity. `frame`:
// shaftFrame(); `sourceDistance`: the source's distance to the globe's center.
export function beamGeometry(beam, frame, sourceDistance) {
	const [u, v, sigma, intensity, angle] = beam
	const center = vec3.add(vec3.scale(frame.u, u), vec3.scale(frame.v, v))
	const fromSource = vec3.madd(center, frame.direction, sourceDistance)
	const axis = vec3.normalize(fromSource)
	const across = vec3.add(
		vec3.scale(frame.u, -Math.sin(angle)),
		vec3.scale(frame.v, Math.cos(angle)),
	)
	const side = vec3.normalize(vec3.madd(across, axis, -vec3.dot(across, axis)))
	return { center, axis, distance: vec3.length(fromSource), side, sigma, intensity }
}

// erf by Winitzki's approximation (within 1.3e-4), twin of shaftErf() in
// light-shafts.glsl.
export function erf(x) {
	const a = 0.147
	const x2 = x * x
	const value = Math.sqrt(1 - Math.exp((-x2 * (4 / Math.PI + a * x2)) / (1 + a * x2)))
	return x < 0 ? -value : value
}

// The density of `beam` (beamGeometry()) integrated along the ray from
// `origin` (world, mm) in the unit `direction` over [0, length] (mm), times
// how squarely the ray crosses it (its sin² against the axis: a beam seen end
// on fades). The density, exp(−(a²/σ² + b²/(σ·elongation)² + s²/reach²) / 2)
// across, along and down the beam, is a Gaussian in the ray's parameter: erf
// at the segment's ends, no singular view. σ widens with the distance from
// the source, taken at the ray's densest point. `closest`: that point's
// parameter, kept in the segment. Twin of the loop of applyShafts() in
// light-shafts.glsl.
export function beamIntegral(origin, direction, length, beam, elongation, reach) {
	const long = vec3.cross(beam.axis, beam.side)
	const offset = vec3.sub(origin, beam.center)
	const p = [vec3.dot(offset, beam.side), vec3.dot(offset, long), vec3.dot(offset, beam.axis)]
	const d = [
		vec3.dot(direction, beam.side),
		vec3.dot(direction, long),
		vec3.dot(direction, beam.axis),
	]
	const quadratic = (taper) => {
		const sigma = beam.sigma * taper
		const inverse = [1 / sigma ** 2, 1 / (sigma * elongation) ** 2, 1 / reach ** 2]
		const a = d[0] ** 2 * inverse[0] + d[1] ** 2 * inverse[1] + d[2] ** 2 * inverse[2]
		const b = p[0] * d[0] * inverse[0] + p[1] * d[1] * inverse[1] + p[2] * d[2] * inverse[2]
		const c = p[0] ** 2 * inverse[0] + p[1] ** 2 * inverse[1] + p[2] ** 2 * inverse[2]
		return { a, b, c, t: -b / a }
	}
	const first = quadratic(1)
	const taper = clamp((beam.distance + p[2] + first.t * d[2]) / beam.distance, 0.25, 4)
	const { a, b, c, t } = quadratic(taper)
	const q = Math.sqrt(0.5 * a)
	const integral =
		beam.intensity *
		Math.exp(-0.5 * Math.max(c + b * t, 0)) *
		Math.sqrt(Math.PI / (2 * a)) *
		(erf((length - t) * q) - erf(-t * q))
	return { integral: integral * Math.max(1 - d[2] ** 2, 0), closest: clamp(t, 0, length) }
}
