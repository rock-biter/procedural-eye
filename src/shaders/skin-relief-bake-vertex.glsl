// Bake of the skin relief (src/adnexa/skinRelief.js): the lid mesh at rest
// laid onto the texture's front-plane box, nearest the viewer in front (the
// rest z sets the depth), with its lid frame. RELIEF_UNDERLAY: a full-screen
// quad at the far plane, behind every part of the mesh, for the texels it
// leaves uncovered.
attribute vec4 lid; // t along the fissure, s across the profile, a (mm from the margin), upper lid
attribute vec4 relief; // front-plane direction in which a grows (xy), fold depth (mm, ≤ 0), along the margin

uniform vec4 uBox; // min x, min y, width, height (mm)

varying vec2 vPoint;
varying vec4 vLid;
varying vec4 vRelief;

void main() {
#ifdef RELIEF_UNDERLAY
	vec2 uv = position.xy * 0.5 + 0.5;
	vPoint = uBox.xy + uv * uBox.zw;
	vLid = vec4(0.0, 1.0, 60.0, 0.0);
	vRelief = vec4(1.0, 0.0, 0.0, 0.5);
	gl_Position = vec4(position.xy, 1.0, 1.0);
#else
	vPoint = position.xy;
	vLid = lid;
	vRelief = relief;
	// Depth: the rest z (mm), toward the viewer nearer (−1).
	gl_Position = vec4((position.xy - uBox.xy) / uBox.zw * 2.0 - 1.0, clamp(-position.z / 100.0, -1.0, 1.0), 1.0);
#endif
}
