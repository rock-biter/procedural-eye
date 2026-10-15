// Eyelid skin: world space (the lids do not turn with the gaze).
attribute vec4 lid; // t along the fissure, s across the profile, a (mm from the margin), upper lid

#include ./lid-follow.glsl

attribute vec2 follow;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vLid;

void main() {
	float angle = lidFollowAngle(follow);
	vec4 world = vec4(rotateAboutX((modelMatrix * vec4(position, 1.0)).xyz, angle), 1.0);
	vWorldPos = world.xyz;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normal), angle);
	vLid = lid;
	gl_Position = projectionMatrix * viewMatrix * world;
}
