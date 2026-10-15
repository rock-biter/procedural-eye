// Both eyeball programs: the mesh is built in eye space (src/eye/eyeballGeometry.js).
varying vec3 vEyePos;

void main() {
	vEyePos = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
