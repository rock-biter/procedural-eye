// Scattering by the air and the dust in it (src/atmosphere/dustField.js).
#ifndef SCATTERING_GLSL
#define SCATTERING_GLSL

#include ./common.glsl

// Henyey–Greenstein phase function (per steradian) of the scattering angle's
// cosine, twin of hgPhase() in src/atmosphere/dustField.js.
float hgPhase(float cosTheta, float g) {
	float denominator = 1.0 + g * g - 2.0 * g * cosTheta;
	return (1.0 - g * g) / (4.0 * PI * denominator * sqrt(denominator));
}

#endif
