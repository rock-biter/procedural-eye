// vite.config.js
import glsl from 'vite-plugin-glsl'
import { defineConfig } from 'vite'

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
