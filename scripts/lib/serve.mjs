// Production build and `vite preview` server for the browser scripts.
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { getFreePort, waitFor } from './chrome.mjs'

export function build(root, outDir) {
	execFileSync(
		process.execPath,
		[
			join(root, 'node_modules/vite/bin/vite.js'),
			'build',
			'--outDir',
			outDir,
			'--emptyOutDir',
			'--logLevel',
			'error',
		],
		{ cwd: root, stdio: 'inherit' },
	)
}

export async function serve(root, outDir, children) {
	const port = await getFreePort()
	const child = spawn(
		process.execPath,
		[
			join(root, 'node_modules/vite/bin/vite.js'),
			'preview',
			'--outDir',
			outDir,
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort',
		],
		{ cwd: root, stdio: 'ignore' },
	)
	children.push(child)
	const url = `http://127.0.0.1:${port}/`
	await waitFor(async () => (await fetch(url)).ok, `vite preview on port ${port}`)
	return url
}
