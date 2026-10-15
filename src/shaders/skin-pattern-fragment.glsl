// Bakes the skin's pigment patterns (skin-relief.glsl) over the front plane at
// the lids' rest position (src/adnexa/skinPattern.js): they depend only on
// that position and the seed, so the skin program reads them from a mipmapped
// texture instead of hashing a hundred cells per pixel. RGBA8, decoded by
// skinPattern() in skin-fragment.glsl:
//   r: melanin mottling, g: blood mottling (both offset and scaled into 0–1),
//   b: veins seen through the thin skin, a: oily patches.
#include ./skin-relief.glsl

uniform vec4 uBox; // min x, min y, width, height (mm)
uniform float uSeed;

varying vec2 vUv;

void main() {
	vec2 p = uBox.xy + vUv * uBox.zw;
	uint seed = uint(uSeed + 0.5) * 7919u + 101u;
	float melanin = 0.3 * fbm(p / 6.0, seed + 51u) + 0.35 * fbm(p / 1.3, seed + 53u);
	float blood = 0.3 * fbm(p / 3.0, seed + 57u) + 0.3 * valueNoise(p / 0.7, seed + 59u);
	float veins = veinNetwork(p, seed + 67u);
	float sebum = smoothstep(-0.3, 0.6, valueNoise(p / 2.5, seed + 83u));
	gl_FragColor = vec4(melanin / 1.3 + 0.5, blood / 1.2 + 0.5, veins, sebum);
}
