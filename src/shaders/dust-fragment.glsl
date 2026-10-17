// A dust mote's blurred image (src/render/dustPass.js), added over the image
// after the depth of field: a soft kernel (1 − s²)² around a fiber's bent
// center line, a flake's point or two crossed fibers. The scene's focus
// distance in the accumulated mean (alpha) hides the motes behind a surface.
uniform sampler2D uSharp; // accumulated mean, alpha: focus distance (−1 where a split frame shaded at half resolution)
uniform sampler2D uHalf; // the half-resolution share of a split frame

varying vec2 vLocal;
varying vec4 vShape;
varying vec3 vColor;
varying float vDistance;

// The kernel at `p` (px) around a center line of half length `halfLength`
// along x, bent by `bend` px at its ends, blurred over `radius` px.
float fiber(vec2 p, float halfLength, float radius, float bend) {
	float u = clamp(p.x, -halfLength, halfLength);
	float t = halfLength > 0.0 ? u / halfLength : 0.0;
	float s = length(vec2(p.x - u, p.y - bend * t * t)) / radius;
	float k = max(1.0 - s * s, 0.0);
	return k * k;
}

void main() {
	float shape = fiber(vLocal, vShape.x, vShape.y, vShape.z);
	if (vShape.w > 0.5) {
		vec2 crossing = mat2(0.36, 0.93, -0.93, 0.36) * vLocal;
		shape = 0.5 * (shape + fiber(crossing, vShape.x, vShape.y, -vShape.z));
	}
	if (shape <= 0.0) discard;
	vec4 scene = texelFetch(uSharp, ivec2(gl_FragCoord.xy), 0);
	if (scene.a < 0.0) scene = texelFetch(uHalf, ivec2(gl_FragCoord.xy) / 2, 0);
	float margin = 1.0 + 0.02 * vDistance;
	float visible = smoothstep(-margin, margin, scene.a - vDistance);
	gl_FragColor = vec4(vColor * shape * visible, 0.0);
}
