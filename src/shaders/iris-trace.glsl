// Sphere tracing of the iris field inside its shell (between the back
// paraboloid and a paraboloid IRIS_SHELL_HEIGHT above it), with Keinert et
// al.'s over-relaxation, followed by the queries the shading needs at the hit:
// the normal, the ambient occlusion and the key light's soft self-shadow.
// Positions are in iris space (eye space minus the pupil center).
//
// Every field evaluation of a pixel runs in ONE loop that steps through these
// phases. The field is large, and each place that calls it is a full inlined
// copy: a single call site keeps the program small enough for the GPU to run
// many pixels at once (several separate loops made it about twice as slow),
// and neighboring pixels in different phases still share the same code.
#ifndef IRIS_TRACE_GLSL
#define IRIS_TRACE_GLSL

#include ./iris-material.glsl
#include ./key-shadow.glsl
#include ./env-rig.glsl

uniform int uIrisSteps;
uniform int uIrisShadowSteps;
uniform int uIrisAoSteps;

#define IRIS_SHELL_HEIGHT 1.3
#define IRIS_MAX_PATH 4.0

#define IRIS_PHASE_MARCH 0
#define IRIS_PHASE_NORMAL 1
#define IRIS_PHASE_AO 2
#define IRIS_PHASE_SHADOW 3

struct IrisHit {
	bool hit;
	bool pupil; // went through the pupil
	vec3 p; // iris space
	float t;
	float footprint; // pixel footprint at the hit (mm)
	int steps; // march steps
	// At a hit: the shading inputs.
	vec3 albedo;
	vec4 atlas;
	vec3 n;
	float ao;
	// The key light (emitter 0): its direction inside the eye, the share
	// transmitted by the cornea, and its shadow (the lids' and lashes' times the
	// relief's own); `keyLit` is false when it does not light the point.
	bool keyLit;
	vec3 keyDirection;
	float keyTransmission;
	float keyShadow;
};

// The mip level whose texels match the footprint (ρ texels of the atlas).
float irisLodFor(float footprint) {
	float texel = (uIrisRest.y - uIrisRest.x) / float(IRIS_ATLAS_HEIGHT);
	return max(log2(footprint / texel), 0.0);
}

// The tetrahedron direction of normal tap `k` (0–3).
vec3 irisNormalTap(int k) {
	return 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
}

// Height above the surface of ambient occlusion tap `k`: quadratic spacing out
// to 0.3 mm (fiber-scale crevices and whole crypts).
float irisAoHeight(int k) {
	float s = float(k) / float(max(uIrisAoSteps - 1, 1));
	return 0.012 + 0.29 * s * s;
}

// Whether the key light reaches the hit through the cornea and past the lids
// (it then needs the relief's soft shadow), filling the key light fields.
bool irisKeyLight(inout IrisHit hit) {
	hit.keyLit = false;
	hit.keyShadow = 1.0;
	if (uEmitterCount <= 0) return false;
	vec4 A = uEmitters[0];
	int type = int(A.w + 0.5);
	if (type == EMITTER_LENS || type == EMITTER_BLOCKER) return false;
	vec3 entry;
	vec3 pEye = hit.p + vec3(uPupil.xy, 0.0);
	hit.keyDirection = lightThroughCornea(pEye, A.xyz, hit.keyTransmission, entry);
	if (dot(hit.n, hit.keyDirection) <= 0.0 || hit.keyTransmission <= 0.0) return false;
	hit.keyLit = true;
	// The lids and lashes shadow the light where it enters the cornea.
	hit.keyShadow = keyShadow((uEyeToWorld * vec4(entry, 1.0)).xyz);
	return hit.keyShadow > 0.0 && uIrisShadowSteps > 0;
}

// `ro`, `rd`: ray in eye space from the posterior cornea; the pixel footprint
// is coneOrigin + coneSpread · t (mm).
IrisHit traceIris(vec3 roEye, vec3 rd, float coneOrigin, float coneSpread) {
	IrisHit hit;
	hit.hit = false;
	hit.pupil = false;
	hit.steps = 0;
	hit.albedo = vec3(0.0);
	hit.atlas = vec4(0.0);
	hit.n = vec3(0.0, 0.0, 1.0);
	hit.ao = 1.0;
	hit.keyLit = false;
	hit.keyDirection = vec3(0.0, 0.0, 1.0);
	hit.keyTransmission = 0.0;
	hit.keyShadow = 1.0;
	vec3 ro = roEye - vec3(uPupil.xy, 0.0);
	float top = uIrisShape.x + IRIS_SHELL_HEIGHT;
	float c = uIrisShape.y;
	float t = 0.0;
	if (ro.z > top - c * dot(ro.xy, ro.xy)) {
		t = intersectParaboloid(ro, rd, top, c);
		if (t < 0.0) {
			hit.t = IRIS_MAX_PATH;
			return hit;
		}
	}
	float tBack = intersectParaboloid(ro, rd, uIrisShape.x, c);
	float tEnd = tBack > 0.0 ? tBack + 0.02 : t + IRIS_MAX_PATH;

	// March.
	float omega = 1.5;
	float previousRadius = 0.0;
	float stepLength = 0.0;
	float footprint = coneOrigin;
	// The shading queries: phase, tap within it, normal tap spacing, AO sum
	// and weight, soft shadow origin, distance, previous radius and result.
	int phase = IRIS_PHASE_MARCH;
	int k = 0;
	float eps = 0.0;
	vec3 normalSum = vec3(0.0);
	float occlusion = 0.0;
	float aoWeight = 1.0;
	vec3 shadowOrigin = vec3(0.0);
	float shadowT = 0.0;
	float shadowPrevious = 0.0;
	float shadowResult = 1.0;
	int budget = uIrisSteps + 4 + max(uIrisAoSteps, 0) + max(uIrisShadowSteps, 0);
	for (int i = ZERO; i < budget; i++) {
		vec3 q;
		if (phase == IRIS_PHASE_MARCH) {
			footprint = coneOrigin + coneSpread * t;
			gIrisLod = irisLodFor(footprint);
			q = ro + rd * t;
		} else if (phase == IRIS_PHASE_NORMAL) {
			q = hit.p + irisNormalTap(k) * eps;
		} else if (phase == IRIS_PHASE_AO) {
			q = hit.p + hit.n * irisAoHeight(k);
		} else {
			q = shadowOrigin + hit.keyDirection * shadowT;
		}

		// The one evaluation of the field.
		IrisParts parts = irisParts(q);
		float d = irisCombine(parts);

		if (phase == IRIS_PHASE_MARCH) {
			hit.steps = i + 1;
			float radius = abs(d);
			bool fail = omega > 1.0 && (radius + previousRadius) < stepLength;
			if (fail) {
				stepLength -= omega * stepLength;
				omega = 1.0;
			} else {
				stepLength = d * omega;
			}
			previousRadius = radius;
			if (!fail && radius < 0.5 * footprint) {
				hit.hit = true;
				hit.p = q;
				hit.albedo = irisAlbedo(parts);
				hit.atlas = parts.atlas;
				eps = max(0.5 * footprint, 0.002);
				phase = IRIS_PHASE_NORMAL;
				k = 0;
				continue;
			}
			t += stepLength;
			if (t > tEnd || hit.steps >= uIrisSteps) break;
		} else if (phase == IRIS_PHASE_NORMAL) {
			normalSum += irisNormalTap(k) * d;
			if (++k < 4) continue;
			hit.n = normalize(normalSum);
			phase = IRIS_PHASE_AO;
			k = 0;
			if (uIrisAoSteps > 0) continue;
		} else if (phase == IRIS_PHASE_AO) {
			float h = irisAoHeight(k);
			occlusion += saturate((h - d) / h) * aoWeight;
			aoWeight *= 0.85;
			if (++k < uIrisAoSteps) continue;
		} else {
			// Soft shadow along the key light (iq's improved penumbra).
			float y = d * d / (2.0 * shadowPrevious);
			float side = sqrt(max(d * d - y * y, 0.0));
			shadowResult = min(shadowResult, 10.0 * side / max(shadowT - y, 1e-4));
			shadowPrevious = d;
			shadowT += clamp(d, 0.01, 0.15);
			if (shadowResult >= 0.02 && shadowT <= 1.6 && ++k < uIrisShadowSteps) continue;
			hit.keyShadow *= saturate(shadowResult);
			break;
		}
		// The ambient occlusion is done: the key light's soft shadow, if needed.
		if (phase == IRIS_PHASE_AO) {
			hit.ao = saturate(1.0 - 0.7 * occlusion);
			if (!irisKeyLight(hit)) break;
			phase = IRIS_PHASE_SHADOW;
			k = 0;
			shadowOrigin = hit.p + hit.n * 0.003;
			shadowT = 0.01;
			shadowPrevious = 1e10;
		}
	}
	hit.footprint = footprint;
	if (hit.hit) {
		hit.t = t;
		return hit;
	}
	// Passed the shell: through the pupil, or (grazing) out of steps.
	vec3 back = tBack > 0.0 ? ro + rd * tBack : ro + rd * t;
	hit.pupil = length(back.xy) < uPupil.z;
	hit.p = back;
	hit.t = tBack > 0.0 ? tBack : t;
	return hit;
}

#endif
