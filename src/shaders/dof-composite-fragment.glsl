// Composite of the interactive depth of field: the sharp accumulated mean
// where the blur circle is under a pixel, a full-resolution blur of the small
// blur circles the half-resolution gather is too coarse for, the gather from
// NEAR_RADIUS on, faded out as accumulated lens samples take over
// (`uWeight`). The gather is upsampled from the half-resolution texels at the
// pixel's own depth, so a silhouette keeps the full resolution's outline. The
// sharp mean and the near blur take the haze (veil.glsl) and the light shafts
// (light-shafts.glsl) here, the gather has them from the prepare pass; where
// the gather covers the pixel, the shafts are left out. Alpha is opaque: the
// effects read it as opacity.
#include ./veil.glsl
#include ./light-shafts.glsl
#include ./dof-radius.glsl

uniform sampler2D uSharp; // accumulated mean (alpha: focus distance; −1 where a split frame shaded at half resolution)
uniform sampler2D uHalf; // the half-resolution share of a split frame (src/render/scenePass.js)
uniform sampler2D uBlurred;
uniform sampler2D uPrepared; // the gather's input (alpha: the texel's signed blur radius)
uniform sampler2D uTileMax; // around each tile: r largest blur radius (dof-dilate-fragment.glsl)
uniform float uWeight;
uniform bool uBackdropGathered; // the backdrop's blur circle is past NEAR_RADIUS + 0.5: the gather shows it whole

varying vec2 vUv;

// Blur radius (full-resolution pixels) from which the gather takes over from
// the near blur, over a pixel either side: its first tap lies 1.6 px out and
// its texels are 2 px wide.
#define NEAR_RADIUS 2.5

// The gather at the pixel (alpha: the largest blur radius covering it), from
// the four half-resolution texels around it, each weighed by the bilinear
// filter and by how close its own radius lies to the pixel's signed `radius`:
// across a silhouette the texels of the other side hold the other surface.
// Where none lies close, the floor leaves the bilinear filter.
vec4 upsample(float radius) {
	ivec2 size = textureSize(uBlurred, 0);
	vec2 p = vUv * vec2(size) - 0.5;
	ivec2 origin = ivec2(floor(p));
	vec2 f = p - floor(p);
	float tolerance = dofRadiusTolerance(radius);
	vec4 sum = vec4(0.0);
	float total = 0.0;
	for (int i = ZERO; i < 4; i++) {
		ivec2 corner = ivec2(i & 1, i >> 1);
		ivec2 texel = clamp(origin + corner, ivec2(0), size - 1);
		vec2 bilinear = mix(1.0 - f, f, vec2(corner));
		float offset = abs(texelFetch(uPrepared, texel, 0).a - radius);
		float weight = bilinear.x * bilinear.y * (1e-5 + 1.0 - smoothstep(0.0, tolerance, offset));
		sum += texelFetch(uBlurred, texel, 0) * weight;
		total += weight;
	}
	return sum / total;
}

// A pixel of the sharp mean (the half-resolution share's texel where a split
// frame left it out): its color and its signed blur radius.
vec4 sharpTexel(ivec2 pixel) {
	vec4 texel = texelFetch(uSharp, clamp(pixel, ivec2(0), textureSize(uSharp, 0) - 1), 0);
	if (texel.a < 0.0) texel = texelFetch(uHalf, pixel / 2, 0);
	return vec4(texel.rgb, dofRadius(texel.a));
}

// The pixels around one within √5 px, nearest first: the 3×3 block, then the
// four 2 px out along the axes, then the eight a knight's move away.
const ivec2 NEAR_TAPS[20] = ivec2[20](
	ivec2(1, 0), ivec2(0, 1), ivec2(-1, 0), ivec2(0, -1),
	ivec2(1, 1), ivec2(-1, 1), ivec2(-1, -1), ivec2(1, -1),
	ivec2(2, 0), ivec2(0, 2), ivec2(-2, 0), ivec2(0, -2),
	ivec2(2, 1), ivec2(1, 2), ivec2(-1, 2), ivec2(-2, 1),
	ivec2(-2, -1), ivec2(-1, -2), ivec2(1, -2), ivec2(2, -1)
);

// The depth of field of the small blur circles, at full resolution, as the
// gather does it: each pixel within √5 px whose blur circle reaches this one
// adds its color, spread over that circle (1 / its area, at least a pixel's).
// What lies behind the pixel shows through its own blur circle, as spread as
// it is, and reaches no farther than twice it. `center`: the pixel's color
// and signed blur radius.
vec3 nearBlur(vec4 center) {
	ivec2 pixel = ivec2(gl_FragCoord.xy);
	float centerSize = abs(center.a);
	float centerWeight = 1.0 / max(PI * centerSize * centerSize, 1.0);
	vec3 sum = center.rgb * centerWeight;
	float total = centerWeight;
	for (int i = ZERO; i < 20; i++) {
		ivec2 offset = NEAR_TAPS[i];
		float distance = length(vec2(offset));
		vec4 tap = sharpTexel(pixel + offset);
		float size = abs(tap.a);
		bool behind = tap.a > center.a;
		if (behind) size = clamp(size, centerSize, centerSize * 2.0);
		float reach = smoothstep(distance - 0.5, distance + 0.5, size);
		float weight = reach * (behind ? centerWeight : 1.0 / max(PI * size * size, 1.0));
		sum += tap.rgb * weight;
		total += weight;
	}
	return sum / total;
}

void main() {
	// Around the pixel's tile: the largest blur radius, and whether all of it
	// is the backdrop (the tiles are drawn only while the gather is).
	ivec2 tile = ivec2(gl_FragCoord.xy) / (2 * DOF_TILE);
	vec2 around = uWeight > 0.0 ? texelFetch(uTileMax, tile, 0).rg : vec2(0.0);
	// The backdrop alone, which the gather shows whole: the upsample there is
	// the bilinear filter.
	if (uWeight >= 1.0 && around.y > 0.5 && uBackdropGathered) {
		gl_FragColor = vec4(textureLod(uBlurred, vUv, 0.0).rgb, 1.0);
		return;
	}
	vec4 sharp = texelFetch(uSharp, ivec2(gl_FragCoord.xy), 0);
	// Shaded at half resolution only: the gather covers it, unless the last
	// frame's blur misjudged it.
	if (sharp.a < 0.0) sharp = texelFetch(uHalf, ivec2(gl_FragCoord.xy) / 2, 0);
	float radius = dofRadius(sharp.a);
	vec3 color = sharp.rgb;
	vec4 blurred = vec4(0.0);
	float w = 0.0;
	if (uWeight > 0.0) {
		// No gather where every blur circle around is under its share.
		float gather = 0.0;
		if (around.x >= NEAR_RADIUS - 0.5) {
			blurred = upsample(radius);
			gather = smoothstep(NEAR_RADIUS - 0.5, NEAR_RADIUS + 0.5, blurred.a);
			w = gather * uWeight;
		}
		// The near blur, unless every pixel around is in focus.
		if (w < 1.0 && around.x >= 0.5) {
			// Its share of what the gather leaves, the rest the sharp mean's.
			float near = uWeight * (1.0 - gather) / (1.0 - w);
			color = mix(color, nearBlur(vec4(sharp.rgb, radius)), near);
		}
	}
	color = applyVeil(color, sharp.a, vUv);
	if (w < 1.0) color = applyShafts(color, max(sharp.a, 1.0), vUv);
	gl_FragColor = vec4(mix(color, blurred.rgb, w), 1.0);
}
