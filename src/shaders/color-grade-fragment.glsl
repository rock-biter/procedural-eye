// White balance, saturation and contrast in linear light, before tone mapping.
uniform vec3 whiteBalance;
uniform float saturation;
uniform float contrast;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	vec3 c = max(inputColor.rgb * whiteBalance, 0.0);
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = max(mix(vec3(l), c, saturation), 0.0);
	// Contrast around middle grey, in log space.
	c = 0.18 * pow(c / 0.18 + 1e-6, vec3(contrast));
	outputColor = vec4(c, inputColor.a);
}
