// The site's icons and social image, rendered by the app itself in headless
// Chrome (docs/DEVELOPMENT.md): the default eye's iris seen from the front,
// cut to a circle, as the favicon and the touch icon, and the opening desktop
// scene as the Open Graph image. Writes into public/.
//
// Usage: pnpm brand [--samples 128] [--no-build] [--chrome <path>]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { connect, launchChrome, waitFor } from './lib/chrome.mjs'
import { build, serve } from './lib/serve.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const { values: options } = parseArgs({
	args,
	options: {
		samples: { type: 'string', default: '128' },
		'no-build': { type: 'boolean', default: false },
		chrome: { type: 'string' },
	},
})

// The iris from the front: a still eye looking down the camera's axis, in a
// deep focus, without the lids, lashes and tear meniscus along them, which
// would cover its top. The icons are cut to a circle `ring` times the limbus,
// a thin rim of sclera.
const ICON = {
	size: 1024,
	ring: 1.06,
	state: {
		camera: {
			focalLength: 100,
			azimuth: 0,
			elevation: 0,
			distance: 160,
			fNumber: 16,
			targetX: 0,
			targetY: 0,
			targetZ: 0,
		},
		animation: { enabled: false, yaw: 0, pitch: 0 },
	},
	setup: ['lids.mesh', 'lashes.mesh', 'tearFilm.meniscus', 'tearFilm.bubbles']
		.map((mesh) => `app.${mesh}.visible = false`)
		.join(';'),
}
// The Open Graph image: the opening scene of a desktop window of its shape,
// rendered at twice its size.
const OG = { width: 1200, height: 630, scale: 2 }

const children = []
const work = mkdtempSync(join(tmpdir(), 'eye-brand-'))

// Renders `query` until the photo converges, after `setup` (code on `app`,
// the EyeApp of ?debug); returns the PNG data URL.
async function render(session, baseUrl, viewport, query, setup = '') {
	await session.setViewport(viewport)
	await session.navigate(`${baseUrl}?${new URLSearchParams(query)}&debug`)
	await waitFor(async () => await session.evaluate('!!window.__EYE_APP__'), 'the app', 60000)
	await session.evaluate(`(() => { const app = window.__EYE_APP__; ${setup}; app.invalidate() })()`)
	await waitFor(
		async () =>
			await session.evaluate(
				'window.__EYE__.getCompileMs() !== null && window.__EYE__.getAccumulation().converged',
			),
		'the render to converge',
		600000,
	)
	if (session.errors.length > 0) throw new Error(session.errors.join('\n'))
	return session.evaluate('window.__EYE__.capture()')
}

// The limbus on screen (pixels of the drawing buffer): its center and its
// largest radius, from the pinhole camera of the frame.
function limbus(session) {
	return session.evaluate(`(() => {
		const app = window.__EYE_APP__
		const size = app.setup.getDrawingBufferSize()
		const camera = app.physicalCamera.camera
		app.physicalCamera.update(app.params, app.eye, app.focusDepth, size, null, app.framing)
		camera.updateMatrixWorld()
		const radius = app.eye.limbusRadius
		const z = app.eye.surfaceZ(radius)
		const point = camera.position.clone()
		const screen = (x, y) => {
			point.set(x, y, z).applyMatrix4(app.eyeRig.eyeToWorld).project(camera)
			return [(point.x + 1) / 2 * size.width, (1 - point.y) / 2 * size.height]
		}
		const [cx, cy] = screen(0, 0)
		let r = 0
		for (let i = 0; i < 64; i++) {
			const [x, y] = screen(radius * Math.cos(i * Math.PI / 32), radius * Math.sin(i * Math.PI / 32))
			r = Math.max(r, Math.hypot(x - cx, y - cy))
		}
		return { x: cx, y: cy, r }
	})()`)
}

// Scales `dataUrl` in the page (halving with high-quality smoothing, then the
// last step), optionally cropped to `rect` (pixels) and cut to a circle with
// a soft edge. Returns a data URL of `type`.
function resample(
	session,
	dataUrl,
	{ width, height, rect = null, circle = false, type = 'image/png' },
) {
	return session.evaluate(`(async () => {
		const image = new Image()
		image.src = ${JSON.stringify(dataUrl)}
		await image.decode()
		const rect = ${JSON.stringify(rect)} ?? { x: 0, y: 0, w: image.width, h: image.height }
		let source = document.createElement('canvas')
		source.width = Math.round(rect.w)
		source.height = Math.round(rect.h)
		source.getContext('2d').drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, source.width, source.height)
		while (source.width / 2 >= ${width}) {
			const half = document.createElement('canvas')
			half.width = Math.round(source.width / 2)
			half.height = Math.round(source.height / 2)
			const context = half.getContext('2d')
			context.imageSmoothingQuality = 'high'
			context.drawImage(source, 0, 0, half.width, half.height)
			source = half
		}
		const out = document.createElement('canvas')
		out.width = ${width}
		out.height = ${height}
		const context = out.getContext('2d')
		context.imageSmoothingQuality = 'high'
		context.drawImage(source, 0, 0, ${width}, ${height})
		if (${circle}) {
			context.globalCompositeOperation = 'destination-in'
			context.beginPath()
			context.arc(${width} / 2, ${height} / 2, ${width} / 2, 0, Math.PI * 2)
			context.fill()
		}
		return out.toDataURL(${JSON.stringify(type)}, 0.9)
	})()`)
}

const bytes = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

// An .ico holding PNG images (Vista and later read them).
function ico(pngs) {
	const header = Buffer.alloc(6)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(pngs.length, 4)
	let offset = 6 + 16 * pngs.length
	const entries = pngs.map(({ size, data }) => {
		const entry = Buffer.alloc(16)
		entry.writeUInt8(size % 256, 0)
		entry.writeUInt8(size % 256, 1)
		entry.writeUInt16LE(1, 4)
		entry.writeUInt16LE(32, 6)
		entry.writeUInt32LE(data.length, 8)
		entry.writeUInt32LE(offset, 12)
		offset += data.length
		return entry
	})
	return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)])
}

try {
	let baseUrl
	if (options['no-build']) {
		baseUrl = await serve(root, join(root, 'dist'), children)
	} else {
		const dist = join(work, 'dist')
		console.log('Building...')
		build(root, dist)
		baseUrl = await serve(root, dist, children)
	}
	const viewport = { width: ICON.size, height: ICON.size }
	const port = await launchChrome({ work, viewport, chrome: options.chrome, children })
	const session = await connect(port, viewport)
	const photo = options.samples

	console.log('Rendering the iris...')
	const state = Buffer.from(JSON.stringify(ICON.state)).toString('base64url')
	const iris = await render(
		session,
		baseUrl,
		viewport,
		{ gui: '0', photo, dpr: '1', state },
		ICON.setup,
	)
	const { x, y, r } = await limbus(session)
	const side = 2 * r * ICON.ring
	const rect = { x: x - side / 2, y: y - side / 2, w: side, h: side }
	const icon = (size, circle = true) =>
		resample(session, iris, { width: size, height: size, rect, circle })
	const favicons = []
	for (const size of [16, 32, 48]) favicons.push({ size, data: bytes(await icon(size)) })
	writeFileSync(join(root, 'public/favicon.ico'), ico(favicons))
	writeFileSync(join(root, 'public/icon-192.png'), bytes(await icon(192)))
	// iOS fills a transparent touch icon with black: this one keeps the square.
	writeFileSync(join(root, 'public/apple-touch-icon.png'), bytes(await icon(180, false)))

	console.log('Rendering the opening scene...')
	const scene = await render(
		session,
		baseUrl,
		{ width: OG.width, height: OG.height, dpr: OG.scale },
		{ gui: '0', photo, dpr: String(OG.scale) },
	)
	const og = await resample(session, scene, {
		width: OG.width,
		height: OG.height,
		type: 'image/jpeg',
	})
	writeFileSync(join(root, 'public/og-image.jpg'), bytes(og))
	console.log('Wrote public/favicon.ico, icon-192.png, apple-touch-icon.png, og-image.jpg')
	session.close()
} finally {
	// Chrome writes its profile until it exits.
	const exited = (child) =>
		child.exitCode !== null || child.signalCode !== null
			? Promise.resolve()
			: new Promise((done) => child.once('exit', done))
	await Promise.all(
		children.map((child) => {
			const done = exited(child)
			child.kill()
			return done
		}),
	)
	rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
