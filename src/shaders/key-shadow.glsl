// Shadows of the lids and lashes from the key light (emitter 0), rendered by
// src/lighting/keyShadow.js into an orthographic depth map. Interactive
// frames filter it (Poisson PCF); accumulation frames move the light across
// the emitter instead, so the mean of hard samples is the true penumbra.
#ifndef KEY_SHADOW_GLSL
#define KEY_SHADOW_GLSL

uniform sampler2D uKeyShadowMap;
uniform mat4 uKeyShadowMatrix; // world → shadow clip
uniform vec4 uKeyShadowParams; // filter radius (uv), depth bias, enabled, unused

const vec2 SHADOW_DISK[12] = vec2[](
	vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
	vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
	vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float keyShadow(vec3 worldPos) {
	if (uKeyShadowParams.z < 0.5) return 1.0;
	vec4 clip = uKeyShadowMatrix * vec4(worldPos, 1.0);
	vec3 ndc = clip.xyz / clip.w;
	vec2 uv = ndc.xy * 0.5 + 0.5;
	if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
	float depth = ndc.z * 0.5 + 0.5 - uKeyShadowParams.y;
	if (uKeyShadowParams.x <= 0.0) return step(depth, texture(uKeyShadowMap, uv).r);
	float lit = 0.0;
	for (int i = 0; i < 12; i++) {
		lit += step(depth, texture(uKeyShadowMap, uv + SHADOW_DISK[i] * uKeyShadowParams.x).r);
	}
	return lit / 12.0;
}

#endif
