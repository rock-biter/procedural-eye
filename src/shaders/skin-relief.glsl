// Periocular skin at macro scale, in the front plane at the lids' rest
// position (mm): the micro-relief (furrows crossing into rhomboid plateaus,
// the fine network inside them, pores, fine wrinkles along the lids and the
// crow's feet) as height functions returning vec3(height mm ≤ 0, d/dx, d/dy),
// and the pigment patterns (mottling, freckles, veins seen through the thin
// skin). Nothing is periodic: every pattern is hashed per cell.
#ifndef SKIN_RELIEF_GLSL
#define SKIN_RELIEF_GLSL

#include ./common.glsl
#include ./noise3.glsl

uint cellHash(ivec2 c, uint seed) {
	return pcgHash(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ seed);
}

vec2 cellPoint(ivec2 c, uint seed) {
	uint h = cellHash(c, seed);
	return vec2(float(h & 65535u), float(h >> 16u)) / 65535.0;
}

// 2D value noise (quintic fade), in [-1, 1].
float valueNoise(vec2 p, uint seed) {
	ivec2 i = ivec2(floor(p));
	vec2 f = p - vec2(i);
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float a = float(cellHash(i, seed) >> 8u);
	float b = float(cellHash(i + ivec2(1, 0), seed) >> 8u);
	float c = float(cellHash(i + ivec2(0, 1), seed) >> 8u);
	float d = float(cellHash(i + ivec2(1, 1), seed) >> 8u);
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * (2.0 / 16777216.0) - 1.0;
}

float fbm(vec2 p, uint seed) {
	return 0.57 * valueNoise(p, seed) + 0.29 * valueNoise(p * 2.07 + 5.3, seed + 1u) +
		0.14 * valueNoise(p * 4.13 - 2.1, seed + 2u);
}

// Grooves across the coordinate w (mm): one line per `spacing` at a random
// place in it, of random depth, `width` wide (mm), broken into segments of
// about `segment` mm by noise at p. Prefiltered by the pixel `footprint` (mm):
// a line narrower than a pixel widens and grows shallower, keeping its
// darkness, so it does not flicker in fresh frames. Returns (height in units
// of the depth, d height / dw).
vec2 grooves(float w, vec2 p, float spacing, float width, float segment, float footprint, uint seed) {
	float k = floor(w / spacing);
	float blurred = sqrt(sq(width) + sq(0.5 * footprint));
	float depth = width / blurred;
	width = blurred;
	vec2 sum = vec2(0.0);
	for (int j = -1; j <= 1; j++) {
		int cell = int(k) + j;
		uint h = pcgHash(uint(cell) ^ seed);
		vec4 r = hashBytes(h);
		float center = (float(cell) + 0.15 + 0.7 * r.x) * spacing;
		float on = smoothstep(-0.2, 0.3, valueNoise(p / segment + r.yz * 41.0, h));
		float d = (w - center) / width;
		float g = depth * (0.3 + 0.7 * r.w) * on * exp(-d * d);
		sum += vec2(-g, 2.0 * d * g / width);
	}
	return sum;
}

// The primary furrows of the skin surface: three families of straight,
// broken grooves 60° apart, crossing into rhomboid and triangular plateaus.
// The family along the skin tension lines (`tension`, unit) is the deepest.
// Each line breaks into segments by a 1D noise along it.
vec3 furrows(vec2 p, vec2 tension, float footprint, uint seed) {
	// A slight wobble keeps the lines from looking ruled.
	vec2 q = p + 0.025 * vec2(valueNoise(p * 2.3, seed), valueNoise(p * 2.3 + 7.7, seed + 9u));
	float width = sqrt(sq(0.016) + sq(0.5 * footprint));
	float depth = 0.016 / width;
	vec3 sum = vec3(0.0);
	for (int k = ZERO; k < 3; k++) {
		float angle = float(k) * (PI / 3.0) + 0.3;
		vec2 across = vec2(cos(angle), sin(angle));
		vec2 along = vec2(-across.y, across.x);
		float weight = depth * (0.3 + 0.7 * pow(abs(dot(along, tension)), 6.0));
		float spacing = 0.22 + 0.04 * float(k);
		float w = dot(q, across);
		float v = dot(q, along) / 0.5;
		float cell = floor(w / spacing);
		for (int j = -1; j <= 1; j++) {
			uint h = pcgHash(uint(int(cell) + j) ^ (seed + uint(k) * 101u));
			vec4 r = hashBytes(h);
			float center = (cell + float(j) + 0.15 + 0.7 * r.x) * spacing;
			// Segments: a 1D value noise along the line.
			float i = floor(v + r.y * 64.0);
			float f = v + r.y * 64.0 - i;
			float on = mix(
				hashBytes(pcgHash(uint(int(i)) ^ h)).x,
				hashBytes(pcgHash(uint(int(i) + 1) ^ h)).x,
				f * f * (3.0 - 2.0 * f)
			);
			float d = (w - center) / width;
			float g = weight * (0.3 + 0.7 * r.w) * smoothstep(0.35, 0.65, on) * exp(-d * d);
			sum += vec3(-g, (2.0 * d * g / width) * across);
		}
	}
	return sum;
}

// The fine network of shallow grooves inside the plateaus (Worley cell
// borders, cells about 0.13 mm) and pores at some cell centers (up to about
// 4 per mm² with `pores` 1), prefiltered by the pixel `footprint` (mm) like
// the grooves. Heights in units of the groove depth.
vec3 fineNetwork(vec2 p, float pores, float footprint, uint seed) {
	const float SCALE = 7.5;
	vec2 q = p * SCALE;
	ivec2 i = ivec2(floor(q));
	vec2 f = q - vec2(i);
	float f1 = 8.0;
	float f2 = 8.0;
	vec2 r1 = vec2(0.0);
	vec2 r2 = vec2(0.0);
	ivec2 c1 = i;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			ivec2 g = ivec2(x, y);
			vec2 r = vec2(g) + cellPoint(i + g, seed) - f;
			float d = dot(r, r);
			if (d < f1) {
				f2 = f1;
				r2 = r1;
				f1 = d;
				r1 = r;
				c1 = i + g;
			} else if (d < f2) {
				f2 = d;
				r2 = r;
			}
		}
	}
	f1 = sqrt(f1) + 1e-5;
	f2 = sqrt(f2) + 1e-5;
	// Cell border: F2 − F1 small; d(F)/dq = −r / F. Only some borders show,
	// in patches, so the network does not read as scales.
	float width = sqrt(sq(0.12) + sq(0.5 * footprint * SCALE));
	float shown = smoothstep(-0.3, 0.6, valueNoise(p * 3.0, seed + 5u));
	float border = shown * (0.12 / width) * exp(-sq((f2 - f1) / width));
	vec2 dBorder = border * (-2.0 * (f2 - f1) / sq(width)) * (r1 / f1 - r2 / f2);
	vec3 height = vec3(-border, -dBorder * SCALE);
	// A pore: a small round pit at a few cell centers.
	float hasPore = step(1.0 - 0.08 * pores, hashBytes(cellHash(c1, seed + 7u)).x);
	float pit = hasPore * exp(-sq(f1 / 0.22));
	height += 2.2 * vec3(-pit, -pit * 2.0 * r1 / sq(0.22) * SCALE);
	return height;
}

// Fine wrinkles: lines along the lids (across `a`, mm from the margin, which
// grows along `across`), crossed at a slant by shorter, shallower ones (the
// crepe of thin lid skin, across `slant`, mm, growing along `dSlant`), and the
// crow's feet fanning out of the lateral canthus (across `angle`, whose
// gradient is `dAngle`). Heights in mm.
vec3 lidWrinkles(
	vec2 p,
	float a,
	vec2 across,
	float slant,
	vec2 dSlant,
	float lidLines,
	float angle,
	vec2 dAngle,
	float fan,
	float footprint,
	uint seed
) {
	vec3 height = vec3(0.0);
	if (lidLines > 0.0) {
		vec2 g = grooves(a + 0.25 * valueNoise(p * 0.55, seed + 31u), p, 0.55, 0.08, 1.4, footprint, seed + 37u);
		height += 0.04 * lidLines * vec3(g.x, g.y * across);
		g = grooves(slant + 0.2 * valueNoise(p * 0.8, seed + 33u), p, 0.4, 0.05, 0.7, footprint, seed + 39u);
		height += 0.015 * lidLines * vec3(g.x, g.y * dSlant);
	}
	if (fan > 0.0) {
		// Wandering, not ruled rays.
		float bend = angle * 8.0 + 0.7 * valueNoise(p * 0.35, seed + 41u) + 0.25 * valueNoise(p * 1.1, seed + 45u);
		vec2 g = grooves(bend, p, 0.75, 0.12, 2.4, footprint, seed + 43u);
		height += 0.08 * fan * vec3(g.x, g.y * 8.0 * dAngle);
	}
	return height;
}

// Ephelides and small lentigines: spots at some cells of a jittered 1.1 mm
// grid, in loose clusters, with ragged edges. Coverage 0–1 (times darkness).
float freckles(vec2 p, float density, uint seed) {
	const float SIZE = 1.1;
	vec2 q = p / SIZE;
	ivec2 i = ivec2(floor(q));
	vec2 f = q - vec2(i);
	float cluster = density * (0.25 + 0.75 * smoothstep(-0.5, 0.5, valueNoise(p / 6.0, seed + 1u)));
	float ragged = 0.22 * valueNoise(p * 7.0, seed + 2u);
	float spot = 0.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			ivec2 c = i + ivec2(x, y);
			vec4 r = hashBytes(cellHash(c, seed));
			if (r.x > cluster * 0.7) continue;
			vec2 center = vec2(x, y) + 0.15 + 0.7 * r.yz;
			float radius = (0.08 + 0.32 * r.w * r.w) / SIZE;
			float d = length(f - center) / radius + ragged;
			spot = max(spot, (0.45 + 0.55 * fract(r.y * 7.0)) * (1.0 - smoothstep(0.6, 1.05, d)));
		}
	}
	return spot;
}

// Veins seen through thin skin: the zero lines of a warped gradient noise
// (the distance to them from the value and its gradient), soft as seen
// through the dermis, in stretches that fade in and out; larger ones (about
// 0.4 mm) and finer branches. Coverage 0–1.
float veinNetwork(vec2 p, uint seed) {
	vec2 q = p / 5.0;
	q += 0.35 * vec2(valueNoise(q * 1.7, seed), valueNoise(q * 1.7 + 3.1, seed + 1u));
	vec4 large = gradientNoise3(vec3(q, 0.37), seed + 2u);
	float gap = abs(large.x) / max(length(large.yz), 0.2) * 5.0;
	float on = smoothstep(-0.2, 0.5, valueNoise(q * 1.1 + 2.0, seed + 5u));
	float veins = on * exp(-sq(gap / 0.22));
	vec4 small = gradientNoise3(vec3(q * 2.6 + 9.0, 0.71), seed + 3u);
	float branch = abs(small.x) / max(length(small.yz), 0.2) * (5.0 / 2.6);
	float onSmall = smoothstep(0.0, 0.5, valueNoise(q * 2.0 + 5.0, seed + 4u));
	return max(veins, 0.5 * onSmall * exp(-sq(branch / 0.1)));
}

// The micro-relief and the fine wrinkles of the skin at `p`, unweighted: the
// furrows and the fine network (with the pores) in mm, and the wrinkles, as
// heights with their front-plane gradients. The caller weighs them by its
// fades, the keratinized share and the skin share. `a`, `along`, `alongMm`
// and `upper` are the lid frame (mm from the margin, along the margin 0–1
// and in mm, the upper share), `across` the unit front-plane direction in
// which `a` grows, `canthi` the medial (xy) and lateral (zw) canthus;
// `pores` and `wrinkleAmount` are skin.pores and skin.wrinkles. The fine
// network is left out where `detail` is 0. The skin program evaluates it per
// pixel in #debug, the bake (skin-relief-bake-fragment.glsl) per texel.
// SKIN_SHELL: the back shell's, in its own coordinates.
struct MicroRelief {
	vec3 furrowed;
	vec3 network;
	vec3 wrinkles;
};

MicroRelief skinMicroRelief(
	vec2 p,
	float a,
	float along,
	float alongMm,
	float upper,
	vec2 across,
	vec4 canthi,
	float pores,
	float wrinkleAmount,
	float footprint,
	float detail,
	uint seed
) {
	// Skin tension lines: along the margin on the lids, radial out of the
	// lateral canthus, where the crow's feet are.
	vec2 outward = normalize(canthi.zw - canthi.xy);
	vec2 fromLateral = p - canthi.zw;
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
#ifdef SKIN_SHELL
	// The shell's coordinates cover the front plane's again: no canthi there.
	// Its tension lines wander over about a centimeter: lines all along the
	// edge streak where the shell turns away, furrows all as shallow cross
	// into a regular lattice.
	fan = 0.0;
	float tensionTurn = PI * valueNoise(p / 12.0, seed + 19u);
	tension = vec2(cos(tensionTurn), sin(tensionTurn));
#endif

	MicroRelief relief;
	relief.furrowed = 0.011 * furrows(p, tension, footprint, seed + 11u);
	relief.network = vec3(0.0);
	if (detail > 0.0) {
		float poreShare = pores * mix(0.35, 1.0, smoothstep(2.0, 8.0, a)) * mix(1.0, 0.6, upper);
		relief.network = 0.0025 * fineNetwork(p, poreShare, footprint, seed + 13u);
	}
	float lidLines = wrinkleAmount * smoothstep(1.2, 2.5, a) * (1.0 - smoothstep(13.0, 20.0, a)) * (1.0 - fan) *
		smoothstep(0.0, 0.15, along);
	// Slanted lines: 25° off the margin, toward the lateral side.
	float side = (upper > 0.5 ? 1.0 : -1.0) * sign(canthi.x - canthi.z);
	float slant = 0.906 * a + 0.423 * alongMm;
	vec2 dSlant = 0.906 * across + 0.423 * side * vec2(-across.y, across.x);
	relief.wrinkles = lidWrinkles(p, a, across, slant, dSlant, lidLines, angle, dAngle, wrinkleAmount * fan, footprint, seed + 17u);
	return relief;
}

// The baked relief (src/adnexa/skinRelief.js), RGBA8 over the front-plane
// box: the front-plane gradient of the whole height (rg, ±RELIEF_SLOPE), the
// albedo term of the furrows and the network (b, 3 furrows + network, in
// −RELIEF_SHADE–0) and the occlusion term (a, 4 micro-relief + 1.5 wrinkles,
// in −RELIEF_OCCLUSION–0). All linear in the heights, so the mipmaps filter
// them as the footprint would.
const float RELIEF_SLOPE = 1.5;
const float RELIEF_SHADE = 0.12;
const float RELIEF_OCCLUSION = 0.4;

vec4 encodeRelief(vec2 gradient, float shade, float occlusion) {
	return vec4(
		clamp(gradient / RELIEF_SLOPE * 0.5 + 0.5, 0.0, 1.0),
		clamp(1.0 + shade / RELIEF_SHADE, 0.0, 1.0),
		clamp(1.0 + occlusion / RELIEF_OCCLUSION, 0.0, 1.0)
	);
}

#endif
