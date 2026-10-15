// Bakes the iris structure atlas (src/iris/irisAtlas.js): one texel per rest
// (θ, ρ), u = θ / 2π (repeating), v = ρ. RGBA16F:
//   r: uncarved surface height above the pigment epithelium, rest mm
//   g: crypt opening: > 0 inside a crypt (mm from its edge), < 0 on the walls
//   b: crypt depth below the uncarved surface, mm (0: no crypt)
//   a: signed distance to the collarette, mm (negative in the pupillary zone)
// With PIGMENT_PASS it bakes the pigment atlas instead:
//   r: ABL melanin (0–1), g: eumelanin share, b: freckle mask, a: nodule mask
#include ./iris-noise.glsl

uniform vec4 uRest; // rest pupil radius, root radius, rest collarette radius, unused
uniform vec4 uThickness; // margin, collarette, root (mm), collarette ρ
uniform vec2 uRidge; // collarette ridge height, width (mm)
uniform vec3 uSurface; // radial noise amplitude (mm), streaks around, undulation (mm)
uniform sampler2D uCollarette; // ρ of the collarette at COLLARETTE_SAMPLES angles
uniform vec4 uFurrows[MAX_FURROWS * 2];
uniform int uFurrowCount;
uniform vec4 uCrypts; // grade 0–4, cell size near the collarette (mm), band (ρ), radial elongation
uniform vec4 uCryptsShape; // peripheral amount, depth (mm), wall half-width (mm), roundness
uniform vec4 uNodules; // count, size (mm), ring (ρ), unused
uniform uint uSeed;
#ifdef PIGMENT_PASS
uniform vec4 uPigment; // ABL melanin, eumelanin share, radial variation, unused
uniform vec4 uHeterochromia; // amount, melanin, eumelanin share, extent past the collarette (ρ)
uniform vec4 uPigmentMisc; // heterochromia softness (ρ), periphery amount, periphery width (ρ), unused
uniform vec4 uFreckles[MAX_FRECKLES * 2];
uniform int uFreckleCount;
uniform vec2 uFreckleColor; // melanin, eumelanin share
#endif

varying vec2 vUv;

float irisThickness(float rho) {
	if (rho <= uThickness.w) return mix(uThickness.x, uThickness.y, smoothstep(0.0, uThickness.w, rho));
	return mix(uThickness.y, uThickness.z, sqrt(smoothstep(uThickness.w, 1.0, rho)));
}

float collaretteRho(float u) {
	float x = fract(u) * float(COLLARETTE_SAMPLES) - 0.5;
	int i = int(floor(x));
	float f = x - float(i);
	float a = texelFetch(uCollarette, ivec2(wrapIndex(i, COLLARETTE_SAMPLES), 0), 0).r;
	float b = texelFetch(uCollarette, ivec2(wrapIndex(i + 1, COLLARETTE_SAMPLES), 0), 0).r;
	return mix(a, b, f);
}

// Angular offset of θ from `start`, in [0, 2π).
float angleFrom(float theta, float start) {
	return mod(theta - start, TAU);
}

vec2 cellJitter(ivec2 c, int periodX, uint seed) {
	int x = wrapIndex(c.x, periodX);
	return 0.15 + 0.7 * vec2(hash01(uint(x), uint(c.y + 4096), seed), hash01(uint(x), uint(c.y + 4096), seed + 7u));
}

// Voronoi of jittered cells, periodic along x, in a metric of `cellMm`
// millimeters per cell: x is the distance to the nearest cell border (mm),
// yz the integer cell, `toSeed` the offset to its seed (mm).
vec3 voronoiBorder(vec2 p, int periodX, vec2 cellMm, uint seed, out vec2 toSeed) {
	ivec2 ip = ivec2(floor(p));
	vec2 fp = p - vec2(ip);
	ivec2 nearestCell = ivec2(0);
	vec2 nearest = vec2(0.0);
	float best = 1e9;
	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			ivec2 g = ivec2(i, j);
			vec2 r = (vec2(g) + cellJitter(ip + g, periodX, seed) - fp) * cellMm;
			float d = dot(r, r);
			if (d < best) {
				best = d;
				nearest = r;
				nearestCell = g;
			}
		}
	}
	float border = 1e9;
	for (int j = -2; j <= 2; j++) {
		for (int i = -2; i <= 2; i++) {
			ivec2 g = nearestCell + ivec2(i, j);
			vec2 r = (vec2(g) + cellJitter(ip + g, periodX, seed) - fp) * cellMm;
			vec2 delta = r - nearest;
			if (dot(delta, delta) > 1e-10) border = min(border, dot(0.5 * (nearest + r), normalize(delta)));
		}
	}
	ivec2 cell = ip + nearestCell;
	toSeed = nearest;
	return vec3(border, float(wrapIndex(cell.x, periodX)), float(cell.y));
}

// The crypt field at this texel: (opening, depth). opening > 0 inside a crypt
// (mm from its edge), < 0 on the walls; depth 0 where there is no crypt.
vec2 crypts(float u, float rho, float rhoCollarette, float r0, float width) {
	float grade = uCrypts.x;
	if (grade <= 0.0) return vec2(-1.0, 0.0);
	vec2 result = vec2(-1.0, 0.0);
	float best = -1e9;
	// Large crypts in a band hugging the collarette (on its ciliary side), then
	// small peripheral crypts toward the root.
	for (int band = 0; band < 2; band++) {
		float size = band == 0 ? uCrypts.y : uCrypts.y * 0.55;
		float rhoStart = band == 0 ? rhoCollarette + 0.6 * uRidge.y / width : 0.72;
		float rhoEnd = band == 0 ? rhoStart + uCrypts.z : 0.97;
		if (rho < rhoStart - 0.02 || rho > rhoEnd + 0.02) continue;
		float probability = band == 0 ? saturate(0.1 + 0.22 * grade) : saturate(uCryptsShape.x * grade * 0.2);
		if (probability <= 0.0) continue;
		float cellHeight = size * uCrypts.w;
		// One lattice per band: the cell count around comes from the band's
		// mean radius, not the texel's, or the lattice would reshuffle along ρ.
		float rhoReference = band == 0 ? uThickness.w + 0.5 * uCrypts.z : 0.85;
		int around = max(6, int(floor(TAU * (uRest.x + rhoReference * width) / size + 0.5)));
		vec2 cellMm = vec2(TAU * r0 / float(around), cellHeight);
		vec2 p = vec2(u * float(around), (rho - rhoStart) * width / cellHeight);
		uint seed = uSeed * 31u + uint(band) * 101u + 11u;
		vec2 toSeed;
		vec3 v = voronoiBorder(p, around, cellMm, seed, toSeed);
		uint cx = uint(v.y);
		uint cy = uint(int(v.z) + 4096);
		if (hash01(cx, cy, seed + 1u) > probability) continue;
		float depth = uCryptsShape.y * (0.55 + 0.9 * hash01(cx, cy, seed + 2u)) * (band == 0 ? 1.0 : 0.55);
		// Lower grades have thicker walls (smaller openings).
		float wall = uCryptsShape.z * (0.7 + 0.6 * hash01(cx, cy, seed + 3u)) * (1.6 - 0.15 * grade);
		float fade = smoothstep(rhoStart - 0.02, rhoStart + 0.03, rho) * (1.0 - smoothstep(rhoEnd - 0.06, rhoEnd + 0.02, rho));
		// Polygonal lacunae (thin trabecular walls) or lens-shaped crypts around
		// the seed, by the roundness parameter.
		float polygon = v.x - wall;
		vec2 axes = 0.5 * cellMm * (0.75 + 0.3 * hash01(cx, cy, seed + 4u)) - wall;
		float ellipse = (1.0 - length(toSeed / max(axes, vec2(1e-3)))) * min(axes.x, axes.y);
		float opening = mix(polygon, ellipse, uCryptsShape.w) - (1.0 - fade) * size;
		if (opening > best) {
			best = opening;
			result = vec2(opening, depth);
		}
	}
	return result;
}

// Wölfflin nodules: small rounded bumps on a mid-peripheral ring.
float nodules(float u, float rho, float r0, float width) {
	int count = int(uNodules.x + 0.5);
	if (count <= 0) return 0.0;
	float bump = 0.0;
	float kf = u * float(count);
	int k0 = int(floor(kf));
	for (int j = -1; j <= 1; j++) {
		int k = wrapIndex(k0 + j, count);
		uint seed = uSeed * 13u + 5u;
		if (hash01(uint(k), 0u, seed) > 0.85) continue;
		float center = (float(k) + 0.5 + 0.6 * (hash01(uint(k), 1u, seed) - 0.5)) / float(count);
		float du = center - u;
		du -= floor(du + 0.5);
		float ringRho = uNodules.z + 0.05 * (hash01(uint(k), 2u, seed) - 0.5);
		vec2 d = vec2(du * TAU * r0, (rho - ringRho) * width);
		float size = uNodules.y * (0.7 + 0.6 * hash01(uint(k), 3u, seed));
		bump = max(bump, 0.6 * size * exp(-dot(d, d) / (size * size)));
	}
	return bump;
}

#ifdef PIGMENT_PASS
float wrappedAngle(float a) {
	return a - TAU * floor(a / TAU + 0.5);
}

void main() {
	float u = vUv.x;
	float rho = vUv.y;
	float theta = u * TAU;
	float width = uRest.y - uRest.x;
	float r0 = uRest.x + rho * width;
	float rhoCollarette = collaretteRho(u);

	float melanin = uPigment.x;
	float eumelanin = uPigment.y;
	// Melanin follows the radial structure: streaks and broad sectors.
	float streaks = 0.6 * periodicNoise(vec2(u * 140.0, rho * 4.0), 140, uSeed + 9u) +
		0.4 * periodicNoise(vec2(u * 23.0, rho * 2.0), 23, uSeed + 10u);
	melanin = saturate(melanin * (1.0 + uPigment.z * streaks));

	// Central heterochromia: the pupillary zone and a ragged band past the
	// collarette take their own pigment.
	float ragged = 0.03 * periodicNoise(vec2(u * 60.0, 0.5), 60, uSeed + 11u);
	float zone = 1.0 - smoothstep(uHeterochromia.w - uPigmentMisc.x, uHeterochromia.w + uPigmentMisc.x, rho - rhoCollarette + ragged);
	float h = uHeterochromia.x * zone;
	melanin = mix(melanin, uHeterochromia.y * (1.0 + 0.5 * uPigment.z * streaks), h);
	eumelanin = mix(eumelanin, uHeterochromia.z, h);

	// Darker periphery toward the root.
	float rim = uPigmentMisc.y * smoothstep(1.0 - uPigmentMisc.z, 1.0, rho);
	melanin += (1.0 - melanin) * 0.8 * rim;
	eumelanin = mix(eumelanin, 0.9, rim);

	// Freckles: irregular elliptic blobs.
	float freckle = 0.0;
	for (int k = 0; k < MAX_FRECKLES; k++) {
		if (k >= uFreckleCount) break;
		vec4 a = uFreckles[2 * k];
		vec4 b = uFreckles[2 * k + 1];
		vec2 d = vec2(wrappedAngle(theta - a.x) * r0, (rho - a.y) * width);
		float c = cos(b.y);
		float s = sin(b.y);
		d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
		d.x /= b.x;
		float edge = 1.0 + 0.3 * periodicNoise(vec2(atan(d.y, d.x) / TAU * 7.0 + 7.0, b.z), 7, uSeed + 12u);
		float distance = length(d) / (a.z * edge);
		freckle = max(freckle, a.w * (1.0 - smoothstep(0.7, 1.0, distance)));
	}
	melanin = mix(melanin, uFreckleColor.x, freckle);
	eumelanin = mix(eumelanin, uFreckleColor.y, freckle);

	float nodule = saturate(nodules(u, rho, r0, width) / max(0.6 * uNodules.y, 1e-4));
	gl_FragColor = vec4(saturate(melanin), saturate(eumelanin), freckle, nodule);
}
#else
void main() {
	float u = vUv.x;
	float rho = vUv.y;
	float theta = u * TAU;
	float width = uRest.y - uRest.x;
	float r0 = uRest.x + rho * width;

	float height = irisThickness(rho);

	// Collarette: signed distance across the zig-zag curve, and its ridge.
	float du = 1.0 / float(COLLARETTE_SAMPLES);
	float rhoCollarette = collaretteRho(u);
	float slope = (collaretteRho(u + du) - collaretteRho(u - du)) / (2.0 * du * TAU) * width / max(r0, 1e-3);
	float collaretteDistance = (rho - rhoCollarette) * width / sqrt(1.0 + slope * slope);
	height += uRidge.x * exp(-2.0 * sq(collaretteDistance / uRidge.y));

	// Radial streaks (long along ρ, tight around) and a slow undulation.
	int around = int(uSurface.y);
	float streaks = periodicNoise(vec2(u * float(around), rho * 5.0), around, uSeed);
	streaks += 0.5 * periodicNoise(vec2(u * float(around * 2), rho * 11.0), around * 2, uSeed + 1u);
	height += uSurface.x * streaks;
	height += uSurface.z * periodicNoise(vec2(u * 9.0, rho * 3.0), 9, uSeed + 2u);

	// Contraction furrows: grooves along wobbling arcs.
	for (int k = 0; k < MAX_FURROWS; k++) {
		if (k >= uFurrowCount) break;
		vec4 a = uFurrows[2 * k];
		vec4 b = uFurrows[2 * k + 1];
		float offset = angleFrom(theta, a.y);
		float fade = 0.25;
		float mask = smoothstep(0.0, fade, offset) * (1.0 - smoothstep(a.z - fade, a.z, offset));
		if (a.z >= TAU - 1e-3) mask = 1.0;
		float rhoFurrow = a.x + b.y * periodicNoise(vec2(u * 7.0, b.z), 7, uSeed + 3u + uint(k));
		float distance = (rho - rhoFurrow) * width;
		height -= a.w * mask * exp(-sq(distance / b.x));
	}

	height += nodules(u, rho, r0, width);
	vec2 crypt = crypts(u, rho, rhoCollarette, r0, width);

	gl_FragColor = vec4(max(height, 0.05), crypt.x, crypt.y, collaretteDistance);
}
#endif
