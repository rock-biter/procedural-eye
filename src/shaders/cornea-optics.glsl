// Ray optics of the anterior eye, twin of src/eye/cornealOptics.js.
#ifndef CORNEA_OPTICS_GLSL
#define CORNEA_OPTICS_GLSL

#include ./eye-profile.glsl

// Unpolarized Fresnel reflectance; eta = n2 / n1.
float fresnelDielectric(float cosi, float eta) {
	float c = abs(cosi);
	float g2 = eta * eta - 1.0 + c * c;
	if (g2 < 0.0) return 1.0;
	float g = sqrt(g2);
	float a = (g - c) / (g + c);
	float b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
	return 0.5 * a * a * (1.0 + b * b);
}

// Both distances to a sphere (near, far), or (-1, -1).
vec2 intersectSphere(vec3 o, vec3 d, vec3 center, float radius) {
	vec3 oc = o - center;
	float b = dot(oc, d);
	float c = dot(oc, oc) - radius * radius;
	float disc = b * b - c;
	if (disc < 0.0) return vec2(-1.0);
	float s = sqrt(disc);
	return vec2(-b - s, -b + s);
}

// Nearest positive distance to the apex sheet of the conic
// x² + y² + (1+Q)w² - 2Rw = 0 (w = apexZ - z), or -1.
float intersectConic(vec3 o, vec3 d, float apexZ, float R, float Q) {
	float k = 1.0 + Q;
	float w0 = apexZ - o.z;
	float a = dot(d.xy, d.xy) + k * d.z * d.z;
	float b = 2.0 * (dot(o.xy, d.xy) - k * w0 * d.z + R * d.z);
	float c = dot(o.xy, o.xy) + k * w0 * w0 - 2.0 * R * w0;
	float t0;
	float t1;
	if (abs(a) < 1e-9) {
		t0 = -c / b;
		t1 = t0;
	} else {
		float disc = b * b - 4.0 * a * c;
		if (disc < 0.0) return -1.0;
		float s = sqrt(disc);
		float q = -0.5 * (b + (b >= 0.0 ? s : -s));
		t0 = q / a;
		t1 = abs(q) > 1e-12 ? c / q : t0;
		if (t0 > t1) {
			float tmp = t0;
			t0 = t1;
			t1 = tmp;
		}
	}
	float w = w0 - t0 * d.z;
	if (t0 > 1e-6 && w >= -1e-6 && (k <= 0.0 || w <= R / k)) return t0;
	w = w0 - t1 * d.z;
	if (t1 > 1e-6 && w >= -1e-6 && (k <= 0.0 || w <= R / k)) return t1;
	return -1.0;
}

vec3 conicNormal(vec3 p, float apexZ, float R, float Q) {
	return normalize(vec3(p.xy, R - (1.0 + Q) * (apexZ - p.z)));
}

// Nearest positive distance to the paraboloid z = z0 - c·r², or -1.
float intersectParaboloid(vec3 o, vec3 d, float z0, float c) {
	float a = c * dot(d.xy, d.xy);
	float b = 2.0 * c * dot(o.xy, d.xy) + d.z;
	float cc = c * dot(o.xy, o.xy) + o.z - z0;
	if (abs(a) < 1e-12) {
		float t = -cc / b;
		return t > 1e-6 ? t : -1.0;
	}
	float disc = b * b - 4.0 * a * cc;
	if (disc < 0.0) return -1.0;
	float s = sqrt(disc);
	float q = -0.5 * (b + (b >= 0.0 ? s : -s));
	float t0 = q / a;
	float t1 = abs(q) > 1e-12 ? cc / q : t0;
	float near = min(t0, t1);
	float far = max(t0, t1);
	if (near > 1e-6) return near;
	if (far > 1e-6) return far;
	return -1.0;
}

// Refraction through both corneal surfaces from the outer point `p` (normal
// `n`, incident `d`). Returns false when the ray misses the posterior surface
// (it enters the limbus) or is totally reflected; otherwise the posterior
// point and the ray in the aqueous.
bool traceCornea(vec3 p, vec3 n, vec3 d, out vec3 inner, out vec3 innerDir) {
	vec3 d1 = refract(d, n, 1.0 / uIor.y);
	if (dot(d1, d1) < 0.5) return false;
	vec3 center = vec3(0.0, 0.0, uCornea.w - uCornea.z);
	vec2 hits = intersectSphere(p, d1, center, uCornea.z);
	if (hits.x <= 0.0) return false;
	inner = p + d1 * hits.x;
	vec3 n2 = (inner - center) / uCornea.z;
	innerDir = refract(d1, n2, uIor.y / uIor.z);
	return dot(innerDir, innerDir) > 0.5;
}

#endif
