// The interactive depth of field's blur radius (src/render/dofPass.js),
// shared by its prepare and composite passes: the thin lens's blur circle
// (src/camera/cameraOptics.js) at a focus distance, and how close two radii
// must be to lie at one depth.
#ifndef DOF_RADIUS_GLSL
#define DOF_RADIUS_GLSL

uniform vec4 uLens; // f² / N (mm²), focus distance s (mm), s − f (mm), sensor-mm → pixel (full res)

// The blur circle on the sensor (mm) of a point `distance` mm away, as a
// signed radius in full-resolution pixels, negative in front of the focus
// plane.
float dofRadius(float distance) {
	distance = max(distance, 1.0);
	return 0.5 * uLens.x * (distance - uLens.y) / (distance * uLens.z) * uLens.w;
}

// Radii closer to `radius` than this lie at its depth for the half-resolution
// passes: a pixel, and more for larger blurs, which hide the difference.
float dofRadiusTolerance(float radius) {
	return 1.0 + 0.25 * abs(radius);
}

#endif
