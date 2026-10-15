// The eye's surfaces in eye space (mm), twin of src/eye/eyeProfile.js:
// sclera sphere, conic anterior cornea joined by a C2 limbus blend, spherical
// posterior cornea, conic anterior lens and the iris back paraboloid.
#ifndef EYE_PROFILE_GLSL
#define EYE_PROFILE_GLSL

#include ./common.glsl

uniform vec4 uGlobe; // sclera radius, limbus radius, limbus blend width, apex z
uniform vec4 uCornea; // anterior R, anterior Q, posterior R, posterior apex z
uniform vec4 uIor; // tear film, corneal stroma, aqueous, lens
uniform vec4 uLens; // anterior R, anterior Q, apex z, thickness
uniform vec4 uIrisShape; // base z, curvature, root radius, rest pupil radius
uniform vec4 uPupil; // center xy (eye space), radius, unused
uniform mat4 uEyeToWorld;

float conicSag(float r, float R, float Q) {
	float disc = 1.0 - (1.0 + Q) * r * r / (R * R);
	return r * r / (R * (1.0 + sqrt(max(disc, 0.0))));
}

float conicSagSlope(float r, float R, float Q) {
	return r / sqrt(max(R * R - (1.0 + Q) * r * r, 1e-9));
}

float corneaZ(float r) {
	return uGlobe.w - conicSag(r, uCornea.x, uCornea.y);
}

float scleraZ(float r) {
	return sqrt(max(uGlobe.x * uGlobe.x - r * r, 0.0));
}

float surfaceZ(float r) {
	float start = uGlobe.y - 0.5 * uGlobe.z;
	float end = uGlobe.y + 0.5 * uGlobe.z;
	if (r <= start) return corneaZ(r);
	if (r >= end) return scleraZ(r);
	float s = smootherstep(start, end, r);
	float zc = corneaZ(r);
	return zc + s * (scleraZ(r) - zc);
}

float surfaceSlope(float r) {
	float start = uGlobe.y - 0.5 * uGlobe.z;
	float end = uGlobe.y + 0.5 * uGlobe.z;
	float corneaSlope = -conicSagSlope(r, uCornea.x, uCornea.y);
	float scleraSlope = -r / max(scleraZ(r), 1e-6);
	if (r <= start) return corneaSlope;
	if (r >= end) return scleraSlope;
	float s = smootherstep(start, end, r);
	float ds = smootherstepDerivative(start, end, r);
	return corneaSlope + s * (scleraSlope - corneaSlope) + ds * (scleraZ(r) - corneaZ(r));
}

// Outward normal of the outer surface at a point on it.
vec3 surfaceNormal(vec3 p) {
	float r = length(p.xy);
	if (r < 1e-6) return vec3(0.0, 0.0, 1.0);
	return normalize(vec3(-surfaceSlope(r) * p.xy / r, 1.0));
}

// The point where the ray from `origin` along `dir` meets the analytic outer
// surface, refined from the rasterized point `guess` with Newton steps: the
// mesh only approximates the profile, the optics need the exact surface.
vec3 refineOnSurface(vec3 origin, vec3 dir, vec3 guess) {
	float t = dot(guess - origin, dir);
	for (int i = ZERO; i < 3; i++) {
		vec3 p = origin + dir * t;
		float r = max(length(p.xy), 1e-6);
		float g = p.z - surfaceZ(r);
		float dg = dir.z - surfaceSlope(r) * dot(p.xy, dir.xy) / r;
		if (abs(dg) < 1e-4) break;
		t -= g / dg;
	}
	return origin + dir * t;
}

float irisBackZ(float r) {
	return uIrisShape.x - uIrisShape.y * r * r;
}

#endif
