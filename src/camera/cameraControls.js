// Pointer controls that edit params.camera directly (the params stay the single
// source of truth): drag orbits, shift- or right-drag pans the target, the
// wheel changes the focus distance (and with it the magnification).
import { setValue } from '../params/params'

const ORBIT_DEGREES_PER_PIXEL = 0.12
const ZOOM_PER_WHEEL_UNIT = 0.0012

export default class CameraControls {
	constructor(element, schema, params, onChange) {
		this.element = element
		this.schema = schema
		this.params = params
		this.onChange = onChange
		this.pointer = null
		this.handleDown = this.handleDown.bind(this)
		this.handleMove = this.handleMove.bind(this)
		this.handleUp = this.handleUp.bind(this)
		this.handleWheel = this.handleWheel.bind(this)
		element.addEventListener('pointerdown', this.handleDown)
		element.addEventListener('pointermove', this.handleMove)
		element.addEventListener('pointerup', this.handleUp)
		element.addEventListener('pointercancel', this.handleUp)
		element.addEventListener('wheel', this.handleWheel, { passive: false })
		element.addEventListener('contextmenu', (event) => event.preventDefault())
	}

	set(path, value) {
		setValue(this.schema, this.params, path, value)
	}

	handleDown(event) {
		this.element.setPointerCapture(event.pointerId)
		this.pointer = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			pan: event.shiftKey || event.button === 2,
		}
	}

	handleMove(event) {
		if (!this.pointer || event.pointerId !== this.pointer.id) return
		const dx = event.clientX - this.pointer.x
		const dy = event.clientY - this.pointer.y
		this.pointer.x = event.clientX
		this.pointer.y = event.clientY
		const camera = this.params.camera
		if (this.pointer.pan) {
			// Millimeters per CSS pixel at the focus plane: the sensor height over
			// the magnification f / (s - f), spread over the canvas height.
			const scale =
				(camera.sensorHeight * (camera.distance - camera.focalLength)) /
				(camera.focalLength * this.element.clientHeight)
			this.set('camera.targetX', camera.targetX - dx * scale)
			this.set('camera.targetY', camera.targetY + dy * scale)
		} else {
			this.set('camera.azimuth', camera.azimuth - dx * ORBIT_DEGREES_PER_PIXEL)
			this.set('camera.elevation', camera.elevation + dy * ORBIT_DEGREES_PER_PIXEL)
		}
		this.onChange()
	}

	handleUp(event) {
		if (this.pointer?.id === event.pointerId) this.pointer = null
	}

	handleWheel(event) {
		event.preventDefault()
		const camera = this.params.camera
		this.set('camera.distance', camera.distance * Math.exp(event.deltaY * ZOOM_PER_WHEEL_UNIT))
		this.onChange()
	}
}
