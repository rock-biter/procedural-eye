// The Sharingan easter egg on the eyeball (src/eye/sharingan.js,
// docs/IRIS.md#sharingan): the Uchiha's patterns as pigment on the iris,
// read from their maps (baked by sharingan-bake-fragment.glsl), and the
// Rinnegan's lavender and rings spreading over the sclera.
#ifndef SHARINGAN_GLSL
#define SHARINGAN_GLSL

#include ./eye-profile.glsl

uniform sampler2D uSharinganMap; // the pattern's palette weights over its disc
uniform sampler2D uSharinganPrevious; // the previous pattern's
uniform vec4 uSharingan; // amount (0–1), blend (0 the previous pattern, 1 this one), turn (radians, counterclockwise), the Rinnegan's reach over the sclera (0–1)
uniform vec2 uSharinganLook; // tissue showing through (0–1), glow radiance
uniform vec3 uSharinganPalette[4]; // ink, red, lavender, violet (linear)
uniform vec2 uRinnegan; // ring spacing along the globe, ring half-width (mm)

// The pixel's footprint (mm) where the sclera is shaded, set by the
// eyeball's programs.
float gSharinganFootprint = 0.01;

// The pattern's disc, SHARINGAN_PUPIL, SHARINGAN_EDGE, and its map,
// SHARINGAN_EXTENT and SHARINGAN_MAP_SIZE, are defines
// (SHARINGAN_DEFINES, src/eye/sharinganPatterns.js).
// How far (mm along the globe past the limbus) the Rinnegan reaches.
#define RINNEGAN_REACH 16.0

// How much darker the pattern is by the pupil and at the rim, as drawn
// (patternShade()).
float sharinganShade(float s) {
	return (0.55 + 0.45 * smoothstep(SHARINGAN_PUPIL, 0.6, s)) * (1.0 - 0.15 * smoothstep(0.8, 1.0, s));
}

// The pattern's albedo at rest ρ and angle θ of the iris, crossfading from
// the previous pattern; `footprint`: the pixel's in rest ρ, which picks the
// maps' mip level.
vec3 sharinganIris(float rho, float theta, float footprint) {
	float s = SHARINGAN_PUPIL + rho / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL);
	float a = theta - uSharingan.z;
	vec2 uv = s * vec2(cos(a), sin(a)) / (2.0 * SHARINGAN_EXTENT) + 0.5;
	float texel = 2.0 * SHARINGAN_EXTENT / float(SHARINGAN_MAP_SIZE);
	float lod = max(log2(footprint / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL) / texel), 0.0);
	vec4 w = textureLod(uSharinganMap, uv, lod);
	if (uSharingan.y < 1.0) w = mix(textureLod(uSharinganPrevious, uv, lod), w, uSharingan.y);
	w /= max(w.x + w.y + w.z + w.w, 1e-3);
	vec3 color = w.x * uSharinganPalette[0] + w.y * uSharinganPalette[1] + w.z * uSharinganPalette[2] + w.w * uSharinganPalette[3];
	return color * sharinganShade(s);
}

// The Rinnegan over the sclera at eye-space point p, out to the front of its
// reach: lavender (a little of the white's own variations, `white` its
// color, still showing), with dark rings uRinnegan.x apart along the globe
// from the limbus, which continue those of the iris.
vec3 rinneganSclera(vec3 albedo, vec3 p, vec3 white) {
	float reach = uSharingan.w;
	if (reach <= 0.0) return albedo;
	float limbus = uGlobe.x * asin(min(uGlobe.y / uGlobe.x, 1.0));
	float arc = uGlobe.x * acos(clamp(p.z / length(p), -1.0, 1.0)) - limbus;
	float front = reach * RINNEGAN_REACH;
	float shown = 1.0 - smoothstep(front - 1.0, front, arc);
	vec3 color = uSharinganPalette[2] * mix(vec3(1.0), albedo / max(white, vec3(1e-3)), 0.35);
	float x = arc / uRinnegan.x;
	float line = abs(x - floor(x + 0.5)) * uRinnegan.x;
	float ink = saturate(0.5 - (line - uRinnegan.y) / max(gSharinganFootprint, 0.004));
	color = mix(color, uSharinganPalette[0], ink);
	return mix(albedo, color, shown);
}

#endif
