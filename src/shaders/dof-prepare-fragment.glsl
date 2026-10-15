// Prepares the interactive depth of field (half resolution): each texel
// averages the color of its 2×2 full-resolution texels of the accumulated
// mean and keeps the signed blur radius (full-resolution pixels, negative in
// front of the focus plane) of the last of them, the one a nearest lookup at
// its center reads, so the gather reads one texel per tap. The signed radius
// grows with the distance, so comparing two radii compares their distances.
uniform sampler2D uSource; // accumulated mean, alpha: apparent focus distance (mm)
uniform vec4 uLens; // f² / N (mm²), focus distance s (mm), s − f (mm), sensor-mm → pixel (full res)

void main() {
	ivec2 size = textureSize(uSource, 0);
	ivec2 base = ivec2(gl_FragCoord.xy) * 2;
	vec4 a = texelFetch(uSource, min(base, size - 1), 0);
	vec4 b = texelFetch(uSource, min(base + ivec2(1, 0), size - 1), 0);
	vec4 c = texelFetch(uSource, min(base + ivec2(0, 1), size - 1), 0);
	vec4 d = texelFetch(uSource, min(base + ivec2(1, 1), size - 1), 0);
	float distance = max(d.a, 1.0);
	// Thin-lens blur circle on the sensor (mm), as a radius in pixels.
	float radius = 0.5 * uLens.x * (distance - uLens.y) / (distance * uLens.z) * uLens.w;
	gl_FragColor = vec4(0.25 * (a.rgb + b.rgb + c.rgb + d.rgb), radius);
}
