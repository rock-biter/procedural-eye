// The eye's transform hierarchy: `pivot` sits at the globe's center (the world
// origin) and carries the gaze rotation; `eyeSpace`, its child, holds the eye
// meshes, built in eye space. The eye turns about the center of its sclera
// sphere, not about the measured center of rotation a little further back
// (13.5 mm behind the apex): the conjunctiva, the margins' support and the
// tear meniscus are built on the globe at rest and do not move, so the globe
// must turn in place under them (docs/OPTICS.md).
import { Group, Matrix4, Quaternion, Vector3 } from 'three'

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
