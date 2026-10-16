// The largest blur radius over a tile and its eight neighbors, and whether
// they are all backdrop (dof-tiles-fragment.glsl): a tile spans more than the
// gather's reach, so this bounds every tap a pixel of the middle tile reads.
uniform sampler2D uTiles; // r: the tile's largest blur radius (full-resolution pixels), g: all backdrop

void main() {
	ivec2 size = textureSize(uTiles, 0);
	ivec2 tile = ivec2(gl_FragCoord.xy);
	vec2 result = vec2(0.0, 1.0);
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 t = texelFetch(uTiles, clamp(tile + ivec2(x, y), ivec2(0), size - 1), 0).rg;
			result = vec2(max(result.x, t.x), min(result.y, t.y));
		}
	}
	gl_FragColor = vec4(result, 0.0, 1.0);
}
