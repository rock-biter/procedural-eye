// Periocular skin at macro scale, in the front plane at the lids' rest
// position (mm): the micro-relief (furrows crossing into domed plateaus, the
// secondary furrows inside them, the follicles opening at the crossings, the
// dimples of the visible pores, fine wrinkles along the lids and the crow's
// feet) as height functions returning vec3(height mm ≤ 0, d/dx, d/dy), and
// the pigment patterns (mottling, freckles, veins seen through the thin
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

// A height (mm) with its front-plane gradient, and the pits opening in it.
struct Pitted {
	vec3 relief;
	vec3 pits;
};

// The node of cell `c` of a star grid (hash `h`), mm from the point `q`
// (cells).
vec2 starNode(ivec2 c, uint h, vec2 q, float cell) {
	return (vec2(c) + 0.2 + 0.6 * vec2(float(h & 65535u), float(h >> 16u)) / 65535.0 - q) * cell;
}

// The primary furrows: stars of fine lines out of the hair follicles, which
// open at the nodes of a jittered `cell` mm grid (Hashimoto's primary lines,
// which run through the follicles). Each node is joined to its eight
// neighbors and, by longer lines, to the four beyond them a knight's move
// away, a share `kept` of the lines shown, each a little bowed: they cross
// into the small triangular and rhomboid plateaus of the skin surface. The
// lines are deepest at the follicles; those along the skin tension lines
// (`tension`, unit) are deeper, by `emphasis` (0: all alike). The profile
// (`profile`: depth, flank width, bottom radius, mm) is a V with a rounded
// bottom and exponential flanks; where lines meet, the deepest wins (a smooth
// maximum). The follicle at each node is a round pit 60–100 µm across,
// `follicles` its depth (mm); some (`dimples`: the chance per node) open in
// the shallow round dimple, 0.25–0.5 mm across, of a visible pore, which
// gives the skin its golf-ball look (Flament et al. 2015: 10–90 per cm² on
// the cheeks). Prefiltered by the pixel `footprint` (mm): flanks and pits
// narrower than it widen and grow shallower, keeping their volume, so fresh
// frames do not flicker.
Pitted starFurrows(
	vec2 p,
	vec2 tension,
	float emphasis,
	float cell,
	float kept,
	vec3 profile,
	float follicles,
	float dimples,
	float footprint,
	uint seed
) {
	// The lines' directions, the eight neighbors' as four lines out of each
	// node, then the knight's moves.
	const ivec2 LINES[8] = ivec2[8](
		ivec2(1, 0), ivec2(0, 1), ivec2(1, 1), ivec2(-1, 1), ivec2(2, 1), ivec2(1, 2), ivec2(-1, 2), ivec2(-2, 1)
	);
	vec2 q = p / cell;
	ivec2 i = ivec2(floor(q));
	float flank = sqrt(sq(profile.y) + sq(0.5 * footprint));
	float round = profile.z * flank / profile.y;
	float depth = profile.x * profile.y / flank;
	// Every line whose cells' box holds p's cell (the lines run up and
	// sideways, so they leave from the nodes up to two rows below and two
	// columns aside): the smooth maximum of their depths, (Σ g⁴)^¼, from the
	// sums of g⁴ and g³ ∇g. The back shell, seen from afar, has only the lines
	// to the eight neighbors.
#ifdef SKIN_SHELL
	const int LINE_COUNT = 4;
#else
	const int LINE_COUNT = 8;
#endif
	float sum4 = 0.0;
	vec2 sum3 = vec2(0.0);
	for (int sy = ZERO - 2; sy <= 0; sy++) {
		for (int sx = ZERO - 2; sx <= 2; sx++) {
			ivec2 c = i + ivec2(sx, sy);
			uint h = cellHash(c, seed);
			vec2 from = starNode(c, h, q, cell);
			for (int k = ZERO; k < LINE_COUNT; k++) {
				ivec2 line = LINES[k];
				ivec2 low = min(ivec2(sx, sy), ivec2(sx, sy) + line);
				ivec2 high = max(ivec2(sx, sy), ivec2(sx, sy) + line);
				if (any(greaterThan(low, ivec2(0))) || any(lessThan(high, ivec2(0)))) continue;
				vec4 r = hashBytes(pcgHash(h + uint(k) * 2654435761u));
				if (r.x >= kept) continue;
				vec2 span = starNode(c + line, cellHash(c + line, seed), q, cell) - from;
				float len = length(span);
				vec2 along = span / len;
				vec2 normal = vec2(-along.y, along.x);
				// Along the line 0–1, and across it (signed, bowed); lines
				// farther than a few flanks add nothing to the maximum.
				float t = -dot(from, along) / len;
				float bow = (r.z - 0.5) * 0.12 * len;
				float across = -dot(from, normal) - 4.0 * bow * saturate(t) * (1.0 - saturate(t));
				if (abs(across) > 6.0 * flank) continue;
				vec2 offset;
				vec2 dOffset = vec2(0.0);
				if (t <= 0.0 || t >= 1.0) {
					offset = t <= 0.0 ? -from : -from - span;
				} else {
					offset = across * normal;
					dOffset = -4.0 * bow * (1.0 - 2.0 * t) / len * along * sign(across);
				}
				float d = length(offset);
				vec2 dD = d > 0.0 ? offset / d + dOffset : vec2(0.0);
				// Deeper toward the follicles at its ends.
				float ends = sq(2.0 * saturate(t) - 1.0);
				float weight = depth * (0.35 + 0.65 * r.y) * mix(1.0, 0.3 + 0.7 * sq(sq(dot(along, tension))), emphasis);
				float rounded = sqrt(d * d + round * round);
				float e = weight * exp((round - rounded) / flank);
				float g = (0.6 + 0.4 * ends) * e;
				vec2 dG = -g * d / (flank * rounded) * dD;
				if (t > 0.0 && t < 1.0) dG += 1.6 * (2.0 * t - 1.0) / len * e * along;
				float g2 = g * g;
				sum4 += g2 * g2;
				sum3 += g2 * g * dG;
			}
		}
	}
	float height = pow(sum4, 0.25);
	Pitted result;
	result.relief = vec3(-height, -sum3 / max(height * height * height, 1e-12));
	// The follicles at the nodes around p, and the dimples of the visible
	// pores: a bowl, smooth at its rim, deeper the wider.
	result.pits = vec3(0.0);
	for (int y = ZERO - 1; y <= 1; y++) {
		for (int x = ZERO - 1; x <= 1; x++) {
			ivec2 c = i + ivec2(x, y);
			uint h = cellHash(c, seed);
			vec2 node = starNode(c, h, q, cell);
			vec4 r = hashBytes(pcgHash(h ^ seed));
			float distance2 = dot(node, node);
			bool dimpled = r.w < dimples;
			float radius = (dimpled ? 0.045 : 0.03) + 0.02 * r.y;
			float blurred = sqrt(sq(radius) + sq(0.5 * footprint));
			float pit = follicles * (0.4 + 0.6 * r.z) * sq(radius / blurred) * exp(-distance2 / sq(blurred));
			result.pits += vec3(-pit, -2.0 * pit * node / sq(blurred));
			float bowlRadius = 0.12 + 0.13 * sq(fract(r.w * 7.31 + r.y));
			float t = distance2 / sq(bowlRadius);
			if (!dimpled || t >= 1.0) continue;
			float bowl = 0.1 * bowlRadius;
			result.relief += vec3(-bowl * sq(1.0 - t), -4.0 * bowl * (1.0 - t) / sq(bowlRadius) * node);
		}
	}
	return result;
}

// The secondary furrows: Voronoi cells `cell` mm across, each a cushion that
// domes over its point (a paraboloid, `profile.w` mm below its top at half a
// cell from it), the furrow a narrow V along the border with a rounded bottom
// (`profile`: depth, flank width, bottom radius, mm). Prefiltered like the
// primary furrows. Height in mm with its front-plane gradient.
vec3 cushions(vec2 p, float cell, vec4 profile, float footprint, uint seed) {
	vec2 q = p / cell;
	ivec2 i = ivec2(floor(q));
	vec2 f = q - vec2(i);
	// The two nearest points (offsets from p, cells).
	float f1 = 8.0;
	float f2 = 8.0;
	vec2 r1 = vec2(0.0);
	vec2 r2 = vec2(0.0);
	for (int y = ZERO - 1; y <= 1; y++) {
		for (int x = ZERO - 1; x <= 1; x++) {
			vec2 r = vec2(x, y) + 0.1 + 0.8 * cellPoint(i + ivec2(x, y), seed) - f;
			float d = dot(r, r);
			if (d < f1) {
				f2 = f1;
				r2 = r1;
				f1 = d;
				r1 = r;
			} else if (d < f2) {
				f2 = d;
				r2 = r;
			}
		}
	}
	// The distance to their bisector (mm), growing toward the nearest point:
	// the border but near the cells' corners, where the furrow is too shallow
	// for the difference to show.
	vec2 apart = r2 - r1;
	float span = max(length(apart), 1e-4);
	float border = (f2 - f1) / (2.0 * span) * cell;
	float flank = sqrt(sq(profile.y) + sq(0.5 * footprint));
	float round = profile.z * flank / profile.y;
	float rounded = sqrt(sq(border) + sq(round));
	float g = profile.x * profile.y / flank * exp((round - rounded) / flank);
	float c = profile.w / sq(0.5 * cell);
	vec2 toPoint = r1 * cell;
	return vec3(-g - c * dot(toPoint, toPoint), -g * border / (flank * rounded) * apart / span + 2.0 * c * toPoint);
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

// The micro-relief and the fine wrinkles of the skin at `p`, unweighted, as
// heights (mm) with their front-plane gradients: the primary furrows with the
// dimples of the visible pores, the secondary furrows, the follicle openings
// (at the furrows' crossings and in the dimples) and the wrinkles. The caller
// weighs them by its fades, the keratinized share and the skin share, and
// turns them into the shading's terms with reliefTerms(). `a`, `along`,
// `alongMm` and `upper` are the lid frame (mm from the margin, along the
// margin 0–1 and in mm, the upper share), `across` the unit front-plane
// direction in which `a` grows, `canthi` the medial (xy) and lateral (zw)
// canthus; `pores` and `wrinkleAmount` are skin.pores and skin.wrinkles. The
// secondary furrows and the furrows' openings are left out where `detail` is
// 0. The skin program evaluates it per pixel in #debug, the bake
// (skin-relief-bake-fragment.glsl) per texel. SKIN_SHELL: the back shell's,
// in its own coordinates.
struct MicroRelief {
	vec3 furrowed;
	vec3 network;
	vec3 openings;
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
	// edge streak where the shell turns away, furrows all alike cross into a
	// regular lattice.
	fan = 0.0;
	float tensionTurn = PI * valueNoise(p / 12.0, seed + 19u);
	tension = vec2(cos(tensionTurn), sin(tensionTurn));
#endif

	// The lids' thin skin creases along its tension lines; elsewhere the
	// lines are more alike.
	float emphasis = mix(0.3, 1.0, max(1.0 - smoothstep(6.0, 14.0, a), fan));
	// Stars of primary furrows out of follicles about 0.6 mm apart (2–3
	// follicles per mm² on the face), 25 µm deep at most, their depth
	// drifting in patches; the follicles' pits deeper with `pores`, shallower
	// on the lids, none at the lash line; the dimples of the visible pores
	// on the cheek and the brow, hardly on the lids. The cushions of the
	// secondary furrows, 0.08 mm across, inside the plateaus.
	float follicles = 0.012 * pores * mix(0.3, 1.0, smoothstep(2.0, 8.0, a)) * smoothstep(0.8, 1.6, a);
	float dimples = 0.3 * pores * smoothstep(3.0, 10.0, a);
	float drift = mix(0.5, 1.0, smoothstep(-0.5, 0.5, valueNoise(p / 0.5, seed + 21u))) *
		mix(0.6, 1.0, smoothstep(-0.6, 0.6, valueNoise(p / 1.5, seed + 23u)));
	Pitted primary = starFurrows(
		p, tension, emphasis, 0.6, 0.85, vec3(0.025, 0.018, 0.005), follicles, dimples, footprint, seed + 11u
	);

	MicroRelief relief;
	relief.furrowed = drift * primary.relief;
	relief.network = vec3(0.0);
	if (detail > 0.0) {
		float shown = mix(0.4, 1.0, smoothstep(-0.3, 0.6, valueNoise(p * 2.0, seed + 25u)));
		relief.network = shown * cushions(p, 0.08, vec4(0.0015, 0.006, 0.003, 0.0015), footprint, seed + 13u);
	}
	relief.openings = detail > 0.0 ? primary.pits : vec3(0.0);
	float lidLines = wrinkleAmount * smoothstep(1.2, 2.5, a) * (1.0 - smoothstep(13.0, 20.0, a)) * (1.0 - fan) *
		smoothstep(0.0, 0.15, along);
	// Slanted lines: 25° off the margin, toward the lateral side.
	float side = (upper > 0.5 ? 1.0 : -1.0) * sign(canthi.x - canthi.z);
	float slant = 0.906 * a + 0.423 * alongMm;
	vec2 dSlant = 0.906 * across + 0.423 * side * vec2(-across.y, across.x);
	relief.wrinkles = lidWrinkles(p, a, across, slant, dSlant, lidLines, angle, dAngle, wrinkleAmount * fan, footprint, seed + 17u);
	return relief;
}

// The relief's terms in the shading, from its weighed parts: the front-plane
// gradient of the whole height (xy), the albedo term (z: the furrows a little
// darker, the openings more) and the occlusion term (w). All linear in the
// heights.
vec4 reliefTerms(vec3 furrowed, vec3 network, vec3 openings, vec3 wrinkles) {
	return vec4(
		furrowed.yz + network.yz + openings.yz + wrinkles.yz,
		2.0 * furrowed.x + network.x + 10.0 * openings.x,
		4.0 * (furrowed.x + network.x) + 30.0 * openings.x + 1.5 * wrinkles.x
	);
}

// The baked relief (src/adnexa/skinRelief.js), RGBA8 over the front-plane
// box: reliefTerms(), the gradient (rg, ±RELIEF_SLOPE), the albedo term (b,
// −RELIEF_SHADE–0) and the occlusion term (a, −RELIEF_OCCLUSION–0). Linear in
// the heights, so the mipmaps filter them as the footprint would.
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
