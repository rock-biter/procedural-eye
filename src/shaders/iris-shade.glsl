// Lighting of the iris through the cornea: each emitter's irradiance reaches
// the iris along the direction refracted at the anterior cornea, reduced by
// the Fresnel transmission there; the strongest emitter also casts the soft
// self-shadows of the relief. Ambient light from the background is occluded
// by the relief (AO). The albedo comes from the Kubelka–Munk lookup of the
// layered iris (src/iris/irisColor.js) and the pigment atlas.
#ifndef IRIS_SHADE_GLSL
#define IRIS_SHADE_GLSL

#include ./iris-trace.glsl
#include ./sclera.glsl
#include ./debug-views.glsl

uniform sampler2D uIrisPigment; // ABL melanin, eumelanin share, freckle mask, nodule mask
uniform sampler3D uIrisColorLut; // linear sRGB by (ABL melanin, eumelanin share, stroma thickness)
uniform vec4 uIrisColorMisc; // ABL share over fibers, saturation, LUT max stroma (mm), glow radiance
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

// Albedo of each component: the stroma with its ABL (less inside a crypt,
// where the ABL is missing), the radial vessels with `fiberAbl` of it, the
// deeper collagen arcs with most of it, the ruff the dark pigment epithelium,
// nodules paler.
vec3 irisAlbedo(IrisParts parts, vec4 weights) {
#if DEBUG_VIEW == DEBUG_IRIS_CLAY
	return vec3(0.45);
#else
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
	return albedo;
#endif
}

vec3 shadeIris(IrisHit hit) {
	vec3 p = hit.p;
	vec3 pEye = p + vec3(uPupil.xy, 0.0);
	setIrisFootprint(hit.footprint);
	IrisParts parts = irisParts(p);
	vec3 n = irisNormal(p, max(0.5 * hit.footprint, 0.002), irisCombine(parts));
	float ao = irisAmbientOcclusion(p, n);
	vec4 weights = irisMaterialWeights(parts);
	vec3 albedo = irisAlbedo(parts, weights);
	float rho = parts.rho;
	vec4 atlas = parts.atlas;
	// Beyond the root: the pigmented iridocorneal angle.
	albedo *= mix(1.0, 0.15, smoothstep(0.97, 1.08, rho));

	// The ambient light reaching the iris comes through the cornea, under the lids.
	float lidAmbient = lidOcclusion((uEyeToWorld * vec4(pEye, 1.0)).xyz);
	vec3 radiance = albedo * INV_PI * backgroundIrradiance(n) * ao * 0.6 * mix(0.4, 1.0, lidAmbient);
	// Its own light (irisColor.glow), neither shadowed nor occluded.
	radiance += albedo * uIrisColorMisc.w;
	for (int i = ZERO; i < uEmitterCount; i++) {
		int base = i * EMITTER_VEC4S;
		vec4 A = uEmitters[base];
		int type = int(A.w + 0.5);
		if (type == EMITTER_LENS || type == EMITTER_BLOCKER) continue;
		float transmission;
		vec3 entry;
		vec3 l = lightThroughCornea(pEye, A.xyz, transmission, entry);
		float cosine = dot(n, l);
		if (cosine <= 0.0 || transmission <= 0.0) continue;
		vec3 facing = emitterIrradiance(i, pEye, normalize(A.xyz - pEye));
		vec3 shadow = vec3(1.0);
		if (i == 0) {
			// The lids and lashes shadow the light where it enters the cornea,
			// and the light shafts crossing it there add to it.
			vec3 world = (uEyeToWorld * vec4(entry, 1.0)).xyz;
			float lit = keyShadow(world);
			if (lit > 0.0) lit *= irisSoftShadow(p + n * 0.003, l, 10.0);
			shadow = lit * keyBeams(world);
		}
		radiance += albedo * INV_PI * facing * transmission * cosine * shadow * mix(0.6, 1.0, ao);
	}

#if DEBUG_VIEW == DEBUG_IRIS_NORMALS
	radiance = n * 0.5 + 0.5;
#elif DEBUG_VIEW == DEBUG_IRIS_AO
	radiance = vec3(ao);
#elif DEBUG_VIEW == DEBUG_IRIS_ATLAS
	radiance = vec3(atlas.r / 0.8, saturate(-atlas.a / 0.3), saturate(atlas.a / 1.5));
#elif DEBUG_VIEW == DEBUG_IRIS_STEPS
	float s = float(hit.steps) / float(uIrisSteps);
	radiance = mix(vec3(0.0, 0.2, 1.0), vec3(1.0, 0.1, 0.0), s) * (hit.steps >= uIrisSteps ? 2.0 : 1.0);
#endif
	return radiance;
}

#endif
