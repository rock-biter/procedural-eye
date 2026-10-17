// Dust motes (src/render/dustPass.js): a fiber, a flake or two crossed fibers
// at their real size, drawn as a quad around their image blurred by the thin
// lens. The motes fill a cube around the eye, fixed in world space, and wrap
// along its world axes as they drift (src/atmosphere/dustField.js), so a
// turning camera moves them only by their parallax. A mote keeps the light of
// its own image: out of focus it spreads into a faint, soft blob.
#include ./env-rig.glsl
#include ./scattering.glsl

attribute vec4 mote; // position in the unit cube, size factor
attribute vec4 motion; // wandering phases, rate factor
attribute vec4 form; // angle on screen, spin (rad/s), bend, kind

uniform mat4 uView; // the pinhole camera of the frame (no lens or pixel jitter)
uniform mat4 uProjection;
uniform vec2 uViewport; // drawing-buffer size (px)
uniform vec4 uLens; // f² / N (mm²), focus distance s (mm), s − f (mm), sensor-mm → pixel
uniform vec4 uVolume; // the cube's center (world, mm) and side (mm)
uniform float uTime; // s
uniform vec3 uWind; // mm/s, world
uniform float uTurbulence; // mm
uniform float uSize; // median fiber length (mm)
uniform float uForward; // phase g
uniform vec3 uAmbient; // background radiance
uniform float uBrightness;
uniform float uMaxRadius; // px

varying vec2 vLocal; // px, along and across the mote
varying vec4 vShape; // half length, blur radius, bend (px), crossed (0 or 1)
varying vec3 vColor; // peak radiance
varying float vDistance; // from the camera (mm)

void cull() {
	gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
	vColor = vec3(0.0);
}

void main() {
	// Drift and the slow wandering of still air, wrapped into the cube.
	float side = uVolume.w;
	float rate = motion.w;
	vec3 wander = sin(uTime * rate * vec3(0.071, 0.053, 0.062) + motion.xyz);
	vec3 local = mote.xyz * side + uWind * uTime * (0.7 + 0.3 * rate) + uTurbulence * wander;
	local = mod(local + 0.5 * side, side) - 0.5 * side;
	// Faded in from the faces, so a mote never pops in where it wraps.
	vec3 edge = abs(local) / (0.5 * side);
	float fade = 1.0 - smoothstep(0.8, 1.0, max(max(edge.x, edge.y), edge.z));
	vec3 view = (uView * vec4(uVolume.xyz + local, 1.0)).xyz;
	float depth = -view.z;
	if (depth < 1.0 || fade <= 0.0) {
		cull();
		return;
	}

	// Its size: fibers a few hundredths of the median length wide whatever
	// their own length, flakes a fifth of a fiber's length.
	float kind = form.w;
	bool crossed = kind < 0.15;
	bool flake = !crossed && kind < 0.5;
	float focalPx = uProjection[1][1] * 0.5 * uViewport.y;
	float lengthMm = uSize * mote.w * (flake ? 0.2 : 1.0);
	float lengthPx = lengthMm * focalPx / depth;
	float widthPx = flake ? lengthPx : 0.06 * uSize * sqrt(mote.w) * focalPx / depth;
	float halfLength = flake ? 0.0 : 0.5 * lengthPx;
	// Blurred by the lens, its width and the pixel.
	float coc = 0.5 * uLens.x * (depth - uLens.y) / (depth * uLens.z) * uLens.w;
	float radius = sqrt(coc * coc + 0.25 * widthPx * widthPx + 0.3);
	fade *= 1.0 - smoothstep(0.6 * uMaxRadius, uMaxRadius, radius);
	float bend = form.z * halfLength;
	vec2 extent = vec2(halfLength + radius, radius + abs(bend)) + 1.5;
	if (crossed) extent = vec2(max(extent.x, extent.y));
	vec4 clip = uProjection * vec4(view, 1.0);
	vec2 ndc = clip.xy / clip.w;
	vec2 reach = max(extent.x, extent.y) * 2.0 / uViewport;
	if (fade <= 0.0 || any(greaterThan(abs(ndc) - reach, vec2(1.0)))) {
		cull();
		return;
	}

	// The light it scatters toward the camera: each emitter's irradiance on a
	// face turned to it, by the phase of the angle between the light and the
	// view, and the background's radiance.
	mat3 toWorld = transpose(mat3(uView));
	vec3 p = toWorld * (view - uView[3].xyz);
	vec3 ray = toWorld * normalize(view);
	vec3 light = vec3(0.0);
	for (int i = ZERO; i < uEmitterCount; i++) {
		vec3 l = normalize(uEmitters[i * EMITTER_VEC4S].xyz - p);
		light += emitterIrradiance(i, p, l) * hgPhase(dot(l, ray), uForward);
	}
	float albedo = 0.6 + 0.4 * fract(motion.w * 7.31);
	vec3 radiance = albedo * (uAmbient + PI * light);
	// Its image's area over the blurred shape's integral (the kernel
	// (1 − s²)² of dust-fragment.glsl integrates to 16/15 radius across a
	// fiber and πr²/3 over a disc).
	float area = flake ? 0.785 * lengthPx * lengthPx : lengthPx * widthPx;
	float spread = 2.0 * halfLength * radius * 16.0 / 15.0 + PI * radius * radius / 3.0;
	vColor = radiance * uBrightness * fade * area / spread;

	float angle = form.x + form.y * uTime;
	mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
	vLocal = position.xy * extent;
	vShape = vec4(halfLength, radius, bend, crossed ? 1.0 : 0.0);
	vDistance = length(view);
	gl_Position = clip + vec4(turn * vLocal * 2.0 / uViewport * clip.w, 0.0, 0.0);
}
