// Start-up compilation (src/app.js): every program is compiled at once, before
// anything draws with it, so that with KHR_parallel_shader_compile the driver
// links them in parallel while the main thread builds the eye; a bake or the
// first frame then waits only for its own programs. A program depends on the
// kind of target it draws into (a render target or the canvas: three's
// output color space), so each job binds one of its kind first.
//
// A job: { scene, camera, target, variants }, `target` a render target or
// null for the canvas, `variants` a list of functions that set up one variant
// (a material swapped onto a mesh or a pass) and return the function that
// undoes it; none compiles the scene as it is. Resolves once every program
// is ready.
export function precompile(renderer, jobs) {
	const previous = renderer.getRenderTarget()
	const pending = []
	for (const { scene, camera, target = null, variants = [() => () => {}] } of jobs) {
		renderer.setRenderTarget(target)
		for (const variant of variants) {
			const undo = variant()
			pending.push(renderer.compileAsync(scene, camera))
			undo()
		}
	}
	renderer.setRenderTarget(previous)
	return Promise.all(pending)
}

// A variant with `material` on `owner` (a mesh, or a postprocessing pass by
// its fullscreenMaterial).
export function withMaterial(owner, material, key = 'material') {
	return () => {
		const previous = owner[key]
		owner[key] = material
		return () => {
			owner[key] = previous
		}
	}
}
