// Prepares the interactive depth of field (half resolution): each texel
// keeps the signed blur radius (full-resolution pixels, negative in front of
// the focus plane) of the last of its 2×2 full-resolution texels of the
// accumulated mean, the one a nearest lookup at its center reads, so the
// gather reads one texel per tap, and averages the color of those of the four
// at that radius. Across a silhouette the others lie at another distance: a
// backdrop texel carrying the skin's color would spread it over the gather's
// whole reach. The signed radius grows with the distance, so comparing two
// radii compares their distances. Where a split frame shaded at half
// resolution only (alpha −1 in the mean, src/render/scenePass.js), the texel
// is that pixel. The haze (veil.glsl) and the light shafts (light-shafts.glsl)
// are added here, so the gather blurs them with the surfaces under them.
#include ./veil.glsl
#include ./light-shafts.glsl
#include ./dof-radius.glsl

uniform sampler2D uSource; // accumulated mean, alpha: apparent focus distance (mm)
uniform sampler2D uHalf; // the half-resolution share of a split frame

varying vec2 vUv;

// How much a texel at `radius` belongs with the one at `reference`.
float sameDepth(float radius, float reference) {
	return 1.0 - smoothstep(0.0, dofRadiusTolerance(reference), abs(radius - reference));
}

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
		float r = dofRadius(d.a);
		float wa = sameDepth(dofRadius(a.a), r);
		float wb = sameDepth(dofRadius(b.a), r);
		float wc = sameDepth(dofRadius(c.a), r);
		color = (a.rgb * wa + b.rgb * wb + c.rgb * wc + d.rgb) / (1.0 + wa + wb + wc);
		distance = d.a;
	} else {
		vec4 h = texelFetch(uHalf, ivec2(gl_FragCoord.xy), 0);
		color = h.rgb;
		distance = h.a;
	}
	color = applyVeil(color, max(distance, 1.0), vUv);
	color = applyShafts(color, max(distance, 1.0), vUv);
	gl_FragColor = vec4(color, dofRadius(distance));
}
