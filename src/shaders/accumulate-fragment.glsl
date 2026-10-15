// Progressive accumulation: the running mean of the frames since the last
// reset. Exact texel reads; a frame with NaN or Inf keeps the history, so one
// bad sample cannot poison the image. The first frame (weight 1) replaces the
// history without reading it.
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uWeight;

void main() {
	ivec2 p = ivec2(gl_FragCoord.xy);
	vec4 current = texelFetch(uCurrent, p, 0);
	bool bad = any(isnan(current)) || any(isinf(current));
	if (!bad && uWeight >= 1.0) {
		gl_FragColor = current;
		return;
	}
	vec4 history = texelFetch(uHistory, p, 0);
	gl_FragColor = bad ? history : mix(history, current, uWeight);
}
