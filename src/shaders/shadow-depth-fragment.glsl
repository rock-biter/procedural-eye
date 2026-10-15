// Depth of the shadow casters (lids, lashes) as seen from the key light.
void main() {
	gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}
