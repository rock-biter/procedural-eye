// The blink: the lid meshes (lids, lashes, tear meniscus) blend their closing
// frames, three.js morph targets holding absolute values
// (src/adnexa/lidBlink.js). The renderer defines USE_MORPHTARGETS for a
// geometry with frames and sets these uniforms per object, so the key light's
// shadow pass, which draws every caster with one material, morphs them too.
// The weights are those of a Catmull–Rom spline through the frames: four at
// most are not 0, some negative.
#ifndef LID_MORPH_GLSL
#define LID_MORPH_GLSL

#include ./common.glsl

#ifdef USE_MORPHTARGETS
uniform float morphTargetBaseInfluence;
uniform float morphTargetInfluences[MORPHTARGETS_COUNT];
uniform sampler2DArray morphTargetsTexture;
uniform ivec2 morphTargetsTextureSize;

// `base` blended with the frames' values of this vertex's `slot`: 0 the
// position, 1 the normal, 2 the color (the lashes' tangent, the lids'
// occlusion in x).
vec3 lidMorph(vec3 base, int slot) {
	vec3 value = base * morphTargetBaseInfluence;
	int texel = gl_VertexID * MORPHTARGETS_TEXTURE_STRIDE + slot;
	int row = texel / morphTargetsTextureSize.x;
	ivec2 uv = ivec2(texel - row * morphTargetsTextureSize.x, row);
	for (int i = ZERO; i < MORPHTARGETS_COUNT; i++) {
		float weight = morphTargetInfluences[i];
		if (weight != 0.0) value += texelFetch(morphTargetsTexture, ivec3(uv, i), 0).xyz * weight;
	}
	return value;
}
#else
vec3 lidMorph(vec3 base, int slot) {
	return base;
}
#endif

#endif
