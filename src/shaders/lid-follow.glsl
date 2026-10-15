// The lids follow the vertical gaze: the upper margin by about 0.9 and the
// lower by about 0.35 of the globe's pitch. Lid-attached vertices rotate
// about the X axis through the globe center (they slide over the globe like
// a shutter), weighted by `follow` = (upper share, share near the margin):
// the skin far from the margin stays put. A gaze up turns the globe by
// −pitch about X (the front rises), and the lids with it.
#ifndef LID_FOLLOW_GLSL
#define LID_FOLLOW_GLSL

uniform vec2 uLidFollow; // pitch (radians, up > 0) the upper and lower lid follow

vec3 rotateAboutX(vec3 p, float angle) {
	float c = cos(angle);
	float s = sin(angle);
	return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

// The rotation about X of a lid vertex (rotateAboutX()).
float lidFollowAngle(vec2 follow) {
	return -mix(uLidFollow.y, uLidFollow.x, follow.x) * follow.y;
}

// The rest position of a world point near the lids (for the fissure map):
// undo the rotation of the lid above or below it.
vec3 lidRestPosition(vec3 world) {
	float upper = smoothstep(-1.5, 1.5, world.y);
	return rotateAboutX(world, mix(uLidFollow.y, uLidFollow.x, upper));
}

#endif
