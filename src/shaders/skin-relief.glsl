// Skin micro-relief: the network of fine grooves that divides the surface
// into small polygons (Worley cell borders at two scales), pores at some cell
// centers. Evaluated in the front plane (the lids face the camera), which
// keeps it to 2D cells.
#ifndef SKIN_RELIEF_GLSL
#define SKIN_RELIEF_GLSL

#include ./common.glsl

vec2 cellPoint(ivec2 c, uint seed) {
	uint h = pcgHash(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ seed);
	return vec2(float(h & 65535u), float(h >> 16u)) / 65535.0;
}

// F1, F2 distances of 2D Worley noise.
vec2 cellular2(vec2 p, uint seed) {
	ivec2 i = ivec2(floor(p));
	vec2 f = p - vec2(i);
	float f1 = 8.0;
	float f2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			ivec2 g = ivec2(x, y);
			vec2 r = vec2(g) + cellPoint(i + g, seed) - f;
			float d = dot(r, r);
			if (d < f1) {
				f2 = f1;
				f1 = d;
			} else if (d < f2) {
				f2 = d;
			}
		}
	}
	return sqrt(vec2(f1, f2));
}

// Height (mm, ≤ 0) of the micro-relief at front-plane point p (mm):
// `grooves` and `pores` 0–1; `detail` 0–1 fades the fine scale when a pixel
// is larger than it.
float skinRelief(vec2 p, float grooves, float pores, float detail) {
	vec2 coarse = cellular2(p * 3.2, 41u);
	float height = -0.012 * grooves * exp(-sq((coarse.y - coarse.x) / 0.1));
	height -= 0.01 * pores * exp(-sq(coarse.x / 0.13)) * step(0.55, cellPoint(ivec2(floor(p * 3.2)), 43u).x);
	if (detail > 0.0) {
		vec2 fine = cellular2(p * 7.5, 42u);
		height -= 0.006 * grooves * detail * exp(-sq((fine.y - fine.x) / 0.12));
	}
	return height;
}

#endif
