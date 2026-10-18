// Compares a set of captures with a baseline (docs/QUALITY.md): pairs the
// PNGs of the two folders by their relative path, measures each pair
// (compareImages() in scripts/lib/png.mjs), writes the difference images, a
// report and a contact sheet with the worst pairs first, and fails when a
// pair strays past the thresholds or a baseline image has no counterpart.
//
// Usage: pnpm compare --baseline <dir> --candidate <dir> [--out <dir>]
//                     [--psnr 50] [--within 2] [--share 0.999] [--bias 0.5]
//                     [--cluster 2]
// A pair passes with PSNR ≥ --psnr, at least --share of the pixels within
// --within (8-bit) on every channel, no tile whose mean luminance moved by
// more than --bias, and no cluster of outliers (a channel off by more than
// 16) larger than --cluster pixels.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { compareImages, decodePng, encodePng } from './lib/png.mjs'

const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const { values: options } = parseArgs({
	args,
	options: {
		baseline: { type: 'string' },
		candidate: { type: 'string' },
		out: { type: 'string' },
		psnr: { type: 'string', default: '50' },
		within: { type: 'string', default: '2' },
		share: { type: 'string', default: '0.999' },
		bias: { type: 'string', default: '0.5' },
		cluster: { type: 'string', default: '2' },
	},
})
if (!options.baseline || !options.candidate) {
	console.error('Usage: pnpm compare --baseline <dir> --candidate <dir> [--out <dir>]')
	process.exit(2)
}
const baselineDir = resolve(options.baseline)
const candidateDir = resolve(options.candidate)
const outDir = resolve(options.out ?? join(candidateDir, 'compare'))
const limits = {
	psnr: Number(options.psnr),
	within: Number(options.within),
	share: Number(options.share),
	bias: Number(options.bias),
	cluster: Number(options.cluster),
}

function pngs(dir) {
	const found = []
	const walk = (path) => {
		for (const name of readdirSync(path)) {
			const full = join(path, name)
			if (full === outDir) continue
			if (statSync(full).isDirectory()) walk(full)
			else if (name.endsWith('.png') && name !== 'contact-sheet.png') found.push(full)
		}
	}
	walk(dir)
	return found.map((path) => relative(dir, path)).sort()
}

function verdict(metrics) {
	const reasons = []
	if (metrics.psnr < limits.psnr) reasons.push(`PSNR ${metrics.psnr.toFixed(1)} < ${limits.psnr}`)
	const share = 1 - metrics.over[limits.within]
	if (!(limits.within in metrics.over))
		reasons.push(`--within ${limits.within} is not a measured threshold`)
	else if (share < limits.share)
		reasons.push(`${(share * 100).toFixed(3)}% within ${limits.within} < ${limits.share * 100}%`)
	if (Math.abs(metrics.tileBias.max) > limits.bias)
		reasons.push(
			`tile bias ${metrics.tileBias.max.toFixed(2)} at ${metrics.tileBias.x},${metrics.tileBias.y}`,
		)
	if (metrics.outliers.largest > limits.cluster)
		reasons.push(`outlier cluster of ${metrics.outliers.largest} px`)
	return reasons
}

mkdirSync(outDir, { recursive: true })
const results = []
for (const file of pngs(baselineDir)) {
	const candidatePath = join(candidateDir, file)
	if (!existsSync(candidatePath)) {
		results.push({ file, pass: false, reasons: ['missing in the candidate'] })
		continue
	}
	const candidate = decodePng(candidatePath)
	const baseline = decodePng(join(baselineDir, file))
	const metrics = compareImages(baseline, candidate, { maps: true })
	if (!metrics) {
		results.push({ file, pass: false, reasons: ['sizes differ'] })
		continue
	}
	const { maps, ...measured } = metrics
	const stem = file.replace(/\.png$/, '')
	const images = {}
	for (const [name, pixels] of Object.entries(maps)) {
		const path = join(outDir, `${stem}--${name}.png`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, encodePng(metrics.width, metrics.height, pixels))
		images[name] = relative(outDir, path)
	}
	const reasons = verdict(measured)
	results.push({ file, pass: reasons.length === 0, reasons, metrics: measured, images })
}

results.sort((a, b) => (a.metrics?.psnr ?? -1) - (b.metrics?.psnr ?? -1))
const failed = results.filter((result) => !result.pass)
writeFileSync(
	join(outDir, 'compare-report.json'),
	// JSON has no Infinity: identical images report their PSNR as "Infinity".
	JSON.stringify(
		{ baseline: baselineDir, candidate: candidateDir, limits, results },
		(_key, value) => (value === Infinity ? 'Infinity' : value),
		2,
	),
)

const image = (path, caption) =>
	`<figure><img src="${path}" loading="lazy"><figcaption>${caption}</figcaption></figure>`
const rows = results
	.map((result) => {
		const header = `<h2 class="${result.pass ? 'pass' : 'fail'}">${result.file} — ${
			result.pass ? 'pass' : result.reasons.join('; ')
		}</h2>`
		if (!result.metrics) return header
		const m = result.metrics
		const summary = `<p>PSNR ${m.psnr.toFixed(2)} dB · max ${m.maxDiff} · over 1/2/4/16: ${[
			1, 2, 4, 16,
		]
			.map((k) => `${(m.over[k] * 100).toFixed(3)}%`)
			.join(
				' / ',
			)} · tile bias ${m.tileBias.max.toFixed(2)} · outliers ${m.outliers.pixels} px in ${
			m.outliers.clusters
		} (largest ${m.outliers.largest})</p>`
		const strip = [
			image(relative(outDir, join(baselineDir, result.file)), 'baseline'),
			image(relative(outDir, join(candidateDir, result.file)), 'candidate'),
			image(result.images.diff16, '|Δ| × 16'),
			image(result.images.diff64, '|Δ| × 64'),
			image(result.images.signed, 'luminance Δ × 16 (red brighter, blue darker)'),
			image(result.images.tiles, 'tile bias × 64'),
			image(result.images.outliers, 'outliers (> 16)'),
		].join('')
		return `${header}${summary}<div class="strip">${strip}</div>`
	})
	.join('\n')
writeFileSync(
	join(outDir, 'contact-sheet.html'),
	`<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;color:#ccc;font:13px system-ui;padding:12px}
h2{font-size:14px;margin:18px 0 4px}.pass{color:#8c8}.fail{color:#e88}p{margin:0 0 6px}
.strip{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
figure{margin:0}img{width:100%;display:block;image-rendering:pixelated}figcaption{padding:2px 0}
</style>${rows}`,
)

for (const result of results) {
	const m = result.metrics
	const line = m
		? `PSNR ${m.psnr.toFixed(2)} dB, max ${m.maxDiff}, ${(m.over[2] * 100).toFixed(3)}% over 2`
		: ''
	console.log(`${result.pass ? 'pass' : 'FAIL'} ${result.file} ${line}`)
	for (const reason of result.reasons) console.log(`     ${reason}`)
}
console.log(`Report: ${join(outDir, 'compare-report.json')}`)
if (failed.length > 0) process.exitCode = 1
