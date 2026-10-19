// The mesh tree (?meshtree=1): a Tweakpane panel at the left listing the
// scene graph, one folder per object (its name and type, its children nested
// inside), with `visible` on every object, and `wireframe` (all its
// materials) and its vertex count on every mesh. The scene's materials are
// never swapped, so a wireframe holds through rebuilds and debug views. Objects the pipeline shows and hides
// itself (`userData.managed`: the split frame's shading block) are listed with
// both disabled, collapsed. `onChange()` hears every edit.
import { Pane } from 'tweakpane'

function materialsOf(mesh) {
	return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

function addNode(container, object, onChange) {
	const managed = object.userData.managed === true
	const folder = container.addFolder({
		title: `${object.name || '(unnamed)'} · ${object.type}`,
		expanded: !managed,
	})
	folder.addBinding(object, 'visible', { disabled: managed }).on('change', () => onChange())
	if (object.isMesh) {
		const toggle = {
			get wireframe() {
				return materialsOf(object).every((material) => material.wireframe)
			},
			set wireframe(value) {
				for (const material of materialsOf(object)) material.wireframe = value
			},
		}
		folder.addBinding(toggle, 'wireframe', { disabled: managed }).on('change', () => onChange())
		// Read once a second: rebuilds replace the geometry.
		const stats = {
			get vertices() {
				return object.geometry.attributes.position?.count ?? 0
			},
		}
		folder.addBinding(stats, 'vertices', {
			readonly: true,
			interval: 1000,
			format: (count) => count.toLocaleString('en-US'),
		})
	}
	for (const child of object.children) addNode(folder, child, onChange)
}

// Builds the tree of `scene`'s children, as it is now, in its own fixed box
// (`.mesh-tree`, style.css).
export function createMeshTree({ scene, onChange }) {
	const element = document.createElement('div')
	element.className = 'mesh-tree'
	document.body.appendChild(element)
	const pane = new Pane({ title: 'Mesh tree', container: element })
	for (const child of scene.children) addNode(pane, child, onChange)
	return { element, pane }
}
