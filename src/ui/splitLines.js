// Splits a text into its lines as they are laid out, for the intro
// (src/ui/intro.js), which slides each one out of a mask: each line becomes a
// block of its own (`split-line`, kept on one line, style.css) holding the
// same content, so the text reads the same. The text is cut between words
// and after hyphens (where a line can break too); a span holding only text
// that runs over a break is cloned on each line; any other element (a link,
// the sound controls) moves whole into its line, listeners and all. GSAP's
// SplitText would rebuild those from their HTML when it reverts.

// A word with the spaces after it, the part of one up to a hyphen, or spaces.
const WORDS = /[^\s-]*-+|[^\s-]+\s*|\s+/g

// Whether a line can split `node` (a span holding only text) or takes it
// whole.
const splittable = (node) =>
	node.nodeName === 'SPAN' &&
	[...node.childNodes].every((child) => child.nodeType === Node.TEXT_NODE)

// Splits the content of `element` into its lines: { lines, revert() }, the
// lines' blocks in reading order and a function that puts the original nodes
// back. Null for an element that is not laid out (display: none).
export function splitLines(element) {
	if (element.getClientRects().length === 0) return null
	const original = [...element.childNodes]

	// The content laid out again with each word in a span of its own, to
	// measure: the pieces in reading order, each the box measured, what the
	// line will hold for it and the spans it sits in (outermost first).
	const pieces = []
	const lay = (nodes, spans, parent) => {
		for (const node of nodes) {
			if (node.nodeType === Node.TEXT_NODE) {
				for (const word of node.data.match(WORDS) ?? []) {
					const box = document.createElement('span')
					box.textContent = word
					parent.append(box)
					pieces.push({ box, content: () => document.createTextNode(word), spans })
				}
			} else if (node.nodeType === Node.ELEMENT_NODE && splittable(node)) {
				const clone = node.cloneNode(false)
				parent.append(clone)
				lay(node.childNodes, [...spans, node], clone)
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				parent.append(node)
				pieces.push({ box: node, content: () => node, spans })
			}
		}
	}
	element.replaceChildren()
	lay(original, [], element)

	// A piece starts a new line once its box starts half its height or more
	// below the line's top (inline boxes overlap on tight line heights). A
	// piece without a box (a collapsed space, a hidden span) stays on the
	// line before it.
	const lines = []
	let line = null
	for (const piece of pieces) {
		const rect = piece.box.getClientRects()[0]
		const below = rect && line && line.top !== null && rect.top - line.top >= rect.height / 2
		if (!line || below) lines.push((line = { top: null, pieces: [] }))
		if (rect && line.top === null) line.top = rect.top
		line.pieces.push(piece)
	}

	// Each line's block, its spans cloned around the pieces they hold.
	const blocks = lines.map(({ pieces }) => {
		const block = document.createElement('div')
		block.className = 'split-line'
		let open = []
		for (const piece of pieces) {
			let depth = 0
			while (depth < open.length && open[depth].span === piece.spans[depth]) depth++
			open = open.slice(0, depth)
			for (const span of piece.spans.slice(depth)) {
				const clone = span.cloneNode(false)
				;(open.at(-1)?.clone ?? block).append(clone)
				open.push({ span, clone })
			}
			;(open.at(-1)?.clone ?? block).append(piece.content())
		}
		return block
	})
	element.replaceChildren(...blocks)
	return { lines: blocks, revert: () => element.replaceChildren(...original) }
}
