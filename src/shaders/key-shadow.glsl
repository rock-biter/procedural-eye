// Shadows of the lids, lashes and face from the key light (emitter 0),
// rendered by src/lighting/keyShadow.js into an orthographic depth map.
// Accumulation frames move the light across the emitter, so the mean of hard
// samples is the true penumbra. Interactive frames filter: the eye's
// receivers, shadowed by the lids and lashes close by, over a fixed third of
// a millimeter; the skin, shadowed by the face's own relief too, over an
// estimated penumbra (percentage-closer soft shadows: the occluders around
// the point give their mean distance, which times the light's apparent size
// is the penumbra's width), so a lash on the lid stays sharp and the brow's
// shadow is soft.
#ifndef KEY_SHADOW_GLSL
#define KEY_SHADOW_GLSL

#include ./common.glsl

uniform sampler2D uKeyShadowMap;
uniform mat4 uKeyShadowMatrix; // world → shadow clip
// Filter radius (uv; 0: hard samples), depth bias, enabled, the light's size
// over its distance (penumbra width per mm of occluder distance).
uniform vec4 uKeyShadowParams;

const vec2 SHADOW_DISK[12] = vec2[](
	vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
	vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
	vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

// The largest penumbra radius (uv): about 5 mm of the map.
#define SHADOW_MAX_RADIUS 0.06

// The point in the map: uv, the receiver's depth less the bias, and the fade
// toward the map's border (1: past it, lit), so a receiver there shows no edge.
vec4 keyShadowPoint(vec3 worldPos) {
	vec4 clip = uKeyShadowMatrix * vec4(worldPos, 1.0);
	vec3 ndc = clip.xyz / clip.w;
	float border = smoothstep(0.85, 1.0, max(abs(ndc.x), abs(ndc.y)));
	return vec4(ndc.xy * 0.5 + 0.5, ndc.z * 0.5 + 0.5 - uKeyShadowParams.y, border);
}

float keyShadow(vec3 worldPos) {
	if (uKeyShadowParams.z < 0.5) return 1.0;
	vec4 point = keyShadowPoint(worldPos);
	if (point.w >= 1.0) return 1.0;
	float lit = 0.0;
	if (uKeyShadowParams.x <= 0.0) {
		lit = step(point.z, texture(uKeyShadowMap, point.xy).r);
	} else {
		for (int i = ZERO; i < 12; i++) {
			lit += step(point.z, texture(uKeyShadowMap, point.xy + SHADOW_DISK[i] * uKeyShadowParams.x).r);
		}
		lit /= 12.0;
	}
	return mix(lit, 1.0, point.w);
}

// The skin, which also casts, with its normal. The bias grows with the
// filter's radius r times the tangent of the angle between the normal and
// the light: over r the receiver's own depth changes by that much, and a
// tilted receiver would otherwise shadow itself in part of the samples
// ("acne"). The map's scales and the light's direction come from the
// orthographic matrix.
float keyShadow(vec3 worldPos, vec3 normal) {
	if (uKeyShadowParams.z < 0.5) return 1.0;
	vec4 point = keyShadowPoint(worldPos);
	if (point.w >= 1.0) return 1.0;
	vec3 uvRow = vec3(uKeyShadowMatrix[0].x, uKeyShadowMatrix[1].x, uKeyShadowMatrix[2].x);
	vec3 depthRow = vec3(uKeyShadowMatrix[0].z, uKeyShadowMatrix[1].z, uKeyShadowMatrix[2].z);
	float uvPerMm = 0.5 * length(uvRow);
	float depthPerMm = 0.5 * length(depthRow);
	float cosine = abs(dot(normalize(normal), normalize(depthRow)));
	float slope = min(sqrt(max(1.0 - cosine * cosine, 0.0)) / max(cosine, 1e-3), 6.0);
	// Map depth of the receiver's own change per uv of radius.
	float tilt = slope * depthPerMm / uvPerMm;
	float texel = 1.0 / float(textureSize(uKeyShadowMap, 0).x);
	float lit = 0.0;
	if (uKeyShadowParams.x <= 0.0) {
		lit = step(point.z - 1.5 * texel * tilt, texture(uKeyShadowMap, point.xy).r);
	} else {
		// A disk turned per pixel, so a few samples do not band.
		float angle = TAU * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
		mat2 spin = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
		// Occluders within reach of the penumbra of one 6 mm away.
		float search = clamp(uKeyShadowParams.w * 3.0 * uvPerMm, uKeyShadowParams.x, SHADOW_MAX_RADIUS);
		float searchDepth = point.z - (search + 1.5 * texel) * tilt;
		float blockers = 0.0;
		float count = 0.0;
		for (int i = ZERO; i < 12; i++) {
			float depth = texture(uKeyShadowMap, point.xy + spin * SHADOW_DISK[i] * search).r;
			if (depth < searchDepth) {
				blockers += depth;
				count += 1.0;
			}
		}
		if (count < 0.5) return 1.0;
		float distance = (point.z - blockers / count) / depthPerMm;
		float radius = clamp(0.5 * uKeyShadowParams.w * distance * uvPerMm, uKeyShadowParams.x, SHADOW_MAX_RADIUS);
		float depth = point.z - (radius + 1.5 * texel) * tilt;
		for (int i = ZERO; i < 12; i++) {
			lit += step(depth, texture(uKeyShadowMap, point.xy + spin * SHADOW_DISK[i] * radius).r);
		}
		lit /= 12.0;
	}
	return mix(lit, 1.0, point.w);
}

#endif
