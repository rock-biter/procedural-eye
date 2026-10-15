// Composite of the interactive depth of field: the sharp accumulated mean
// where the blur circle is under a pixel, the half-resolution gather
// elsewhere, faded out as accumulated lens samples take over (`uWeight`).
// Alpha is opaque: the effects read it as opacity.
uniform sampler2D uSharp; // accumulated mean (alpha: focus distance)
uniform sampler2D uBlurred;
uniform float uWeight;

varying vec2 vUv;

void main() {
	vec3 sharp = texelFetch(uSharp, ivec2(gl_FragCoord.xy), 0).rgb;
	vec4 blurred = texture(uBlurred, vUv);
	float w = smoothstep(0.6, 2.5, blurred.a) * uWeight;
	gl_FragColor = vec4(mix(sharp, blurred.rgb, w), 1.0);
}
