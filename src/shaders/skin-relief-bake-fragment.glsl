// Bakes the skin's micro-relief and fine wrinkles (skinMicroRelief(),
// skin-relief.glsl) at rest over the front-plane box (src/adnexa/skinRelief.js),
// prefiltered by one texel, weighed as the skin program weighs them except
// for the fades and the keratinized share, which it applies when it reads
// them; encoded by encodeRelief(). SKIN_SHELL: the back shell's relief.
// FRECKLES: the freckles instead (coverage in r).
#include ./skin-relief.glsl

uniform vec4 uSkin; // redness, roughness, wetness, pores
uniform vec4 uSkin2; // wrinkles, translucency, lid profile wall end, lid profile edge end
uniform vec4 uSkin3; // freckles, veins, pigmentation, seed
uniform vec4 uCanthi; // medial (xy) and lateral (zw) canthus, front plane at rest (mm)
uniform vec2 uMarginLength; // upper and lower margin lengths (mm)
uniform float uFootprint; // a texel (mm)

varying vec2 vPoint;
varying vec4 vLid;
varying vec4 vRelief;

void main() {
	vec2 p = vPoint;
	uint seed = uint(uSkin3.w + 0.5) * 7919u + 101u;
#ifdef FRECKLES
	gl_FragColor = vec4(freckles(p, uSkin3.x, seed + 61u), 0.0, 0.0, 1.0);
#else
	float s = vLid.y;
	float a = vLid.z;
	float upper = vLid.w;
	float along = vRelief.w;
	float onSkin = smoothstep(uSkin2.z, uSkin2.w, s);
	float alongMm = along * mix(uMarginLength.y, uMarginLength.x, step(0.5, upper));
	vec2 across = normalize(vRelief.xy + vec2(1e-6, 0.0));
	MicroRelief r =
		skinMicroRelief(p, a, along, alongMm, upper, across, uCanthi, uSkin.w, uSkin2.x, uFootprint, 1.0, seed);
	vec3 micro = r.furrowed + r.network;
	vec3 wrinkles = onSkin * r.wrinkles;
	gl_FragColor =
		encodeRelief(micro.yz + wrinkles.yz, 3.0 * r.furrowed.x + r.network.x, 4.0 * micro.x + 1.5 * wrinkles.x);
#endif
}
