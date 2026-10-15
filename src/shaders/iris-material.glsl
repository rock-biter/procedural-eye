// What the iris is made of at a surface point of its field: the share of each
// component (stroma, radial vessels, collagen arcs, ruff) and their albedo
// from the Kubelka–Munk lookup of the layered iris (src/iris/irisColor.js)
// and the pigment atlas; and how a light reaches it through the cornea.
#ifndef IRIS_MATERIAL_GLSL
#define IRIS_MATERIAL_GLSL

#include ./cornea-optics.glsl
#include ./iris-sdf.glsl
#include ./debug-views.glsl

uniform sampler2D uIrisPigment; // ABL melanin, eumelanin share, freckle mask, nodule mask
uniform sampler3D uIrisColorLut; // linear sRGB by (ABL melanin, eumelanin share, stroma thickness)
uniform vec4 uIrisColorMisc; // ABL share over fibers, saturation, LUT max stroma (mm), unused
uniform vec3 uIrisTint;

// Single-surface keratometric index: the cornea as one refracting surface.
#define KERATOMETRIC_IOR 1.3375

// Direction from eye-space point `p` toward a light at `target`, as it runs
// inside the eye after refraction at the anterior cornea, and the share of the
// light transmitted there.
vec3 lightThroughCornea(vec3 p, vec3 target, out float transmission, out vec3 entry) {
	vec3 toLight = normalize(target - p);
	vec3 inside = toLight;
	transmission = 0.0;
	entry = p;
	for (int i = ZERO; i < 1; i++) {
		float t = intersectConic(p, inside, uGlobe.w, uCornea.x, uCornea.y);
		if (t < 0.0) return inside;
		entry = p + inside * t;
		vec3 n = conicNormal(entry, uGlobe.w, uCornea.x, uCornea.y);
		vec3 incoming = normalize(entry - target);
		float cosi = -dot(incoming, n);
		if (cosi <= 0.0) return inside;
		vec3 refracted = refract(incoming, n, 1.0 / KERATOMETRIC_IOR);
		transmission = 1.0 - fresnelDielectric(cosi, uIor.x);
		inside = -refracted;
	}
	return inside;
}

// Share of each component at a surface point: the closest ones dominate.
vec4 irisMaterialWeights(IrisParts parts) {
	vec4 d = vec4(parts.stroma, parts.radial, parts.arcs, parts.ruff);
	float nearest = min(min(d.x, d.y), min(d.z, d.w));
	vec4 w = exp(-(d - nearest) / 0.008);
	return w / (w.x + w.y + w.z + w.w);
}

// Reflectance of the layered iris (src/iris/irisColor.js) for ABL melanin,
// eumelanin share and the stroma thickness under the visible point.
vec3 irisColorLookup(float melanin, float eumelanin, float stroma) {
	vec3 size = vec3(IRIS_LUT_MELANIN, IRIS_LUT_EUMELANIN, IRIS_LUT_STROMA);
	vec3 uvw = vec3(saturate(melanin), saturate(eumelanin), saturate(stroma / uIrisColorMisc.z));
	return texture(uIrisColorLut, (uvw * (size - 1.0) + 0.5) / size).rgb;
}

// Albedo of the surface point: the stroma with its ABL (less inside a crypt,
// where the ABL is missing), the radial vessels with `fiberAbl` of it, the
// deeper collagen arcs with most of it, the ruff the dark pigment epithelium,
// nodules paler; beyond the root, the pigmented iridocorneal angle.
vec3 irisAlbedo(IrisParts parts) {
#if DEBUG_VIEW == DEBUG_IRIS_CLAY
	vec3 albedo = vec3(0.45);
#else
	vec4 weights = irisMaterialWeights(parts);
	vec4 pigment = textureLod(uIrisPigment, vec2(parts.theta * (1.0 / TAU), saturate(parts.rho)), gIrisLod);
	float inCrypt = smoothstep(0.0, 0.03, parts.atlas.g) * smoothstep(0.005, 0.03, parts.top - parts.h0);
	// The deep stroma keeps some melanocytes where the ABL is missing.
	float melanin = pigment.r * mix(1.0, 0.6, inCrypt) * (1.0 - 0.75 * pigment.a);
	float stroma = max(parts.h, 0.0);
	vec3 stromaColor = irisColorLookup(melanin, pigment.g, stroma);
	vec3 radialColor = irisColorLookup(pigment.r * uIrisColorMisc.x, pigment.g, stroma);
	vec3 arcColor = irisColorLookup(0.8 * pigment.r, pigment.g, stroma);
	vec3 ruffColor = vec3(0.028, 0.016, 0.011);
	vec3 albedo = weights.x * stromaColor + weights.y * radialColor + weights.z * arcColor + weights.w * ruffColor;
	albedo = max(mix(vec3(luma(albedo)), albedo, uIrisColorMisc.y), 0.0) * uIrisTint;
#endif
	return albedo * mix(1.0, 0.15, smoothstep(0.97, 1.08, parts.rho));
}

#endif
