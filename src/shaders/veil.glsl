// The haze (src/render/dofPass.js): light of the rig scattered toward the
// camera by the air between it and the surface. Over a distance d the scene
// keeps T = exp(−σ·d) of its radiance and the air adds (1 − T) of what it
// scatters along the ray: the background's radiance, the same in every
// direction, plus each light's irradiance times the phase of its angle to the
// ray, so the haze brightens toward a light behind it. The backdrop takes the
// haze of the dust volume's far end.
#ifndef VEIL_GLSL
#define VEIL_GLSL

#include ./scattering.glsl

#define VEIL_LIGHTS 4

uniform vec4 uVeil; // density σ (1/mm), far distance (mm), phase g, unused
uniform vec3 uVeilAmbient;
uniform vec3 uVeilLightDirection[VEIL_LIGHTS]; // world, toward the light
uniform vec3 uVeilLightIrradiance[VEIL_LIGHTS];
uniform int uVeilLightCount;
uniform mat3 uVeilBasis; // the camera's axes in world space
uniform vec2 uVeilTan; // tangents of the half fields of view (x, y)

// The direction (world) of the pinhole camera's ray through the pixel at `uv`.
vec3 veilRay(vec2 uv) {
	return normalize(uVeilBasis * vec3((uv * 2.0 - 1.0) * uVeilTan, -1.0));
}

// `color` seen at `distance` (mm) through the pixel at `uv`.
vec3 applyVeil(vec3 color, float distance, vec2 uv) {
	if (uVeil.x <= 0.0) return color;
	float transmittance = exp(-uVeil.x * clamp(distance, 0.0, uVeil.y));
	vec3 ray = veilRay(uv);
	vec3 air = uVeilAmbient;
	for (int i = ZERO; i < uVeilLightCount; i++) {
		air += uVeilLightIrradiance[i] * hgPhase(dot(uVeilLightDirection[i], ray), uVeil.z);
	}
	return color * transmittance + air * (1.0 - transmittance);
}

#endif
