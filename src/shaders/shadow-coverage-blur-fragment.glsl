// One separable Gaussian pass of a shadow coverage (src/lighting/shadowCoverage.js):
// r and g a little (σ uSigma.x texels), b and a over the shadow's softness
// (σ uSigma.y). The border texels hold no coverage, so the edge clamp adds none.
#include ./common.glsl

uniform sampler2D uSource;
uniform vec2 uStep; // one texel along the pass's axis (uv)
uniform vec2 uSigma; // texels

varying vec2 vUv;

void main() {
	int lightReach = int(ceil(3.0 * uSigma.x));
	vec2 light = vec2(0.0);
	float lightWeight = 0.0;
	for (int i = ZERO; i <= 2 * lightReach; i++) {
		float x = float(i - lightReach);
		float w = exp(-0.5 * x * x / (uSigma.x * uSigma.x));
		light += w * texture(uSource, vUv + uStep * x).rg;
		lightWeight += w;
	}
	int heavyReach = int(ceil(3.0 * uSigma.y));
	vec2 heavy = vec2(0.0);
	float heavyWeight = 0.0;
	for (int i = ZERO; i <= 2 * heavyReach; i++) {
		float x = float(i - heavyReach);
		float w = exp(-0.5 * x * x / (uSigma.y * uSigma.y));
		heavy += w * texture(uSource, vUv + uStep * x).ba;
		heavyWeight += w;
	}
	gl_FragColor = vec4(light / lightWeight, heavy / heavyWeight);
}
