// The order the scene's meshes draw in (their renderOrder), written out.
// Within one renderOrder three's WebGL renderer sorts the meshes by material,
// in the order the materials were made, and its WebGPU renderer by distance,
// so no order that matters is left to either. The depth test gives the same
// image in any order, save exact ties; the order sets what it costs:
// - the split frames' block first: it marks the pixels a split frame leaves
//   out with the near plane's depth (src/render/scenePass.js);
// - the lashes, then the lids, which cover the eye: the depth test then skips
//   the costly programs behind them;
// - the back shell after the lids, which hide it from the front;
// - the tear meniscus, then the eyeball, whose optics cost the most;
// - the backdrop last, in the pixels nothing else covered.
export const DRAW_ORDER = Object.freeze({
	shadingBlock: -1000,
	lashes: -1,
	lids: 0,
	backShell: 1,
	meniscus: 2,
	eyeball: 3,
	backdrop: 4,
})
