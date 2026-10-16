// The skin tones of the skin buttons (the HUD's bottom-left quadrant), from
// fair to deep: values of `skin.color`, the albedo the skin program darkens further
// with its melanin and blood (docs/ADNEXA.md). A tone changes only the color;
// the other skin leaves keep their values. The light tone is the color of
// defaults.json.
export const SKIN_TONES = Object.freeze([
	{ name: 'fair', label: 'Fair', color: '#deb298' },
	{ name: 'light', label: 'Light', color: '#b88264' },
	{ name: 'medium', label: 'Medium', color: '#a06c48' },
	{ name: 'brown', label: 'Brown', color: '#784c32' },
	{ name: 'deep', label: 'Deep', color: '#4c2f21' },
])
