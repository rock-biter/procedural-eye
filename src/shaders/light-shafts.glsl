// The light shafts in the air (src/lighting/shaftLight.js, src/render/dofPass.js):
// a few Gaussian blades of the key light, from a source at a finite distance,
// whose light the air scatters toward the camera. Along a pixel's ray, from
// the camera to the surface it meets, a beam's density integrates in closed
// form: across, along its long side and down its axis (the reach) it is a
// Gaussian, so along the ray too, with erf at the segment's ends. No geometry
// and no singular view: a beam fades into the skin where it passes through it,
// fades out down its axis, and costs the same at any zoom. Its σ widens with
// the distance from the source, taken at the ray's densest point. A beam
// seen end on fades (the sin² of the ray against its axis), so the beams
// show most when the camera looks across them. The casters cut a beam where
// it passes behind them, as seen from the source, along their sharp outline
// however far behind (shadow-coverage.glsl, at the ray's densest point). Twin of beamIntegral() in
// src/atmosphere/lightShafts.js.
#ifndef LIGHT_SHAFTS_GLSL
#define LIGHT_SHAFTS_GLSL

#include ./veil.glsl
#include ./shaft-light.glsl

uniform vec4 uShaftCenters[MAX_SHAFTS]; // center (world), intensity
uniform vec4 uShaftAxes[MAX_SHAFTS]; // axis from the source (unit), the source's distance (mm)
uniform vec4 uShaftSides[MAX_SHAFTS]; // thin side (unit), σ across (mm)
uniform int uShaftCount;
uniform vec3 uShaftAir; // light scattered per mm of beam (rgb)
uniform vec4 uShaftAirParams; // elongation, how much the casters cut the beams, unused, unused
uniform vec3 uShaftOrigin; // the camera (world)

// erf by Winitzki's approximation (within 1.3e-4), twin of erf() in
// src/atmosphere/lightShafts.js.
float shaftErf(float x) {
	float x2 = x * x;
	float value = sqrt(1.0 - exp(-x2 * (1.27323954 + 0.147 * x2) / (1.0 + 0.147 * x2)));
	return x < 0.0 ? -value : value;
}

// `color` seen at `distance` (mm) through the pixel at `uv`, with the light the
// beams in front of it scatter toward the camera.
vec3 applyShafts(vec3 color, float distance, vec2 uv) {
	if (uShaftCount == 0) return color;
	vec3 ray = veilRay(uv);
	float far = clamp(distance, 0.0, 1e4);
	float reach = 1.0 / (uShaftReach * uShaftReach);
	float sum = 0.0;
	for (int i = ZERO; i < uShaftCount; i++) {
		vec4 center = uShaftCenters[i];
		vec4 axis = uShaftAxes[i];
		vec4 side = uShaftSides[i];
		vec3 longSide = cross(axis.xyz, side.xyz);
		vec3 offset = uShaftOrigin - center.xyz;
		vec3 p = vec3(dot(offset, side.xyz), dot(offset, longSide), dot(offset, axis.xyz));
		vec3 d = vec3(dot(ray, side.xyz), dot(ray, longSide), dot(ray, axis.xyz));
		// Its densest point untapered, then σ at that distance from the source.
		vec3 inverse = vec3(1.0 / (side.w * side.w), 1.0 / sq(side.w * uShaftAirParams.x), reach);
		float t = -dot(p * d, inverse) / dot(d * d, inverse);
		float taper = clamp((axis.w + p.z + t * d.z) / axis.w, 0.25, 4.0);
		inverse.xy /= taper * taper;
		float a = dot(d * d, inverse);
		float b = dot(p * d, inverse);
		t = -b / a;
		float m = max(dot(p * p, inverse) + b * t, 0.0);
		if (m > 12.0) continue;
		float q = sqrt(0.5 * a);
		float along = shaftErf((far - t) * q) - shaftErf(-t * q);
		float integral = center.w * exp(-0.5 * m) * sqrt(1.5707963 / a) * along * max(1.0 - d.z * d.z, 0.0);
		float cut = shaftCut(uShaftOrigin + ray * clamp(t, 0.0, far), 0.0);
		sum += integral * (1.0 - uShaftAirParams.y * cut);
	}
	return color + uShaftAir * sum;
}

#endif
