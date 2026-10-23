// The Sharingan easter egg on the eyeball (src/eye/sharingan.js,
// docs/IRIS.md#sharingan): the Uchiha's patterns as pigment on the iris,
// read from their baked fields (sharingan-bake-fragment.glsl) and morphing
// from one to the next, and the Rinnegan's lavender and rings spreading over
// the sclera; the Rinnegan's hint showing through both for an instant.
#ifndef SHARINGAN_GLSL
#define SHARINGAN_GLSL

#include ./eye-profile.glsl

uniform sampler2D uSharinganMap; // the pattern's field: the distance to its ink, the weights of red, lavender and violet under it
uniform sampler2D uSharinganPrevious; // the field of the pattern it morphs from
uniform sampler2D uSharinganHint; // the Rinnegan's field, for its hint
uniform vec4 uSharingan; // amount (0–1), morph (0 the previous pattern, 1 this one), turn (radians, counterclockwise), the Rinnegan's reach over the sclera (0–1)
uniform vec4 uSharinganLook; // tissue showing through (0–1), glow radiance, the Rinnegan's hint (0–1), the morph's melt radius
uniform vec3 uSharinganPalette[4]; // ink, red, lavender, violet (linear)
uniform vec2 uRinnegan; // ring spacing along the globe, ring half-width (mm)

// The pixel's footprint (mm) where the sclera is shaded, set by the
// eyeball's programs.
float gSharinganFootprint = 0.01;

// The pattern's disc, SHARINGAN_PUPIL, SHARINGAN_EDGE, its field and morph,
// SHARINGAN_FIELD, SHARINGAN_ERODE, SHARINGAN_GROW and SHARINGAN_THIN, and
// its map, SHARINGAN_EXTENT and SHARINGAN_MAP_SIZE, are defines
// (SHARINGAN_DEFINES, src/eye/sharinganPatterns.js).
// How far (mm along the globe past the limbus) the Rinnegan reaches.
#define RINNEGAN_REACH 16.0

// How much darker the pattern is by the pupil and at the rim, as drawn
// (patternShade()).
float sharinganShade(float s) {
	return (0.55 + 0.45 * smoothstep(SHARINGAN_PUPIL, 0.6, s)) * (1.0 - 0.15 * smoothstep(0.8, 1.0, s));
}

// The color of a field's value (fieldColor()), edges `aa` wide.
vec3 sharinganColor(vec4 field, float aa) {
	vec3 under = field.yzw / max(field.y + field.z + field.w, 1e-3);
	vec3 color = under.x * uSharinganPalette[1] + under.y * uSharinganPalette[2] + under.z * uSharinganPalette[3];
	return mix(color, uSharinganPalette[0], saturate(0.5 - field.x / aa));
}

// The pattern's albedo at rest ρ and angle θ of the iris: its field at the
// mip level of `footprint` (the pixel's, in rest ρ), morphing from the
// previous pattern's (morphField()): the new ink grown in while the old one
// is still there, melted together by a smooth minimum whose radius peaks
// halfway, the old one then thinned away. `hint`: the Rinnegan's instead,
// unturned.
vec3 sharinganIris(float rho, float theta, float footprint, bool hint) {
	float s = SHARINGAN_PUPIL + rho / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL);
	float a = hint ? theta : theta - uSharingan.z;
	vec2 uv = s * vec2(cos(a), sin(a)) / (2.0 * SHARINGAN_EXTENT) + 0.5;
	float texel = 2.0 * SHARINGAN_EXTENT / float(SHARINGAN_MAP_SIZE);
	float aa = max(footprint / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL), texel);
	float lod = log2(aa / texel);
	if (hint) return sharinganColor(textureLod(uSharinganHint, uv, lod), aa) * sharinganShade(s);
	vec4 field = textureLod(uSharinganMap, uv, lod);
	float t = uSharingan.y;
	if (t < 1.0) {
		vec4 from = textureLod(uSharinganPrevious, uv, lod);
		float melt = max(uSharinganLook.w * sin(PI * t), 1e-4);
		float grown = 1.0 - smoothstep(0.0, SHARINGAN_GROW, t);
		float thinned = smoothstep(SHARINGAN_THIN, 1.0, t);
		float d = smin(from.x + thinned * SHARINGAN_ERODE, field.x + grown * SHARINGAN_ERODE, melt);
		field = vec4(d, mix(from.yzw, field.yzw, t));
	}
	return sharinganColor(field, aa) * sharinganShade(s);
}

// The Rinnegan over the sclera at eye-space point p, out to the front of its
// reach, or all of it as its hint shows through: lavender (a little of the
// white's own variations, `white` its color, still showing), with dark rings
// uRinnegan.x apart along the globe from the limbus, which continue those of
// the iris.
vec3 rinneganSclera(vec3 albedo, vec3 p, vec3 white) {
	float reach = uSharingan.w;
	float hint = uSharinganLook.z;
	if (reach <= 0.0 && hint <= 0.0) return albedo;
	float limbus = uGlobe.x * asin(min(uGlobe.y / uGlobe.x, 1.0));
	float arc = uGlobe.x * acos(clamp(p.z / length(p), -1.0, 1.0)) - limbus;
	float front = reach * RINNEGAN_REACH;
	float shown = reach > 0.0 ? 1.0 - smoothstep(front - 1.0, front, arc) : 0.0;
	vec3 color = uSharinganPalette[2] * mix(vec3(1.0), albedo / max(white, vec3(1e-3)), 0.35);
	float x = arc / uRinnegan.x;
	float line = abs(x - floor(x + 0.5)) * uRinnegan.x;
	float ink = saturate(0.5 - (line - uRinnegan.y) / max(gSharinganFootprint, 0.004));
	color = mix(color, uSharinganPalette[0], ink);
	return mix(albedo, color, max(shown, hint));
}

#endif
