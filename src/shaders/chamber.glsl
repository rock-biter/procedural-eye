// What a ray sees once refracted into the anterior chamber: the iris (traced
// field, iris-trace.glsl and iris-shade.glsl), or through the pupil the
// anterior lens reflection (Purkinje III) over the dark fundus.
#ifndef CHAMBER_GLSL
#define CHAMBER_GLSL

#include ./iris-shade.glsl

struct ChamberResult {
	vec3 radiance;
	// Path length in the aqueous to what was seen, for the apparent depth.
	float distance;
};

// Polar grid every 0.5 mm and 15°, to judge the refraction.
float refractionGrid(float r, float theta) {
	float ringLine = abs(fract(r / 0.5 + 0.5) - 0.5) * 0.5;
	float spokeLine = abs(fract(theta / (PI / 12.0) + 0.5) - 0.5) * (PI / 12.0) * r;
	return 1.0 - smoothstep(0.0, 0.012, min(ringLine, spokeLine));
}

ChamberResult traceChamber(vec3 o, vec3 d, float coneOrigin, float coneSpread) {
	ChamberResult result;
	IrisHit hit = traceIris(o, d, coneOrigin, coneSpread);
	result.distance = hit.t;
	if (hit.hit) {
		result.radiance = shadeIris(hit);
#if DEBUG_VIEW == DEBUG_REFRACTION_CHECKER
		float r = length(hit.p.xy);
		result.radiance = mix(vec3(0.05), vec3(1.0, 0.85, 0.1), refractionGrid(r, atan(hit.p.y, hit.p.x)));
#endif
		return result;
	}
#if DEBUG_VIEW == DEBUG_IRIS_STEPS
	result.radiance = hit.pupil ? vec3(0.0) : vec3(1.0, 0.0, 1.0);
	return result;
#endif
	// Through the pupil: the anterior lens reflects a little, the fundus behind
	// is almost black.
	float tl = intersectConic(o, d, uLens.z, uLens.x, uLens.y);
	if (hit.pupil && tl > 0.0) {
		vec3 p = o + d * tl;
		vec3 n = conicNormal(p, uLens.z, uLens.x, uLens.y);
		float f = fresnelDielectric(dot(d, n), uIor.w / uIor.z);
		result.radiance = f * envRadiance(p, reflect(d, n)) + vec3(0.0025, 0.0012, 0.0010);
		result.distance = tl;
	} else {
		result.radiance = vec3(0.004, 0.003, 0.0025);
	}
	return result;
}

#endif
