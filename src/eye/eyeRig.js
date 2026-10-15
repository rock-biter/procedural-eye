// The eye's transform hierarchy: `pivot` sits at the center of rotation (about
// 13.5 mm behind the corneal apex) and carries the gaze rotation; `eyeSpace`,
// its child, puts the globe center at the world origin in primary gaze. Eye
// meshes are built in eye space and parented to `eyeSpace`.
import { Group, Matrix4, Quaternion, Vector3 } from 'three'

// Distance of the center of rotation behind the corneal apex.
export const ROTATION_CENTER_DEPTH = 13.5

export default class EyeRig {
	constructor() {
		this.pivot = new Group()
		this.pivot.name = 'EyePivot'
		this.eyeSpace = new Group()
		this.eyeSpace.name = 'EyeSpace'
		this.pivot.add(this.eyeSpace)
		this.worldToEye = new Matrix4()
		this.eyeToWorld = new Matrix4()
		this.rotation = new Quaternion()
	}

	// New profile: the center of rotation follows the apex.
	setGeometry(eye) {
		const center = eye.apexZ - ROTATION_CENTER_DEPTH
		this.pivot.position.set(0, 0, center)
		this.eyeSpace.position.set(0, 0, -center)
	}

	setGaze(quaternion) {
		this.pivot.quaternion.copy(quaternion)
	}

	updateMatrices() {
		this.pivot.updateMatrixWorld(true)
		this.eyeToWorld.copy(this.eyeSpace.matrixWorld)
		this.worldToEye.copy(this.eyeToWorld).invert()
	}

	toEye(worldPoint, target = new Vector3()) {
		return target.copy(worldPoint).applyMatrix4(this.worldToEye)
	}
}
