// Prepares the interactive depth of field (half resolution): each texel
// averages the color of its 2×2 full-resolution texels of the accumulated
// mean and keeps the signed blur radius (full-resolution pixels, negative in
// front of the focus plane) of the last of them, the one a nearest lookup at
// its center reads, so the gather reads one texel per tap. The signed radius
// grows with the distance, so comparing two radii compares their distances.
// Where a split frame shaded at half resolution only (alpha −1 in the mean,
// src/render/scenePass.js), the texel is that pixel.
uniform sampler2D uSource; // accumulated mean, alpha: apparent focus distance (mm)
uniform sampler2D uHalf; // the half-resolution share of a split frame
uniform vec4 uLens; // f² / N (mm²), focus distance s (mm), s − f (mm), sensor-mm → pixel (full res)

void main() {
	ivec2 size = textureSize(uSource, 0);
	ivec2 base = ivec2(gl_FragCoord.xy) * 2;
	vec4 d = texelFetch(uSource, min(base + ivec2(1, 1), size - 1), 0);
	vec3 color;
	float distance;
	if (d.a >= 0.0) {
		vec4 a = texelFetch(uSource, min(base, size - 1), 0);
		vec4 b = texelFetch(uSource, min(base + ivec2(1, 0), size - 1), 0);
		vec4 c = texelFetch(uSource, min(base + ivec2(0, 1), size - 1), 0);
		color = 0.25 * (a.rgb + b.rgb + c.rgb + d.rgb);
		distance = d.a;
	} else {
		vec4 h = texelFetch(uHalf, ivec2(gl_FragCoord.xy), 0);
		color = h.rgb;
		distance = h.a;
	}
	distance = max(distance, 1.0);
	// Thin-lens blur circle on the sensor (mm), as a radius in pixels.
	float radius = 0.5 * uLens.x * (distance - uLens.y) / (distance * uLens.z) * uLens.w;
	gl_FragColor = vec4(color, radius);
}
