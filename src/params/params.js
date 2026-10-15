// Pure helpers over PARAM_SCHEMA (src/params/paramSchema.js): the params object
// is a plain nested copy of the schema holding only values. Paths are dotted
// strings ('lighting.key.azimuth').

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isLeaf(node) {
	return node !== null && typeof node === 'object' && 'default' in node && 'kind' in node
}

export function leafType(leaf) {
	if (leaf.options) return 'choice'
	if (typeof leaf.default === 'boolean') return 'boolean'
	if (typeof leaf.default === 'number') return 'number'
	if (typeof leaf.default === 'string' && COLOR_PATTERN.test(leaf.default)) return 'color'
	throw new Error(`Unsupported leaf default ${JSON.stringify(leaf.default)}`)
}

// Calls fn(leaf, path) for every leaf, depth first in declaration order.
export function forEachLeaf(schema, fn, prefix = '') {
	for (const [key, node] of Object.entries(schema)) {
		const path = prefix ? `${prefix}.${key}` : key
		if (isLeaf(node)) fn(node, path)
		else forEachLeaf(node, fn, path)
	}
}

export function getLeaf(schema, path) {
	let node = schema
	for (const key of path.split('.')) {
		if (node === null || typeof node !== 'object' || !(key in node)) return null
		node = node[key]
	}
	return isLeaf(node) ? node : null
}

export function getValue(params, path) {
	let node = params
	for (const key of path.split('.')) {
		if (node === null || typeof node !== 'object') return undefined
		node = node[key]
	}
	return node
}

// The value a leaf accepts for `value`: numbers clamped to the range and
// snapped to integers when the step is integral, unknown choices and malformed
// colors replaced by the default.
export function sanitizeValue(leaf, value) {
	switch (leafType(leaf)) {
		case 'number': {
			const number = Number(value)
			if (!Number.isFinite(number)) return leaf.default
			const clamped = Math.min(Math.max(number, leaf.min ?? -Infinity), leaf.max ?? Infinity)
			return Number.isInteger(leaf.step) && Number.isInteger(leaf.default)
				? Math.round(clamped)
				: clamped
		}
		case 'boolean':
			return value === true || value === 'true' || value === 1
		case 'choice':
			return leaf.options.includes(value) ? value : leaf.default
		case 'color':
			return typeof value === 'string' && COLOR_PATTERN.test(value)
				? value.toLowerCase()
				: leaf.default
	}
	return leaf.default
}

// Writes a sanitized value and returns it; unknown paths throw.
export function setValue(schema, params, path, value) {
	const leaf = getLeaf(schema, path)
	if (!leaf) throw new Error(`Unknown parameter ${path}`)
	const keys = path.split('.')
	let node = params
	for (const key of keys.slice(0, -1)) node = node[key] ??= {}
	const sanitized = sanitizeValue(leaf, value)
	node[keys.at(-1)] = sanitized
	return sanitized
}

export function createDefaults(schema) {
	const params = {}
	forEachLeaf(schema, (leaf, path) => setValue(schema, params, path, leaf.default))
	return params
}

// Applies a deep partial object of values; returns the unknown paths, which
// are ignored (an older preset may name a removed parameter).
export function applyOverrides(schema, params, overrides, prefix = '') {
	const unknown = []
	for (const [key, value] of Object.entries(overrides ?? {})) {
		const path = prefix ? `${prefix}.${key}` : key
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			unknown.push(...applyOverrides(schema, params, value, path))
		} else if (getLeaf(schema, path)) {
			setValue(schema, params, path, value)
		} else {
			unknown.push(path)
		}
	}
	return unknown
}

export function createParams(schema, ...overrideLayers) {
	const params = createDefaults(schema)
	for (const layer of overrideLayers) applyOverrides(schema, params, layer)
	return params
}

export function cloneParams(params) {
	return structuredClone(params)
}

// Paths whose values differ between two params objects.
export function diffParams(schema, a, b) {
	const changed = []
	forEachLeaf(schema, (_leaf, path) => {
		if (getValue(a, path) !== getValue(b, path)) changed.push(path)
	})
	return changed
}

// The deep partial object of the values that differ from the defaults.
export function nonDefaultValues(schema, params) {
	const partial = {}
	forEachLeaf(schema, (leaf, path) => {
		const value = getValue(params, path)
		if (value !== leaf.default) {
			const keys = path.split('.')
			let node = partial
			for (const key of keys.slice(0, -1)) node = node[key] ??= {}
			node[keys.at(-1)] = typeof value === 'number' ? roundForState(value) : value
		}
	})
	return partial
}

function roundForState(value) {
	return Math.round(value * 1e6) / 1e6
}

// URL-safe state string of the non-default values (base64url of JSON).
export function encodeState(schema, params) {
	const json = JSON.stringify(nonDefaultValues(schema, params))
	return btoa(json).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

// The deep partial object encoded by encodeState(), or null when malformed.
export function decodeState(text) {
	try {
		const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
		const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
		const value = JSON.parse(atob(padded))
		return value !== null && typeof value === 'object' ? value : null
	} catch {
		return null
	}
}
