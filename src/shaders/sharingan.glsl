// The Sharingan easter egg on the eyeball (src/eye/sharingan.js,
// docs/IRIS.md#sharingan): the Uchiha's patterns as pigment on the iris,
// painted from the compass constructions of src/eye/sharinganPatterns.js
// (twin: paintPattern(), patternShade()), and the Rinnegan's lavender and
// rings spreading over the sclera.
#ifndef SHARINGAN_GLSL
#define SHARINGAN_GLSL

#include ./eye-profile.glsl

uniform highp sampler2D uSharinganShapes; // a row a pattern (packPatterns())
uniform vec4 uSharingan; // pattern, previous pattern, blend (0 the previous, 1 the pattern), turn (radians, counterclockwise)
uniform vec4 uSharinganLevel; // amount (0–1), the Rinnegan's reach over the sclera (0–1), tissue (0–1), glow radiance
uniform vec3 uSharinganPalette[4]; // ink, red, lavender, violet (linear)
uniform vec2 uRinnegan; // ring spacing along the globe, ring half-width (mm)

// The pixel's footprint (mm) where the sclera is shaded, set by the
// eyeball's programs.
float gSharinganFootprint = 0.01;

#define SHARINGAN_PUPIL 0.17
#define SHARINGAN_EDGE 0.88
#define SHARINGAN_SHAPES 24
#define SHARINGAN_COPIES 6
#define SHARINGAN_TERMS 4
// How far (mm along the globe past the limbus) the Rinnegan reaches.
#define RINNEGAN_REACH 16.0

// The signed distance of a term (disc 1, outside 2, half-plane 3, spiral 4),
// a stroke along its edge with a half-width.
float sharinganTerm(int kind, vec4 term, vec2 q) {
	float d;
	if (kind == 1) {
		d = length(q - term.xy) - term.z;
	} else if (kind == 2) {
		d = term.z - length(q - term.xy);
	} else if (kind == 3) {
		d = dot(q, term.xy) - term.z;
	} else {
		float pitch = TAU * term.y;
		float t = (length(q) - term.x - term.y * atan(q.y, q.x)) / pitch;
		d = abs(t - floor(t + 0.5)) * abs(pitch);
	}
	return term.w > 0.0 ? abs(d) - term.w : d;
}

// The color of pattern `row` at `q` of its disc, edges `aa` wide: its base,
// then each shape over it, the nearest of its turned copies.
vec3 sharinganPaint(int row, vec2 q, float aa) {
	vec4 header = texelFetch(uSharinganShapes, ivec2(0, row), 0);
	int count = int(header.x + 0.5);
	vec3 color = uSharinganPalette[int(header.y + 0.5)];
	for (int i = ZERO; i < SHARINGAN_SHAPES; i++) {
		if (i >= count) break;
		int base = 1 + (1 + SHARINGAN_TERMS) * i;
		vec4 head = texelFetch(uSharinganShapes, ivec2(base, row), 0);
		vec4 terms[SHARINGAN_TERMS];
		int kinds[SHARINGAN_TERMS];
		int code = int(head.x + 0.5);
		int paint = code - 8 * (code / 8);
		code /= 8;
		for (int k = ZERO; k < SHARINGAN_TERMS; k++) {
			terms[k] = texelFetch(uSharinganShapes, ivec2(base + 1 + k, row), 0);
			kinds[k] = code - 8 * (code / 8);
			code /= 8;
		}
		int copies = int(head.y + 0.5);
		float d = 1e3;
		for (int c = ZERO; c < SHARINGAN_COPIES; c++) {
			if (c >= copies) break;
			float a = -(head.z + TAU * float(c) / float(copies));
			vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
			float e = -1e3;
			for (int k = ZERO; k < SHARINGAN_TERMS; k++) {
				if (kinds[k] > 0) e = max(e, sharinganTerm(kinds[k], terms[k], p));
			}
			if (head.w > 0.0) e = abs(e) - head.w;
			d = min(d, e);
		}
		color = mix(color, uSharinganPalette[paint], saturate(0.5 - d / aa));
	}
	return color;
}

// How much darker the pattern is by the pupil and at the rim, as drawn.
float sharinganShade(float s) {
	return (0.55 + 0.45 * smoothstep(SHARINGAN_PUPIL, 0.6, s)) * (1.0 - 0.15 * smoothstep(0.8, 1.0, s));
}

// The pattern's albedo at rest ρ and angle θ of the iris, crossfading from
// the previous pattern; `aa`: the pixel's footprint in rest ρ.
vec3 sharinganIris(float rho, float theta, float aa) {
	float s = SHARINGAN_PUPIL + rho / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL);
	float a = theta - uSharingan.w;
	vec2 q = s * vec2(cos(a), sin(a));
	float width = max(aa / SHARINGAN_EDGE * (1.0 - SHARINGAN_PUPIL), 0.002);
	vec3 color = sharinganPaint(int(uSharingan.x + 0.5), q, width);
	if (uSharingan.z < 1.0) color = mix(sharinganPaint(int(uSharingan.y + 0.5), q, width), color, uSharingan.z);
	return color * sharinganShade(s);
}

// The Rinnegan over the sclera at eye-space point p, out to the front of its
// reach: lavender (a little of the white's own variations, `white` its
// color, still showing), with dark rings uRinnegan.x apart along the globe
// from the limbus, which continue those of the iris.
vec3 rinneganSclera(vec3 albedo, vec3 p, vec3 white) {
	float reach = uSharinganLevel.y;
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
