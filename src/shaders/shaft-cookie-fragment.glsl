// The light shafts' cookie (src/lighting/shaftLight.js): the twin of
// bakeShaftCookie() in src/atmosphere/lightShafts.js, each texel the sum of
// the blades whose box holds it.
#include ./common.glsl

// Per blade, three vec4: its center (u, v, mm) and the factors of its
// Gaussian across and along; its intensity and the cosine and sine of its
// angle; its texel box (i0, i1, j0, j1). cookieBlades() packs them.
uniform vec4 uBlades[MAX_SHAFTS * 3];
uniform int uBladeCount;
uniform vec2 uCookie; // half side, texel (mm)

void main() {
	vec2 texel = floor(gl_FragCoord.xy);
	// The texel's center: −extent + (i + 0.5) · texel.
	vec2 position = -uCookie.x + gl_FragCoord.xy * uCookie.y;
	float sum = 0.0;
	for (int k = ZERO; k < uBladeCount; k++) {
		vec4 shape = uBlades[3 * k];
		vec4 light = uBlades[3 * k + 1];
		vec4 box = uBlades[3 * k + 2];
		if (texel.x < box.x || texel.x > box.y || texel.y < box.z || texel.y > box.w) continue;
		vec2 d = position - shape.xy;
		float a = -d.x * light.z + d.y * light.y;
		float b = d.x * light.y + d.y * light.z;
		sum += light.x * exp(-a * a * shape.z - b * b * shape.w);
	}
	gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
}
