// The skin tones of the skin buttons (the HUD's left side), from light to
// deep: values of `skin.color`, the albedo the skin program darkens further
// with its melanin and blood (docs/ADNEXA.md). A tone changes only the color;
// the other skin leaves keep their values. The brown tone is the color of
// defaults.json; the light one sets the backdrop's tone (src/app.js).
export const SKIN_TONES = Object.freeze([
	{ name: 'light', label: 'Light', color: '#b88264' },
	{ name: 'medium', label: 'Medium', color: '#a06c48' },
	{ name: 'brown', label: 'Brown', color: '#784c32' },
	{ name: 'dark', label: 'Dark', color: '#4c2f21' },
	{ name: 'deep', label: 'Deep', color: '#301d15' },
])
