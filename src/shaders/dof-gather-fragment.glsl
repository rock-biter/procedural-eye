// Depth of field for interactive frames (half resolution): Gustafsson's
// single-pass bokeh gather along a golden-angle spiral, with the physical
// blur circle of the thin lens (src/camera/cameraOptics.js). Alpha keeps the
// largest blur radius that covers the pixel, for the composite.
uniform sampler2D uColor;
uniform sampler2D uFocus; // alpha: apparent focus distance (mm)
uniform vec4 uLens; // f² / N (mm²), focus distance s (mm), s − f (mm), sensor-mm → pixel (full res)
uniform vec2 uTexel; // full-resolution texel size

varying vec2 vUv;

#define GOLDEN_ANGLE 2.39996323
#define MAX_RADIUS 18.0
#define RADIUS_STEP 1.6

float blurRadius(float distance) {
	float coc = uLens.x * abs(distance - uLens.y) / (distance * uLens.z);
	return min(0.5 * coc * uLens.w, MAX_RADIUS);
}

void main() {
	float centerDistance = max(texture(uFocus, vUv).a, 1.0);
	float centerSize = blurRadius(centerDistance);
	vec3 color = texture(uColor, vUv).rgb;
	float total = 1.0;
	float coverage = centerSize;
	float radius = RADIUS_STEP;
	for (float angle = 0.0; radius < MAX_RADIUS; angle += GOLDEN_ANGLE) {
		vec2 uv = vUv + vec2(cos(angle), sin(angle)) * uTexel * radius;
		vec3 sampleColor = texture(uColor, uv).rgb;
		float sampleDistance = max(texture(uFocus, uv).a, 1.0);
		float sampleSize = blurRadius(sampleDistance);
		// What lies behind the pixel cannot blur over it more than the pixel itself.
		if (sampleDistance > centerDistance) sampleSize = min(sampleSize, centerSize * 2.0);
		float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
		color += mix(color / total, sampleColor, m);
		total += 1.0;
		if (sampleDistance < centerDistance) coverage = max(coverage, sampleSize * m);
		radius += RADIUS_STEP / radius;
	}
	gl_FragColor = vec4(color / total, coverage);
}
