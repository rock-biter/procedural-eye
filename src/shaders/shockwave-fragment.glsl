// The Sharingan's awakening (src/render/shockwave.js, docs/RENDERING.md): a
// shockwave running from the middle of the frame out past its corners, in
// linear light before the color effects. Its front, a ring frayed by noise
// around it, acts as a lens: the image ahead of it is pushed outward, the
// image behind it pulled in, red and blue a little more and less than
// green, and the ring brightens a little.
uniform vec4 shockFront; // radius (1 at the corners), half-width, push (of the half-diagonal), color split (share of the push)
uniform vec3 shockLook; // fraying (of the half-diagonal), its phase, brightening

// PCG over the cell `i` of `period` around (a periodic value noise's lattice).
float shockHash(int i, int period) {
	uint h = uint((i % period + period) % period) * 747796405u + 2891336453u;
	h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
	return float((h >> 22u) ^ h) * (1.0 / 4294967295.0);
}

// Smooth periodic value noise (0–1) at `x` cells, `period` cells around.
float shockNoise(float x, int period) {
	float cell = floor(x);
	float f = x - cell;
	int i = int(cell);
	return mix(shockHash(i, period), shockHash(i + 1, period), f * f * (3.0 - 2.0 * f));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	vec2 frame = vec2(aspect, 1.0);
	float corner = 0.5 * length(frame);
	vec2 p = (uv - 0.5) * frame;
	float r = length(p) / corner;
	// Around the frame, 0–1; two octaves of fraying, drifting apart.
	float around = atan(p.y, p.x) / PI2 + 0.5;
	float fray = 0.65 * shockNoise(around * 14.0 + shockLook.y, 14) + 0.35 * shockNoise(around * 37.0 - 1.7 * shockLook.y, 37) - 0.5;
	float x = (r - shockFront.x - fray * shockLook.x) / shockFront.y;
	float band = exp(-x * x);
	vec2 outward = p / max(length(p), 1e-4);
	vec2 offset = outward * (x * band * shockFront.z * corner) / frame;
	vec3 color = vec3(
		texture2D(inputBuffer, uv - offset * (1.0 + shockFront.w)).r,
		texture2D(inputBuffer, uv - offset).g,
		texture2D(inputBuffer, uv - offset * (1.0 - shockFront.w)).b
	);
	outputColor = vec4(color * (1.0 + shockLook.z * band), inputColor.a);
}
