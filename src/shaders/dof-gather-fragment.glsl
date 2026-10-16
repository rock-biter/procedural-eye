// Depth of field for interactive frames (half resolution): Gustafsson's
// single-pass bokeh gather along a golden-angle spiral, with the physical
// blur circle of the thin lens (src/camera/cameraOptics.js) prepared per
// texel by dof-prepare-fragment.glsl. Alpha keeps the largest blur radius that
// covers the pixel, for the composite.
uniform sampler2D uPrepared; // rgb: color, a: signed blur radius (full-resolution pixels)
uniform sampler2D uTileMax; // around the pixel's tile: r largest blur radius, g all backdrop (dof-dilate-fragment.glsl)
uniform vec2 uTexel; // full-resolution texel size

varying vec2 vUv;

#define MAX_RADIUS 18.0
#define RADIUS_STEP 1.6
// Rotation by the golden angle (2.39996 rad).
const mat2 GOLDEN_ROTATION = mat2(-0.73736887, 0.67549029, -0.67549029, -0.73736887);

void main() {
	vec4 center = textureLod(uPrepared, vUv, 0.0);
	float centerSize = min(abs(center.a), MAX_RADIUS);
	// A tap at `radius` only counts where its blur reaches the pixel, so the
	// spiral stops past the largest blur around: the taps beyond it would
	// leave the mean and the coverage as they are. Within the backdrop every
	// tap has the color of the pixel, which is then the result. The tile
	// holds the pixel (DOF_TILE is even, so the 2×2 quads never straddle two
	// tiles).
	vec2 tile = texelFetch(uTileMax, ivec2(gl_FragCoord.xy) / DOF_TILE, 0).rg;
	if (tile.y > 0.5) {
		gl_FragColor = vec4(center.rgb, centerSize);
		return;
	}
	float reach = min(MAX_RADIUS, tile.x + 0.5);
	vec3 color = center.rgb;
	float total = 1.0;
	float coverage = centerSize;
	float radius = RADIUS_STEP;
	vec2 direction = vec2(1.0, 0.0);
	while (radius < reach) {
		vec4 tap = textureLod(uPrepared, vUv + direction * uTexel * radius, 0.0);
		float sampleSize = min(abs(tap.a), MAX_RADIUS);
		// What lies behind the pixel cannot blur over it more than the pixel itself.
		if (tap.a > center.a) sampleSize = min(sampleSize, centerSize * 2.0);
		float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
		color += mix(color / total, tap.rgb, m);
		total += 1.0;
		if (tap.a < center.a) coverage = max(coverage, sampleSize * m);
		radius += RADIUS_STEP / radius;
		direction = GOLDEN_ROTATION * direction;
	}
	gl_FragColor = vec4(color / total, coverage);
}
