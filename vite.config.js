// vite.config.js
import glsl from 'vite-plugin-glsl'
import { defineConfig } from 'vite'

export default defineConfig({
	// Shader chunks carry #ifndef guards (the Node test hooks inline every
	// include); the plugin also drops repeated includes itself.
	plugins: [glsl({ removeDuplicatedImports: true, warnDuplicatedImports: false })],
	build: {
		// Top-level await in main.js (lazy GUI import).
		target: 'es2022',
	},
})
