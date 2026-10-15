// 3D gradient noise with analytic derivatives (iq), PCG-hashed: returns
// (value, d/dx, d/dy, d/dz), value in about [-1, 1].
#ifndef NOISE3_GLSL
#define NOISE3_GLSL

#include ./common.glsl

vec3 gradient3(ivec3 c, uint seed) {
	uint h = pcgHash(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(c.z) * 83492791u ^ seed);
	vec3 g = vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 511.5 - 1.0;
	return normalize(g + 1e-4);
}

vec4 gradientNoise3(vec3 p, uint seed) {
	ivec3 i = ivec3(floor(p));
	vec3 f = p - vec3(i);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
	vec3 ga = gradient3(i + ivec3(0, 0, 0), seed);
	vec3 gb = gradient3(i + ivec3(1, 0, 0), seed);
	vec3 gc = gradient3(i + ivec3(0, 1, 0), seed);
	vec3 gd = gradient3(i + ivec3(1, 1, 0), seed);
	vec3 ge = gradient3(i + ivec3(0, 0, 1), seed);
	vec3 gf = gradient3(i + ivec3(1, 0, 1), seed);
	vec3 gg = gradient3(i + ivec3(0, 1, 1), seed);
	vec3 gh = gradient3(i + ivec3(1, 1, 1), seed);
	float va = dot(ga, f - vec3(0, 0, 0));
	float vb = dot(gb, f - vec3(1, 0, 0));
	float vc = dot(gc, f - vec3(0, 1, 0));
	float vd = dot(gd, f - vec3(1, 1, 0));
	float ve = dot(ge, f - vec3(0, 0, 1));
	float vf = dot(gf, f - vec3(1, 0, 1));
	float vg = dot(gg, f - vec3(0, 1, 1));
	float vh = dot(gh, f - vec3(1, 1, 1));
	float value = va + u.x * (vb - va) + u.y * (vc - va) + u.z * (ve - va) + u.x * u.y * (va - vb - vc + vd) +
		u.y * u.z * (va - vc - ve + vg) + u.z * u.x * (va - vb - ve + vf) +
		u.x * u.y * u.z * (-va + vb + vc - vd + ve - vf - vg + vh);
	vec3 derivative = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.z * (ge - ga) + u.x * u.y * (ga - gb - gc + gd) +
		u.y * u.z * (ga - gc - ge + gg) + u.z * u.x * (ga - gb - ge + gf) +
		u.x * u.y * u.z * (-ga + gb + gc - gd + ge - gf - gg + gh) +
		du * (vec3(vb - va, vc - va, ve - va) + u.yzx * vec3(va - vb - vc + vd, va - vc - ve + vg, va - vb - ve + vf) +
			u.zxy * vec3(va - vb - ve + vf, va - vb - vc + vd, va - vc - ve + vg) +
			u.yzx * u.zxy * (-va + vb + vc - vd + ve - vf - vg + vh));
	return vec4(value, derivative) * 1.6;
}

#endif
