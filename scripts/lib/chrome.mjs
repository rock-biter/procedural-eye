// Headless Chrome over the DevTools protocol (Node 22+ global WebSocket), as
// in the terrain project's bench: launch, one page session, console capture.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

export function findChrome(explicit) {
	const candidates = [
		explicit,
		process.env.CHROME_PATH,
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	]
	const found = candidates.find((path) => path && existsSync(path))
	if (!found) throw new Error('Chrome not found: pass --chrome <path> or set CHROME_PATH.')
	return found
}

export function getFreePort() {
	return new Promise((done, fail) => {
		const server = createServer()
		server.on('error', fail)
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address()
			server.close(() => done(port))
		})
	})
}

export async function waitFor(check, what, timeoutMs = 60000) {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		try {
			if (await check()) return
		} catch {
			// Not up yet.
		}
		await sleep(100)
	}
	throw new Error(`Timed out waiting for ${what}`)
}

export async function launchChrome({ work, viewport, chrome, children }) {
	const port = await getFreePort()
	const child = spawn(
		findChrome(chrome),
		[
			'--headless=new',
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${join(work, 'chrome')}`,
			'--ignore-gpu-blocklist',
			'--enable-unsafe-swiftshader',
			'--disable-gpu-vsync',
			'--disable-frame-rate-limit',
			`--window-size=${viewport.width},${viewport.height}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--allow-file-access-from-files',
			'about:blank',
		],
		{ stdio: 'ignore' },
	)
	children.push(child)
	await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok, 'Chrome')
	return port
}

// One CDP session on the browser's first page, collecting console errors.
export async function connect(port, viewport) {
	const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
	const socket = new WebSocket(
		targets.find((target) => target.type === 'page').webSocketDebuggerUrl,
	)
	await new Promise((done) => socket.addEventListener('open', done, { once: true }))
	let nextId = 0
	const pending = new Map()
	const session = { errors: [], warnings: [] }
	socket.addEventListener('message', ({ data }) => {
		const message = JSON.parse(data)
		if (message.id && pending.has(message.id)) {
			pending.get(message.id)(message)
			pending.delete(message.id)
		} else if (message.method === 'Runtime.consoleAPICalled') {
			const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
			if (message.params.type === 'error') session.errors.push(text.slice(0, 2000))
			if (message.params.type === 'warning') session.warnings.push(text.slice(0, 500))
		} else if (message.method === 'Runtime.exceptionThrown') {
			const details = message.params.exceptionDetails
			session.errors.push(details.exception?.description ?? details.text)
		}
	})
	session.send = (method, params = {}) => {
		const id = ++nextId
		socket.send(JSON.stringify({ id, method, params }))
		return new Promise((done) => pending.set(id, done))
	}
	session.evaluate = async (expression) =>
		(
			await session.send('Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true,
			})
		).result?.result?.value
	session.setViewport = (size) =>
		session.send('Emulation.setDeviceMetricsOverride', {
			width: size.width,
			height: size.height,
			deviceScaleFactor: size.dpr ?? 1,
			mobile: false,
		})
	session.navigate = async (url) => {
		session.errors.length = 0
		session.warnings.length = 0
		await session.send('Page.navigate', { url })
	}
	session.close = () => socket.close()
	await session.send('Runtime.enable')
	await session.send('Page.enable')
	await session.setViewport(viewport)
	return session
}
