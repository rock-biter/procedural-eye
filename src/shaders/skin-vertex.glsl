// Eyelid skin: world space (the lids do not turn with the gaze). The skin
// pattern is evaluated at the rest position, so it stays on the skin when the
// lids follow the gaze. SKIN_SHELL: the back shell (src/adnexa/backShell.js),
// whose pattern coordinates are its own skin unrolled into the front plane.
attribute vec4 lid; // t along the fissure, s across the profile, a (mm from the margin), upper lid
attribute vec4 relief; // front-plane direction in which a grows (xy), fold depth (mm, ≤ 0), along the margin (0 medial, 1 lateral)
attribute float ao; // baked ambient occlusion (1 open), src/adnexa/lidOcclusion.js
#ifdef SKIN_SHELL
attribute vec2 coords; // the skin unrolled into the front plane (mm)
#endif

#include ./lid-follow.glsl

attribute vec2 follow;

// Centroid: a multisampled pass (the half-resolution share of a split
// frame, src/render/scenePass.js) shades a triangle that covers one sample
// of a pixel at the pixel's center, off the triangle, where plain varyings
// extrapolate (the lid frame, the relief, the occlusion past their ranges)
// and the shading turned negative, which the depth of field spread into
// black blots. Centroid ones stay on the triangle. Their derivatives are
// unreliable where the centroid moves, so the screen-space derivatives
// (skin-fragment.glsl) take plain copies, interpolated at the center:
// the world position, and the rest position (xy), the place along the
// margin and across the profile (zw).
centroid varying vec3 vWorldPos;
centroid varying vec3 vRestPos;
centroid varying vec3 vNormal;
centroid varying vec4 vLid;
centroid varying vec4 vRelief;
centroid varying float vAo;
varying vec3 vCenterWorldPos;
varying vec4 vCenterFrame;

void main() {
	float angle = lidFollowAngle(follow);
	vec3 rest = (modelMatrix * vec4(position, 1.0)).xyz;
	vec4 world = vec4(rotateAboutX(rest, angle), 1.0);
	vWorldPos = world.xyz;
#ifdef SKIN_SHELL
	vRestPos = vec3(coords, 0.0);
#else
	vRestPos = rest;
#endif
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normal), angle);
	vLid = lid;
	vRelief = relief;
	vAo = ao;
	vCenterWorldPos = vWorldPos;
	vCenterFrame = vec4(vRestPos.xy, relief.w, lid.y);
	gl_Position = projectionMatrix * viewMatrix * world;
}
