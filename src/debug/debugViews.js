// Numbering of the debug views shared with src/shaders/debug-views.glsl: a
// material compiles the view it shows as the DEBUG_VIEW define.
import { DEBUG_VIEWS } from '../params/paramSchema'

export function debugViewDefine(view) {
	const index = DEBUG_VIEWS.indexOf(view)
	return index < 0 ? 0 : index
}
