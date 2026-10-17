// Visual check (docs/QUALITY.md): builds the app, serves it, and renders each
// requested preset in headless Chrome until its photo accumulation converges,
// then saves the image, a contact sheet next to the reference photographs,
// and a report with timings and console errors (which fail the run).
//
// Usage: pnpm capture [--presets a,b|all] [--views beauty,normals] [--samples 64]
//                     [--width 1600] [--height 1000] [--dpr 1] [--out captures]
//                     [--query extra=1] [--hash debug] [--bench <frames>] [--no-build]
//                     [--chrome <path>]
// --hash debug renders as #debug does: the skin evaluates its relief per pixel
// instead of reading it baked.
// --bench also renders that many interactive frames per shot, each finished
// with a synchronous read, and reports the time per frame and the compile time.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { connect, launchChrome, waitFor } from './lib/chrome.mjs'
import { build, serve } from './lib/serve.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const { values: options } = parseArgs({
	args,
	options: {
		presets: { type: 'string', default: 'default' },
		views: { type: 'string', default: 'beauty' },
		samples: { type: 'string', default: '64' },
		width: { type: 'string', default: '1600' },
		height: { type: 'string', default: '1000' },
		dpr: { type: 'string', default: '1' },
		out: { type: 'string', default: 'captures' },
		query: { type: 'string', default: '' },
		hash: { type: 'string', default: '' },
		'no-build': { type: 'boolean', default: false },
		chrome: { type: 'string' },
		timeout: { type: 'string', default: '600' },
		bench: { type: 'string', default: '0' },
	},
})

const viewport = {
	width: Number(options.width),
	height: Number(options.height),
	dpr: Number(options.dpr),
}
const outDir = resolve(root, options.out)
mkdirSync(outDir, { recursive: true })
const children = []
const work = mkdtempSync(join(tmpdir(), 'eye-capture-'))

const REFERENCES = [
	'eye-01.jpg',
	'eye-02.jpg',
	'eye-03.png',
	'eye-04.jpg',
	'eye-05.jpg',
	'eye-06.jpg',
	'eye-07.avif',
	'eye-08.avif',
	'eye-09.jpg',
]

function contactSheet(shots) {
	const ref = (name) => relative(outDir, join(root, 'references', name))
	const cards = shots
		.map(
			(shot) =>
				`<figure><img src="${shot.file}"><figcaption>${shot.label}${shot.references?.length ? ` · ref ${shot.references.join(', ')}` : ''}</figcaption></figure>`,
		)
		.join('\n')
	const refs = REFERENCES.map(
		(name) =>
			`<figure class="ref"><img src="${ref(name)}"><figcaption>${name}</figcaption></figure>`,
	).join('\n')
	return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;color:#ccc;font:13px system-ui;padding:12px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.refs{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}
figure{margin:0}img{width:100%;display:block}figcaption{padding:4px 0}
.ref img{height:170px;object-fit:cover}
</style><div class="grid">${cards}</div><div class="refs">${refs}</div>`
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
	const port = await launchChrome({ work, viewport, chrome: options.chrome, children })
	const session = await connect(port, viewport)
	const presetNames =
		options.presets === 'all'
			? await (async () => {
					await session.navigate(`${baseUrl}?gui=0&photo=1`)
					await waitFor(async () => await session.evaluate('!!window.__EYE__'), 'the app')
					return JSON.parse(
						await session.evaluate('JSON.stringify(window.__EYE__.getPresetNames())'),
					)
				})()
			: options.presets.split(',')
	const views = options.views.split(',')
	const shots = []
	const report = { viewport, samples: Number(options.samples), shots: [] }
	let failed = false
	for (const preset of presetNames) {
		for (const view of views) {
			const query = new URLSearchParams({
				preset,
				gui: '0',
				photo: options.samples,
				dpr: options.dpr,
			})
			if (view !== 'beauty') query.set('view', view)
			for (const [key, value] of new URLSearchParams(options.query)) query.set(key, value)
			const started = Date.now()
			await session.navigate(`${baseUrl}?${query}${options.hash ? `#${options.hash}` : ''}`)
			await waitFor(async () => await session.evaluate('!!window.__EYE__'), 'the app', 60000)
			await waitFor(
				async () => await session.evaluate('window.__EYE__.getAccumulation().converged'),
				`${preset}/${view} to converge`,
				Number(options.timeout) * 1000,
			)
			const dataUrl = await session.evaluate('window.__EYE__.capture()')
			const file = `${preset}${view === 'beauty' ? '' : `--${view}`}.png`
			writeFileSync(
				join(outDir, file),
				Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
			)
			const stats = JSON.parse(
				await session.evaluate('JSON.stringify(window.__EYE__.getRenderStats())'),
			)
			const benchFrames = Number(options.bench)
			const bench =
				benchFrames > 0
					? JSON.parse(
							await session.evaluate(`JSON.stringify(window.__EYE__.measureSync(${benchFrames}))`),
						)
					: null
			const info = JSON.parse(
				(await session.evaluate(
					`JSON.stringify(window.__EYE__.getPresetInfo(${JSON.stringify(preset)}))`,
				)) ?? 'null',
			)
			const seconds = (Date.now() - started) / 1000
			const entry = {
				preset,
				view,
				file,
				seconds,
				cpuFrameMs: stats.cpu?.p50 ?? null,
				frameIntervalMs: stats.frame?.p50 ?? null,
				compileMs: await session.evaluate('window.__EYE__.getCompileMs()'),
				skinBakeMs: await session.evaluate('window.__EYE__.getSkinBakeMs()'),
				benchFrameMs: bench,
				errors: [...session.errors],
			}
			report.shots.push(entry)
			shots.push({
				file,
				label: `${preset} / ${view} (${seconds.toFixed(1)} s)`,
				references: info?.references,
			})
			const benchFrame = bench
				? `, frame median ${bench.medianMs} ms (min ${bench.minMs}, max ${bench.maxMs})`
				: ''
			console.log(
				`  ${file}: ${seconds.toFixed(1)} s, compile ${Math.round(entry.compileMs)} ms${benchFrame}`,
			)
			for (const error of session.errors) {
				failed = true
				console.log(`    error: ${error}`)
			}
		}
	}
	writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
	const sheetPath = join(outDir, 'contact-sheet.html')
	writeFileSync(sheetPath, contactSheet(shots))
	// Screenshot of the sheet itself.
	const sheetSize = { width: 1600, height: 900 + Math.ceil(shots.length / 2) * 520 }
	await session.setViewport(sheetSize)
	await session.navigate(pathToFileURL(sheetPath).href)
	await waitFor(
		async () => await session.evaluate('[...document.images].every((image) => image.complete)'),
		'the contact sheet images',
	)
	const { result } = await session.send('Page.captureScreenshot', {
		format: 'png',
		captureBeyondViewport: true,
	})
	writeFileSync(join(outDir, 'contact-sheet.png'), Buffer.from(result.data, 'base64'))
	console.log(`Contact sheet: ${join(outDir, 'contact-sheet.png')}`)
	session.close()
	if (failed) process.exitCode = 1
} finally {
	for (const child of children) child.kill()
	rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
