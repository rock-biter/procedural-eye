// The smallest blur radius (full-resolution pixels) over each texel of the
// last frame's prepared depth of field (dof-prepare-fragment.glsl) and its
// eight neighbors: a split frame shades at full resolution where it is small
// (src/render/scenePass.js). The neighbors cover the bilinear lookup of the
// composite and a little motion.
uniform sampler2D uPrepared; // a: signed blur radius (full-resolution pixels), last frame

void main() {
	ivec2 size = textureSize(uPrepared, 0);
	ivec2 texel = ivec2(gl_FragCoord.xy);
	float radius = 1e4;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			ivec2 p = clamp(texel + ivec2(x, y), ivec2(0), size - 1);
			radius = min(radius, abs(texelFetch(uPrepared, p, 0).a));
		}
	}
	gl_FragColor = vec4(radius, 0.0, 0.0, 1.0);
}
