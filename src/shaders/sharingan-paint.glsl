// The Sharingan's patterns as compass constructions (src/eye/sharinganPatterns.js),
// evaluated where the bake draws a pattern's field (sharingan-bake-fragment.glsl).
#ifndef SHARINGAN_PAINT_GLSL
#define SHARINGAN_PAINT_GLSL

#include ./common.glsl

uniform highp sampler2D uSharinganShapes; // a row a pattern (packPatterns())

#define SHARINGAN_SHAPES 24
#define SHARINGAN_COPIES 6
#define SHARINGAN_TEXELS 6

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

// The field of pattern `row` at `q` of its disc (twin of patternField() in
// src/eye/sharinganPatterns.js): the signed distance to its ink, saturating
// softly at SHARINGAN_FIELD, then the weights of red, lavender and violet
// under it, edges `aa` wide. The ink is a union of the ink shapes, each
// other shape cutting itself out of it; the color under it is the base (or
// the pattern's own on an ink base) with every other shape painted over it.
// A shape away from its bounds by more than the field reaches is skipped,
// and a copy as soon as a term puts it that far (the intersection only
// grows).
vec4 sharinganField(int row, vec2 q, float aa) {
	vec4 header = texelFetch(uSharinganShapes, ivec2(0, row), 0);
	int count = int(header.x + 0.5);
	int base = int(header.y + 0.5);
	float d = base == 0 ? -1e3 : 1e3;
	vec3 under = vec3(equal(ivec3(1, 2, 3), ivec3(base == 0 ? int(header.w + 0.5) : base)));
	float far = 4.0 * SHARINGAN_FIELD;
	float r = length(q);
	for (int i = ZERO; i < SHARINGAN_SHAPES; i++) {
		if (i >= count) break;
		int texel = 1 + SHARINGAN_TEXELS * i;
		vec4 bounds = texelFetch(uSharinganShapes, ivec2(texel + 1, row), 0);
		if (r < bounds.x - far || r > bounds.y + far) continue;
		vec4 head = texelFetch(uSharinganShapes, ivec2(texel, row), 0);
		vec4 t0 = texelFetch(uSharinganShapes, ivec2(texel + 2, row), 0);
		vec4 t1 = texelFetch(uSharinganShapes, ivec2(texel + 3, row), 0);
		vec4 t2 = texelFetch(uSharinganShapes, ivec2(texel + 4, row), 0);
		vec4 t3 = texelFetch(uSharinganShapes, ivec2(texel + 5, row), 0);
		int code = int(head.x + 0.5);
		int paint = code - 8 * (code / 8);
		int k0 = (code / 8) - 8 * (code / 64);
		int k1 = (code / 64) - 8 * (code / 512);
		int k2 = (code / 512) - 8 * (code / 4096);
		int k3 = code / 4096;
		int copies = int(head.y + 0.5);
		float reach = far + head.w;
		float distance = 1e3;
		for (int c = ZERO; c < SHARINGAN_COPIES; c++) {
			if (c >= copies) break;
			float a = -(head.z + TAU * float(c) / float(copies));
			vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
			float e = sharinganTerm(k0, t0, p);
			if (k1 > 0 && e < reach) e = max(e, sharinganTerm(k1, t1, p));
			if (k2 > 0 && e < reach) e = max(e, sharinganTerm(k2, t2, p));
			if (k3 > 0 && e < reach) e = max(e, sharinganTerm(k3, t3, p));
			if (head.w > 0.0) e = abs(e) - head.w;
			distance = min(distance, e);
		}
		if (paint == 0) {
			d = min(d, distance);
		} else {
			d = max(d, -distance);
			under = mix(under, vec3(equal(ivec3(1, 2, 3), ivec3(paint))), saturate(0.5 - distance / aa));
		}
	}
	return vec4(SHARINGAN_FIELD * tanh(d / SHARINGAN_FIELD), under);
}

#endif
