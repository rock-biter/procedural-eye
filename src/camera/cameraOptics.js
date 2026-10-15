// Thin-lens camera optics in millimeters, shared by the physical camera
// (src/camera/physicalCamera.js), the gather DOF and the accumulation's lens
// sampling, so every mode blurs alike. `focusDistance` is the object-side
// distance from the lens to the plane in focus.

// Lens-to-sensor distance when focused at `focusDistance`.
export function imageDistance(focalLength, focusDistance) {
	return (focalLength * focusDistance) / (focusDistance - focalLength)
}

// Vertical field of view in radians; it narrows as the focus gets closer
// (focus breathing), which is what makes macro framing tighten.
export function verticalFov(focalLength, focusDistance, sensorHeight) {
	return 2 * Math.atan(sensorHeight / (2 * imageDistance(focalLength, focusDistance)))
}

export function magnification(focalLength, focusDistance) {
	return focalLength / (focusDistance - focalLength)
}

export function apertureRadius(focalLength, fNumber) {
	return focalLength / (2 * fNumber)
}

// Signed blur-circle diameter on the sensor for a point at `distance` from the
// lens: negative in front of the focus plane, positive behind it.
export function circleOfConfusion(focalLength, fNumber, focusDistance, distance) {
	return (
		((focalLength * focalLength) / fNumber) *
		((distance - focusDistance) / (distance * (focusDistance - focalLength)))
	)
}

export function cocToPixels(coc, sensorHeight, imageHeightPx) {
	return (coc * imageHeightPx) / sensorHeight
}

// Offsets to add to the projection matrix elements [8] and [9] (three's
// column-major layout) for a camera moved by `lensX`, `lensY` (mm, in its own
// x and y) that keeps the focus plane fixed, plus a jitter of `jitterX`,
// `jitterY` pixels. `halfWidth`, `halfHeight`: half extent of the view at the
// focus distance; `widthPx`, `heightPx`: size of the full image in pixels.
export function projectionShear({
	lensX = 0,
	lensY = 0,
	halfWidth,
	halfHeight,
	jitterX = 0,
	jitterY = 0,
	widthPx = 1,
	heightPx = 1,
}) {
	return {
		x: -lensX / halfWidth - (2 * jitterX) / widthPx,
		y: -lensY / halfHeight - (2 * jitterY) / heightPx,
	}
}

// Total depth of field (mm) for an acceptable blur circle `coc` on the sensor.
export function depthOfField(focalLength, fNumber, focusDistance, coc) {
	const H = (focalLength * focalLength) / (fNumber * coc) + focalLength
	const near = (focusDistance * (H - focalLength)) / (H + focusDistance - 2 * focalLength)
	const far =
		H > focusDistance
			? (focusDistance * (H - focalLength)) / (H - focusDistance)
			: Number.POSITIVE_INFINITY
	return far - near
}
