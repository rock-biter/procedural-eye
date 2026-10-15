// Composite of the interactive depth of field: the sharp frame where the
// blur circle is under a pixel, the half-resolution gather elsewhere, faded
// out as accumulated lens samples take over (`uWeight`).
uniform sampler2D uSharp;
uniform sampler2D uBlurred;
uniform float uWeight;

varying vec2 vUv;

void main() {
	vec3 sharp = texture(uSharp, vUv).rgb;
	vec4 blurred = texture(uBlurred, vUv);
	float w = smoothstep(0.6, 2.5, blurred.a) * uWeight;
	gl_FragColor = vec4(mix(sharp, blurred.rgb, w), 1.0);
}
