// Eyelash shading: Kajiya–Kay diffuse and two shifted specular lobes along the
// hair tangent (a white reflection off the cuticle and a dimmer colored one
// from light that passed through the fiber), lighter toward the thin tips.
#include ./debug-views.glsl
#include ./lit-surface.glsl
#include ./key-shadow.glsl

uniform vec3 uLashColor;
uniform float uLashShine;

// Centroid, so a multisampled pass never shades a lash off its tube
// (lash-vertex.glsl).
centroid varying vec3 vWorldPos;
centroid varying vec3 vNormal;
centroid varying vec3 vTangent;
centroid varying vec2 vLash;

void main() {
	vec3 v = normalize(cameraPosition - vWorldPos);
	vec3 t = normalize(vTangent);
	vec3 n = normalize(vNormal);
	if (dot(n, v) < 0.0) n = -n;
	vec3 albedo = uLashColor * mix(1.0, 2.2, vLash.x * vLash.x * vLash.x) * mix(0.85, 1.15, vLash.y);
	vec3 color = albedo * INV_PI * backgroundIrradiance(n) * 0.8;
	float keyLit = keyShadow(vWorldPos);
	vec3 primaryTangent = normalize(t + n * 0.1);
	vec3 secondaryTangent = normalize(t - n * 0.2);
	for (int i = ZERO; i < uEmitterCount; i++) {
		int base = i * EMITTER_VEC4S;
		vec4 A = uEmitters[base];
		int type = int(A.w + 0.5);
		if (type == EMITTER_LENS || type == EMITTER_BLOCKER) continue;
		vec3 l = normalize(A.xyz - vWorldPos);
		vec3 facing = emitterIrradiance(i, vWorldPos, l);
		float shadow = i == 0 ? keyLit : 1.0;
		float tl = dot(t, l);
		float diffuse = sqrt(max(1.0 - tl * tl, 0.0));
		color += albedo * INV_PI * facing * diffuse * 0.7 * shadow;
		vec3 h = normalize(l + v);
		float th1 = dot(primaryTangent, h);
		float th2 = dot(secondaryTangent, h);
		float primary = pow(sqrt(max(1.0 - th1 * th1, 0.0)), 160.0);
		float secondary = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 40.0);
		float visible = smoothstep(-0.2, 0.3, dot(n, l));
		color += facing * uLashShine * visible * shadow * (0.08 * primary + 0.05 * secondary * albedo * 12.0);
	}
#if DEBUG_VIEW == DEBUG_NORMALS
	color = n * 0.5 + 0.5;
#endif
	gl_FragColor = vec4(color, length(cameraPosition - vWorldPos));
}
