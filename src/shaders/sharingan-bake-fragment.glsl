// A Sharingan pattern's field (src/eye/sharingan.js): the distance to its
// ink and the color under it, over its disc and a little past it,
// SHARINGAN_MAP_SIZE texels across.
#include ./sharingan-paint.glsl

uniform int uSharinganRow;

varying vec2 vUv;

void main() {
	vec2 q = (vUv * 2.0 - 1.0) * SHARINGAN_EXTENT;
	gl_FragColor = sharinganField(uSharinganRow, q, 2.0 * SHARINGAN_EXTENT / float(SHARINGAN_MAP_SIZE));
}
