// The backdrop (src/render/backdrop.js): the clear color, darkened by the soft
// shadow the skin patch casts from the light shafts' direction on a plane
// below the face (shadow-coverage.glsl):
// sharper where the patch nearly touches it, softer farther behind. A floor
// by default, it tilts up toward a wall behind the face. Only a camera on its
// side sees it, and it fades out where the ray grazes it. Alpha keeps the
// background's focus distance.
#include ./shadow-coverage.glsl

uniform vec3 uBackdropColor;
uniform vec4 uShadowPlane; // unit normal (world), offset: its points p have dot(normal, p) = offset
uniform float uShadowStrength;

varying vec3 vRay;

void main() {
	vec3 ray = normalize(vRay);
	vec3 normal = uShadowPlane.xyz;
	float above = dot(normal, cameraPosition) - uShadowPlane.w;
	float facing = -dot(normal, ray);
	float shade = 1.0;
	if (above > 0.0 && facing > 1e-4) {
		vec3 point = cameraPosition + ray * (above / facing);
		shade -= uShadowStrength * smoothstep(0.005, 0.03, facing) * shaftCover(point);
	}
	gl_FragColor = vec4(uBackdropColor * shade, FOCUS_AT_INFINITY);
}
