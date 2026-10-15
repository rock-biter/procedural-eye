// Shared lighting of the opaque world-space surfaces (skin, lashes) under the
// analytic rig: diffuse with a per-channel wrap (a cheap subsurface look),
// GGX specular from each emitter's representative point, mirror reflection
// of the rig for wet surfaces.
#ifndef LIT_SURFACE_GLSL
#define LIT_SURFACE_GLSL

#include ./env-rig.glsl

float ggxDistribution(float nh, float alpha) {
	float a2 = alpha * alpha;
	float d = nh * nh * (a2 - 1.0) + 1.0;
	return a2 / (PI * d * d);
}

float smithVisibility(float nv, float nl, float alpha) {
	float k = alpha * 0.5;
	return 0.25 / ((nv * (1.0 - k) + k) * (nl * (1.0 - k) + k));
}

float schlick(float cosTheta, float f0) {
	return f0 + (1.0 - f0) * pow(1.0 - saturate(cosTheta), 5.0);
}

// Diffuse with wrap per channel (`wrap` = red, green, blue reach past the
// terminator), specular GGX lobe of `roughness`, for every emitter, plus the
// background. `shadow0` dims emitter 0 (the key light) per channel: skin
// passes it with a softer red, the scattered light bleeding into the shadow.
vec3 litSurface(vec3 p, vec3 n, vec3 v, vec3 albedo, vec3 wrap, float roughness, float f0, float specular, vec3 shadow0) {
	vec3 color = albedo * INV_PI * backgroundIrradiance(n);
	float nv = max(dot(n, v), 1e-3);
	for (int i = ZERO; i < uEmitterCount; i++) {
		int base = i * EMITTER_VEC4S;
		vec4 A = uEmitters[base];
		int type = int(A.w + 0.5);
		if (type == EMITTER_LENS || type == EMITTER_BLOCKER) continue;
		vec3 toLight = A.xyz - p;
		float distance = length(toLight);
		vec3 l = toLight / distance;
		vec3 facing = emitterIrradiance(i, p, l);
		vec3 shadow = i == 0 ? shadow0 : vec3(1.0);
		float nl = dot(n, l);
		vec3 wrapped = saturate((vec3(nl) + wrap) / (1.0 + wrap));
		color += albedo * INV_PI * facing * wrapped * shadow;
		if (nl <= 0.0 || specular <= 0.0) continue;
		// Representative point: the emitter seen as a sphere of its size widens the lobe.
		vec4 B = uEmitters[base + 1];
		vec4 C = uEmitters[base + 2];
		float size = max(B.w, C.w) / distance;
		float alpha = roughness * roughness;
		float alphaWide = saturate(alpha + 0.5 * size);
		vec3 h = normalize(l + v);
		float d = ggxDistribution(max(dot(n, h), 0.0), alphaWide) * (alpha * alpha) / (alphaWide * alphaWide);
		float f = schlick(dot(v, h), f0);
		color += specular * facing * f * d * smithVisibility(nv, nl, alpha) * nl * shadow.g;
	}
	return color;
}

#endif
