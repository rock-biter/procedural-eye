// Composite of the interactive depth of field: the sharp accumulated mean
// where the blur circle is under a pixel, the half-resolution gather
// elsewhere, faded out as accumulated lens samples take over (`uWeight`).
// The sharp mean takes the haze here (veil.glsl), the gather has it from the
// prepare pass. Alpha is opaque: the effects read it as opacity.
#include ./veil.glsl

uniform sampler2D uSharp; // accumulated mean (alpha: focus distance; −1 where a split frame shaded at half resolution)
uniform sampler2D uHalf; // the half-resolution share of a split frame (src/render/scenePass.js)
uniform sampler2D uBlurred;
uniform float uWeight;

varying vec2 vUv;

void main() {
	vec4 sharp = texelFetch(uSharp, ivec2(gl_FragCoord.xy), 0);
	// Shaded at half resolution only: the gather covers it, unless the last
	// frame's blur misjudged it.
	if (sharp.a < 0.0) sharp = texelFetch(uHalf, ivec2(gl_FragCoord.xy) / 2, 0);
	sharp.rgb = applyVeil(sharp.rgb, sharp.a, vUv);
	vec4 blurred = texture(uBlurred, vUv);
	float w = smoothstep(0.6, 2.5, blurred.a) * uWeight;
	gl_FragColor = vec4(mix(sharp.rgb, blurred.rgb, w), 1.0);
}
