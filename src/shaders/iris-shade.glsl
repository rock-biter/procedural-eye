// Lighting of the iris through the cornea: each emitter's irradiance reaches
// the iris along the direction refracted at the anterior cornea, reduced by
// the Fresnel transmission there; the strongest emitter also casts the soft
// self-shadows of the relief. Ambient light from the background is occluded
// by the relief (AO). The trace (iris-trace.glsl) brings the albedo
// (iris-material.glsl), the normal, the occlusion and the key light's shadow.
#ifndef IRIS_SHADE_GLSL
#define IRIS_SHADE_GLSL

#include ./iris-trace.glsl
#include ./sclera.glsl
#include ./debug-views.glsl

vec3 shadeIris(IrisHit hit) {
	vec3 pEye = hit.p + vec3(uPupil.xy, 0.0);
	vec3 n = hit.n;
	float ao = hit.ao;
	vec3 albedo = hit.albedo;

	// The ambient light reaching the iris comes through the cornea, under the lids.
	float lidAmbient = lidOcclusion((uEyeToWorld * vec4(pEye, 1.0)).xyz);
	vec3 radiance = albedo * INV_PI * backgroundIrradiance(n) * ao * 0.6 * mix(0.4, 1.0, lidAmbient);
	for (int i = ZERO; i < uEmitterCount; i++) {
		int base = i * EMITTER_VEC4S;
		vec4 A = uEmitters[base];
		int type = int(A.w + 0.5);
		if (type == EMITTER_LENS || type == EMITTER_BLOCKER) continue;
		float transmission;
		vec3 l;
		float shadow = 1.0;
		if (i == 0) {
			if (!hit.keyLit) continue;
			l = hit.keyDirection;
			transmission = hit.keyTransmission;
			shadow = hit.keyShadow;
		} else {
			vec3 entry;
			l = lightThroughCornea(pEye, A.xyz, transmission, entry);
		}
		float cosine = dot(n, l);
		if (cosine <= 0.0 || transmission <= 0.0) continue;
		vec3 facing = emitterIrradiance(i, pEye, normalize(A.xyz - pEye));
		radiance += albedo * INV_PI * facing * transmission * cosine * shadow * mix(0.6, 1.0, ao);
	}

#if DEBUG_VIEW == DEBUG_IRIS_NORMALS
	radiance = n * 0.5 + 0.5;
#elif DEBUG_VIEW == DEBUG_IRIS_AO
	radiance = vec3(ao);
#elif DEBUG_VIEW == DEBUG_IRIS_ATLAS
	vec4 atlas = hit.atlas;
	radiance = vec3(atlas.r / 0.8, saturate(-atlas.a / 0.3), saturate(atlas.a / 1.5));
#elif DEBUG_VIEW == DEBUG_IRIS_STEPS
	float s = float(hit.steps) / float(uIrisSteps);
	radiance = mix(vec3(0.0, 0.2, 1.0), vec3(1.0, 0.1, 0.0), s) * (hit.steps >= uIrisSteps ? 2.0 : 1.0);
#endif
	return radiance;
}

#endif
