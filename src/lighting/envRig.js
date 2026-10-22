// The analytic light rig: studio emitters described by params.lighting, built
// in world space around the eye (the globe center is the world origin) and
// packed for src/shaders/env-rig.glsl. The shaders intersect reflected rays
// with these shapes exactly, so catchlight edges stay sharp at any
// magnification, and integrate their irradiance for the diffuse terms.
//
// Every emitter is a planar shape with a center, two in-plane unit axes and
// half extents, packed as EMITTER_VEC4S vec4s:
//   A: center.xyz, type      B: axisU.xyz, half width   C: axisV.xyz, half height
//   D: radiance.rgb, edge softness (fraction of the half extent)
//   E: type parameters       F: second radiance.rgb (window bottom), unused
// Radiance is linear sRGB in the scene's arbitrary units (exposure in post).
import { DEG, vec3 } from '../math'
import { hexToLinearRgb, kelvinToLinearRgb, luminance } from './colorTemperature'

export const MAX_EMITTERS = 10
export const EMITTER_VEC4S = 6

export const EMITTER_TYPE = Object.freeze({
	RECT: 0,
	DISK: 1,
	OCTAGON: 2,
	WINDOW: 3,
	RING: 4,
	LEDS: 5,
	LENS: 6,
	BLOCKER: 7,
})

const SHAPE_TYPES = {
	rect: EMITTER_TYPE.RECT,
	disk: EMITTER_TYPE.DISK,
	octagon: EMITTER_TYPE.OCTAGON,
}

// Unit direction from the eye at `azimuth`, `elevation` (degrees): azimuth 0
// faces the default camera (+Z), positive azimuth is the right of the picture
// (+X), positive elevation is up.
export function sphericalDirection(azimuth, elevation) {
	const az = azimuth * DEG
	const el = elevation * DEG
	return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
}

// In-plane axes of a panel at `position` facing `target`, its width level
// with the horizon before `roll` (degrees).
export function facingAxes(position, target, roll = 0) {
	const normal = vec3.normalize(vec3.sub(target, position))
	let u = vec3.cross([0, 1, 0], normal)
	if (vec3.length(u) < 1e-6) u = [1, 0, 0]
	u = vec3.normalize(u)
	let v = vec3.cross(normal, u)
	const c = Math.cos(roll * DEG)
	const s = Math.sin(roll * DEG)
	;[u, v] = [
		vec3.add(vec3.scale(u, c), vec3.scale(v, s)),
		vec3.sub(vec3.scale(v, c), vec3.scale(u, s)),
	]
	return { u, v, normal }
}

function emitter(
	type,
	center,
	u,
	v,
	halfWidth,
	halfHeight,
	radiance,
	softness = 0,
	e = [0, 0, 0, 0],
	f = [0, 0, 0, 0],
) {
	return { type, center, u, v, halfWidth, halfHeight, radiance, softness, e, f }
}

const scaled = (rgb, intensity) => rgb.map((c) => c * intensity)

// The studio panels (key, fill), the window and the camera-mounted lights and
// silhouettes. `camera`: { position, right, up } in world space; `target`:
// the point the panels face (the eye).
export function buildEmitters(lighting, camera, target = [0, 0, 0]) {
	const list = []

	for (const name of ['key', 'fill']) {
		const panel = lighting[name]
		if (!panel.enabled || panel.intensity <= 0) continue
		const center = vec3.madd(
			target,
			sphericalDirection(panel.azimuth, panel.elevation),
			panel.distance,
		)
		const { u, v } = facingAxes(center, target, panel.roll)
		list.push(
			emitter(
				SHAPE_TYPES[panel.shape],
				center,
				u,
				v,
				panel.width / 2,
				panel.height / 2,
				scaled(kelvinToLinearRgb(panel.temperature), panel.intensity),
				panel.softness,
				// Diffuser hot spot: the center is this much brighter than the edge.
				[0.18, 0, 0, 0],
			),
		)
	}

	const window = lighting.window
	if (window.enabled && window.intensity > 0) {
		const center = vec3.madd(
			target,
			sphericalDirection(window.azimuth, window.elevation),
			window.distance,
		)
		const { u, v } = facingAxes(center, target, 0)
		list.push(
			emitter(
				EMITTER_TYPE.WINDOW,
				center,
				u,
				v,
				window.width / 2,
				window.height / 2,
				scaled(hexToLinearRgb(window.skyTop), window.intensity),
				0.004,
				[
					window.columns,
					window.rows,
					window.mullion / window.width,
					window.mullion / window.height,
				],
				[...scaled(hexToLinearRgb(window.skyBottom), window.intensity), 0],
			),
		)
	}

	// Camera-mounted: coaxial ring light, LED ring, the lens, the body and the
	// photographer behind it, all facing the eye in the camera's own frame.
	const forward = vec3.normalize(vec3.sub(target, camera.position))
	const at = (offset) => vec3.madd(camera.position, forward, -offset)
	const ring = lighting.ring
	if (ring.enabled && ring.intensity > 0) {
		list.push(
			emitter(
				EMITTER_TYPE.RING,
				at(0),
				camera.right,
				camera.up,
				ring.outerRadius,
				ring.outerRadius,
				scaled(kelvinToLinearRgb(ring.temperature), ring.intensity),
				0.02,
				[Math.min(ring.innerRadius / ring.outerRadius, 0.99), 0, 0, 0],
			),
		)
	}
	const leds = lighting.leds
	if (leds.enabled && leds.intensity > 0) {
		list.push(
			emitter(
				EMITTER_TYPE.LEDS,
				at(-1),
				camera.right,
				camera.up,
				leds.radius + leds.size,
				leds.radius + leds.size,
				scaled(kelvinToLinearRgb(leds.temperature), leds.intensity),
				0.15,
				[leds.count, leds.radius, leds.size / 2, 0],
			),
		)
	}
	const silhouette = lighting.camera
	if (silhouette.enabled) {
		const dark = scaled(hexToLinearRgb(lighting.room.color), lighting.room.intensity * 0.04)
		list.push(
			emitter(
				EMITTER_TYPE.LENS,
				at(2),
				camera.right,
				camera.up,
				silhouette.lensRadius,
				silhouette.lensRadius,
				dark,
				0.03,
				[0.9, 0, 0, 0],
			),
		)
		if (silhouette.bodyWidth > 0 && silhouette.bodyHeight > 0) {
			list.push(
				emitter(
					EMITTER_TYPE.BLOCKER,
					at(140),
					camera.right,
					camera.up,
					silhouette.bodyWidth / 2,
					silhouette.bodyHeight / 2,
					dark,
					0.05,
				),
			)
		}
		if (silhouette.photographer) {
			const shade = scaled(hexToLinearRgb(lighting.room.color), lighting.room.intensity * 0.25)
			list.push(
				emitter(
					EMITTER_TYPE.BLOCKER,
					vec3.add(at(420), vec3.scale(camera.up, -120)),
					camera.right,
					camera.up,
					260,
					380,
					shade,
					0.4,
				),
			)
		}
	}
	return list.slice(0, MAX_EMITTERS)
}

// Uniform data of src/shaders/env-rig.glsl: the emitters (in the space of
// `matrix`, a column-major 4×4 rigid transform from world space, or world
// space when null) as a flat Float32Array of vec4s, and their count.
export function packEmitters(
	list,
	matrix = null,
	out = new Float32Array(MAX_EMITTERS * EMITTER_VEC4S * 4),
) {
	out.fill(0)
	const point = (p) => (matrix ? transformPoint(matrix, p) : p)
	const direction = (d) => (matrix ? transformDirection(matrix, d) : d)
	list.forEach((item, index) => {
		const base = index * EMITTER_VEC4S * 4
		out.set([...point(item.center), item.type], base)
		out.set([...direction(item.u), item.halfWidth], base + 4)
		out.set([...direction(item.v), item.halfHeight], base + 8)
		out.set([...item.radiance, item.softness], base + 12)
		out.set(item.e, base + 16)
		out.set(item.f, base + 20)
	})
	return { data: out, count: list.length }
}

export function transformPoint(m, p) {
	return [
		m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
		m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
		m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
	]
}

export function transformDirection(m, d) {
	return [
		m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
		m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
		m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
	]
}

// Background radiance terms of the room or the outdoor sky (env-rig.glsl).
export function packBackground(lighting) {
	const room = scaled(hexToLinearRgb(lighting.room.color), lighting.room.intensity)
	const sky = lighting.sky
	return {
		uRoom: [...room, lighting.room.floor],
		uSkyZenith: [...scaled(hexToLinearRgb(sky.zenith), sky.intensity), sky.enabled ? 1 : 0],
		uSkyHorizon: [
			...scaled(hexToLinearRgb(sky.horizon), sky.intensity),
			Math.sin(sky.horizonHeight * DEG),
		],
		uSkyGround: [...scaled(hexToLinearRgb(sky.ground), sky.intensity * 0.35), sky.treeLine],
	}
}

// The rig in a red flash (the Terminator glitch, src/eye/terminator.js):
// each light and the room or sky turn `amount` (0–1) of the way to `color`
// (linear rgb), their brightest channel `gain` times their luminance. In
// place, on the emitters of buildEmitters() and the terms of packBackground().
export function flashRig(list, background, color, gain, amount) {
	if (amount <= 0) return
	const peak = Math.max(...color, 1e-6)
	const flash = (rgb) => {
		const level = (luminance(rgb) * gain) / peak
		return rgb.map((c, i) => c + (color[i] * level - c) * amount)
	}
	for (const item of list) {
		item.radiance = flash(item.radiance)
		if (item.type === EMITTER_TYPE.WINDOW) item.f = [...flash(item.f.slice(0, 3)), item.f[3]]
	}
	for (const key of Object.keys(background))
		background[key] = [...flash(background[key].slice(0, 3)), background[key][3]]
}

// Approximate photometric illuminance at the eye from the rig and background
// (relative units), the input of the pupil model. With a line of sight
// `direction` (unit, world space), each emitter is weighed as the pupil weighs
// light: by a Gaussian of its angle from the line of sight (`fieldSigma`
// degrees), so looking toward a light constricts the pupil. The background
// surrounds the eye and keeps its full weight.
export function sceneLuminance(lighting, list, direction = null, fieldSigma = 30) {
	const { uRoom, uSkyHorizon } = packBackground(lighting)
	let total = lighting.sky.enabled ? luminance(uSkyHorizon) * Math.PI : luminance(uRoom) * Math.PI
	for (const item of list) {
		if (item.type === EMITTER_TYPE.LENS || item.type === EMITTER_TYPE.BLOCKER) continue
		const distance = vec3.length(item.center)
		const area = 4 * item.halfWidth * item.halfHeight
		let weight = 1
		if (direction) {
			const cosine = vec3.dot(direction, item.center) / distance
			const angle = Math.acos(Math.min(Math.max(cosine, -1), 1)) / DEG
			weight = Math.exp(-0.5 * (angle / fieldSigma) ** 2)
		}
		total += (weight * luminance(item.radiance) * area) / (distance * distance)
	}
	return total
}
