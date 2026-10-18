// Reduces a shadow map into its coverage (src/lighting/shadowCoverage.js):
// per texel, a 4×4 grid of the map's texels over its footprint (it is float
// and read unfiltered), plus the globe as a disc at its front depth, which the
// map lacks inside the fissure. r and b: the share of the grid something
// blocks; g and a: that share times the mean depth of what blocks it, in mm
// from the light along its view (the map's depth made linear).
#include ./common.glsl

uniform sampler2D uShadowMap; // depth from the light, 1 where nothing casts
uniform float uScale; // the map's field over the coverage's
uniform float uTexel; // a coverage texel (uv)
uniform vec3 uDepthRange; // the map's near and far (mm), 1 for a perspective map
uniform vec4 uGlobe; // the globe's center (coverage uv), its center's depth (mm), its radius (uv)
uniform float uGlobeRadius; // mm

varying vec2 vUv;

// The map's depth in mm along the light's view.
float linearDepth(float depth) {
	float near = uDepthRange.x;
	float far = uDepthRange.y;
	if (uDepthRange.z > 0.5) return near * far / (far - depth * (far - near));
	return near + depth * (far - near);
}

void main() {
	vec2 size = vec2(textureSize(uShadowMap, 0));
	float blocked = 0.0;
	float depthSum = 0.0;
	for (int j = ZERO; j < 4; j++) {
		for (int i = ZERO; i < 4; i++) {
			vec2 uv = vUv + (vec2(i, j) - 1.5) * 0.25 * uTexel;
			vec2 inMap = (uv - 0.5) / uScale + 0.5;
			float depth = 1e9;
			if (all(greaterThanEqual(inMap, vec2(0.0))) && all(lessThan(inMap, vec2(1.0)))) {
				float stored = texelFetch(uShadowMap, ivec2(inMap * size), 0).r;
				if (stored < 0.9999) depth = linearDepth(stored);
			}
			vec2 g = (uv - uGlobe.xy) / uGlobe.w;
			float rho2 = dot(g, g);
			if (rho2 < 1.0) depth = min(depth, uGlobe.z - sqrt(1.0 - rho2) * uGlobeRadius);
			if (depth < 1e8) {
				blocked += 1.0;
				depthSum += depth;
			}
		}
	}
	gl_FragColor = vec4(blocked, depthSum, blocked, depthSum) / 16.0;
}
