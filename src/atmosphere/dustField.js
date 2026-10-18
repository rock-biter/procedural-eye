// The dust in the air around the eye, drawn by src/render/dustPass.js: seeded
// motes and the lights the haze scatters (src/shaders/veil.glsl).
//
// The motes fill a cube around the eye, fixed in world space and wrapping
// along its world axes as they drift: turning the camera moves them only by
// their true parallax. Each one is a fiber, a flake or two crossed fibers, at
// their real size: tenths of a millimeter, a few pixels in a macro frame, so
// only the ones near the focus plane read as specks.
import { EMITTER_TYPE, packBackground } from '../lighting/envRig'
import { luminance } from '../lighting/colorTemperature'
import { vec3 } from '../math'
import { createRandom, gaussian } from '../random'

export const MAX_MOTES = 2000
// Floats per mote: position in the unit cube and size factor; wandering
// phases and rate; screen angle, spin (rad/s), bend and kind.
export const MOTE_FLOATS = 12
// The lights the haze scatters (VEIL_LIGHTS in src/shaders/veil.glsl).
export const VEIL_LIGHTS = 4
// Kinds (the last float, uniform in [0, 1)): under CROSSED two crossed
// fibers, under FLAKES a round flake, above a single fiber.
export const MOTE_KINDS = Object.freeze({ CROSSED: 0.15, FLAKES: 0.5 })

// Spread of the log-normal mote sizes (ln units).
const SIZE_SIGMA = 0.45

// `count` motes from `seed`: position in the cube of side 1 centered on the
// origin, size factor (median 1); the phases of the wandering (radians) and
// its rate factor; the angle on screen, the spin (rad/s), the bend (share of
// the half length) and the kind.
export function createMotes(seed, count = MAX_MOTES) {
	const random = createRandom(`dust:${seed}`)
	const out = new Float32Array(count * MOTE_FLOATS)
	for (let i = 0; i < count; i++) {
		const o = i * MOTE_FLOATS
		out[o] = random() - 0.5
		out[o + 1] = random() - 0.5
		out[o + 2] = random() - 0.5
		out[o + 3] = Math.min(Math.exp(SIZE_SIGMA * gaussian(random(), random())), 2.5)
		out[o + 4] = random() * 2 * Math.PI
		out[o + 5] = random() * 2 * Math.PI
		out[o + 6] = random() * 2 * Math.PI
		out[o + 7] = 0.6 + 0.8 * random()
		out[o + 8] = random() * 2 * Math.PI
		out[o + 9] = (random() - 0.5) * 0.12
		out[o + 10] = (random() - 0.5) * 0.7
		out[o + 11] = random()
	}
	return out
}

// Irradiance (relative units) at the target from one emitter facing it: its
// radiance times its emitting area over the squared distance.
export function emitterIrradiance(item, target) {
	if (item.type === EMITTER_TYPE.LENS || item.type === EMITTER_TYPE.BLOCKER) return null
	const toLight = vec3.sub(item.center, target)
	const distance2 = Math.max(vec3.dot(toLight, toLight), 1)
	let area = 4 * item.halfWidth * item.halfHeight
	if (item.type === EMITTER_TYPE.DISK) area *= Math.PI / 4
	else if (item.type === EMITTER_TYPE.OCTAGON) area *= 0.8284271
	else if (item.type === EMITTER_TYPE.RING) area *= (Math.PI / 4) * (1 - item.e[0] ** 2)
	else if (item.type === EMITTER_TYPE.LEDS) area = item.e[0] * Math.PI * item.e[2] ** 2
	else if (item.type === EMITTER_TYPE.WINDOW) {
		const radiance = item.radiance.map((c, i) => 0.5 * (c + item.f[i]))
		return { direction: vec3.normalize(toLight), irradiance: scale(radiance, area / distance2) }
	}
	return { direction: vec3.normalize(toLight), irradiance: scale(item.radiance, area / distance2) }
}

const scale = (rgb, s) => rgb.map((c) => c * s)

// What the haze scatters: the brightest emitters seen from the target as
// small sources (direction toward them, irradiance), at most VEIL_LIGHTS, and
// the background's radiance, which scatters into every direction alike.
export function veilLights(lighting, emitters, target = [0, 0, 0]) {
	const lights = emitters
		.map((item) => emitterIrradiance(item, target))
		.filter(Boolean)
		.sort((a, b) => luminance(b.irradiance) - luminance(a.irradiance))
		.slice(0, VEIL_LIGHTS)
	const { uRoom, uSkyZenith, uSkyHorizon, uSkyGround } = packBackground(lighting)
	const ambient = lighting.sky.enabled
		? [0, 1, 2].map((i) => 0.5 * (uSkyGround[i] + 0.55 * uSkyHorizon[i] + 0.45 * uSkyZenith[i]))
		: scale(uRoom.slice(0, 3), 0.5 * (1 + uRoom[3]))
	return { lights, ambient }
}

// Henyey–Greenstein phase function (per steradian) of the scattering angle's
// cosine, twin of hgPhase() in src/shaders/scattering.glsl.
export function hgPhase(cosTheta, g) {
	const denominator = 1 + g * g - 2 * g * cosTheta
	return (1 - g * g) / (4 * Math.PI * denominator * Math.sqrt(denominator))
}
