// Tear film water (the meniscus along the lid margins, tear bubbles): a smooth
// mirror of the light rig with water's Fresnel, over a faint transmitted tint
// of what lies behind (the lid margin, the sclera).
#include ./debug-views.glsl
#include ./lit-surface.glsl
#include ./key-shadow.glsl
#include ./shaft-light.glsl

uniform vec3 uTearTint;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
	vec3 v = normalize(cameraPosition - vWorldPos);
	vec3 n = normalize(vNormal);
	if (dot(n, v) < 0.0) n = -n;
	float cosi = saturate(dot(n, v));
	float fresnel = schlick(cosi, 0.0208);
	vec3 reflected = envRadiance(vWorldPos, reflect(-v, n));
	vec3 shadow = vec3(keyShadow(vWorldPos));
	vec3 irradiance = envIrradianceShadowed(vWorldPos, n, shadow, 0.6) + shaftIrradiance(vWorldPos, n, 0.0);
	vec3 transmitted = uTearTint * INV_PI * irradiance;
	vec3 color = reflected * fresnel + transmitted * (1.0 - fresnel);
	gl_FragColor = vec4(color, length(cameraPosition - vWorldPos));
}
