// Pointer controls that edit params.camera directly (the params stay the single
// source of truth): drag orbits, shift- or right-drag pans the target, the
// wheel changes the focus distance (and with it the magnification) within
// `distanceLimits`. An orbit coasts after the drag lets go, for
// `controls.inertia`. The mouse also turns the view a little toward itself
// (`controls.parallax` zoomed in, `controls.parallaxOut` zoomed out): a turn
// of the orbit kept in `parallax`, not in the params, which
// src/camera/physicalCamera.js adds to the camera's.
import { setValue } from '../params/params'
import { coast, follow, parallaxReach, RELEASE_WINDOW, releaseVelocity } from './orbitMotion'

const ORBIT_DEGREES_PER_PIXEL = 0.12
const ZOOM_PER_WHEEL_UNIT = 0.0012

export default class CameraControls {
	constructor(element, schema, params, onChange) {
		this.element = element
		this.schema = schema
		this.params = params
		this.onChange = onChange
		// () => [min, max] distances for the wheel, or null. Outside them, the
		// wheel only brings the camera back toward them. The parallax's reach
		// follows the zoom level between them.
		this.distanceLimits = null
		this.pointer = null
		// The coasting orbit's speed (deg/s), or null.
		this.velocity = null
		// The mouse over the window, [-1, 1] up and right; the parallax turn
		// (degrees) that follows it.
		this.mouse = { x: 0, y: 0 }
		this.parallax = { azimuth: 0, elevation: 0 }
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
		window.addEventListener('pointermove', (event) => {
			if (event.pointerType !== 'mouse') return
			this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
			this.mouse.y = 1 - (event.clientY / window.innerHeight) * 2
		})
		// A mouse that leaves the window lets the view settle back.
		document.addEventListener('mouseout', (event) => {
			if (event.relatedTarget === null) this.mouse.x = this.mouse.y = 0
		})
	}

	set(path, value) {
		setValue(this.schema, this.params, path, value)
	}

	// Stops a coasting orbit (a transition takes the camera).
	stop() {
		this.velocity = null
	}

	handleDown(event) {
		this.element.setPointerCapture(event.pointerId)
		this.velocity = null
		this.pointer = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			pan: event.shiftKey || event.button === 2,
			// The orbit after each move, for the release speed.
			track: [],
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
			const time = event.timeStamp / 1000
			const track = this.pointer.track
			track.push({ time, azimuth: camera.azimuth, elevation: camera.elevation })
			while (time - track[0].time > RELEASE_WINDOW) track.shift()
		}
		this.onChange()
	}

	handleUp(event) {
		if (this.pointer?.id !== event.pointerId) return
		if (!this.pointer.pan && this.params.controls.inertia > 0) {
			const velocity = releaseVelocity(this.pointer.track, event.timeStamp / 1000)
			if (velocity.azimuth !== 0 || velocity.elevation !== 0) this.velocity = velocity
		}
		this.pointer = null
	}

	handleWheel(event) {
		event.preventDefault()
		const camera = this.params.camera
		let distance = camera.distance * Math.exp(event.deltaY * ZOOM_PER_WHEEL_UNIT)
		if (this.distanceLimits) {
			const [min, max] = this.distanceLimits()
			const low = Math.min(min, camera.distance)
			const high = Math.max(max, camera.distance)
			distance = Math.min(Math.max(distance, low), high)
		}
		if (distance === camera.distance) return
		this.set('camera.distance', distance)
		this.onChange()
	}

	// Steps the coasting orbit and the parallax by `dt` seconds. `living`: the
	// parallax follows the mouse; otherwise (a still eye, photo mode) it
	// settles back to none, so the image that accumulates is params.camera's.
	// Returns whether the parallax moved.
	update(dt, living) {
		if (this.velocity) this.coast(dt)
		const { controls, camera } = this.params
		const amplitude = parallaxReach(controls, camera.distance, this.distanceLimits?.())
		const lag = controls.parallaxLag
		// Like a short drag from the center: the scene turns toward the mouse.
		const azimuth = living ? -this.mouse.x * amplitude : 0
		const elevation = living ? -this.mouse.y * amplitude : 0
		const p = this.parallax
		const moved = p.azimuth !== azimuth || p.elevation !== elevation
		p.azimuth = follow(p.azimuth, azimuth, dt, lag)
		p.elevation = follow(p.elevation, elevation, dt, lag)
		return moved
	}

	coast(dt) {
		const camera = this.params.camera
		const step = coast(this.velocity, dt, this.params.controls.inertia)
		const azimuth = camera.azimuth + step.azimuth
		const elevation = camera.elevation + step.elevation
		this.set('camera.azimuth', azimuth)
		this.set('camera.elevation', elevation)
		this.velocity = step.velocity
		// An orbit that reaches a limit stops along it.
		if (this.velocity && camera.azimuth !== azimuth) this.velocity.azimuth = 0
		if (this.velocity && camera.elevation !== elevation) this.velocity.elevation = 0
		this.onChange()
	}
}
