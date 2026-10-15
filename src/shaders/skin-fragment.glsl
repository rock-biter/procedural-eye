// Eyelid skin and lid margin: procedural micro-relief (pores, fine wrinkles
// parallel to the margin), albedo with the thin pink skin near the lash line
// and the wet mucosa of the intermarginal strip, wrapped diffuse and two
// specular lobes, mirror reflection where it is wet.
#include ./debug-views.glsl
#include ./lit-surface.glsl
#include ./key-shadow.glsl
#include ./noise3.glsl
#include ./skin-relief.glsl

uniform vec3 uSkinColor;
uniform vec4 uSkin; // redness, roughness, wetness, pores
uniform vec4 uSkin2; // wrinkles, translucency, lid profile wall end, lid profile edge end
uniform float uPixelAngle; // radians per pixel

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vLid;

void main() {
	vec3 v = normalize(cameraPosition - vWorldPos);
	vec3 geometric = normalize(vNormal);
	if (!gl_FrontFacing) geometric = -geometric;
	float s = vLid.y;
	float a = vLid.z;
	float onMargin = 1.0 - smoothstep(uSkin2.z, uSkin2.w, s);

	// Micro-relief by differences of the front-plane height, faded out where a
	// pixel is wider than the grooves.
	float footprint = length(cameraPosition - vWorldPos) * uPixelAngle;
	float relief = 1.0 - smoothstep(0.06, 0.2, footprint);
	float detail = 1.0 - smoothstep(0.02, 0.06, footprint);
	vec3 gradient = vec3(0.0);
	float h0 = 0.0;
	if (relief > 0.0) {
		float e = 0.008;
		h0 = skinRelief(vWorldPos.xy, uSkin2.x, uSkin.w, detail);
		float hx = skinRelief(vWorldPos.xy + vec2(e, 0.0), uSkin2.x, uSkin.w, detail);
		float hy = skinRelief(vWorldPos.xy + vec2(0.0, e), uSkin2.x, uSkin.w, detail);
		gradient = vec3((hx - h0) / e, (hy - h0) / e, 0.0) * relief;
		gradient -= geometric * dot(gradient, geometric);
	}
	// Fine wrinkles parallel to the margin, irregular, a few millimeters out.
	vec4 warp = gradientNoise3(vWorldPos * vec3(0.6, 1.8, 0.6), 14u);
	float wrinkle = sin((a * 2.2 + 0.6 * warp.x) * TAU);
	float wrinkleStrength = 0.06 * uSkin2.x * smoothstep(1.5, 5.0, a) * (0.5 + 0.5 * warp.y);
	vec3 across = normalize(vec3(0.0, sign(vLid.w - 0.5), 0.0) - geometric * dot(vec3(0.0, sign(vLid.w - 0.5), 0.0), geometric) + 1e-4);
	gradient += across * wrinkle * wrinkleStrength;
	vec3 n = normalize(geometric - gradient * (1.0 - onMargin));

	// Albedo: mottled skin, pinker toward the lash line, darker at the lash
	// roots, a little darker in the grooves, and the wet mucosa of the margin.
	vec4 mottle = gradientNoise3(vWorldPos * 0.35, 15u);
	vec4 blotch = gradientNoise3(vWorldPos * 1.3, 16u);
	vec3 albedo = uSkinColor * (1.0 + 0.08 * mottle.x) * mix(vec3(1.0), vec3(1.06, 0.9, 0.9), 0.5 + 0.5 * blotch.x);
	albedo *= 1.0 + 6.0 * h0;
	vec3 pink = uSkinColor * vec3(1.12, 0.74, 0.74);
	albedo = mix(albedo, pink, uSkin.x * exp(-a / 2.0));
	albedo *= mix(1.0, 0.62, exp(-a / 0.5) * (1.0 - onMargin));
	vec3 mucosa = vec3(0.55, 0.22, 0.2);
	albedo = mix(albedo, mucosa, onMargin);

	float wet = mix(uSkin.z * exp(-a / 3.0), 1.0, onMargin);
	float roughness = mix(uSkin.y, 0.1, wet);
	vec3 wrap = uSkin2.y * vec3(0.55, 0.28, 0.18);
	float lit = keyShadow(vWorldPos + geometric * 0.02);
	// Light scattered under the skin softens the red edge of the shadows.
	vec3 shadow = mix(vec3(lit), vec3(sqrt(lit), lit, lit * lit), uSkin2.y);
	vec3 color = litSurface(vWorldPos, n, v, albedo, wrap, roughness, 0.028, 1.0, shadow);
	float fresnel = schlick(dot(n, v), 0.02);
	color += wet * fresnel * envRadiance(vWorldPos, reflect(-v, n)) * 0.6;

#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#endif
	gl_FragColor = vec4(color, length(cameraPosition - vWorldPos));
}
