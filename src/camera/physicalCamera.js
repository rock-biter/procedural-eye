// The macro camera: placed from params.camera around a target on the apparent
// iris plane, with the field of view of a thin lens focused at that distance
// (it narrows as the focus gets closer, like a real macro lens). For
// accumulation samples it moves across the aperture and shears the frustum so
// the focus plane stays put (src/camera/cameraOptics.js): averaging the
// samples gives the true depth of field, reflections and refraction included.
import { MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { gazeQuaternion } from '../animation/gaze'
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
		// The camera of the frame before the sample's lens and pixel jitter:
		// world matrix, view and projection (src/render/dustPass.js).
		this.pinhole = { matrixWorld: new Matrix4(), view: new Matrix4(), projection: new Matrix4() }
		// { azimuth, elevation } in degrees, added to params.camera's.
		this.orbitOffset = { azimuth: 0, elevation: 0 }
	}

	// `focusDepth`: depth of the apparent iris behind the corneal apex (the
	// entrance pupil); `sample`: an accumulationSample() or null; `size`: the
	// drawing-buffer size in pixels; `framing`: the eye's settled line of sight
	// (yaw, pitch in degrees, src/animation/animator.js). The camera aims and
	// focuses on the entrance pupil turned that way about the globe's center
	// (the world origin, src/eye/eyeRig.js), so the iris stays framed and sharp
	// when the eye turns.
	update(params, eye, focusDepth, size, sample = null, framing = { yaw: 0, pitch: 0 }) {
		const c = params.camera
		const camera = this.camera
		this.rotation.fromArray(gazeQuaternion(framing.yaw, framing.pitch))
		this.framed.set(0, 0, eye.apexZ - focusDepth).applyQuaternion(this.rotation)
		this.target.set(c.targetX, c.targetY, c.targetZ).add(this.framed)
		const [x, y, z] = sphericalDirection(
			c.azimuth + this.orbitOffset.azimuth,
			c.elevation + this.orbitOffset.elevation,
		)
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
		this.pinhole.matrixWorld.copy(camera.matrixWorld)
		this.pinhole.view.copy(camera.matrixWorldInverse)
		this.pinhole.projection.copy(camera.projectionMatrix)
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
