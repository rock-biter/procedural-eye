// The cornea and limbus: tear-film reflection of the analytic rig, refraction
// through both corneal surfaces into the anterior chamber, and the limbus
// fading the clear cornea into the sclera. Alpha carries the apparent focus
// distance for the depth of field. Behind the Terminator glitch's front
// (terminator.glsl) the T-800's red lens lies behind the cornea, on the iris
// plane, and the limbus is the chrome of its socket; on the front both are
// shaded and glitch into each other.
#include ./debug-views.glsl
#include ./chamber.glsl
#include ./sclera.glsl
#include ./terminator.glsl

uniform vec3 uCameraEye;
uniform float uPixelAngle; // radians per pixel
uniform vec4 uLimbus; // opaque-from inside, fully-opaque outside, ring width, ring strength
uniform float uLimbusOverlap;

varying vec3 vEyePos;

// Radial distance stretched vertically: the sclera overlaps the cornea more at
// the top and bottom, so the visible iris is wider than tall.
float limbusRadius(vec2 xy) {
	float r = length(xy);
	float s = xy.y / max(r, 1e-6);
	return r * (1.0 + uLimbusOverlap / uGlobe.y * s * s);
}

// What the cap shows at eye-space point p of its surface, seen along dir:
// the eye or the T-800's (`terminator`).
struct Cap {
	vec3 color;
	vec3 reflected;
	vec3 refracted;
	float fresnel;
	float opacity;
	float focusDistance;
};

Cap shadeCap(vec3 p, vec3 dir, bool terminator) {
	Cap cap;
	vec3 n = surfaceNormal(p);
	float rLimbus = limbusRadius(p.xy);
	float opacity = smoothstep(uGlobe.y - uLimbus.x, uGlobe.y + uLimbus.y, rLimbus);
	// The clear cornea is a near-perfect mirror; the conjunctiva over the
	// limbus already has the irregular surface of the sclera. The sclera's
	// relief and diffuse light are only computed where the limbus shows them.
	vec3 mirror = opacity > 0.0 ? normalize(mix(n, scleraNormal(p, n), opacity)) : n;
	float cosi = -dot(dir, mirror);
	float fresnel = fresnelDielectric(cosi, uIor.x);
	vec3 mirrorDir = reflect(dir, mirror);
	vec3 reflection = lidReflection(p, mirrorDir, envRadiance(p, mirrorDir));
	vec3 inside = vec3(0.0);
	float insideDistance = 3.0;
	if (opacity < 0.999) {
		vec3 inner;
		vec3 innerDir;
		if (traceCornea(p, n, dir, inner, innerDir)) {
			if (terminator) {
				float t = max((uIrisShape.x - inner.z) / min(innerDir.z, -1e-3), 0.0);
				inside = terminatorLens((inner + innerDir * t).xy - uPupil.xy, uPupil.z, uGlobe.y);
				insideDistance = length(inner - p) + t;
			} else {
				// Pixel footprint: the cone from the camera, narrowed by the refraction.
				float coneOrigin = length(inner - uCameraEye) * uPixelAngle;
				gIrisSight = vec2(length(p - uCameraEye), length(inner - p));
				ChamberResult chamber = traceChamber(inner, innerDir, coneOrigin, uPixelAngle / uIor.z);
				inside = chamber.radiance;
				insideDistance = length(inner - p) + chamber.distance;
			}
		}
		// The limbal ring: a dark band where the iris disappears under the
		// limbus (black, where the lens meets its socket).
		float ring = smoothstep(uGlobe.y - uLimbus.x - uLimbus.z, uGlobe.y - 0.25 * uLimbus.x, rLimbus);
		inside *= (1.0 - fresnel) * (1.0 - (terminator ? 1.0 : uLimbus.w) * ring);
	}
	vec3 diffuse = vec3(0.0);
	if (opacity > 0.0) {
		float footprint = length(p - uCameraEye) * uPixelAngle;
		diffuse = terminator ? socketChrome(p, n, dir, footprint) : scleraDiffuse(p, n) * (1.0 - fresnel);
	}
	cap.refracted = mix(inside, diffuse, opacity);
	// The chrome has its own reflection: the tear film's covers only the lens.
	cap.reflected = reflection * fresnel * (terminator ? 1.0 - opacity : 1.0);
	cap.color = cap.refracted + cap.reflected;
	cap.fresnel = fresnel;
	cap.opacity = opacity;

	// Apparent depth: the iris through the cornea (paraxial single surface),
	// the reflection as the virtual image of a convex mirror (R / 2).
	float cameraDistance = length(p - uCameraEye);
	float refractedDepth = apparentDepth(insideDistance);
	float reflectedDepth = 0.5 * uCornea.x;
	float weight = luma(cap.reflected) / (luma(cap.reflected) + luma(cap.refracted * (1.0 - opacity)) + 1e-6);
	cap.focusDistance = cameraDistance + mix(mix(refractedDepth, 0.0, opacity), reflectedDepth, weight);
	return cap;
}

void main() {
	vec3 dir = normalize(vEyePos - uCameraEye);
	vec3 p = refineOnSurface(uCameraEye, dir, vEyePos);
	// On the glitch's front the point slides along the surface, and the eye
	// and the T-800 are blended per channel; elsewhere one of them shows. A
	// loop, so the iris' trace is compiled once.
	Glitch glitch = glitchAt(p);
	vec2 xy = p.xy + glitch.shift;
	vec3 q = glitch.band ? vec3(xy, surfaceZ(length(xy))) : p;
	vec3 color = vec3(0.0);
	float focusDistance = 0.0;
	Cap shown;
	for (int i = ZERO; i < 2; i++) {
		bool terminator = i == 1;
		vec3 share = terminator ? glitch.weight : 1.0 - glitch.weight;
		if (max(share.r, max(share.g, share.b)) <= 0.0) continue;
		Cap cap = shadeCap(q, dir, terminator);
		color += share * cap.color;
		focusDistance += share.g * cap.focusDistance;
		if (!terminator || glitch.weight.g >= 1.0) shown = cap;
	}
	color *= glitch.gain;

#if DEBUG_VIEW == DEBUG_NORMALS
	color = surfaceNormal(p) * 0.5 + 0.5;
#elif DEBUG_VIEW == DEBUG_FRESNEL
	color = vec3(shown.fresnel * 20.0);
#elif DEBUG_VIEW == DEBUG_REFLECTION_ONLY
	color = shown.reflected;
#elif DEBUG_VIEW == DEBUG_REFRACTION_ONLY
	color = shown.refracted;
#elif DEBUG_VIEW == DEBUG_LIMBUS_MASK
	color = vec3(shown.opacity);
#endif
	gl_FragColor = vec4(color, focusDistance);
}
