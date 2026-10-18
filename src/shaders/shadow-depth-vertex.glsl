// Shadow casters, with the lids' gaze follow (lid-follow.glsl) and blink
// (lid-morph.glsl).
#include ./lid-follow.glsl
#include ./lid-morph.glsl

attribute vec2 follow;

void main() {
	vec3 blinked = (modelMatrix * vec4(lidMorph(position, 0), 1.0)).xyz;
	vec3 moved = rotateAboutX(blinked, lidFollowAngle(follow));
	gl_Position = projectionMatrix * viewMatrix * vec4(moved, 1.0);
}
