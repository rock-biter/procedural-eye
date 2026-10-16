// The share of a split frame a pass leaves out (src/render/scenePass.js):
// drawn at the near plane before the scene, it marks those pixels with alpha
// −1 and its depth makes the depth test skip the scene there. The sharp share
// (full resolution) is where the last frame's blur stayed under SHARP_RADIUS
// (shading-spread-fragment.glsl), the blurred share (half resolution) the rest.
uniform sampler2D uSpread; // r: smallest blur radius around each half-resolution texel
uniform bool uSharpShare; // this pass shades the sharp share

void main() {
	ivec2 texel = ivec2(gl_FragCoord.xy) / (uSharpShare ? 2 : 1);
	texel = min(texel, textureSize(uSpread, 0) - 1);
	bool sharp = texelFetch(uSpread, texel, 0).r < SHARP_RADIUS;
	if (sharp == uSharpShare) discard;
	gl_FragColor = vec4(0.0, 0.0, 0.0, -1.0);
}
