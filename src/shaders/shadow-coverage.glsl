// What blocks a light, soft (src/lighting/shadowCoverage.js), for what lies
// around the casters: a point behind them, as seen from the light, is
// shadowed by their blurred coverage, the softer blur the farther behind; a
// point in front of them is lit. The key's coverage shadows the dust's key
// light; the light shafts' coverage the dust and the floor below the face
// softly, and cuts the beams on the surfaces (shaft-light.glsl) and in the air
// along the casters' sharp outline.
#ifndef SHADOW_COVERAGE_GLSL
#define SHADOW_COVERAGE_GLSL

#include ./common.glsl

// Each: r, g: share blocked and × depth (mm), a little blurred; b, a: the
// same, soft; world → coverage clip; (enabled, unused, distance (mm) behind
// the casters where the shadow is softest, unused); the light's position and
// view direction (world).
uniform sampler2D uKeyCoverage;
uniform mat4 uKeyCoverageMatrix;
uniform vec4 uKeyCoverageParams;
uniform vec3 uKeyCoverageEye;
uniform vec3 uKeyCoverageForward;
uniform sampler2D uShaftCoverage;
uniform mat4 uShaftCoverageMatrix;
uniform vec4 uShaftCoverageParams;
uniform vec3 uShaftCoverageEye;
uniform vec3 uShaftCoverageForward;

// The coverage at `worldPos`: its four channels, the point's depth behind
// the casters' (mm; the sharp estimate near them, the soft one around), and
// the fade toward the map's border (1: past it, unblocked).
vec4 coverageAt(sampler2D map, mat4 matrix, vec3 eye, vec3 forward, vec3 worldPos, out float behind, out float border) {
	behind = -1e4;
	border = 1.0;
	vec4 clip = matrix * vec4(worldPos, 1.0);
	if (clip.w <= 1e-3) return vec4(0.0);
	vec2 ndc = clip.xy / clip.w;
	border = smoothstep(0.9, 1.0, max(abs(ndc.x), abs(ndc.y)));
	if (border >= 1.0) return vec4(0.0);
	vec4 k = textureLod(map, ndc * 0.5 + 0.5, 0.0);
	float near = k.g / max(k.r, 1e-4);
	float far = k.a / max(k.b, 1e-4);
	behind = dot(worldPos - eye, forward) - mix(far, near, saturate(k.r * 4.0));
	return k;
}

// The share of the light blocked at `worldPos` (0 to 1), taken `bias` mm
// nearer the light: a surface that casts too leaves itself lit. Soft: the
// farther behind the casters, the wider the penumbra.
float coverage(sampler2D map, mat4 matrix, vec4 params, vec3 eye, vec3 forward, vec3 worldPos, float bias) {
	if (params.x < 0.5) return 0.0;
	float behind;
	float border;
	vec4 k = coverageAt(map, matrix, eye, forward, worldPos, behind, border);
	behind -= bias;
	float soft = saturate(behind / params.z);
	return mix(k.r, k.b, soft) * smoothstep(-2.0, 2.0, behind) * (1.0 - border);
}

// The same along the casters' sharp outline at any distance behind them: for
// what must vanish in their shadow, the light shafts.
float coverageSharp(sampler2D map, mat4 matrix, vec4 params, vec3 eye, vec3 forward, vec3 worldPos, float bias) {
	if (params.x < 0.5) return 0.0;
	float behind;
	float border;
	vec4 k = coverageAt(map, matrix, eye, forward, worldPos, behind, border);
	return k.r * smoothstep(-2.0, 2.0, behind - bias) * (1.0 - border);
}

float keyCover(vec3 worldPos) {
	return coverage(uKeyCoverage, uKeyCoverageMatrix, uKeyCoverageParams, uKeyCoverageEye, uKeyCoverageForward, worldPos, 0.0);
}

float shaftCover(vec3 worldPos) {
	return coverage(uShaftCoverage, uShaftCoverageMatrix, uShaftCoverageParams, uShaftCoverageEye, uShaftCoverageForward, worldPos, 0.0);
}

// Whether the light shafts' source sees `worldPos` past the casters, sharp.
float shaftCut(vec3 worldPos, float bias) {
	return coverageSharp(uShaftCoverage, uShaftCoverageMatrix, uShaftCoverageParams, uShaftCoverageEye, uShaftCoverageForward, worldPos, bias);
}

#endif
