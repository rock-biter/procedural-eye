import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	apertureRadius,
	circleOfConfusion,
	depthOfField,
	imageDistance,
	magnification,
	projectionShear,
	verticalFov,
} from '../src/camera/cameraOptics'
import { accumulationSample, concentricDisk, halton } from '../src/camera/lensSampling'

const close = (a, b, tolerance, label) =>
	assert.ok(Math.abs(a - b) < tolerance, `${label ?? ''} ${a} vs ${b}`)

test('1:1 macro: focus at 2f images at 2f with unit magnification', () => {
	close(imageDistance(100, 200), 200, 1e-9)
	close(magnification(100, 200), 1, 1e-12)
	// The field narrows as the focus gets closer (focus breathing).
	assert.ok(verticalFov(100, 200, 24) < verticalFov(100, 1000, 24))
	close(apertureRadius(100, 8), 6.25, 1e-12)
})

test('blur circle: zero at focus, signed, and the macro depth of field is about a millimeter', () => {
	close(circleOfConfusion(100, 8, 200, 200), 0, 1e-12)
	assert.ok(circleOfConfusion(100, 8, 200, 190) < 0)
	assert.ok(circleOfConfusion(100, 8, 200, 210) > 0)
	// f/8 at 1:1 with a 0.03 mm acceptable circle: 2·N·c·(m+1)/m² ≈ 0.96 mm.
	close(depthOfField(100, 8, 200, 0.03), 0.96, 0.02, 'dof')
})

test('the lens-shift shear keeps the focus plane fixed and moves everything else', () => {
	const focus = 200
	const fov = verticalFov(100, focus, 24)
	const aspect = 1.5
	const t = Math.tan(fov / 2)
	const halfHeight = focus * t
	const halfWidth = halfHeight * aspect
	const project = ([x, y, z], shear = { x: 0, y: 0 }) => [
		(x / (aspect * t) + shear.x * z) / -z,
		(y / t + shear.y * z) / -z,
	]
	const lens = { lensX: 3, lensY: -2 }
	const shear = projectionShear({ ...lens, halfWidth, halfHeight })
	const moved = ([x, y, z]) => [x - lens.lensX, y - lens.lensY, z]
	for (const p of [
		[0, 0, -focus],
		[5, -3, -focus],
		[-9, 7, -focus],
	]) {
		const a = project(p)
		const b = project(moved(p), shear)
		close(a[0], b[0], 1e-12, 'x')
		close(a[1], b[1], 1e-12, 'y')
	}
	const off = [5, -3, -focus + 10]
	assert.ok(Math.abs(project(off)[0] - project(moved(off), shear)[0]) > 1e-3)
	// A one-pixel jitter moves the image by one pixel (2 / width in NDC).
	const jitter = projectionShear({
		halfWidth,
		halfHeight,
		jitterX: 1,
		widthPx: 1000,
		heightPx: 600,
	})
	close(Math.abs(project([5, -3, -focus], jitter)[0] - project([5, -3, -focus])[0]), 0.002, 1e-12)
})

test('Halton and concentric disk samples stay in range and are well spread', () => {
	assert.equal(halton(1, 2), 0.5)
	assert.equal(halton(3, 2), 0.75)
	let sumX = 0
	let sumY = 0
	for (let i = 0; i < 256; i++) {
		const s = accumulationSample(i)
		assert.ok(Math.abs(s.jitterX) <= 0.5 && Math.abs(s.jitterY) <= 0.5)
		assert.ok(Math.hypot(s.lensX, s.lensY) <= 1 + 1e-12)
		sumX += s.lensX
		sumY += s.lensY
	}
	close(sumX / 256, 0, 0.02)
	close(sumY / 256, 0, 0.02)
	close(Math.hypot(...concentricDisk(1, 0.5)), 1, 1e-12)
})
