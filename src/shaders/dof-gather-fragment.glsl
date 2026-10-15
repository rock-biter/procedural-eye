// Depth of field for interactive frames (half resolution): Gustafsson's
// single-pass bokeh gather along a golden-angle spiral, with the physical
// blur circle of the thin lens (src/camera/cameraOptics.js) prepared per
// texel by dof-prepare-fragment.glsl. Alpha keeps the largest blur radius that
// covers the pixel, for the composite.
uniform sampler2D uPrepared; // rgb: color, a: signed blur radius (full-resolution pixels)
uniform vec2 uTexel; // full-resolution texel size

varying vec2 vUv;

#define MAX_RADIUS 18.0
#define RADIUS_STEP 1.6
// Rotation by the golden angle (2.39996 rad).
const mat2 GOLDEN_ROTATION = mat2(-0.73736887, 0.67549029, -0.67549029, -0.73736887);

void main() {
	vec4 center = texture(uPrepared, vUv);
	float centerSize = min(abs(center.a), MAX_RADIUS);
	vec3 color = center.rgb;
	float total = 1.0;
	float coverage = centerSize;
	float radius = RADIUS_STEP;
	vec2 direction = vec2(1.0, 0.0);
	while (radius < MAX_RADIUS) {
		vec4 tap = texture(uPrepared, vUv + direction * uTexel * radius);
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
