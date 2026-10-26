// vite.config.js
import glsl from 'vite-plugin-glsl'
import { defineConfig } from 'vite'

// Social cards need an absolute image URL (index.html): a Vercel build gives
// them the project's production domain (set in previews too), a local build
// leaves them relative to the page.
const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
process.env.VITE_SITE_URL = production ? `https://${production}` : ''

export default defineConfig(({ command }) => ({
	// Shader chunks carry #ifndef guards (the Node test hooks inline every
	// include); the plugin also drops repeated includes itself. The build
	// strips their whitespace too (comments go in any case).
	plugins: [
		glsl({
			removeDuplicatedImports: true,
			warnDuplicatedImports: false,
			minify: command === 'build',
		}),
	],
	build: {
		// Top-level await in main.js (the presets, loaded only for ?preset=).
		target: 'es2022',
	},
}))
