// The recorded sounds of the camera foley (docs/AUDIO.md): CC0 recordings
// from Freesound, cut, cleaned and normalized into src/audio/sounds/, with
// their credits. The manifest, scripts/sounds.json, names each source (its
// HQ preview, which downloads without an account) and each cut: `start` and
// `duration` (s), optional `highpass` (Hz, 40 by default), `gate` (dB below
// the peak under which the floor is pushed down), `fadeIn`/`fadeOut` (s),
// `peak` (dBFS, −1 by default) and `loop` (s of tail crossfaded into the head,
// written as WAV, whose decoders add no padding; the rest are MP3). A one-shot
// starts 2 ms before its 1 ms loudness first comes within 20 dB of its peak.
//
// Usage: pnpm sounds [--only <name>] — needs ffmpeg with libmp3lame on PATH.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const { values: options } = parseArgs({ args, options: { only: { type: 'string' } } })

const RATE = 44100
const cache = join(root, 'node_modules', '.cache', 'eye-sounds')
const out = join(root, 'src', 'audio', 'sounds')
const manifest = JSON.parse(readFileSync(join(root, 'scripts', 'sounds.json'), 'utf8'))
mkdirSync(cache, { recursive: true })
mkdirSync(out, { recursive: true })

async function source(name) {
	const { preview } = manifest.sources[name]
	const file = join(cache, preview.split('/').pop())
	if (!existsSync(file)) {
		const response = await fetch(preview)
		if (!response.ok) throw new Error(`${preview}: ${response.status}`)
		writeFileSync(file, Buffer.from(await response.arrayBuffer()))
	}
	const raw = execFileSync(
		'ffmpeg',
		['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
		{ maxBuffer: 1 << 30 },
	)
	return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

// RBJ second-order high-pass, Q 0.707.
function highpass(x, frequency) {
	const w = (2 * Math.PI * frequency) / RATE
	const alpha = Math.sin(w) / (2 * Math.SQRT1_2)
	const cos = Math.cos(w)
	const a0 = 1 + alpha
	const b0 = (1 + cos) / 2 / a0
	const b1 = -(1 + cos) / a0
	const a1 = (-2 * cos) / a0
	const a2 = (1 - alpha) / a0
	const y = new Float32Array(x.length)
	let x1 = 0
	let x2 = 0
	let y1 = 0
	let y2 = 0
	for (let i = 0; i < x.length; i++) {
		y[i] = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x[i]
		y2 = y1
		y1 = y[i]
	}
	return y
}

const peakOf = (x) => x.reduce((max, v) => Math.max(max, Math.abs(v)), 0)

// The first sample of the first 1 ms window whose RMS comes within 20 dB of
// the loudest window's.
function onset(x) {
	const size = Math.round(0.001 * RATE)
	const levels = []
	for (let i = 0; i + size <= x.length; i += size) {
		let sum = 0
		for (let j = i; j < i + size; j++) sum += x[j] * x[j]
		levels.push(Math.sqrt(sum / size))
	}
	const threshold = Math.max(...levels) * 10 ** (-20 / 20)
	return levels.findIndex((level) => level > threshold) * size
}

// Pushes the floor under `db` below the peak further down (an expander of
// ratio 3), following a 1 ms attack and 40 ms release envelope.
function gate(x, db) {
	const threshold = peakOf(x) * 10 ** (db / 20)
	const attack = Math.exp(-1 / (0.001 * RATE))
	const release = Math.exp(-1 / (0.04 * RATE))
	let envelope = 0
	return x.map((v) => {
		const level = Math.abs(v)
		envelope = level > envelope ? attack * envelope + (1 - attack) * level : release * envelope
		return envelope < threshold ? v * (envelope / threshold) ** 2 : v
	})
}

function fade(x, fadeIn, fadeOut) {
	const inLength = Math.round(fadeIn * RATE)
	const outLength = Math.round(fadeOut * RATE)
	for (let i = 0; i < inLength; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / inLength)
	for (let i = 0; i < outLength; i++)
		x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / outLength)
	return x
}

// The last `length` samples crossfaded (equal power) into the first, so the
// loop runs on from its last sample into its first without a step.
function loop(x, length) {
	const body = x.slice(0, x.length - length)
	for (let i = 0; i < length; i++) {
		const t = i / length
		body[i] =
			body[i] * Math.sin((Math.PI / 2) * t) + x[body.length + i] * Math.cos((Math.PI / 2) * t)
	}
	return body
}

function encode(x, file, wav) {
	const codec = wav ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-q:a', '2']
	execFileSync(
		'ffmpeg',
		[
			...['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-'],
			...codec,
			file,
		],
		{ input: Buffer.from(x.buffer, x.byteOffset, x.byteLength) },
	)
}

const decoded = {}
for (const sound of manifest.sounds) {
	if (options.only && sound.name !== options.only) continue
	decoded[sound.source] ??= await source(sound.source)
	const all = decoded[sound.source]
	const from = Math.round(sound.start * RATE)
	const length = Math.round((sound.duration + (sound.loop ?? 0)) * RATE)
	let x = highpass(all.slice(Math.max(from - RATE, 0), from + length), sound.highpass ?? 40)
	x = x.slice(Math.min(from, RATE))
	if (!sound.loop) x = x.slice(Math.max(onset(x) - Math.round(0.002 * RATE), 0))
	if (sound.gate !== undefined) x = gate(x, sound.gate)
	if (sound.loop) x = loop(x, Math.round(sound.loop * RATE))
	else x = fade(x, sound.fadeIn ?? 0.002, sound.fadeOut ?? 0.02)
	const gain = 10 ** ((sound.peak ?? -1) / 20) / peakOf(x)
	x = x.map((v) => v * gain)
	const file = join(out, `${sound.name}.${sound.loop ? 'wav' : 'mp3'}`)
	encode(x, file, Boolean(sound.loop))
	console.log(`${sound.name}: ${(x.length / RATE).toFixed(3)} s`)
}

const credits = Object.values(manifest.sources)
	.map(
		({ id, title, author }) =>
			`- [${title}](https://freesound.org/s/${id}/) by ${author}, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)`,
	)
	.join('\n')
writeFileSync(
	join(out, 'CREDITS.md'),
	`# Sound Credits\n\nThe recordings these sounds are cut from, all dedicated to the public domain (CC0) on Freesound. \`pnpm sounds\` cuts them (\`scripts/sounds.json\`).\n\n${credits}\n`,
)
