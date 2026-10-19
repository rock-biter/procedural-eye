// Eyelashes: world-space tubes (src/adnexa/lashes.js).
attribute vec3 tangent3;
attribute vec2 lash; // position along the lash (0 root, 1 tip), per-lash random
attribute float lashRadius; // the ring's radius (mm)

// How much thicker the lashes are, a share of their radius: more as the
// camera zooms out (src/adnexa/lashGenerator.js lashWidening()).
uniform float uLashWiden;

#include ./lid-follow.glsl
#include ./lid-morph.glsl

attribute vec2 follow;

// Centroid: a multisampled pass (the half-resolution share of a split
// frame, src/render/scenePass.js) shades a lash that covers one sample of a
// pixel at the pixel's center, off the thin tube, where plain varyings
// extrapolate far (vLash.x past 1 cubed into the albedo, a point hundreds
// of mm away) and the pixel flares; centroid ones stay on the triangle.
centroid varying vec3 vWorldPos;
centroid varying vec3 vNormal;
centroid varying vec3 vTangent;
centroid varying vec2 vLash;

void main() {
	float angle = lidFollowAngle(follow);
	vec3 normalBlinked = normalize(lidMorph(normal, 1));
	// Off the centerline along the ring's normal: the tube widens with its
	// radius, so the tips stay fine.
	vec3 blinked = lidMorph(position, 0) + normalBlinked * lashRadius * uLashWiden;
	vec4 world = vec4(rotateAboutX((modelMatrix * vec4(blinked, 1.0)).xyz, angle), 1.0);
	vWorldPos = world.xyz;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normalBlinked), angle);
	// The blink's tangents ride in the morph colors (src/adnexa/lashes.js).
	vTangent = rotateAboutX(normalize(mat3(modelMatrix) * lidMorph(tangent3, 2)), angle);
	vLash = lash;
	gl_Position = projectionMatrix * viewMatrix * world;
}
