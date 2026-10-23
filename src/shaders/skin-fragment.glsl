// Eyelid skin and lid margin. The skin: micro-relief of stars of furrows out
// of the follicles, the dimples of the pores and the secondary furrows, fine
// wrinkles along the lids and crow's feet (skin-relief.glsl), softened in the
// diffuse by the light scattered under the skin; an albedo of melanin, blood
// and the veins seen through the thin skin, mottled, with freckles, darker in
// the folds and toward the canthi; shade in the geometric folds; oilier and
// wetter toward the margin.
// The intermarginal strip: wet conjunctiva behind, the mucocutaneous
// junction, the row of meibomian orifices, the grey line, the keratinized
// anterior margin. Wrapped diffuse, GGX specular, mirror reflection where wet.
// SKIN_SHELL: the back shell (src/adnexa/backShell.js), plain skin far from
// the lids, without freckles and veins, darker by uShellTone; its pattern
// coordinates are its own skin unrolled into the front plane.
// SKIN_BAKED (outside #debug): the micro-relief, the wrinkles and the
// freckles come from textures baked at rest (src/adnexa/skinRelief.js)
// instead of being hashed per pixel.
#include ./debug-views.glsl
#include ./lit-surface.glsl
#include ./key-shadow.glsl
#include ./shaft-light.glsl
#include ./skin-relief.glsl

uniform vec3 uSkinColor;
uniform vec4 uSkin; // redness, roughness, wetness, pores
uniform vec4 uSkin2; // wrinkles, translucency, lid profile wall end, lid profile edge end
uniform vec4 uSkin3; // freckles, veins, pigmentation, seed
uniform vec4 uCanthi; // medial (xy) and lateral (zw) canthus, front plane at rest (mm)
uniform vec2 uMarginLength; // upper and lower margin lengths (mm)
uniform float uPixelAngle; // radians per pixel
uniform vec2 uDefocus; // camera aperture diameter, focus distance (mm)
uniform float uOcclusion; // strength of the baked ambient occlusion
uniform sampler2D uSkinPattern; // baked pigment patterns (skin-pattern-fragment.glsl)
uniform vec4 uSkinPatternBox; // its box in the front plane: min x, min y, 1 / width, 1 / height (mm)
#ifdef SKIN_BAKED
// The baked relief and freckles (src/adnexa/skinRelief.js) over the same box,
// and their texel sizes (mm).
uniform sampler2D uSkinRelief;
uniform float uSkinReliefTexel;
uniform sampler2D uSkinFreckles;
uniform float uSkinFrecklesTexel;
#endif
#ifdef SKIN_SHELL
uniform float uShellTone; // the back shell's albedo, a share of the skin's
#endif

// Centroid for the shading, plain copies for the derivatives
// (skin-vertex.glsl).
centroid varying vec3 vWorldPos;
centroid varying vec3 vRestPos;
centroid varying vec3 vNormal;
centroid varying vec4 vLid;
centroid varying vec4 vRelief;
centroid varying float vAo;
varying vec3 vCenterWorldPos;
varying vec4 vCenterFrame;
centroid varying vec3 vFacing[LIT_EMITTERS];

// Meibomian orifices per margin, upper and lower (docs/RESEARCH.md).
const vec2 ORIFICES = vec2(34.0, 24.0);
// Approximate width of the intermarginal strip (mm).
const float STRIP = 1.25;
// The share of the relief's slopes the diffuse sees, red, green, blue.
const vec3 SCATTERED_RELIEF = vec3(0.2, 0.5, 0.8);

// Gradient along the surface of a scalar varying (Mikkelsen 2010), from
// screen-space derivatives: constant per triangle for an interpolated value.
vec3 surfaceGradient(float f, vec3 n, vec3 dpdx, vec3 dpdy) {
	vec3 r1 = cross(dpdy, n);
	vec3 r2 = cross(n, dpdx);
	float det = dot(dpdx, r1);
	det = abs(det) < 1e-12 ? 1e-12 : det;
	return (dFdx(f) * r1 + dFdy(f) * r2) / det;
}

// Height (mm) of the intermarginal strip at `m` = (along, across) mm: the
// fine bumps of the mucosa and a meibomian orifice at `center`, a low mound
// of meibum around a pinhole, `open` 0–1.
float marginHeight(vec2 m, vec2 center, float size, float open, uint seed) {
	float r = length(m - center) / size;
	float orifice = 0.005 * exp(-sq(r / 1.3)) - 0.006 * exp(-sq(r / 0.45));
	return open * orifice + 0.005 * valueNoise(m / 0.05, seed) + 0.012 * valueNoise(m / 0.25, seed + 1u);
}

void main() {
	vec3 v = normalize(cameraPosition - vWorldPos);
	vec3 geometric = normalize(vNormal);
	if (!gl_FrontFacing) geometric = -geometric;
	float s = vLid.y;
	float a = vLid.z;
	float upper = vLid.w;
	float fold = vRelief.z;
	float along = vRelief.w;
	vec2 p = vRestPos.xy;
	uint seed = uint(uSkin3.w + 0.5) * 7919u + 101u;
	// Melanin and blood mottling, veins, oily patches (skin-pattern-fragment.glsl).
	vec2 uv = (p - uSkinPatternBox.xy) * uSkinPatternBox.zw;
	vec4 pattern = texture(uSkinPattern, uv);
	float onMargin = 1.0 - smoothstep(uSkin2.z, uSkin2.w, s);
	float onSkin = 1.0 - onMargin;
	// The canthi, where the margin features fade out.
	float taper = smoothstep(0.0, 0.1, along) * smoothstep(0.0, 0.1, 1.0 - along);

	// The intermarginal strip's frame: along the margin and across it (mm),
	// from derivatives (in uniform control flow).
	float marginLength = mix(uMarginLength.y, uMarginLength.x, step(0.5, upper));
	float alongMm = along * marginLength;
	float u = s / uSkin2.z;
	vec2 m = vec2(alongMm, u * STRIP);
	vec3 dpdx = dFdx(vCenterWorldPos);
	vec3 dpdy = dFdy(vCenterWorldPos);
	vec3 gradAlong = surfaceGradient(vCenterFrame.z * marginLength, geometric, dpdx, dpdy);
	vec3 gradAcross = surfaceGradient(vCenterFrame.w / uSkin2.z * STRIP, geometric, dpdx, dpdy);

	// The pixel footprint (mm), widened by the depth of field's blur circle
	// on the skin (aperture × defocus / focus distance): the relief fades
	// where either is wider than the dimples of the pores, the secondary
	// furrows, the follicles' openings and the orifices earlier. Blurred, they
	// would only average out (and cost).
	float distanceToCamera = length(cameraPosition - vWorldPos);
	float depth = -(viewMatrix * vec4(vWorldPos, 1.0)).z;
	float blur = uDefocus.x * abs(depth - uDefocus.y) / uDefocus.y;
	float footprint = sqrt(sq(distanceToCamera * uPixelAngle) + sq(0.5 * blur));
	float relief = 1.0 - smoothstep(0.1, 0.3, footprint);
	float detail = 1.0 - smoothstep(0.015, 0.05, footprint);

	// Regions of the skin.
	float upperLid = upper * smoothstep(1.0, 2.5, a) * (1.0 - smoothstep(9.0, 15.0, a));
	float underEye = (1.0 - upper) * smoothstep(1.0, 3.0, a) * (1.0 - smoothstep(8.0, 13.0, a));
	float canthi = exp(-sq(distance(p, uCanthi.xy) / 3.5)) + 0.6 * exp(-sq(distance(p, uCanthi.zw) / 3.5));
#ifdef SKIN_SHELL
	// The shell's coordinates cover the front plane's again: no canthi there.
	canthi = 0.0;
#endif

	// Micro-relief (furrows, follicles, pores, secondary furrows) and fine
	// wrinkles (skin-relief.glsl): the front-plane gradient of their height
	// (mm), and their terms in the albedo (furrows darker) and the occlusion.
	// The anterior edge of the margin is skin too.
	vec2 reliefGradient = vec2(0.0);
	float reliefShade = 0.0;
	float reliefOcclusion = 0.0;
	float keratinized = smoothstep(0.85, 1.3, u);
#ifdef SKIN_BAKED
	// Baked at rest (src/adnexa/skinRelief.js), read at the mip level of the
	// footprint: the mipmaps filter it as the footprint did. Its wrinkles are
	// weighed by the skin share already.
	if (relief > 0.0 && keratinized > 0.0) {
		vec4 baked = textureLod(uSkinRelief, uv, log2(max(0.7 * footprint / uSkinReliefTexel, 1.0)));
		float weight = relief * keratinized;
		reliefGradient = weight * (baked.rg * 2.0 - 1.0) * RELIEF_SLOPE;
		reliefShade = weight * (baked.b - 1.0) * RELIEF_SHADE;
		reliefOcclusion = weight * (baked.a - 1.0) * RELIEF_OCCLUSION;
	}
#else
	if (relief > 0.0 && keratinized > 0.0) {
		vec2 across = normalize(vRelief.xy + vec2(1e-6, 0.0));
		MicroRelief r =
			skinMicroRelief(p, a, along, alongMm, upper, across, uCanthi, uSkin.w, uSkin2.x, footprint, detail, seed);
		float weight = relief * keratinized;
		vec4 terms = reliefTerms(
			weight * r.furrowed, weight * detail * r.network, weight * detail * r.openings, relief * onSkin * r.wrinkles
		);
		reliefGradient = terms.xy;
		reliefShade = terms.z;
		reliefOcclusion = terms.w;
	}
#endif

	// The margin's relief, in the strip's own frame: fine bumps of the mucosa
	// (they break the wet reflection into glints) and the orifices.
	float orifices = 0.0;
	vec3 marginGradient = vec3(0.0);
	float orificeRim = 0.0;
#ifndef SKIN_SHELL
	if (onMargin > 0.0 && detail > 0.0) {
		float count = upper > 0.5 ? ORIFICES.x : ORIFICES.y;
		float x = along * count;
		float cell = floor(x);
		vec4 h = hashBytes(pcgHash(uint(int(cell)) ^ (seed + (upper > 0.5 ? 71u : 73u))));
		vec2 center = vec2((cell + 0.5 + 0.35 * (h.x - 0.5)) * (marginLength / count), (0.42 + 0.1 * (h.y - 0.5)) * STRIP);
		float size = 0.03 + 0.03 * h.z * h.z;
		// A few are closed, some capped with a bead of meibum.
		float open = step(0.15, h.w) * taper * (1.0 - smoothstep(0.9, 1.0, u));
		float e = 0.004;
		uint bumps = seed + 75u;
		float h0 = marginHeight(m, center, size, open, bumps);
		vec2 g = vec2(
			marginHeight(m + vec2(e, 0.0), center, size, open, bumps) - h0,
			marginHeight(m + vec2(0.0, e), center, size, open, bumps) - h0
		) / e;
		marginGradient = detail * (g.x * gradAlong + g.y * gradAcross);
		float ro = length(m - center) / size;
		orifices = detail * open * exp(-sq(ro / 0.45));
		orificeRim = detail * open * exp(-sq(ro / 1.3)) * step(0.7, h.w);
	}
#endif

#ifdef SKIN_SHELL
	// The relief's gradient in the unrolled coordinates, carried onto the
	// surface by theirs (the band stands edge-on to the front plane).
	vec3 gradient = reliefGradient.x * surfaceGradient(vCenterFrame.x, geometric, dpdx, dpdy) +
		reliefGradient.y * surfaceGradient(vCenterFrame.y, geometric, dpdx, dpdy);
#else
	vec3 gradient = vec3(reliefGradient, 0.0);
	gradient -= geometric * dot(gradient, geometric);
#endif
	vec3 tilt = gradient + marginGradient * onMargin;
	vec3 n = normalize(geometric - tilt);
	// Light scattered under the skin blurs the shading of its relief, the red
	// over a millimeter or so, the blue the least (d'Eon et al. 2007): the
	// diffuse sees the relief's slopes weakened per channel, the specular
	// all of them.
	mat3 diffuse = mat3(
		normalize(geometric - SCATTERED_RELIEF.r * tilt),
		normalize(geometric - SCATTERED_RELIEF.g * tilt),
		normalize(geometric - SCATTERED_RELIEF.b * tilt)
	);

	// Albedo: melanin, blood and the venous tint over the skin color.
	float melanin = (pattern.r - 0.5) * 1.3;
	float blood = (pattern.g - 0.5) * 1.2;
	float venous = 0.0;
	float cavity = saturate(-fold / 0.5);
#ifndef SKIN_SHELL
#ifdef SKIN_BAKED
	melanin += 1.1 * textureLod(uSkinFreckles, uv, log2(max(footprint / uSkinFrecklesTexel, 1.0))).r;
#else
	melanin += 1.1 * freckles(p, uSkin3.x, seed + 61u);
#endif
	float veins = pattern.b;
	venous += uSkin3.y * (0.8 * upperLid + 1.0 * underEye + 1.6 * veins * saturate(upperLid + underEye + 0.15));
#endif
	melanin += uSkin3.z * (0.9 * cavity + 0.5 * underEye + 0.4 * canthi);
	// Capillaries: pinker thin skin toward the lash line and in the canthi.
	blood += uSkin.x * (1.5 * exp(-a / 1.6) + 0.6 * canthi);
	vec3 albedo = uSkinColor * pow(vec3(0.8, 0.68, 0.56), vec3(melanin)) *
		pow(vec3(1.0, 0.8, 0.82), vec3(blood)) * pow(vec3(0.84, 0.85, 1.0), vec3(venous));
	// Furrows are a little darker; the lash roots darker still.
	albedo *= 1.0 + reliefShade;
	albedo *= mix(1.0, 0.7, exp(-a / 0.5) * onSkin);
#ifdef SKIN_SHELL
	albedo *= uShellTone;
#else

	// The margin, from the posterior border (u 0) to the lash line (u 1–2),
	// mottled along its length by its vessels.
	if (onMargin > 0.0) {
		float flush = fbm(m * vec2(1.2, 2.0), seed + 81u);
		vec3 conjunctiva = vec3(0.6, 0.24, 0.22) * pow(vec3(1.0, 0.8, 0.82), vec3(0.6 * flush));
		vec3 anterior = uSkinColor * vec3(0.98, 0.7, 0.66) * pow(vec3(1.0, 0.8, 0.82), vec3(uSkin.x + 0.5 * flush));
		vec3 margin = mix(conjunctiva, anterior, smoothstep(0.25, 0.6, u));
		// Marx's line (the mucocutaneous junction) and the grey line.
		margin *= 1.0 - 0.22 * exp(-sq((u - 0.3) / 0.05));
		margin = mix(margin, vec3(luma(margin)) * 0.85, 0.45 * exp(-sq((u - 0.72) / 0.06)) * taper);
		margin = mix(margin, margin * vec3(0.6, 0.5, 0.5), 0.7 * orifices);
		margin = mix(margin, vec3(0.8, 0.68, 0.5), 0.3 * saturate(orificeRim));
		albedo = mix(albedo, margin, onMargin);
	}
#endif

	// Folds are shaded (ambient and specular occlusion), grooves a little.
	float occlusion = (1.0 - 0.45 * pow(cavity, 0.8)) * (1.0 + reliefOcclusion);
	// Baked over the geometry: deep in the canthi, under the margins, in the crease.
	occlusion *= mix(1.0, vAo, uOcclusion);
	// Wet toward the margin, oily patches on the lids, matte further out.
	float sebum = pattern.a * (1.0 - smoothstep(6.0, 16.0, a));
	float wet = mix(uSkin.z * exp(-a / 2.5), 1.0 - 0.25 * smoothstep(0.6, 1.2, u), onMargin);
	float roughness = mix(uSkin.y * (1.0 - 0.25 * sebum), mix(0.06, 0.13, smoothstep(0.4, 1.0, u)), wet);
	vec3 wrap = uSkin2.y * vec3(0.55, 0.28, 0.18);
	float lit = keyShadow(vWorldPos + geometric * 0.02, geometric);
	// Light scattered under the skin softens the red edge of the shadows.
	vec3 shadow = mix(vec3(lit), vec3(sqrt(lit), lit, lit * lit), uSkin2.y);
	vec3 facings[LIT_EMITTERS];
	for (int i = 0; i < LIT_EMITTERS; i++) facings[i] = vFacing[i];
	vec3 color = litSurface(facings, vWorldPos, n, diffuse, v, albedo * occlusion, wrap, roughness, 0.028, occlusion, shadow);
	// The light shafts crossing the skin.
	color += albedo * occlusion * INV_PI * shaftIrradiance(vWorldPos, diffuse[1], 0.15);
	// The tear film makes the margin a mirror. On the skin the moisture follows
	// the relief, so it reflects roughly (litSurface() above), and the mirror
	// image fades out within half a millimeter: further out, where the folds of
	// the canthi turn the skin grazing, it showed the emitters as pale blots.
	// It is left out where it fades under 1e-4 (some 4 mm from the margin) and
	// on the back shell, which lies 60 mm out.
#ifndef SKIN_SHELL
	float mirror = mix(wet * exp(-a / 0.5), wet, onMargin);
	if (mirror > 1e-4) {
		float fresnel = schlick(dot(n, v), 0.02);
		color += mirror * occlusion * fresnel * envRadiance(vWorldPos, reflect(-v, n)) * 0.6;
	}
#endif

#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#endif
	gl_FragColor = vec4(color, distanceToCamera);
}
