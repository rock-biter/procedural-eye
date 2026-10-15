// Eyelashes: world-space tubes (src/adnexa/lashes.js).
attribute vec3 tangent3;
attribute vec2 lash; // position along the lash (0 root, 1 tip), per-lash random

#include ./lid-follow.glsl

attribute vec2 follow;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec2 vLash;

void main() {
	float angle = lidFollowAngle(follow);
	vec4 world = vec4(rotateAboutX((modelMatrix * vec4(position, 1.0)).xyz, angle), 1.0);
	vWorldPos = world.xyz;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normal), angle);
	vTangent = rotateAboutX(normalize(mat3(modelMatrix) * tangent3), angle);
	vLash = lash;
	gl_Position = projectionMatrix * viewMatrix * world;
}
