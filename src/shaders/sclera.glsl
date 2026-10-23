// The white of the eye: tinted diffuse under the rig, shadowed by the lids
// (key light shadow map) and occluded near their margins. The Rinnegan
// (sharingan.glsl) turns it lavender, ringed.
#ifndef SCLERA_GLSL
#define SCLERA_GLSL

#include ./env-rig.glsl
#include ./key-shadow.glsl
#include ./shaft-light.glsl
#include ./eye-profile.glsl
#include ./noise3.glsl
#include ./lid-follow.glsl
#include ./sharingan.glsl

uniform vec3 uScleraColor;
uniform vec4 uSclera; // redness, yellowing, surface irregularity, unused
uniform sampler2D uScleraVessels; // r: superficial, g: deep vessel density (polar map)
uniform vec2 uScleraPsi; // ψ range of the vessel map (radians)
uniform sampler2D uFissureMap; // signed distance to the fissure (mm), front plane: r open, g closed
uniform vec2 uFissureExtent; // half width, half height of the map (mm)
uniform float uLidBlink; // the blink's closure, 0 open (src/adnexa/lidBlink.js)

// Signed distances (mm) of a world point to the fissure, > 0 in the opening:
// x where the lids rest, y as the blink closes them. The margins close
// linearly, so the blend is the distance to the closing margin.
vec2 fissureDistances(vec3 world) {
	vec2 uv = lidRestPosition(world).xy / (2.0 * uFissureExtent) + 0.5;
	vec2 d = texture(uFissureMap, uv).rg;
	return vec2(d.x, mix(d.x, d.y, uLidBlink));
}

float fissureDistance(vec3 world) {
	return fissureDistances(world).y;
}

uniform vec4 uLidReflection; // lid sphere radius (mm), lash comb density (1/mm), lash reach (mm), unused
uniform vec3 uLidRadiance; // the skin as seen in reflections
uniform vec3 uLashRadiance;

// What a mirror ray from eye-space point p along r sees, given what the rig
// shows that way (`env`): the lids and lashes are near the eye, outside the
// rig, so a ray that leaves the opening below or above the margins meets the
// skin (approximated as a sphere around the globe) or the comb of lashes.
vec3 lidReflection(vec3 p, vec3 r, vec3 env) {
	vec3 origin = (uEyeToWorld * vec4(p, 1.0)).xyz;
	vec3 direction = normalize(mat3(uEyeToWorld) * r);
	float radius = uLidReflection.x;
	float b = dot(origin, direction);
	float c = dot(origin, origin) - radius * radius;
	float disc = b * b - c;
	if (disc < 0.0) return env;
	float t = -b + sqrt(disc);
	if (t <= 0.0) return env;
	vec3 hit = origin + direction * t;
	float d = fissureDistance(hit);
	// Under the lids: the skin, fading in over a fraction of a millimeter.
	float skin = 1.0 - smoothstep(-0.25, 0.15, d);
	vec3 color = mix(env, uLidRadiance, skin);
	// The lashes: a comb of dark strands just past the margins, denser above.
	float reach = uLidReflection.z * (hit.y > 0.0 ? 1.0 : 0.55);
	float band = smoothstep(-0.2, 0.3, d) * (1.0 - smoothstep(0.3, reach, d));
	float strands = smoothstep(0.55, 0.95, fract(hit.x * uLidReflection.y + 0.35 * sin(hit.x * 3.1) + 0.2 * d));
	return mix(color, uLashRadiance, band * strands * 0.9);
}

// Ambient occlusion of the globe by the lids: dark under and near them.
float lidOcclusion(vec3 world) {
	float d = fissureDistance(world);
	return mix(0.12, 1.0, smoothstep(-0.4, 2.6, d));
}

// Albedo of the sclera at eye-space point p: the white, yellower with age,
// pinker toward the lids (`fissure`: the distance to them at rest), with the
// vessel network over it; the Rinnegan's where it reaches.
vec3 scleraAlbedo(vec3 p, float fissure) {
	float phi = atan(p.y, p.x);
	float psi = acos(clamp(p.z / length(p), -1.0, 1.0));
	vec2 uv = vec2(phi * (1.0 / TAU), (psi - uScleraPsi.x) / (uScleraPsi.y - uScleraPsi.x));
	vec4 vessels = texture(uScleraVessels, uv);
	vec3 albedo = uScleraColor * mix(vec3(1.0), vec3(1.0, 0.95, 0.78), uSclera.y);
	// Redder in the corners and near the lids (more vessels, thinner tissue).
	float edge = 1.0 - smoothstep(0.0, 3.5, fissure);
	albedo *= mix(vec3(1.0), vec3(1.0, 0.86, 0.84), uSclera.x * edge);
	vec3 superficial = vec3(0.52, 0.05, 0.04);
	vec3 deep = vec3(0.42, 0.16, 0.24);
	albedo = mix(albedo, deep, saturate(vessels.g * (0.35 + 0.5 * uSclera.x)));
	albedo = mix(albedo, superficial, saturate(vessels.r * (0.35 + 0.65 * uSclera.x)));
	return rinneganSclera(albedo, p, uScleraColor);
}

// Conjunctival micro-relief: the wet surface is not a perfect mirror.
vec3 scleraNormal(vec3 p, vec3 n) {
	vec4 a = gradientNoise3(p * 1.4, 21u);
	vec4 b = gradientNoise3(p * 4.0, 22u);
	vec3 g = (a.yzw * 0.6 + b.yzw * 0.25) * 0.06 * uSclera.z;
	return normalize(n - (g - n * dot(g, n)));
}

vec3 scleraDiffuse(vec3 p, vec3 n) {
	vec3 world = (uEyeToWorld * vec4(p, 1.0)).xyz;
	vec2 fissure = fissureDistances(world);
	float occlusion = mix(0.12, 1.0, smoothstep(-0.4, 2.6, fissure.y));
	vec3 shadow = vec3(keyShadow(world) * mix(0.5, 1.0, occlusion));
	vec3 irradiance = envIrradianceShadowed(p, n, shadow, occlusion);
	// The light shafts crossing it, in world space.
	vec3 normal = normalize((uEyeToWorld * vec4(n, 0.0)).xyz);
	irradiance += shaftIrradiance(world, normal, 0.0) * mix(0.5, 1.0, occlusion);
	return scleraAlbedo(p, fissure.x) * INV_PI * irradiance;
}

#endif
