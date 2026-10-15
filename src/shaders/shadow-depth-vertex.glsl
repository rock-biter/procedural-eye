// Shadow casters, with the lids' gaze follow (lid-follow.glsl).
#include ./lid-follow.glsl

attribute vec2 follow;

void main() {
	vec3 moved = rotateAboutX((modelMatrix * vec4(position, 1.0)).xyz, lidFollowAngle(follow));
	gl_Position = projectionMatrix * viewMatrix * vec4(moved, 1.0);
}
