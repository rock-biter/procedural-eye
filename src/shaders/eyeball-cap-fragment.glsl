// The cornea and limbus: tear-film reflection of the analytic rig, refraction
// through both corneal surfaces into the anterior chamber, and the limbus
// fading the clear cornea into the sclera. Alpha carries the apparent focus
// distance for the depth of field.
#include ./debug-views.glsl
#include ./chamber.glsl
#include ./sclera.glsl

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

void main() {
	vec3 dir = normalize(vEyePos - uCameraEye);
	vec3 p = refineOnSurface(uCameraEye, dir, vEyePos);
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
			// Pixel footprint: the cone from the camera, narrowed by the refraction.
			float coneOrigin = length(inner - uCameraEye) * uPixelAngle;
			gIrisSight = vec2(length(p - uCameraEye), length(inner - p));
			ChamberResult chamber = traceChamber(inner, innerDir, coneOrigin, uPixelAngle / uIor.z);
			inside = chamber.radiance;
			insideDistance = length(inner - p) + chamber.distance;
		}
		// The limbal ring: a dark band where the iris disappears under the limbus.
		float ring = smoothstep(uGlobe.y - uLimbus.x - uLimbus.z, uGlobe.y - 0.25 * uLimbus.x, rLimbus);
		inside *= (1.0 - fresnel) * (1.0 - uLimbus.w * ring);
	}
	vec3 diffuse = opacity > 0.0 ? scleraDiffuse(p, n) * (1.0 - fresnel) : vec3(0.0);
	vec3 refracted = mix(inside, diffuse, opacity);
	vec3 reflected = reflection * fresnel;
	vec3 color = refracted + reflected;

	// Apparent depth: the iris through the cornea (paraxial single surface),
	// the reflection as the virtual image of a convex mirror (R / 2).
	float cameraDistance = length(p - uCameraEye);
	float refractedDepth = apparentDepth(insideDistance);
	float reflectedDepth = 0.5 * uCornea.x;
	float weight = luma(reflected) / (luma(reflected) + luma(refracted * (1.0 - opacity)) + 1e-6);
	float focusDistance = cameraDistance + mix(mix(refractedDepth, 0.0, opacity), reflectedDepth, weight);

#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#elif DEBUG_VIEW == DEBUG_FRESNEL
	color = vec3(fresnel * 20.0);
#elif DEBUG_VIEW == DEBUG_REFLECTION_ONLY
	color = reflected;
#elif DEBUG_VIEW == DEBUG_REFRACTION_ONLY
	color = refracted;
#elif DEBUG_VIEW == DEBUG_LIMBUS_MASK
	color = vec3(opacity);
#endif
	gl_FragColor = vec4(color, focusDistance);
}
