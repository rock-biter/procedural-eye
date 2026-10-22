// The Terminator easter egg on the eyeball (src/eye/terminator.js,
// docs/RENDERING.md): the glitch's mask, the T-800's red lens, and the chrome
// of its socket, turned on a lathe around the eye's axis, with a raised bezel
// round the lens and eight rivets beyond it. Both eyeball programs shade
// either the eye or the T-800, pixel by pixel: the mask is 0 or 1, in
// blocks, so a block takes one branch.
#ifndef TERMINATOR_GLSL
#define TERMINATOR_GLSL

#include ./sclera.glsl

uniform vec4 uGlitch; // coverage (0–1), block height (mm), pattern, unused
uniform vec2 uGlitchShape; // full-width slices' share, the rows' shift (cells)
uniform vec3 uTerminatorLens; // the lens' red radiance
uniform vec3 uTerminatorCore; // its core's
uniform vec4 uTerminatorChrome; // the chrome's tint (linear), roughness

// Whether a world point shows the T-800. The front plane is cut into rows
// a block high; a row is either one full-width slice or, shifted sideways,
// blocks 2 to 8 cells wide, each on with the probability of the coverage.
// The pattern changes with uGlitch.z. In the world, not on the screen: the
// blocks stay put as the camera moves, and the eye turns under them.
bool glitched(vec3 world) {
	float coverage = uGlitch.x;
	if (coverage <= 0.0) return false;
	if (coverage >= 1.0) return true;
	vec2 c = world.xy;
	float cell = uGlitch.y;
	uint pattern = uint(uGlitch.z);
	uint row = uint(int(floor(c.y / cell)) + 65536);
	vec4 h = hashBytes(pcgHash(row * 977u + pattern * 7919u + 13u));
	if (h.x < uGlitchShape.x) return h.y < coverage;
	float width = cell * (2.0 + floor(h.z * 7.0));
	float x = c.x + (h.w - 0.5) * 8.0 * uGlitchShape.y * cell;
	uint column = uint(int(floor(x / width)) + 65536);
	return hash01(row, column, pattern) < coverage;
}

// The lens' radiance at `q` (mm from the pupil's center, on the iris
// plane): a white-hot core within the pupil, three times the lens' glow,
// red out toward the limbus through the fine rings of a Fresnel lens, dark at
// its rim. Bright reds turn orange under the tone mapping: the red stays
// near the glow of a white surface, the core alone burns.
vec3 terminatorLens(vec2 q, float pupil, float limbus) {
	float r = length(q);
	float rho = r / limbus;
	float core = exp(-sq(r / max(0.6 * pupil, 0.3)));
	float rings = 0.85 + 0.15 * smoothstep(0.2, 0.8, abs(fract(rho * 14.0) - 0.5) * 2.0);
	float falloff = mix(0.25, 1.0, 1.0 - smoothstep(0.3, 0.9, rho));
	vec3 color = uTerminatorLens * falloff * rings + 3.0 * uTerminatorCore * core;
	return color * (1.0 - smoothstep(0.82, 0.97, rho));
}

// Polished chrome under the rig: what its mirror ray sees (`sharp`), blurred
// toward the light around that direction as the roughness grows, tinted by
// the metal's Fresnel (Schlick), with a faint diffuse veil that keeps its
// shape readable. The room alone is too even to read as chrome: below the
// horizon its reflection darkens, as a studio's floor and stands would.
// `shadow`: the key light's, per channel; `occlusion`: the ambient's.
vec3 chromeRadiance(vec3 p, vec3 n, vec3 v, vec3 sharp, vec3 shadow, float occlusion) {
	vec3 f0 = uTerminatorChrome.rgb;
	vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - saturate(dot(n, v)), 5.0);
	vec3 r = reflect(-v, n);
	vec3 blurred = envIrradianceShadowed(p, r, shadow, occlusion) * INV_PI;
	vec3 mirror = mix(sharp * occlusion, blurred, uTerminatorChrome.w);
	float horizon = mix(0.08, 1.0, smoothstep(-0.15, 0.45, dot(r, uEnvUp)));
	vec3 veil = 0.04 * f0 * INV_PI * envIrradianceShadowed(p, n, shadow, occlusion);
	return fresnel * mirror * horizon + veil;
}

// The socket's chrome at eye-space point p, of normal n, seen along dir;
// `footprint`: the pixel's size there (mm), under which the grooves fade.
vec3 socketChrome(vec3 p, vec3 n, vec3 dir, float footprint) {
	float r = length(p.xy);
	float limbus = uGlobe.y;
	// The relief tilts the normal along the surface, away from the axis.
	vec3 radial = vec3(p.xy / max(r, 1e-6), 0.0);
	radial = normalize(radial - n * dot(radial, n));
	// The bezel, a bead 0.15 mm high 0.9 mm past the limbus, and the grooves
	// beyond it, 0.3 mm apart: the slopes of their heights.
	float x = (r - limbus - 0.9) / 0.4;
	float slope = -0.75 * x * exp(-x * x);
	float grooves = (1.0 - smoothstep(0.08, 0.2, footprint)) * smoothstep(0.8, 1.6, x);
	slope += grooves * 0.25 * sin(TAU * r / 0.3);
	vec3 m = normalize(n - slope * radial);
	// The rivets, domes 0.35 mm wide on a ring 2.4 mm past the limbus, each in
	// a dark seam.
	float sector = TAU / 8.0;
	float angle = (floor(atan(p.y, p.x) / sector) + 0.5) * sector;
	vec2 d = p.xy - (limbus + 2.4) * vec2(cos(angle), sin(angle));
	float rivet = length(d) / 0.35;
	vec3 tilt = vec3(d, 0.0) - n * dot(vec3(d, 0.0), n);
	if (rivet < 1.0) m = normalize(m + 2.5 * tilt);
	float seam = 1.0 - 0.8 * exp(-sq((rivet - 1.0) / 0.15));

	vec3 world = (uEyeToWorld * vec4(p, 1.0)).xyz;
	float occlusion = lidOcclusion(world);
	vec3 shadow = vec3(keyShadow(world) * mix(0.5, 1.0, occlusion));
	vec3 mirrorDir = reflect(dir, m);
	vec3 sharp = lidReflection(p, mirrorDir, envRadiance(p, mirrorDir));
	return chromeRadiance(p, m, -dir, sharp, shadow, occlusion) * seam;
}

#endif
