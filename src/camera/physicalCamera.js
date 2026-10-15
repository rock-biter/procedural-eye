// The macro camera: placed from params.camera around a target on the apparent
// iris plane, with the field of view of a thin lens focused at that distance
// (it narrows as the focus gets closer, like a real macro lens). For
// accumulation samples it moves across the aperture and shears the frustum so
// the focus plane stays put (src/camera/cameraOptics.js): averaging the
// samples gives the true depth of field, reflections and refraction included.
import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { gazeQuaternion } from '../animation/gaze'
import { ROTATION_CENTER_DEPTH } from '../eye/eyeRig'
import { sphericalDirection } from '../lighting/envRig'
import { apertureRadius, projectionShear, verticalFov } from './cameraOptics'

export default class PhysicalCamera {
	constructor() {
		this.camera = new PerspectiveCamera(10, 1, 5, 10000)
		this.target = new Vector3()
		this.framed = new Vector3()
		this.rotation = new Quaternion()
		this.right = new Vector3()
		this.up = new Vector3()
		this.focusDistance = 200
	}

	// `focusDepth`: depth of the apparent iris behind the corneal apex (the
	// entrance pupil); `sample`: an accumulationSample() or null; `size`: the
	// drawing-buffer size in pixels; `framing`: the eye's settled line of sight
	// (yaw, pitch in degrees, src/animation/animator.js). The camera aims and
	// focuses on the entrance pupil turned that way about the center of
	// rotation, so the iris stays framed and sharp when the eye turns.
	update(params, eye, focusDepth, size, sample = null, framing = { yaw: 0, pitch: 0 }) {
		const c = params.camera
		const camera = this.camera
		const center = eye.apexZ - ROTATION_CENTER_DEPTH
		this.rotation.fromArray(gazeQuaternion(framing.yaw, framing.pitch))
		this.framed.set(0, 0, eye.apexZ - focusDepth - center).applyQuaternion(this.rotation)
		this.target.set(c.targetX, c.targetY, center).add(this.framed)
		const [x, y, z] = sphericalDirection(c.azimuth, c.elevation)
		camera.position.set(x, y, z).multiplyScalar(c.distance).add(this.target)
		camera.up.set(0, 1, 0)
		camera.lookAt(this.target)
		this.focusDistance = c.distance
		const fov = verticalFov(c.focalLength, c.distance, c.sensorHeight)
		camera.fov = MathUtils.radToDeg(fov)
		camera.aspect = size.width / size.height
		camera.near = Math.max(1, c.distance * 0.02)
		camera.far = c.distance * 40
		camera.updateProjectionMatrix()
		camera.updateMatrixWorld()
		if (!sample) return

		const aperture = apertureRadius(c.focalLength, c.fNumber)
		const lensX = sample.lensX * aperture
		const lensY = sample.lensY * aperture
		this.right.setFromMatrixColumn(camera.matrixWorld, 0)
		this.up.setFromMatrixColumn(camera.matrixWorld, 1)
		camera.position.addScaledVector(this.right, lensX).addScaledVector(this.up, lensY)
		camera.updateMatrixWorld()
		const halfHeight = c.distance * Math.tan(fov / 2)
		const shear = projectionShear({
			lensX,
			lensY,
			halfWidth: halfHeight * camera.aspect,
			halfHeight,
			jitterX: sample.jitterX,
			jitterY: sample.jitterY,
			widthPx: size.width,
			heightPx: size.height,
		})
		const e = camera.projectionMatrix.elements
		e[8] += shear.x
		e[9] += shear.y
		camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
	}
}
