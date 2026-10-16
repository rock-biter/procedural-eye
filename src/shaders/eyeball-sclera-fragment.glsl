// The sclera beyond the limbus: wet reflection of the rig over the diffuse white.
// Behind the world plane z = uGlobeCut the globe is cut: there it lies under
// the conjunctiva, and the back shell closes in front of it.
#include ./debug-views.glsl
#include ./cornea-optics.glsl
#include ./sclera.glsl

uniform vec3 uCameraEye;
uniform float uGlobeCut; // world z (mm)

varying vec3 vEyePos;

void main() {
	vec3 dir = normalize(vEyePos - uCameraEye);
	vec2 hits = intersectSphere(uCameraEye, dir, vec3(0.0), uGlobe.x);
	vec3 p = hits.x > 0.0 ? uCameraEye + dir * hits.x : vEyePos;
	if ((uEyeToWorld * vec4(p, 1.0)).z < uGlobeCut) discard;
	vec3 n = normalize(p);
	vec3 wet = scleraNormal(p, n);
	float fresnel = fresnelDielectric(-dot(dir, wet), uIor.x);
	vec3 mirrorDir = reflect(dir, wet);
	vec3 reflected = lidReflection(p, mirrorDir, envRadiance(p, mirrorDir)) * fresnel;
	vec3 color = scleraDiffuse(p, n) * (1.0 - fresnel) + reflected;
#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#elif DEBUG_VIEW == DEBUG_FRESNEL
	color = vec3(fresnel * 20.0);
#elif DEBUG_VIEW == DEBUG_REFLECTION_ONLY
	color = reflected;
#elif DEBUG_VIEW == DEBUG_LIMBUS_MASK
	color = vec3(1.0);
#endif
	gl_FragColor = vec4(color, length(p - uCameraEye));
}
