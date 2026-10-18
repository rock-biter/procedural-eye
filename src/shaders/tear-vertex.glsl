// Tear meniscus: world space. It blinks with the lids (lid-morph.glsl).
#include ./lid-follow.glsl
#include ./lid-morph.glsl

attribute vec2 follow;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
	float angle = lidFollowAngle(follow);
	vec4 world = vec4(rotateAboutX((modelMatrix * vec4(lidMorph(position, 0), 1.0)).xyz, angle), 1.0);
	vWorldPos = world.xyz;
	vNormal = rotateAboutX(normalize(mat3(modelMatrix) * lidMorph(normal, 1)), angle);
	gl_Position = projectionMatrix * viewMatrix * world;
}
