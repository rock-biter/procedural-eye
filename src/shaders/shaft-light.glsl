// The light shafts' light on what they cross (src/lighting/shaftLight.js):
// the cookie, baked over the beams' cross-section (the plane through the
// globe's center facing their source), holds the beams' profile; a point
// reads it where the line from the source through it meets that plane, so
// the beams spread with the distance from the source, and fade along their
// axis over the reach. A surface adds their light from the source
// (shaftIrradiance()), where the casters do not hide it from the source
// (shadow-coverage.glsl); the iris, lit through the cornea, scales the key's
// own term by them (keyBeams()).
#ifndef SHAFT_LIGHT_GLSL
#define SHAFT_LIGHT_GLSL

#include ./shadow-coverage.glsl

uniform sampler2D uShaftCookie;
uniform mat3 uShaftFrame; // columns: the cross-section's axes u and v, the beams' direction (world)
uniform vec4 uShaftSource; // the source (world), its distance to the globe's center (mm)
uniform float uShaftCookieExtent; // the cookie's half side (mm)
uniform float uShaftReach; // the beams' σ along their axis (mm)
uniform vec3 uShaftLight; // the beams' light on the surfaces, as a share of the key's
uniform vec3 uShaftIrradiance; // their irradiance on a surface facing the source (rgb)

// The beams' profile at `worldPos` (1 on the axis of a beam of intensity 1).
float shaftCookie(vec3 worldPos) {
	vec3 q = worldPos - uShaftSource.xyz;
	float z = dot(q, uShaftFrame[2]);
	if (z < 1.0) return 0.0;
	vec2 st = vec2(dot(q, uShaftFrame[0]), dot(q, uShaftFrame[1])) * (uShaftSource.w / z);
	st /= uShaftCookieExtent;
	if (max(abs(st.x), abs(st.y)) >= 1.0) return 0.0;
	float along = (z - uShaftSource.w) / uShaftReach;
	return textureLod(uShaftCookie, st * 0.5 + 0.5, 0.0).r * exp(-0.5 * along * along);
}

// The beams reaching a surface point: their profile, where the casters let
// them through. Taken off the surface along its normal, with a few
// millimeters of slack, so the face that casts lights itself.
float shaftReaching(vec3 worldPos, vec3 normal) {
	float beams = shaftCookie(worldPos);
	if (beams <= 0.0) return 0.0;
	return beams * (1.0 - shaftCut(worldPos + normal * 2.0, 6.0));
}

// The beams' irradiance on a surface at `worldPos` facing `normal` (world),
// `wrap` reaching past the terminator.
vec3 shaftIrradiance(vec3 worldPos, vec3 normal, float wrap) {
	if (max(uShaftIrradiance.r, max(uShaftIrradiance.g, uShaftIrradiance.b)) <= 0.0) return vec3(0.0);
	vec3 l = normalize(uShaftSource.xyz - worldPos);
	float facing = saturate((dot(normal, l) + wrap) / (1.0 + wrap));
	if (facing <= 0.0) return vec3(0.0);
	return uShaftIrradiance * facing * shaftReaching(worldPos, normal);
}

// The factor of the key's light where it enters the cornea: its own, plus
// the beams crossing it there.
vec3 keyBeams(vec3 worldPos) {
	if (max(uShaftLight.r, max(uShaftLight.g, uShaftLight.b)) <= 0.0) return vec3(1.0);
	return 1.0 + uShaftLight * shaftReaching(worldPos, vec3(0.0));
}

#endif
