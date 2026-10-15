// Eyelid skin: world space (the lids do not turn with the gaze). The skin
// pattern is evaluated at the rest position, so it stays on the skin when the
// lids follow the gaze.
attribute vec4 lid; // t along the fissure, s across the profile, a (mm from the margin), upper lid
attribute vec4 relief; // front-plane direction in which a grows (xy), fold depth (mm, ≤ 0), along the margin (0 medial, 1 lateral)
attribute float ao; // baked ambient occlusion (1 open), src/adnexa/lidOcclusion.js

#include ./lid-follow.glsl

attribute vec2 follow;

varying vec3 vWorldPos;
varying vec3 vRestPos;
varying vec3 vNormal;
varying vec4 vLid;
varying vec4 vRelief;
varying float vAo;

void main() {
	float angle = lidFollowAngle(follow);
	vec3 rest = (modelMatrix * vec4(position, 1.0)).xyz;
	vec4 world = vec4(rotateAboutX(rest, angle), 1.0);
	vWorldPos = world.xyz;
	vRestPos = rest;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normal), angle);
	vLid = lid;
	vRelief = relief;
	vAo = ao;
	gl_Position = projectionMatrix * viewMatrix * world;
}
