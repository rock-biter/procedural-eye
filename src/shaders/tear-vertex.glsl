// Tear meniscus and bubbles: world space.
#include ./lid-follow.glsl

attribute vec2 follow;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
	float angle = lidFollowAngle(follow);
	vec4 world = vec4(rotateAboutX((modelMatrix * vec4(position, 1.0)).xyz, angle), 1.0);
	vWorldPos = world.xyz;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * normal), angle);
	gl_Position = projectionMatrix * viewMatrix * world;
}
