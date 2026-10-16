// Sphere tracing of the iris field inside its shell (between the back
// paraboloid and a paraboloid IRIS_SHELL_HEIGHT above it), with Keinert et
// al.'s over-relaxation, plus the normal, ambient occlusion and soft shadow
// queries. Positions are in iris space (eye space minus the pupil center).
#ifndef IRIS_TRACE_GLSL
#define IRIS_TRACE_GLSL

#include ./cornea-optics.glsl
#include ./iris-sdf.glsl

uniform int uIrisSteps;
uniform int uIrisShadowSteps;
uniform int uIrisAoSteps;
uniform vec2 uDefocus; // camera aperture diameter, focus distance (mm)

// The camera's distance to the corneal point of the pixel and the path from
// there to the start of the trace (mm), set by eyeball-cap-fragment.glsl.
vec2 gIrisSight = vec2(0.0);

#define IRIS_SHELL_HEIGHT 1.3
#define IRIS_MAX_PATH 4.0

struct IrisHit {
	bool hit;
	bool pupil; // went through the pupil
	vec3 p; // iris space
	float t;
	float footprint; // pixel footprint at the hit (mm)
	int steps;
};

// The radius (mm) over which the depth of field spreads the point `t` mm
// along the trace: its apparent distance against the focus distance, as the
// interactive gather blurs it (src/render/dofPass.js).
float defocusBlur(float t) {
	float distance = gIrisSight.x + apparentDepth(gIrisSight.y + t);
	return 0.5 * uDefocus.x * abs(distance - uDefocus.y) / uDefocus.y;
}

// The ray footprint (mm) of the field's next evaluations, and the mip level
// whose texels match it (ρ texels of the atlas).
void setIrisFootprint(float footprint) {
	float texel = (uIrisRest.y - uIrisRest.x) / float(IRIS_ATLAS_HEIGHT);
	gIrisFootprint = footprint;
	gIrisLod = max(log2(footprint / texel), 0.0);
}

// `ro`, `rd`: ray in eye space from the posterior cornea; the pixel footprint
// is coneOrigin + coneSpread · t (mm).
IrisHit traceIris(vec3 roEye, vec3 rd, float coneOrigin, float coneSpread) {
	IrisHit hit;
	hit.hit = false;
	hit.pupil = false;
	hit.steps = 0;
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

	float omega = 1.5;
	float previousRadius = 0.0;
	float stepLength = 0.0;
	float footprint = coneOrigin;
	for (int i = ZERO; i < uIrisSteps; i++) {
		hit.steps = i + 1;
		footprint = coneOrigin + coneSpread * t;
		setIrisFootprint(footprint);
		gIrisBlur = defocusBlur(t);
		float signedRadius = irisField(ro + rd * t);
		float radius = abs(signedRadius);
		bool fail = omega > 1.0 && (radius + previousRadius) < stepLength;
		if (fail) {
			stepLength -= omega * stepLength;
			omega = 1.0;
		} else {
			stepLength = signedRadius * omega;
		}
		previousRadius = radius;
		if (!fail && radius < 0.5 * footprint) {
			hit.hit = true;
			break;
		}
		t += stepLength;
		if (t > tEnd) break;
	}
	hit.t = t;
	hit.p = ro + rd * t;
	hit.footprint = footprint;
	if (!hit.hit) {
		// Passed the shell: through the pupil, or (grazing) out of steps.
		vec3 back = tBack > 0.0 ? ro + rd * tBack : hit.p;
		hit.pupil = length(back.xy) < uPupil.z;
		hit.p = back;
		hit.t = tBack > 0.0 ? tBack : t;
	}
	return hit;
}

// Forward differences from `f0`, the field at `p`, which the shading has
// evaluated anyway: three evaluations instead of a tetrahedron's four.
vec3 irisNormal(vec3 p, float eps, float f0) {
	vec3 n = vec3(0.0);
	for (int i = ZERO; i < 3; i++) {
		vec3 e = vec3(i == 0, i == 1, i == 2);
		n += e * (irisField(p + e * eps) - f0);
	}
	return normalize(n);
}

float irisAmbientOcclusion(vec3 p, vec3 n) {
	float occlusion = 0.0;
	float weight = 1.0;
	// Quadratic spacing out to 0.3 mm: fiber-scale crevices and whole crypts.
	for (int i = ZERO; i < uIrisAoSteps; i++) {
		float s = float(i) / float(max(uIrisAoSteps - 1, 1));
		float h = 0.012 + 0.29 * s * s;
		occlusion += saturate((h - irisField(p + n * h)) / h) * weight;
		weight *= 0.85;
	}
	return saturate(1.0 - 0.7 * occlusion);
}

// Soft shadow along `l` (iq's improved penumbra); `k` sharpens it.
float irisSoftShadow(vec3 p, vec3 l, float k) {
	float result = 1.0;
	float t = 0.01;
	float previous = 1e10;
	for (int i = ZERO; i < uIrisShadowSteps; i++) {
		float h = irisField(p + l * t);
		float y = h * h / (2.0 * previous);
		float d = sqrt(max(h * h - y * y, 0.0));
		result = min(result, k * d / max(t - y, 1e-4));
		previous = h;
		t += clamp(h, 0.01, 0.15);
		if (result < 0.02 || t > 1.6) break;
	}
	return saturate(result);
}

#endif
