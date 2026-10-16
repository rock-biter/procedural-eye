// Full-screen triangle of postprocessing's passes, at the far plane; with
// NEAR_PLANE at the near one, where its depth hides everything drawn after it
// (src/render/scenePass.js).
varying vec2 vUv;

void main() {
	vUv = position.xy * 0.5 + 0.5;
#ifdef NEAR_PLANE
	gl_Position = vec4(position.xy, -1.0, 1.0);
#else
	gl_Position = vec4(position.xy, 1.0, 1.0);
#endif
}
