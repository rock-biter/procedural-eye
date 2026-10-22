// The sclera beyond the limbus: wet reflection of the rig over the diffuse white.
// Behind the world plane z = uGlobeCut the globe is cut: there it lies under
// the conjunctiva, and the back shell closes in front of it. Behind the
// Terminator glitch's front it is the chrome of the T-800's socket; on the
// front both glitch into each other (terminator.glsl).
#include ./debug-views.glsl
#include ./cornea-optics.glsl
#include ./sclera.glsl
#include ./terminator.glsl

uniform vec3 uCameraEye;
uniform float uPixelAngle; // radians per pixel
uniform float uGlobeCut; // world z (mm)

varying vec3 vEyePos;

void main() {
	vec3 dir = normalize(vEyePos - uCameraEye);
	vec2 hits = intersectSphere(uCameraEye, dir, vec3(0.0), uGlobe.x);
	vec3 p = hits.x > 0.0 ? uCameraEye + dir * hits.x : vEyePos;
	vec3 world = (uEyeToWorld * vec4(p, 1.0)).xyz;
	if (world.z < uGlobeCut) discard;
	// On the glitch's front the point slides along the globe (terminator.glsl).
	Glitch glitch = glitchAt(p);
	vec2 xy = p.xy + glitch.shift;
	vec3 q = glitch.band ? vec3(xy, sqrt(max(sq(uGlobe.x) - dot(xy, xy), 0.0))) : p;
	vec3 n = normalize(q);
	vec3 wet = scleraNormal(q, n);
	float fresnel = fresnelDielectric(-dot(dir, wet), uIor.x);
	vec3 mirrorDir = reflect(dir, wet);
	vec3 reflected = lidReflection(q, mirrorDir, envRadiance(q, mirrorDir)) * fresnel;
	vec3 w = glitch.weight;
	vec3 color = vec3(0.0);
	if (min(w.r, min(w.g, w.b)) < 1.0) color = scleraDiffuse(q, n) * (1.0 - fresnel) + reflected;
	if (max(w.r, max(w.g, w.b)) > 0.0) color = mix(color, socketChrome(q, n, dir, length(q - uCameraEye) * uPixelAngle), w);
	color *= glitch.gain;
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
