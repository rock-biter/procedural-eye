// Tile maximum of the interactive depth of field (half resolution): each
// texel holds the largest blur radius (full-resolution pixels, unsigned) over
// DOF_TILE × DOF_TILE texels of the prepared buffer (dof-prepare-fragment.glsl),
// and whether all of them are the backdrop (focused at infinity, one color).
// dof-dilate-fragment.glsl spreads both over the neighboring tiles.
#include ./common.glsl

uniform sampler2D uPrepared; // rgb: color, a: signed blur radius (full-resolution pixels)
uniform float uBackdropRadius; // radii from this one on belong to the backdrop

void main() {
	ivec2 size = textureSize(uPrepared, 0);
	ivec2 base = ivec2(gl_FragCoord.xy) * DOF_TILE;
	float radius = 0.0;
	float backdrop = 1.0;
	for (int y = ZERO; y < DOF_TILE; y++) {
		for (int x = ZERO; x < DOF_TILE; x++) {
			ivec2 p = min(base + ivec2(x, y), size - 1);
			float a = texelFetch(uPrepared, p, 0).a;
			radius = max(radius, abs(a));
			backdrop = a < uBackdropRadius ? 0.0 : backdrop;
		}
	}
	gl_FragColor = vec4(radius, backdrop, 0.0, 1.0);
}
