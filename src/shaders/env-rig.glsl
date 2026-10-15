// The analytic light rig (src/lighting/envRig.js packs it): mirror rays are
// intersected with the emitter shapes exactly, diffuse surfaces integrate
// their irradiance. Emitters arrive in the space of the including material
// (eye space for the eyeball, world space for the lids), with `uEnvUp` the
// world's up direction in that space.
#ifndef ENV_RIG_GLSL
#define ENV_RIG_GLSL

#include ./common.glsl

#define EMITTER_RECT 0
#define EMITTER_DISK 1
#define EMITTER_OCTAGON 2
#define EMITTER_WINDOW 3
#define EMITTER_RING 4
#define EMITTER_LEDS 5
#define EMITTER_LENS 6
#define EMITTER_BLOCKER 7

uniform vec4 uEmitters[MAX_EMITTERS * EMITTER_VEC4S];
uniform int uEmitterCount;
uniform vec4 uRoom; // radiance, floor factor
uniform vec4 uSkyZenith; // radiance, enabled
uniform vec4 uSkyHorizon; // radiance, sin(horizon elevation)
uniform vec4 uSkyGround; // radiance, tree-line amount
uniform vec3 uEnvUp;

float envHash(vec2 p) {
	return hash01(uint(int(floor(p.x)) + 4096), uint(int(floor(p.y)) + 4096), 17u);
}

float envValueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = envHash(i);
	float b = envHash(i + vec2(1.0, 0.0));
	float c = envHash(i + vec2(0.0, 1.0));
	float d = envHash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Radiance of the room (or the outdoor sky) in direction `dir`.
vec3 backgroundRadiance(vec3 dir) {
	float y = dot(dir, uEnvUp);
	if (uSkyZenith.w > 0.5) {
		float horizon = uSkyHorizon.w;
		// A ragged tree line just above the horizon.
		vec3 side = normalize(dir - uEnvUp * y + vec3(1e-5));
		float azimuth = atan(side.x, side.z);
		float tree = uSkyGround.w * 0.06 * (0.55 + 0.45 * envValueNoise(vec2(azimuth * 18.0, 0.0)) +
			0.35 * envValueNoise(vec2(azimuth * 71.0, 3.0)));
		if (y < horizon + tree) {
			float fade = smoothstep(horizon - 0.25, horizon, y);
			return uSkyGround.rgb * mix(0.35, 1.0, fade) * (y < horizon ? 1.0 : 0.6);
		}
		float t = saturate((y - horizon) / (1.0 - horizon));
		return mix(uSkyHorizon.rgb, uSkyZenith.rgb, pow(t, 0.6));
	}
	float up = smoothstep(-0.35, 0.65, y);
	return uRoom.rgb * mix(uRoom.w, 1.12, up);
}

// Radiance and coverage of an emitter at its normalized coordinates `uv`.
vec4 emitterShape(int type, vec2 uv, vec4 B, vec4 D, vec4 E, vec4 F) {
	float soft = max(D.w, 1e-3);
	if (type == EMITTER_RECT || type == EMITTER_BLOCKER) {
		float d = max(abs(uv.x), abs(uv.y));
		float coverage = 1.0 - smoothstep(1.0 - soft, 1.0, d);
		float hot = 1.0 + E.x * (1.0 - dot(uv, uv) * 0.5);
		return vec4(D.rgb * hot / (1.0 + E.x * 0.5), coverage);
	}
	if (type == EMITTER_DISK || type == EMITTER_LENS) {
		float d = length(uv);
		float coverage = 1.0 - smoothstep(1.0 - soft, 1.0, d);
		vec3 radiance = D.rgb;
		if (type == EMITTER_LENS) {
			// The front element and the bright rim of the barrel.
			radiance *= 1.0 + 6.0 * smoothstep(E.x - 0.03, E.x, d) * (1.0 - smoothstep(E.x, E.x + 0.04, d));
		} else {
			radiance *= 1.0 + E.x * (1.0 - d * d * 0.5);
		}
		return vec4(radiance, coverage);
	}
	if (type == EMITTER_OCTAGON) {
		vec2 a = abs(uv);
		float d = max(max(a.x, a.y), (a.x + a.y) * 0.70710678);
		float coverage = 1.0 - smoothstep(1.0 - soft, 1.0, d);
		float hot = 1.0 + E.x * (1.0 - dot(uv, uv) * 0.5);
		return vec4(D.rgb * hot / (1.0 + E.x * 0.5), coverage);
	}
	if (type == EMITTER_WINDOW) {
		float d = max(abs(uv.x), abs(uv.y));
		float coverage = 1.0 - smoothstep(1.0 - soft, 1.0, d);
		vec2 s = uv * 0.5 + 0.5;
		vec2 cells = s * E.xy;
		vec2 f = fract(cells);
		vec2 border = min(f, 1.0 - f) / E.xy;
		// Mullions and the frame (pane borders at the edge) are dark wood or metal.
		float mullion = max(step(border.x, 0.5 * E.z), step(border.y, 0.5 * E.w));
		vec3 sky = mix(F.rgb, D.rgb, smoothstep(0.0, 1.0, s.y));
		// A faint skyline at the bottom of the lower panes.
		float skyline = step(s.y, 0.12 + 0.1 * envValueNoise(vec2(s.x * 23.0, 1.0)));
		sky *= mix(1.0, 0.35, skyline);
		vec3 frame = uRoom.rgb * 0.25;
		return vec4(mix(sky, frame, mullion), coverage);
	}
	if (type == EMITTER_RING) {
		float r = length(uv);
		float coverage = smoothstep(E.x - soft, E.x, r) * (1.0 - smoothstep(1.0 - soft, 1.0, r));
		return vec4(D.rgb, coverage);
	}
	if (type == EMITTER_LEDS) {
		vec2 p = uv * B.w;
		float count = max(E.x, 1.0);
		float angleStep = TAU / count;
		float k = floor(atan(p.y, p.x) / angleStep + 0.5);
		vec2 center = E.y * vec2(cos(k * angleStep), sin(k * angleStep));
		float d = length(p - center) / max(E.z, 1e-3);
		float coverage = 1.0 - smoothstep(1.0 - soft, 1.0, d);
		return vec4(D.rgb * (1.0 + 0.6 * (1.0 - d * d)), coverage);
	}
	return vec4(0.0);
}

// Radiance seen from `origin` along unit `dir`: the nearest emitter, blended
// over what lies behind by its edge coverage, else the background.
vec3 envRadiance(vec3 origin, vec3 dir) {
	vec3 color = backgroundRadiance(dir);
	float nearest = 1e20;
	for (int i = ZERO; i < uEmitterCount; i++) {
		int base = i * EMITTER_VEC4S;
		vec4 A = uEmitters[base];
		vec4 B = uEmitters[base + 1];
		vec4 C = uEmitters[base + 2];
		vec3 normal = cross(B.xyz, C.xyz);
		float denom = dot(dir, normal);
		if (abs(denom) < 1e-7) continue;
		float t = dot(A.xyz - origin, normal) / denom;
		if (t <= 0.0 || t >= nearest) continue;
		vec3 q = origin + dir * t - A.xyz;
		vec2 uv = vec2(dot(q, B.xyz) / B.w, dot(q, C.xyz) / C.w);
		if (max(abs(uv.x), abs(uv.y)) > 1.0) continue;
		vec4 hit = emitterShape(int(A.w + 0.5), uv, B, uEmitters[base + 3], uEmitters[base + 4], uEmitters[base + 5]);
		if (hit.a <= 0.0) continue;
		color = mix(color, hit.rgb, hit.a);
		if (hit.a > 0.99) nearest = t;
	}
	return color;
}

// Irradiance per unit radiance of a uniform quad (corners a, b, c, d, counter-
// clockwise seen from its lit side) at a point with normal n: Lambert's
// polygon formula ½·Σθᵢ(n·Γᵢ), exact without horizon clipping, clamped.
float quadFormFactor(vec3 p, vec3 n, vec3 a, vec3 b, vec3 c, vec3 d) {
	vec3 v0 = normalize(a - p);
	vec3 v1 = normalize(b - p);
	vec3 v2 = normalize(c - p);
	vec3 v3 = normalize(d - p);
	vec3 f = vec3(0.0);
	f += acos(clamp(dot(v0, v1), -1.0, 1.0)) * normalize(cross(v0, v1));
	f += acos(clamp(dot(v1, v2), -1.0, 1.0)) * normalize(cross(v1, v2));
	f += acos(clamp(dot(v2, v3), -1.0, 1.0)) * normalize(cross(v2, v3));
	f += acos(clamp(dot(v3, v0), -1.0, 1.0)) * normalize(cross(v3, v0));
	return max(-dot(f, n), 0.0) * 0.5;
}

// Average radiance of an emitter (for its diffuse contribution).
vec3 emitterMeanRadiance(int type, vec4 D, vec4 E, vec4 F) {
	if (type == EMITTER_WINDOW) return 0.5 * (D.rgb + F.rgb) * (1.0 - E.z * E.x) * (1.0 - E.w * E.y);
	if (type == EMITTER_RECT || type == EMITTER_OCTAGON || type == EMITTER_DISK) {
		return D.rgb * (1.0 + E.x * 0.67) / (1.0 + E.x * 0.5);
	}
	return D.rgb;
}

// Emitting area in units of the bounding quad (4·hw·hh).
float emitterFill(int type, vec4 E) {
	if (type == EMITTER_DISK) return PI / 4.0;
	if (type == EMITTER_OCTAGON) return 0.8284271;
	if (type == EMITTER_RING) return PI / 4.0 * (1.0 - E.x * E.x);
	if (type == EMITTER_LEDS) return 0.0;
	return 1.0;
}

// Irradiance at `p` with normal `n` from emitter `i` alone.
vec3 emitterIrradiance(int i, vec3 p, vec3 n) {
	int base = i * EMITTER_VEC4S;
	vec4 A = uEmitters[base];
	vec4 B = uEmitters[base + 1];
	vec4 C = uEmitters[base + 2];
	vec4 D = uEmitters[base + 3];
	vec4 E = uEmitters[base + 4];
	vec4 F = uEmitters[base + 5];
	int type = int(A.w + 0.5);
	if (type == EMITTER_LENS || type == EMITTER_BLOCKER) return vec3(0.0);
	if (type == EMITTER_LEDS) {
		// Small sources: solid angle × cosines.
		vec3 toLight = A.xyz - p;
		float d2 = dot(toLight, toLight);
		vec3 l = toLight * inversesqrt(d2);
		float area = E.x * PI * E.z * E.z;
		float cosEmitter = abs(dot(l, normalize(cross(B.xyz, C.xyz))));
		return D.rgb * area * cosEmitter * max(dot(n, l), 0.0) / d2;
	}
	vec3 u = B.xyz * B.w;
	vec3 v = C.xyz * C.w;
	float factor = quadFormFactor(p, n, A.xyz - u - v, A.xyz + u - v, A.xyz + u + v, A.xyz - u + v);
	return emitterMeanRadiance(type, D, E, F) * factor * emitterFill(type, E);
}

// Irradiance of the background (room or sky) on a surface with normal n.
vec3 backgroundIrradiance(vec3 n) {
	float y = dot(n, uEnvUp);
	if (uSkyZenith.w > 0.5) {
		vec3 skyMean = mix(uSkyHorizon.rgb, uSkyZenith.rgb, 0.45);
		return PI * mix(uSkyGround.rgb, skyMean, 0.5 + 0.5 * y);
	}
	return PI * uRoom.rgb * mix(uRoom.w, 1.12, 0.5 + 0.5 * y);
}

// Total irradiance from the rig and the background.
vec3 envIrradiance(vec3 p, vec3 n) {
	vec3 irradiance = backgroundIrradiance(n);
	for (int i = ZERO; i < uEmitterCount; i++) irradiance += emitterIrradiance(i, p, n);
	return irradiance;
}

// The same with the key light (emitter 0) dimmed by `shadow0` and the
// background by `ambient` (occlusion by the lids).
vec3 envIrradianceShadowed(vec3 p, vec3 n, float shadow0, float ambient) {
	vec3 irradiance = backgroundIrradiance(n) * ambient;
	for (int i = ZERO; i < uEmitterCount; i++) {
		irradiance += emitterIrradiance(i, p, n) * (i == 0 ? shadow0 : 1.0);
	}
	return irradiance;
}

#endif
