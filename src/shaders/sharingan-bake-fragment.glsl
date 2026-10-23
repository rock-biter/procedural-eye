// A Sharingan pattern's map (src/eye/sharingan.js): the palette's weights
// over its disc and a little past it, SHARINGAN_MAP_SIZE texels across,
// edges a texel wide.
#include ./sharingan-paint.glsl

uniform int uSharinganRow;

varying vec2 vUv;

void main() {
	vec2 q = (vUv * 2.0 - 1.0) * SHARINGAN_EXTENT;
	gl_FragColor = sharinganWeights(uSharinganRow, q, 2.0 * SHARINGAN_EXTENT / float(SHARINGAN_MAP_SIZE));
}
