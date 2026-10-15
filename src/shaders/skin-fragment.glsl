// Eyelid skin and lid margin. The skin: micro-relief of crossing furrows,
// a fine network and pores, fine wrinkles along the lids and crow's feet
// (skin-relief.glsl); an albedo of melanin, blood and the veins seen through
// the thin skin, mottled, with freckles, darker in the folds and toward the
// canthi; shade in the geometric folds; oilier and wetter toward the margin.
// The intermarginal strip: wet conjunctiva behind, the mucocutaneous
// junction, the row of meibomian orifices, the grey line, the keratinized
// anterior margin. Wrapped diffuse, GGX specular, mirror reflection where wet.
#include ./debug-views.glsl
#include ./lit-surface.glsl
#include ./key-shadow.glsl
#include ./skin-relief.glsl

uniform vec3 uSkinColor;
uniform vec4 uSkin; // redness, roughness, wetness, pores
uniform vec4 uSkin2; // wrinkles, translucency, lid profile wall end, lid profile edge end
uniform vec4 uSkin3; // freckles, veins, pigmentation, seed
uniform vec4 uCanthi; // medial (xy) and lateral (zw) canthus, front plane at rest (mm)
uniform vec2 uMarginLength; // upper and lower margin lengths (mm)
uniform float uPixelAngle; // radians per pixel
uniform vec2 uDefocus; // camera aperture diameter, focus distance (mm)

varying vec3 vWorldPos;
varying vec3 vRestPos;
varying vec3 vNormal;
varying vec4 vLid;
varying vec4 vRelief;

// Meibomian orifices per margin, upper and lower (docs/RESEARCH.md).
const vec2 ORIFICES = vec2(34.0, 24.0);
// Approximate width of the intermarginal strip (mm).
const float STRIP = 1.25;

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
	vec3 dpdx = dFdx(vWorldPos);
	vec3 dpdy = dFdy(vWorldPos);
	vec3 gradAlong = surfaceGradient(alongMm, geometric, dpdx, dpdy);
	vec3 gradAcross = surfaceGradient(u * STRIP, geometric, dpdx, dpdy);

	// The pixel footprint (mm), widened by the depth of field's blur circle
	// on the skin (aperture × defocus / focus distance): furrows and wrinkles
	// fade where either is wider than them, the fine network, the pores and
	// the orifices earlier. Blurred, they would only average out (and cost).
	float distanceToCamera = length(cameraPosition - vWorldPos);
	float depth = -(viewMatrix * vec4(vWorldPos, 1.0)).z;
	float blur = uDefocus.x * abs(depth - uDefocus.y) / uDefocus.y;
	float footprint = sqrt(sq(distanceToCamera * uPixelAngle) + sq(0.5 * blur));
	float relief = 1.0 - smoothstep(0.05, 0.16, footprint);
	float detail = 1.0 - smoothstep(0.015, 0.05, footprint);

	// Skin tension lines: along the margin on the lids, radial out of the
	// lateral canthus, where the crow's feet are.
	vec2 across = normalize(vRelief.xy + vec2(1e-6, 0.0));
	vec2 outward = normalize(uCanthi.zw - uCanthi.xy);
	vec2 fromLateral = p - uCanthi.zw;
	float r = max(length(fromLateral), 1e-3);
	float cosAngle = dot(fromLateral, outward) / r;
	float sinAngle = (fromLateral.y * outward.x - fromLateral.x * outward.y) / r;
	float angle = atan(sinAngle, cosAngle);
	vec2 dAngle = (cosAngle * vec2(-outward.y, outward.x) - sinAngle * outward) / r;
	float fan = smoothstep(3.0, 7.0, r) * (1.0 - smoothstep(15.0, 23.0, r)) * (1.0 - smoothstep(0.8, 1.3, abs(angle)));
	vec2 alongLid = vec2(-across.y, across.x);
	vec2 radial = fromLateral / r;
	// Blend the two orientations as doubled angles (lines have no sign).
	vec2 doubled = mix(
		vec2(sq(alongLid.x) - sq(alongLid.y), 2.0 * alongLid.x * alongLid.y),
		vec2(sq(radial.x) - sq(radial.y), 2.0 * radial.x * radial.y),
		fan
	);
	float tensionAngle = 0.5 * atan(doubled.y, doubled.x);
	vec2 tension = vec2(cos(tensionAngle), sin(tensionAngle));

	// Regions of the skin.
	float upperLid = upper * smoothstep(1.0, 2.5, a) * (1.0 - smoothstep(9.0, 15.0, a));
	float underEye = (1.0 - upper) * smoothstep(1.0, 3.0, a) * (1.0 - smoothstep(8.0, 13.0, a));
	float canthi = exp(-sq(distance(p, uCanthi.xy) / 3.5)) + 0.6 * exp(-sq(distance(p, uCanthi.zw) / 3.5));

	// Micro-relief (furrows, fine network, pores) and fine wrinkles: heights
	// (mm) with their front-plane gradients. The anterior edge of the margin
	// is skin too.
	vec3 furrowed = vec3(0.0);
	vec3 network = vec3(0.0);
	vec3 wrinkles = vec3(0.0);
	float keratinized = smoothstep(0.85, 1.3, u);
	if (relief > 0.0 && keratinized > 0.0) {
		furrowed = 0.011 * relief * keratinized * furrows(p, tension, footprint, seed + 11u);
		if (detail > 0.0) {
			float pores = uSkin.w * mix(0.35, 1.0, smoothstep(2.0, 8.0, a)) * mix(1.0, 0.6, upper);
			network = 0.0025 * relief * keratinized * detail * fineNetwork(p, pores, footprint, seed + 13u);
		}
		float lidLines = uSkin2.x * smoothstep(1.2, 2.5, a) * (1.0 - smoothstep(13.0, 20.0, a)) * (1.0 - fan) *
			smoothstep(0.0, 0.15, along);
		// Slanted lines: 25° off the margin, toward the lateral side.
		float side = (upper > 0.5 ? 1.0 : -1.0) * sign(uCanthi.x - uCanthi.z);
		float slant = 0.906 * a + 0.423 * alongMm;
		vec2 dSlant = 0.906 * across + 0.423 * side * vec2(-across.y, across.x);
		wrinkles = relief * onSkin *
			lidWrinkles(p, a, across, slant, dSlant, lidLines, angle, dAngle, uSkin2.x * fan, footprint, seed + 17u);
	}
	vec3 micro = furrowed + network;
	vec3 height = micro + wrinkles;

	// The margin's relief, in the strip's own frame: fine bumps of the mucosa
	// (they break the wet reflection into glints) and the orifices.
	float orifices = 0.0;
	vec3 marginGradient = vec3(0.0);
	float orificeRim = 0.0;
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

	vec3 gradient = vec3(height.yz, 0.0);
	gradient -= geometric * dot(gradient, geometric);
	vec3 n = normalize(geometric - gradient - marginGradient * onMargin);

	// Albedo: melanin, blood and the venous tint over the skin color.
	float melanin = 0.3 * fbm(p / 6.0, seed + 51u) + 0.35 * fbm(p / 1.3, seed + 53u);
	float blood = 0.3 * fbm(p / 3.0, seed + 57u) + 0.3 * valueNoise(p / 0.7, seed + 59u);
	float venous = 0.0;
	float cavity = saturate(-fold / 0.5);
	melanin += 1.1 * freckles(p, uSkin3.x, seed + 61u);
	melanin += uSkin3.z * (0.9 * cavity + 0.5 * underEye + 0.4 * canthi);
	float veins = veinNetwork(p, seed + 67u);
	venous += uSkin3.y * (0.8 * upperLid + 1.0 * underEye + 1.6 * veins * saturate(upperLid + underEye + 0.15));
	// Capillaries: pinker thin skin toward the lash line and in the canthi.
	blood += uSkin.x * (1.5 * exp(-a / 1.6) + 0.6 * canthi);
	vec3 albedo = uSkinColor * pow(vec3(0.8, 0.68, 0.56), vec3(melanin)) *
		pow(vec3(1.0, 0.8, 0.82), vec3(blood)) * pow(vec3(0.84, 0.85, 1.0), vec3(venous));
	// Furrows are a little darker; the lash roots darker still.
	albedo *= 1.0 + 3.0 * furrowed.x + network.x;
	albedo *= mix(1.0, 0.7, exp(-a / 0.5) * onSkin);

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

	// Folds are shaded (ambient and specular occlusion), grooves a little.
	float occlusion = (1.0 - 0.45 * pow(cavity, 0.8)) * (1.0 + 4.0 * micro.x + 1.5 * wrinkles.x);
	// Wet toward the margin, oily patches on the lids, matte further out.
	float sebum = smoothstep(-0.3, 0.6, valueNoise(p / 2.5, seed + 83u)) * (1.0 - smoothstep(6.0, 16.0, a));
	float wet = mix(uSkin.z * exp(-a / 2.5), 1.0 - 0.25 * smoothstep(0.6, 1.2, u), onMargin);
	float roughness = mix(uSkin.y * (1.0 - 0.25 * sebum), mix(0.06, 0.13, smoothstep(0.4, 1.0, u)), wet);
	vec3 wrap = uSkin2.y * vec3(0.55, 0.28, 0.18);
	float lit = keyShadow(vWorldPos + geometric * 0.02);
	// Light scattered under the skin softens the red edge of the shadows.
	vec3 shadow = mix(vec3(lit), vec3(sqrt(lit), lit, lit * lit), uSkin2.y);
	vec3 color = litSurface(vWorldPos, n, v, albedo * occlusion, wrap, roughness, 0.028, occlusion, shadow);
	float fresnel = schlick(dot(n, v), 0.02);
	color += wet * occlusion * fresnel * envRadiance(vWorldPos, reflect(-v, n)) * 0.6;

#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#endif
	gl_FragColor = vec4(color, distanceToCamera);
}
