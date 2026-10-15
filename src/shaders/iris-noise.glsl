// Gradient noise periodic in x (the polar angle wraps), hashed with PCG.
#ifndef IRIS_NOISE_GLSL
#define IRIS_NOISE_GLSL

#include ./common.glsl

// i modulo period, in [0, period). Float division: GPUs have no integer
// divider, and the operands stay far below 2^24.
int wrapIndex(int i, int period) {
	return i - period * int(floor(float(i) / float(period)));
}

vec2 latticeGradient(int x, int y, uint seed) {
	float a = TAU * hash01(uint(x), uint(y + 65536), seed);
	return vec2(cos(a), sin(a));
}

// In about [-1, 1]; `period` lattice cells along x.
float periodicNoise(vec2 p, int period, uint seed) {
	ivec2 i = ivec2(floor(p));
	vec2 f = p - vec2(i);
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	int x0 = wrapIndex(i.x, period);
	int x1 = wrapIndex(i.x + 1, period);
	float a = dot(latticeGradient(x0, i.y, seed), f);
	float b = dot(latticeGradient(x1, i.y, seed), f - vec2(1.0, 0.0));
	float c = dot(latticeGradient(x0, i.y + 1, seed), f - vec2(0.0, 1.0));
	float d = dot(latticeGradient(x1, i.y + 1, seed), f - vec2(1.0, 1.0));
	return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

#endif
