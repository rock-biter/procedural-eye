// Rest space of the iris, twin of src/iris/irisSpace.js: the current radius r
// (from the pupil center) maps to the rest radius r0 where the features live.
#ifndef IRIS_SPACE_GLSL
#define IRIS_SPACE_GLSL

#include ./common.glsl

uniform vec4 uIrisRest; // rest pupil radius, root radius, rest collarette radius, zone area (r_c0² − r_p0²)
uniform float uIrisThicknessResponse;

struct IrisRest {
	float r0;
	float radial; // rest length per current length, radially
	float tangential; // and around
	float thickness; // current thickness / rest thickness
};

IrisRest irisToRest(float r, float pupilRadius) {
	IrisRest m;
	float rc = sqrt(pupilRadius * pupilRadius + uIrisRest.w);
	if (r <= rc) {
		m.r0 = sqrt(max(r * r - pupilRadius * pupilRadius + uIrisRest.x * uIrisRest.x, 0.0));
		m.radial = r / max(m.r0, 1e-6);
	} else {
		m.radial = (uIrisRest.y - uIrisRest.z) / (uIrisRest.y - rc);
		m.r0 = uIrisRest.z + (r - rc) * m.radial;
	}
	m.tangential = m.r0 / max(r, 1e-6);
	m.thickness = pow(max(m.radial * m.tangential, 1e-4), uIrisThicknessResponse);
	return m;
}

// Normalized rest radius: 0 at the pupil margin, 1 at the root.
float irisRho(float r0) {
	return (r0 - uIrisRest.x) / (uIrisRest.y - uIrisRest.x);
}

// Conservative scale from rest-space distances to current space.
float irisDistanceScale(IrisRest m) {
	return 1.0 / max(max(m.radial, m.tangential), 1.0 / m.thickness);
}

#endif
