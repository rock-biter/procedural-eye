// Hands the accumulated mean to the effects with an opaque alpha: the history
// alpha holds the focus distance, which postprocessing's blend functions would
// read as opacity.
uniform sampler2D uSource;

void main() {
	gl_FragColor = vec4(texelFetch(uSource, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}
