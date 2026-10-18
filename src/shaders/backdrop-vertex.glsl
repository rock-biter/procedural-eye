// The backdrop's full-screen triangle (src/render/backdrop.js), at the far
// plane: the depth test leaves it the pixels nothing else covered. Each
// vertex carries its ray from the camera, unprojected through this sample's
// camera (its lens offset and shear included): the points of one depth in
// clip space lie on a plane, so the rays interpolate exactly.
varying vec3 vRay;

void main() {
	vec4 point = inverse(projectionMatrix * viewMatrix) * vec4(position.xy, 0.0, 1.0);
	vRay = point.xyz / point.w - cameraPosition;
	gl_Position = vec4(position.xy, 1.0, 1.0);
}
