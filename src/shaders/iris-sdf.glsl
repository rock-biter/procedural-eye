// The iris as a signed distance field in iris space (eye space shifted to the
// pupil center), in current-space millimeters:
// - the stroma, a slab between the pigment epithelium (the back paraboloid)
//   and the uncarved surface of the structure atlas, carved by the crypts of
//   Fuchs, whose walls widen below the surface (undercut);
// - three families of fibers by polar domain repetition: wavy radial vessels
//   near the surface and two families of collagen arcs sweeping in opposite
//   directions deeper down (Rohen, Wyatt). Their heights are shares of the
//   UNCARVED surface, so where a crypt removes the stroma they bridge over it;
// - the crenated pupillary ruff and the pupil margin.
// Features live in rest space (iris-space.glsl); the result is scaled to a
// conservative current-space bound.
#ifndef IRIS_SDF_GLSL
#define IRIS_SDF_GLSL

#include ./iris-space.glsl
#include ./iris-noise.glsl
#include ./eye-profile.glsl

uniform sampler2D uIrisAtlas;
uniform vec4 uFiberRadial; // count, radius (mm), waviness (cells), height (share of surface)
uniform vec4 uFiberArc; // count each way, radius (mm), sweep root→margin (rad), height (share)
uniform vec4 uFiberMisc; // radial coverage, arc coverage, fusion (mm), crypt undercut (mm)
uniform vec4 uRuff; // width (mm), crenations, micro amplitude (mm), micro striations around
uniform uint uIrisSeed;
// How many striation widths the depth of field's blur radius must reach before
// the micro striations are left out: interactive frames skip what the gather
// averages out anyway; accumulation samples never do (src/eye/eyeball.js).
uniform float uIrisMicroBlur;

// The interactive depth of field shows its gather in full from this blur
// radius (pixels) on (dof-composite-fragment.glsl).
#define IRIS_GATHERED_BLUR 2.5

// The ray footprint (mm), the mip level of the atlas lookups there, and the
// radius (mm) over which the depth of field spreads that point, set by the
// trace (iris-trace.glsl).
float gIrisFootprint = 0.0;
float gIrisLod = 0.0;
float gIrisBlur = 0.0;

#define IRIS_MARGIN_ROUNDING 0.1
// Heightfield to distance: the surface slopes stay below about 1.3.
#define IRIS_HEIGHT_LIPSCHITZ 0.6

float irisBackHeight(float r) {
	return uIrisShape.x - uIrisShape.y * r * r;
}

vec4 sampleIrisAtlas(float theta, float rho) {
	return textureLod(uIrisAtlas, vec2(theta * (1.0 / TAU), saturate(rho)), gIrisLod);
}

float wrapAngle(float a) {
	return a - TAU * floor(a / TAU + 0.5);
}

// Distance (rest mm) to one family of fibers: `count` fibers around, each a
// tube following θ_k(ρ) = cell center + sweep·(1 − ρ) + waviness, at a share
// of the uncarved surface height `top`, over a seeded extent along ρ.
float fiberFamily(float theta, float rho, float r0, float h0, float top, float count, float radius, float waviness, float heightShare, float sweep, float coverage, uint seed) {
	if (count < 0.5 || coverage <= 0.0) return 1e3;
	// Every fiber center lies within ±5% of the surface height around its
	// share: far from that band, the vertical gap is a valid lower bound.
	float bound = abs(h0 - top * heightShare) - top * 0.05 - radius * 1.35;
	if (bound > 0.015) return bound;
	float width = uIrisRest.y - uIrisRest.x;
	float cell = TAU / count;
	float phi = sweep * (1.0 - rho);
	int n = int(count + 0.5);
	float x = (theta - phi) / cell;
	int k0 = int(floor(x));
	// The point's cell, its neighbor on the near side, and the far neighbor
	// only when one of its fibers could come closer than the best so far: its
	// center lies at least 0.75 − waviness cells away (jitter ±0.25 cell, wave
	// up to ±waviness), and the slant of the sweep and the wave shortens that
	// lateral gap at most by the factor below.
	int side = x - float(k0) < 0.5 ? -1 : 1;
	float slant = (abs(sweep) + waviness * cell * TAU * 5.0) / width;
	float farGap = r0 * (0.75 - waviness) * cell * inversesqrt(1.0 + sq(r0 * slant)) - radius * 1.35;
	float best = 1e3;
	for (int j = ZERO; j < 3; j++) {
		if (j == 2 && farGap >= best) break;
		int k = wrapIndex(k0 + (j == 0 ? 0 : j == 1 ? side : -side), n);
		uint hash = pcgHash(uint(k) * 2654435761u + seed);
		vec4 a = hashBytes(hash);
		if (a.x > coverage) continue;
		vec4 b = hashBytes(pcgHash(hash));
		float h2 = a.y;
		float h3 = a.z;
		float h4 = a.w;
		float h5 = b.x;
		float amplitude = waviness * cell * (0.4 + 0.6 * h2);
		float frequency = TAU * (1.5 + 3.5 * h3);
		float phase = TAU * h4;
		float wave = frequency * rho + phase;
		float center = (float(k) + 0.5 + 0.5 * (h5 - 0.5)) * cell + phi + amplitude * sin(wave);
		float dTheta = wrapAngle(theta - center);
		float slope = (-sweep + amplitude * frequency * cos(wave)) / width;
		float lateral = r0 * dTheta * inversesqrt(1.0 + sq(r0 * slope));
		float height = top * (heightShare + 0.1 * (h2 - 0.5));
		float thickness = radius * (0.65 + 0.7 * h3);
		float start = 0.03 + 0.35 * h4 * h4;
		float end = 1.0 - 0.12 * h5;
		float along = max(max(start - rho, rho - end), 0.0) * width;
		best = min(best, length(vec3(lateral, h0 - height, along)) - thickness);
	}
	return best;
}

struct IrisParts {
	float stroma;
	float radial;
	float arcs;
	float ruff;
	float cryptDepth; // depth of the crypt at this point (0: none)
	float top; // uncarved surface height (rest mm)
	float h0; // height above the pigment epithelium (rest mm)
	float h; // height above the pigment epithelium (current mm)
	float theta;
	float rho;
	vec4 atlas;
};

IrisParts irisParts(vec3 p) {
	IrisParts parts;
	float r = length(p.xy);
	float theta = atan(p.y, p.x);
	float h = p.z - irisBackHeight(r);
	IrisRest m = irisToRest(r, uPupil.z);
	float rho = irisRho(m.r0);
	vec4 atlas = sampleIrisAtlas(theta, rho);
	float scale = irisDistanceScale(m);
	float top = atlas.r;
	float h0 = h / m.thickness;

	// Stroma: slab carved by the crypt, whose opening widens below the surface.
	float slab = max(h0 - top, -h0) * IRIS_HEIGHT_LIPSCHITZ;
	float zeta = top - h0;
	float opening = atlas.g + uFiberMisc.w * smoothstep(0.0, 0.12, zeta);
	// Continuous across cell borders (the filtered depth ramps to 0 there): with
	// no crypt the opening is negative and nothing is carved.
	float cavity = max(-opening, zeta - atlas.b);
	float stroma = smax(slab, -cavity, 0.05);

	float radial = fiberFamily(theta, rho, m.r0, h0, top, uFiberRadial.x, uFiberRadial.y, uFiberRadial.z, uFiberRadial.w, 0.0, uFiberMisc.x, uIrisSeed + 101u);
	float arcsCw = fiberFamily(theta, rho, m.r0, h0, top, uFiberArc.x, uFiberArc.y, 0.32, uFiberArc.w, uFiberArc.z, uFiberMisc.y, uIrisSeed + 202u);
	float arcsCcw = fiberFamily(theta, rho, m.r0, h0, top, uFiberArc.x, uFiberArc.y, 0.32, uFiberArc.w - 0.08, -uFiberArc.z * 0.85, uFiberMisc.y, uIrisSeed + 303u);

	// Fine radial striations on the surface, only where a pixel resolves them
	// (they fade with the atlas level) and the depth of field does not blur
	// them away: over uIrisMicroBlur of their widths, once the gather shows.
	float micro = 0.0;
	if (uRuff.z > 0.0 && gIrisLod < 1.5 && abs(slab) < 0.05) {
		int around = int(uRuff.w);
		float striation = TAU * r / float(around);
		float hidden = gIrisBlur / max(uIrisMicroBlur * striation, IRIS_GATHERED_BLUR * gIrisFootprint);
		float resolved = 1.0 - smoothstep(1.0, 2.0, hidden);
		if (resolved > 0.0) {
			micro = uRuff.z * resolved * (1.0 - gIrisLod / 1.5) *
				periodicNoise(vec2(theta * (1.0 / TAU) * float(around), rho * 40.0), around, uIrisSeed + 404u);
		}
	}

	// The pupil cuts the stroma and the fibers (rounded margin), not the ruff.
	float pupilCut = uPupil.z - r;
	parts.stroma = smax((stroma + micro) * scale, pupilCut, IRIS_MARGIN_ROUNDING);
	parts.radial = smax(radial * scale, pupilCut, IRIS_MARGIN_ROUNDING);
	parts.arcs = smax(min(arcsCw, arcsCcw) * scale, pupilCut, IRIS_MARGIN_ROUNDING);

	// The pupillary ruff: the pigment epithelium rolled over the margin, a
	// crenated tube (current space), only evaluated near it.
	// It sits on the front of the margin, where the epithelium rolls over it.
	float w = uRuff.x;
	float rimHeight = max(top * m.thickness * 0.6, 1.2 * w);
	parts.ruff = length(vec2(r - (uPupil.z - 0.2 * w), h - rimHeight)) - 1.3 * w;
	if (parts.ruff < 0.05) {
		// Beads of irregular size and spacing, not a gear.
		float warp = 4.0 * periodicNoise(vec2(theta * (1.0 / TAU) * 40.0, 0.5), 40, uIrisSeed + 505u);
		float beads = sin(theta * uRuff.y + warp);
		float size = periodicNoise(vec2(theta * (1.0 / TAU) * 90.0, 1.5), 90, uIrisSeed + 606u);
		parts.ruff += w * (0.35 - 0.3 * smoothstep(-0.3, 1.0, beads) * (0.55 + 0.45 * size));
	}
	parts.cryptDepth = atlas.b > 0.0 && opening > 0.0 ? atlas.b : 0.0;
	parts.top = top;
	parts.h0 = h0;
	parts.h = h;
	parts.theta = theta;
	parts.rho = rho;
	parts.atlas = atlas;
	return parts;
}

float irisCombine(IrisParts parts) {
	return min(smin(parts.stroma, min(parts.radial, parts.arcs), uFiberMisc.z), parts.ruff);
}

float irisField(vec3 p) {
	return irisCombine(irisParts(p));
}

#endif
