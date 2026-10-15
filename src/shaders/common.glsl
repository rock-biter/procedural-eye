// Shared constants, hashes and blend helpers. Guarded: every program includes
// it through several chunks.
#ifndef COMMON_GLSL
#define COMMON_GLSL

#define PI 3.14159265358979
#define TAU 6.28318530717959
#define INV_PI 0.318309886183791

// Always 0, but unknown to the compiler: loops written `for (int i = ZERO; ...)`
// are not unrolled, which keeps ANGLE-Metal compile times reasonable.
uniform int uZero;
#define ZERO uZero

float saturate(float x) {
	return clamp(x, 0.0, 1.0);
}

vec3 saturate(vec3 x) {
	return clamp(x, 0.0, 1.0);
}

float sq(float x) {
	return x * x;
}

// Rec. 709 luminance (three already defines luminance() for its materials).
float luma(vec3 c) {
	return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// PCG hash (Jarzynski & Olano 2020), twin of pcg() in src/random.js.
uint pcgHash(uint v) {
	uint state = v * 747796405u + 2891336453u;
	uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
	return (word >> 22u) ^ word;
}

// [0, 1) from up to three integers, twin of hash01() in src/random.js.
float hash01(uint a, uint b, uint c) {
	return float(pcgHash(pcgHash(pcgHash(a) + b) + c)) * (1.0 / 4294967296.0);
}

float hash01(int a, int b, int c) {
	return hash01(uint(a), uint(b), uint(c));
}

// Four [0, 1) numbers from one PCG hash (8 bits each): cheap per-instance
// randomness where 1/256 resolution is enough.
vec4 hashBytes(uint h) {
	return vec4(uvec4(h, h >> 8u, h >> 16u, h >> 24u) & 255u) * (1.0 / 256.0);
}

// Polynomial smooth minimum and maximum (iq), blend width k.
float smin(float a, float b, float k) {
	float h = max(k - abs(a - b), 0.0) / k;
	return min(a, b) - h * h * k * 0.25;
}

float smax(float a, float b, float k) {
	float h = max(k - abs(a - b), 0.0) / k;
	return max(a, b) + h * h * k * 0.25;
}

// C2 step, twin of smootherstep() in src/math.js.
float smootherstep(float edge0, float edge1, float x) {
	float t = saturate((x - edge0) / (edge1 - edge0));
	return t * t * t * (t * (6.0 * t - 15.0) + 10.0);
}

float smootherstepDerivative(float edge0, float edge1, float x) {
	float t = (x - edge0) / (edge1 - edge0);
	if (t <= 0.0 || t >= 1.0) return 0.0;
	return 30.0 * t * t * (t - 1.0) * (t - 1.0) / (edge1 - edge0);
}

#endif
