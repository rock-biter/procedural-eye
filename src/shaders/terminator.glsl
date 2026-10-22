// The Terminator easter egg on the eyeball (src/eye/terminator.js,
// docs/RENDERING.md): the glitch's shockwave, the T-800's red lens, and the
// chrome of its socket, turned on a lathe around the eye's axis, with a
// raised bezel round the lens and eight rivets beyond it.
#ifndef TERMINATOR_GLSL
#define TERMINATOR_GLSL

#include ./sclera.glsl

uniform vec4 uGlitch; // the front's reach (0 the eye's axis, 1 the globe's edge), half-width of its band (mm), row height (mm), the pattern's clock
uniform vec4 uGlitchShape; // tears (mm), color split (mm), ripple (mm), blockiness (0–1)
uniform vec2 uGlitchMotion; // jumps (mm), flicker (0–1)
uniform vec3 uTerminatorLens; // the lens' red radiance
uniform vec3 uTerminatorCore; // its core's
uniform vec4 uTerminatorChrome; // the chrome's tint (linear), roughness

// The glitch at an eye-space point of the surface.
struct Glitch {
	vec3 weight; // the T-800's share, per channel
	vec2 shift; // where to shade instead: this far along the surface (mm, eye space)
	vec3 gain; // the row's brightness and tint
	bool band; // on the front: both shaded, and blended
};

// A shockwave from the eye's axis: behind its front the T-800, ahead of it
// the eye, and on it a band uGlitch.y mm either side where the two glitch
// into each other. Torn into rows across the eye, of uneven heights, each
// shifted sideways (a few much further), lit a little differently, some
// tinted magenta or cyan, and pulled toward the front as by a lens; in each
// row, blocks of either, more of the T-800's further in. Red, green and blue
// see the front uGlitchShape.y mm apart, and split the blocks as much.
// The clock (uGlitch.w, the glitch's time in ticks) ticks the pattern on,
// but not evenly: each stretch of rows keeps its own pace, some stuttering,
// some racing; a few blocks flicker every frame, and a few jump, showing
// what lies elsewhere, above or below too; now and then a row drops to
// either side, and a tick moves the whole front, flips the band or flashes
// it (uGlitchMotion.y: how often). Between the ticks it moves on: the front
// breathes, the rows roll up or down at a pace that changes every eight
// ticks, and each row creeps sideways until its pattern ticks on. While the
// glitch is on (a reach above 0), its band shows.
Glitch glitchAt(vec3 p) {
	Glitch g;
	g.weight = vec3(0.0);
	g.shift = vec2(0.0);
	g.gain = vec3(1.0);
	g.band = false;
	if (uGlitch.x <= 0.0) return g;
	float clock = uGlitch.w;
	float flicker = uGlitchMotion.y;
	float halfWidth = uGlitch.y;
	vec4 tick = hashBytes(pcgHash(uint(clock) * 7919u + 3u));
	vec4 phase = hashBytes(pcgHash(uint(0.125 * clock) * 2654435u + 5u));
	float front = uGlitch.x * uGlobe.x + 0.25 * halfWidth * sin(0.35 * clock);
	if (tick.x < 0.3 * flicker) front += (tick.y - 0.5) * 2.0 * halfWidth;
	float r = length(p.xy);
	float x = (r - front) / halfWidth;
	if (x <= -1.5) {
		g.weight = vec3(1.0);
		return g;
	}
	if (x >= 1.5) return g;
	g.band = true;
	float window = sq(1.0 - sq(min(abs(x), 1.0)));
	// Every four rows, one thick row or four thin ones, at the stretch's pace.
	float cell = uGlitch.z;
	float y = p.y / cell + (phase.x - 0.5) * 3.0 * clock;
	uint stretch = uint(int(floor(0.25 * y)) + 65536);
	vec4 pace = hashBytes(pcgHash(stretch * 2654435u + 17u));
	float paced = clock * mix(0.3, 2.0, pace.x) + 8.0 * pace.y;
	uint pattern = uint(paced);
	vec4 h = hashBytes(pcgHash(stretch * 977u + pattern * 7919u + 13u));
	uint row = h.x < 0.35 ? pcgHash(stretch) : uint(int(floor(y)) + 262144);
	vec4 k = hashBytes(pcgHash(row * 977u + pattern * 7919u + 29u));
	vec4 m = hashBytes(pcgHash(row * 31u + pattern * 131u + 7u));
	vec2 radial = p.xy / max(r, 1e-6);
	vec4 c = hashBytes(pcgHash(row * 613u + pattern * 37u + 101u));
	float tear = ((k.x - 0.5) * (m.x < 0.2 ? 2.5 : 1.0) + (c.x - 0.5) * fract(paced)) * 2.0 * uGlitchShape.x;
	vec2 shift = vec2(tear, 0.0) - uGlitchShape.z * x * radial;
	float width = cell * (2.0 + floor(k.z * 6.0));
	uint column = uint(int(floor((p.x + window * shift.x) / width)) + 65536);
	vec4 b = hashBytes(pcgHash(pcgHash(row * 7919u + column) + pattern * 31u));
	if (b.x < 0.2 * flicker) shift += (b.yz - 0.5) * 2.0 * uGlitchMotion.x;
	g.shift = window * shift;
	vec2 q = p.xy + g.shift;
	float block = b.w < 0.3 * flicker ? hash01(row, column, uint(3.0 * clock)) : hash01(row, column, pattern);
	float split = min(uGlitchShape.y, 0.5 * halfWidth) / halfWidth;
	vec3 s = (length(q) - front) / halfWidth + vec3(-split, 0.0, split);
	vec3 ramp = saturate(0.5 - 0.5 * s);
	g.weight = mix(ramp, step(block + vec3(-0.5, 0.0, 0.5) * split, ramp), uGlitchShape.w);
	if (window > 0.0 && m.w < 0.12 * flicker) g.weight = vec3(step(0.5, k.y));
	if (window > 0.0 && tick.z < 0.1 * flicker) g.weight = 1.0 - g.weight;
	vec3 tint = m.z < 0.2 ? (m.y < 0.5 ? vec3(1.35, 0.65, 1.25) : vec3(0.6, 1.25, 1.4)) : vec3(1.0);
	float bright = (1.0 + (k.w - 0.5) * 0.6) * (1.0 + (tick.w - 0.5) * 0.8 * flicker);
	g.gain = mix(vec3(1.0), bright * tint, window);
	return g;
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
