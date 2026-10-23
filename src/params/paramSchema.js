// The single source of truth for what is tunable: groups of leaves, each
// `{ default, min, max, step, unit, kind, label, options }`. The default
// values come from src/params/defaults.json, exported by the panel's
// **Export defaults JSON**; the `default` written here is the fallback for a
// leaf the file does not name (a new one) and the value the tests use.
// `kind` routes a change (src/app.js):
// - 'uniform': read every frame, nothing else to do;
// - 'bake': re-bakes the iris atlases, the iris color table and the vessel maps;
// - 'rebuild': regenerates geometry (and the derived eye geometry, then bakes);
// - 'define': recompiles the affected programs (tone mapping, debug views).
// A leaf whose default is a '#rrggbb' string is a color; one with `options`
// is a choice; booleans are toggles. Lengths are millimeters unless the unit
// says otherwise. Ranges come from the measurements in docs/RESEARCH.md.
// Transitions (src/params/paramTransition.js) glide numbers and colors; a
// `discrete` number (a seed, a count) changes in one step, and a toggle that
// `fades` its sibling leaf fades it from or to zero instead of switching.

import PROJECT_DEFAULTS from './defaults.json' with { type: 'json' }
import { withDefaults } from './params'
import { PATTERN_NAMES } from '../eye/sharinganPatterns'

const num = (value, min, max, step, unit, kind = 'uniform', label) => ({
	default: value,
	min,
	max,
	step,
	unit,
	kind,
	label,
})
const toggle = (value, kind = 'uniform', label) => ({ default: value, kind, label })
const choice = (value, options, kind = 'uniform', label) => ({
	default: value,
	options,
	kind,
	label,
})
const color = (value, kind = 'uniform', label) => ({ default: value, kind, label })
const discrete = (leaf) => ({ ...leaf, discrete: true })
const fading = (leaf, sibling = 'intensity') => ({ ...leaf, fades: sibling })

export const DEBUG_VIEWS = [
	'beauty',
	'refraction-checker',
	'normals',
	'fresnel',
	'reflection-only',
	'refraction-only',
	'limbus-mask',
	'iris-clay',
	'iris-steps',
	'iris-normals',
	'iris-ao',
	'iris-atlas',
]

// The schema with the fallback defaults. The tests use it, so they do not
// depend on the tuning in defaults.json.
export const BASE_PARAM_SCHEMA = {
	eye: {
		laterality: choice('right', ['right', 'left'], 'rebuild'),
		age: num(30, 5, 90, 1, 'years', 'uniform', 'age (pupil size)'),
		kappa: num(5, 0, 8, 0.1, 'deg', 'uniform', 'angle κ (visual axis nasal)'),
	},
	animation: {
		enabled: toggle(true, 'uniform', 'living eye'),
		pupilReflex: toggle(true, 'uniform', 'pupil light reflex'),
		adaptation: num(110, 1, 1000, 1, 'cd/m² per unit', 'uniform', 'luminance scale'),
		hippus: num(0.15, 0, 0.6, 0.01, 'mm'),
		pupilResponse: num(0.5, 0, 1.5, 0.01, 'mm', 'uniform', 'pupil change per look'),
		gaze: choice('wander', ['camera', 'cursor', 'wander', 'fixed']),
		yaw: num(0, -30, 30, 0.1, 'deg'),
		pitch: num(0, -25, 25, 0.1, 'deg'),
		lookRange: num(12, 0, 25, 0.1, 'deg', 'uniform', 'look-around range'),
		lookInterval: num(2.5, 0.5, 10, 0.1, 's', 'uniform', 'time between looks'),
		saccadeSlowdown: num(5, 1, 12, 0.1, '×', 'uniform', 'saccade slowdown'),
		microMovements: num(0.3, 0, 1, 0.01, '', 'uniform', 'micro-movements'),
		lidFollow: num(1, 0, 1.5, 0.01, '', 'uniform', 'lid follow'),
		blinkRate: num(15, 0, 40, 0.5, '/min', 'uniform', 'blink rate'),
		blinkSlowdown: num(1, 0.5, 4, 0.05, '×', 'uniform', 'blink slowdown'),
	},
	globe: {
		scleraRadius: num(12, 11.2, 12.8, 0.05, 'mm', 'rebuild'),
	},
	cornea: {
		radius: num(7.8, 7.0, 8.6, 0.01, 'mm', 'rebuild', 'anterior radius'),
		asphericity: num(-0.26, -0.6, 0.2, 0.01, '', 'rebuild', 'asphericity Q'),
		diameter: num(11.7, 10.7, 12.6, 0.05, 'mm', 'rebuild', 'diameter (HVID)'),
		limbusBlend: num(0.9, 0.3, 2.0, 0.05, 'mm', 'rebuild', 'limbus blend'),
		posteriorRadius: num(6.5, 6.0, 7.0, 0.01, 'mm', 'rebuild', 'posterior radius'),
		thickness: num(0.55, 0.45, 0.65, 0.005, 'mm', 'rebuild', 'central thickness'),
		ior: num(1.376, 1.36, 1.39, 0.001, '', 'uniform', 'stroma IOR'),
		tearIor: num(1.337, 1.33, 1.35, 0.001, '', 'uniform', 'tear film IOR'),
	},
	chamber: {
		depth: num(3.05, 2.4, 3.8, 0.01, 'mm', 'rebuild', 'anterior chamber depth'),
		aqueousIor: num(1.336, 1.33, 1.345, 0.001, '', 'uniform', 'aqueous IOR'),
	},
	limbus: {
		opacityInner: num(0.45, 0.05, 1.5, 0.01, 'mm', 'uniform', 'opaque from (inside)'),
		opacityOuter: num(0.35, 0.05, 1.5, 0.01, 'mm', 'uniform', 'fully opaque at (outside)'),
		ringWidth: num(0.7, 0.1, 1.6, 0.01, 'mm', 'uniform', 'limbal ring width'),
		ringStrength: num(0.55, 0, 1, 0.01, '', 'uniform', 'limbal ring strength'),
		verticalOverlap: num(0.55, 0, 1.2, 0.01, 'mm', 'uniform', 'sclera overlap top/bottom'),
	},
	iris: {
		pupilDiameter: num(3.6, 1.5, 8, 0.05, 'mm', 'uniform', 'pupil diameter'),
		restPupilDiameter: num(3.6, 2, 6, 0.05, 'mm', 'bake', 'rest pupil diameter'),
		rootRadius: num(5.75, 5.3, 6.2, 0.01, 'mm', 'rebuild', 'root radius'),
		rootDrop: num(0.45, 0.1, 0.9, 0.01, 'mm', 'rebuild', 'root drop (bowing)'),
		pupilDecentration: num(0.15, 0, 0.5, 0.01, 'mm', 'uniform', 'nasal decentration'),
	},
	irisStructure: {
		seed: discrete(num(1, 1, 9999, 1, '', 'bake')),
		marginThickness: num(0.45, 0.2, 0.8, 0.01, 'mm', 'bake', 'thickness at margin'),
		collaretteThickness: num(0.6, 0.3, 0.9, 0.01, 'mm', 'bake', 'thickness at collarette'),
		rootThickness: num(0.38, 0.2, 0.6, 0.01, 'mm', 'bake', 'thickness at root'),
		thicknessResponse: num(0.6, 0, 1.5, 0.01, '', 'uniform', 'dilation thickening'),
		collarette: {
			position: num(0.3, 0.15, 0.5, 0.005, '', 'bake', 'position (share of width)'),
			amplitude: num(0.05, 0, 0.15, 0.002, '', 'bake', 'zig-zag amplitude'),
			teeth: discrete(num(16, 6, 40, 1, '', 'bake')),
			irregularity: num(0.6, 0, 1, 0.01, '', 'bake'),
			height: num(0.07, 0, 0.25, 0.005, 'mm', 'bake', 'ridge height'),
			width: num(0.16, 0.03, 0.5, 0.005, 'mm', 'bake', 'ridge width'),
		},
		furrows: {
			count: discrete(num(3, 0, 6, 1, '', 'bake')),
			extent: num(0.75, 0, 1, 0.01, '', 'bake', 'extent (share of circle)'),
			depth: num(0.05, 0, 0.15, 0.002, 'mm', 'bake'),
			width: num(0.06, 0.02, 0.2, 0.002, 'mm', 'bake'),
		},
		surface: {
			radialNoise: num(0.03, 0, 0.1, 0.001, 'mm', 'bake', 'radial streaks'),
			radialFrequency: discrete(num(260, 40, 800, 1, '', 'bake', 'streaks around')),
			undulation: num(0.04, 0, 0.15, 0.001, 'mm', 'bake'),
		},
		crypts: {
			grade: num(2, 0, 4, 0.05, '', 'bake', 'grade (Edwards/Larsson)'),
			size: num(0.75, 0.3, 1.6, 0.01, 'mm', 'bake', 'cell size near collarette'),
			band: num(0.24, 0.1, 0.6, 0.01, '', 'bake', 'band width (share of width)'),
			elongation: num(1.5, 0.6, 3, 0.01, '', 'bake', 'radial elongation'),
			peripheral: num(0.5, 0, 1, 0.01, '', 'bake', 'peripheral crypts'),
			depth: num(0.3, 0.03, 0.5, 0.005, 'mm', 'bake'),
			wall: num(0.07, 0.01, 0.25, 0.002, 'mm', 'bake', 'wall half-width'),
			undercut: num(0.05, 0, 0.2, 0.002, 'mm', 'uniform'),
			roundness: num(0.5, 0, 1, 0.01, '', 'bake', 'roundness (polygon → lens)'),
		},
		fibers: {
			radialCount: discrete(num(150, 0, 300, 1, '', 'uniform', 'radial vessels')),
			radialThickness: num(0.03, 0.008, 0.1, 0.001, 'mm', 'uniform', 'radial vessel radius'),
			radialWaviness: num(0.22, 0, 0.8, 0.01, '', 'uniform', 'radial waviness'),
			radialHeight: num(0.95, 0.5, 1.1, 0.005, '', 'uniform', 'radial height (share of surface)'),
			radialCoverage: num(0.8, 0, 1, 0.01, '', 'uniform', 'radial coverage'),
			arcCount: discrete(num(45, 0, 300, 1, '', 'uniform', 'collagen arcs (each way)')),
			arcThickness: num(0.026, 0.006, 0.08, 0.001, 'mm', 'uniform', 'arc radius'),
			arcSpan: num(90, 0, 180, 1, 'deg', 'uniform', 'arc sweep root→margin'),
			arcHeight: num(0.62, 0.2, 1, 0.005, '', 'uniform', 'arc height (share of surface)'),
			arcCoverage: num(0.6, 0, 1, 0.01, '', 'uniform', 'arc coverage'),
			blend: num(0.025, 0.002, 0.08, 0.001, 'mm', 'uniform', 'fusion with stroma'),
		},
		ruff: {
			width: num(0.085, 0.01, 0.2, 0.002, 'mm', 'uniform', 'pupillary ruff width'),
			crenations: discrete(num(150, 20, 400, 1, '', 'uniform')),
		},
		nodules: {
			count: discrete(num(0, 0, 60, 1, '', 'bake', 'Wölfflin nodules')),
			size: num(0.09, 0.02, 0.25, 0.002, 'mm', 'bake'),
			ring: num(0.8, 0.5, 0.95, 0.005, '', 'bake', 'ring position'),
		},
		micro: {
			amplitude: num(0.006, 0, 0.02, 0.0005, 'mm', 'uniform', 'micro striations'),
			frequency: discrete(num(1400, 300, 4000, 10, '', 'uniform', 'striations around')),
		},
	},
	irisColor: {
		ablMelanin: num(0.45, 0, 1, 0.005, '', 'bake', 'ABL melanin'),
		eumelanin: num(0.75, 0, 1, 0.01, '', 'bake', 'eumelanin share'),
		stromaMelanin: num(0.02, 0, 1, 0.005, '', 'bake', 'stroma melanin'),
		stromaScattering: num(2.5, 0.3, 10, 0.05, '1/mm', 'bake', 'stroma scattering'),
		rayleighShare: num(0.9, 0, 1, 0.01, '', 'bake', 'Rayleigh share (blue)'),
		blood: num(0.003, 0, 0.03, 0.0005, '', 'bake', 'stroma blood'),
		ablThickness: num(0.057, 0.02, 0.12, 0.001, 'mm', 'bake', 'ABL thickness'),
		ablScattering: num(3, 0, 20, 0.1, '1/mm', 'bake', 'ABL scattering'),
		melanosomeScattering: num(0, 0, 40, 0.5, '1/mm', 'bake', 'melanosome scattering'),
		fiberAbl: num(0.7, 0, 1, 0.01, '', 'uniform', 'ABL over fibers'),
		saturation: num(1.15, 0, 3, 0.01),
		tint: color('#ffffff'),
		// Light of its own (artistic, the mako eyes of the random eye): the
		// iris adds its albedo times this times a white surface lit by the rig.
		glow: num(0, 0, 4, 0.01),
		variation: num(0.3, 0, 1, 0.01, '', 'bake', 'radial melanin variation'),
		heterochromia: {
			amount: num(0, 0, 1, 0.01, '', 'bake', 'central heterochromia'),
			melanin: num(0.6, 0, 1, 0.01, '', 'bake'),
			eumelanin: num(0.25, 0, 1, 0.01, '', 'bake'),
			extent: num(0.08, -0.1, 0.4, 0.005, '', 'bake', 'extent past collarette'),
			softness: num(0.05, 0.005, 0.2, 0.005, '', 'bake'),
		},
		periphery: {
			amount: num(0.35, 0, 1, 0.01, '', 'bake', 'peripheral darkening'),
			width: num(0.15, 0.02, 0.4, 0.005, '', 'bake'),
		},
		freckles: {
			count: discrete(num(2, 0, 32, 1, '', 'bake')),
			size: num(0.3, 0.05, 1, 0.01, 'mm', 'bake'),
			melanin: num(0.95, 0, 1, 0.01, '', 'bake'),
			eumelanin: num(0.55, 0, 1, 0.01, '', 'bake'),
			inferotemporal: num(0.7, 0, 1, 0.01, '', 'bake', 'inferior-temporal bias'),
		},
	},
	lids: {
		// Fissure (src/adnexa/fissure.js).
		fissureWidth: num(29, 24, 32, 0.1, 'mm', 'rebuild', 'fissure width'),
		medialShare: num(0.505, 0.45, 0.6, 0.005, '', 'rebuild', 'medial share of the width'),
		medialHeight: num(-3.2, -5, 1, 0.05, 'mm', 'rebuild', 'medial canthus height'),
		canthalTilt: num(2, -6, 12, 0.1, 'deg', 'rebuild', 'canthal tilt'),
		mrd1: num(4, 0.5, 6, 0.05, 'mm', 'rebuild', 'upper margin above pupil (MRD1)'),
		mrd2: num(5.3, 3, 8, 0.05, 'mm', 'rebuild', 'lower margin below pupil (MRD2)'),
		upperPeak: num(0.45, 0.25, 0.7, 0.005, '', 'rebuild', 'upper peak (share from medial)'),
		lowerPeak: num(0.58, 0.3, 0.75, 0.005, '', 'rebuild', 'lower trough (share from medial)'),
		upperMedialAngle: num(40, 15, 70, 0.5, 'deg', 'rebuild', 'upper medial angle'),
		lowerMedialAngle: num(22, 10, 50, 0.5, 'deg', 'rebuild', 'lower medial angle'),
		upperAngle: num(30, 10, 60, 0.5, 'deg', 'rebuild', 'upper lateral angle'),
		lowerAngle: num(22, 10, 60, 0.5, 'deg', 'rebuild', 'lower lateral angle'),
		closure: num(0, 0, 1, 0.01, '', 'rebuild', 'closure at rest'),
		// Lids (src/adnexa/lidGeometry.js).
		marginThickness: num(2, 1.2, 3, 0.05, 'mm', 'rebuild', 'margin thickness'),
		marginRadius: num(0.7, 0.2, 1.2, 0.01, 'mm', 'rebuild', 'margin edge radius'),
		lidThickness: num(2.6, 1.5, 6, 0.05, 'mm', 'rebuild', 'upper lid thickness'),
		lowerHeight: num(6.5, 3, 10, 0.1, 'mm', 'rebuild', 'lower lid height (margin to cheek)'),
		lowerFullness: num(0.5, 0, 1, 0.05, 'mm', 'rebuild', 'lower lid fullness'),
		creaseHeight: num(3, 1, 8, 0.1, 'mm', 'rebuild', 'upper lid show (margin to fold)'),
		creaseDepth: num(1.1, 0, 1.5, 0.05, 'mm', 'rebuild', 'upper crease depth'),
		creaseFold: num(0.9, 0, 1.5, 0.05, 'mm', 'rebuild', 'skin fold over the crease'),
		lowerRoll: num(0.2, 0, 1, 0.05, 'mm', 'rebuild', 'lower pretarsal roll'),
		lateralOverlap: num(0.2, 0, 1.2, 0.01, 'mm', 'rebuild', 'lateral overlap'),
		// Depths behind the corneal apex and the face around the orbit
		// (src/adnexa/periocular.js).
		medialDepth: num(4.5, 1, 8, 0.1, 'mm', 'rebuild', 'medial canthus behind apex'),
		lateralDepth: num(8.5, 5, 12, 0.1, 'mm', 'rebuild', 'lateral canthus behind apex'),
		rimDepth: num(16, 12, 21, 0.1, 'mm', 'rebuild', 'lateral orbital rim behind apex'),
		browHeight: num(15, 11, 22, 0.1, 'mm', 'rebuild', 'brow above pupil'),
		browProjection: num(5, -2, 12, 0.1, 'mm', 'rebuild', 'brow in front of apex'),
		cheekProjection: num(0, -6, 5, 0.1, 'mm', 'rebuild', 'cheek in front of apex'),
		noseDistance: num(31.5, 28, 35, 0.1, 'mm', 'rebuild', 'pupil to midline'),
		noseProjection: num(9, 4, 18, 0.1, 'mm', 'rebuild', 'nasal dorsum in front of apex'),
		seed: discrete(num(1, 1, 9999, 1, '', 'rebuild', 'seed (skin)')),
		meniscusLower: num(0.36, 0, 0.8, 0.005, 'mm', 'rebuild', 'lower tear meniscus radius'),
		meniscusUpper: num(0.2, 0, 0.6, 0.005, 'mm', 'rebuild', 'upper tear meniscus radius'),
	},
	lashes: {
		seed: discrete(num(1, 1, 9999, 1, '', 'rebuild')),
		upperCount: discrete(num(150, 0, 200, 1, '', 'rebuild', 'upper count')),
		lowerCount: discrete(num(80, 0, 120, 1, '', 'rebuild', 'lower count')),
		upperLength: num(9, 4, 14, 0.1, 'mm', 'rebuild', 'upper length'),
		lowerLength: num(5.5, 2, 9, 0.1, 'mm', 'rebuild', 'lower length'),
		thickness: num(0.08, 0.03, 0.14, 0.001, 'mm', 'rebuild'),
		upperLift: num(22, -10, 70, 0.5, 'deg', 'rebuild', 'upper lift'),
		lowerLift: num(32, -10, 60, 0.5, 'deg', 'rebuild', 'lower lift'),
		upperCurl: num(0.45, 0, 1.5, 0.01, '', 'rebuild', 'upper curl'),
		lowerCurl: num(0.35, 0, 1.5, 0.01, '', 'rebuild', 'lower curl'),
		clumping: num(0.5, 0, 1, 0.01, '', 'rebuild'),
		randomness: num(0.6, 0, 1.5, 0.01, '', 'rebuild'),
		color: color('#1d140f'),
		shine: num(0.5, 0, 1, 0.01),
		// How much thicker the lashes are zoomed all the way out (none zoomed
		// in): fuller from afar without more of them.
		zoomOut: num(0.3, 0, 1, 0.01, '', 'uniform', 'thicker zoomed out'),
	},
	skin: {
		color: color('#c98f6e'),
		redness: num(0.45, 0, 1, 0.01, '', 'uniform', 'margin redness'),
		roughness: num(0.42, 0.1, 0.9, 0.01),
		wetness: num(0.5, 0, 1, 0.01, '', 'uniform', 'moisture'),
		pores: num(0.5, 0, 1, 0.01),
		wrinkles: num(0, 0, 1, 0.01),
		translucency: num(0, 0, 1, 0.01, '', 'uniform', 'subsurface'),
		freckles: num(0.85, 0, 1, 0.01),
		veins: num(0.4, 0, 1, 0.01, '', 'uniform', 'veins (thin-skin tint)'),
		pigmentation: num(0.4, 0, 1, 0.01, '', 'uniform', 'crease and canthi pigment'),
		occlusion: num(1, 0, 1, 0.01, '', 'uniform', 'baked ambient occlusion'),
		backdrop: num(0.55, 0, 1.5, 0.01, '', 'uniform', 'backdrop (× lit default skin tone)'),
	},
	// The back shell closing the skin patch behind the eye
	// (src/adnexa/backShell.js): how far it keeps behind the globe and the lids,
	// the flat band along the patch's edge, and its skin's tone.
	shell: {
		clearance: num(1.5, 0.5, 15, 0.1, 'mm', 'rebuild', 'clearance behind the eye'),
		band: num(1, 0.3, 4, 0.1, 'mm', 'rebuild', 'edge band'),
		tone: num(0.6, 0.1, 1, 0.01, '', 'uniform', 'tone (× skin albedo)'),
	},
	sclera: {
		color: color('#e7ddd2', 'uniform', 'base color'),
		irregularity: num(0.35, 0, 1, 0.01, '', 'uniform', 'surface irregularity'),
		redness: num(0.45, 0, 1, 0.01),
		yellowing: num(0.15, 0, 1, 0.01),
		vessels: {
			seed: discrete(num(1, 1, 9999, 1, '', 'bake')),
			conjunctival: discrete(num(28, 0, 80, 1, '', 'bake', 'conjunctival vessels')),
			episcleral: discrete(num(14, 0, 40, 1, '', 'bake', 'episcleral vessels')),
			tortuosity: num(1, 0.2, 2.5, 0.01, '', 'bake'),
		},
	},
	lighting: {
		room: {
			color: color('#c9c2b8'),
			intensity: num(0.35, 0, 4, 0.01),
			floor: num(0.35, 0, 1, 0.01, '', 'uniform', 'floor brightness'),
		},
		key: {
			enabled: fading(toggle(true)),
			shape: choice('rect', ['rect', 'disk', 'octagon']),
			azimuth: num(38, -180, 180, 1, 'deg'),
			elevation: num(28, -80, 80, 1, 'deg'),
			distance: num(700, 150, 3000, 10, 'mm'),
			width: num(600, 20, 2000, 10, 'mm'),
			height: num(450, 20, 2000, 10, 'mm'),
			intensity: num(9, 0, 200, 0.1),
			temperature: num(5600, 2000, 12000, 50, 'K'),
			softness: num(0.08, 0, 0.5, 0.01, '', 'uniform', 'edge softness'),
		},
		fill: {
			enabled: fading(toggle(true)),
			shape: choice('rect', ['rect', 'disk', 'octagon']),
			azimuth: num(-55, -180, 180, 1, 'deg'),
			elevation: num(5, -80, 80, 1, 'deg'),
			distance: num(900, 150, 3000, 10, 'mm'),
			width: num(300, 20, 2000, 10, 'mm'),
			height: num(900, 20, 2000, 10, 'mm'),
			intensity: num(2.2, 0, 200, 0.1),
			temperature: num(5200, 2000, 12000, 50, 'K'),
			softness: num(0.15, 0, 0.5, 0.01, '', 'uniform', 'edge softness'),
		},
		window: {
			enabled: fading(toggle(false)),
			azimuth: num(-35, -180, 180, 1, 'deg'),
			elevation: num(15, -80, 80, 1, 'deg'),
			distance: num(1800, 300, 6000, 10, 'mm'),
			width: num(1200, 100, 4000, 10, 'mm'),
			height: num(1500, 100, 4000, 10, 'mm'),
			columns: discrete(num(2, 1, 6, 1, '', 'uniform', 'panes across')),
			rows: discrete(num(3, 1, 6, 1, '', 'uniform', 'panes down')),
			mullion: num(50, 0, 200, 1, 'mm', 'uniform', 'mullion width'),
			intensity: num(14, 0, 200, 0.1),
			skyTop: color('#9fc3ff'),
			skyBottom: color('#f2f4f7'),
		},
		ring: {
			enabled: fading(toggle(false)),
			innerRadius: num(45, 5, 200, 1, 'mm'),
			outerRadius: num(60, 6, 220, 1, 'mm'),
			intensity: num(25, 0, 400, 0.5),
			temperature: num(5500, 2000, 12000, 50, 'K'),
		},
		leds: {
			enabled: fading(toggle(false)),
			count: discrete(num(12, 3, 48, 1)),
			radius: num(40, 5, 200, 1, 'mm'),
			size: num(3, 0.5, 20, 0.1, 'mm'),
			intensity: num(300, 0, 5000, 1),
			temperature: num(6000, 2000, 12000, 50, 'K'),
		},
		sky: {
			enabled: fading(toggle(false)),
			intensity: num(6, 0, 100, 0.1),
			zenith: color('#4f8fe8'),
			horizon: color('#cfe3f7'),
			ground: color('#4a5a3a'),
			horizonHeight: num(2, -20, 30, 0.5, 'deg', 'uniform', 'horizon elevation'),
			treeLine: num(0.6, 0, 1, 0.01, '', 'uniform', 'tree line'),
		},
		camera: {
			enabled: toggle(true, 'uniform', 'reflect camera'),
			lensRadius: num(36, 5, 80, 1, 'mm', 'uniform', 'lens front radius'),
			bodyWidth: num(150, 0, 400, 1, 'mm'),
			bodyHeight: num(110, 0, 400, 1, 'mm'),
			photographer: toggle(true),
		},
	},
	// The air around the eye (src/atmosphere/dustField.js, src/render/dustPass.js):
	// fibers and flakes of dust at their real size in a cube around the eye,
	// blurred by the lens, lit by the rig with a forward-scattering phase,
	// drifting very slowly; and the haze, a veil of light scattered by the air
	// that grows with the distance.
	dust: {
		enabled: fading(toggle(true, 'uniform', 'dust'), 'brightness'),
		brightness: num(1, 0, 10, 0.01),
		count: discrete(num(1000, 0, 2000, 1, '', 'uniform', 'motes')),
		seed: discrete(num(1, 1, 9999, 1)),
		size: num(350, 50, 1500, 10, 'µm', 'uniform', 'median fiber length'),
		extent: num(160, 60, 1000, 10, 'mm', 'uniform', 'cube side'),
		forward: num(0.65, 0, 0.95, 0.01, '', 'uniform', 'forward scattering'),
		drift: num(0.3, 0, 10, 0.05, 'mm/s', 'uniform', 'air drift'),
		turbulence: num(0.6, 0, 12, 0.05, 'mm'),
		haze: num(0.04, 0, 3, 0.005, '1/m', 'uniform', 'haze density'),
		shadow: num(0.7, 0, 1, 0.01, '', 'uniform', 'shadow of the patch'),
	},
	// The light shafts (src/atmosphere/lightShafts.js, src/lighting/shaftLight.js):
	// a few blades of the key light from a source `distance` from the globe,
	// in the key's direction turned by `azimuth` and `elevation`, so they fan
	// out from it; the patch's shadow on the backdrop comes from there too.
	// `intensity` is their light as a share of the key's; `light`, `dust` and
	// `air` how much of it the skin and the eye, the dust motes and the air
	// show. Each blade is `width` across (σ) and `elongation` times that along
	// its long side, which lies along `angle` in their cross-section; the
	// blades are scattered within `spread`, or side by side across their long
	// sides, like slats, as `alignment` goes to 1. `length` is their σ along
	// their axis. They `sway` (mm) and `flicker` slowly, at `speed`, with the
	// dust's clock (frozen in photo mode); moving, they restart the image
	// every frame, as a living eye does.
	shafts: {
		enabled: fading(toggle(true, 'uniform', 'light shafts')),
		azimuth: num(0, -90, 90, 1, 'deg', 'uniform', 'azimuth from the key'),
		elevation: num(25, -60, 60, 1, 'deg', 'uniform', 'elevation over the key'),
		distance: num(260, 120, 2000, 10, 'mm', 'uniform', 'source distance'),
		intensity: num(1, 0, 3, 0.01, '×', 'uniform', 'beam light (× key)'),
		light: num(3, 0, 8, 0.01, '', 'uniform', 'on skin and eye'),
		dust: num(15, 0, 40, 0.1, '', 'uniform', 'on the dust'),
		air: num(40, 0, 150, 0.5, '1/m', 'uniform', 'in the air'),
		color: color('#ffffff', 'uniform', 'tint'),
		count: discrete(num(7, 1, 12, 1, '', 'uniform', 'beams')),
		seed: discrete(num(1, 1, 9999, 1)),
		width: num(1.8, 0.5, 20, 0.1, 'mm', 'uniform', 'blade width (σ)'),
		elongation: num(1.5, 1, 20, 0.1, '×', 'uniform', 'blade length (× width)'),
		widthVariation: num(0.4, 0, 1, 0.01, '', 'uniform', 'width variation'),
		spread: num(40, 0, 150, 1, 'mm'),
		offsetX: num(0, -100, 100, 0.5, 'mm', 'uniform', 'offset across'),
		offsetY: num(0, -100, 100, 0.5, 'mm', 'uniform', 'offset up'),
		angle: num(70, 0, 180, 1, 'deg', 'uniform', 'blade angle'),
		alignment: num(0.25, 0, 1, 0.01, '', 'uniform', 'side by side'),
		length: num(110, 20, 400, 1, 'mm', 'uniform', 'reach (σ along)'),
		shadow: num(0.95, 0, 1, 0.01, '', 'uniform', 'cut by the patch'),
		sway: num(2, 0, 15, 0.1, 'mm', 'uniform', 'sway'),
		flicker: num(0.3, 0, 1, 0.01, '', 'uniform', 'flicker'),
		speed: num(1, 0, 3, 0.01, '×', 'uniform', 'motion speed'),
	},
	// The backdrop beyond the skin (src/render/backdrop.js): the soft shadow the
	// skin patch casts from the light shafts' direction (the key's, turned by
	// shafts.azimuth and shafts.elevation) onto a floor `distance` below the
	// globe's center, which shows nothing else; `tilt` turns it up about the
	// world x axis toward a wall behind the face. Only a camera on its side
	// sees it.
	backdrop: {
		shadow: num(0.8, 0, 1, 0.01, '', 'uniform', 'shadow strength'),
		distance: num(70, 5, 300, 1, 'mm', 'uniform', 'plane below the globe'),
		tilt: num(0, 0, 90, 1, 'deg', 'uniform', 'plane tilt (0 floor, 90 wall)'),
		softness: num(16, 2, 30, 0.5, 'mm', 'uniform', 'shadow softness'),
	},
	camera: {
		focalLength: num(110, 35, 200, 1, 'mm', 'uniform', 'focal length'),
		fNumber: num(8, 1.4, 32, 0.1, '', 'uniform', 'f-number'),
		sensorHeight: num(24, 8, 36, 0.1, 'mm', 'uniform', 'sensor height'),
		distance: num(185, 60, 1000, 0.5, 'mm', 'uniform', 'focus distance'),
		azimuth: num(-26, -80, 80, 0.1, 'deg'),
		elevation: num(-7.8, -60, 60, 0.1, 'deg'),
		targetX: num(0, -20, 20, 0.05, 'mm', 'uniform', 'target x'),
		targetY: num(0, -20, 20, 0.05, 'mm', 'uniform', 'target y'),
		targetZ: num(0, -20, 20, 0.05, 'mm', 'uniform', 'target z'),
		exposure: num(0, -6, 6, 0.05, 'EV'),
		whiteBalance: num(5600, 2500, 12000, 50, 'K', 'uniform', 'white balance'),
	},
	// The Zoom out and Zoom in buttons (main.js), which also bound the wheel:
	// the camera distances they glide to and how long a zoom takes. Landscape
	// (desktop) screens zoom in to `in` and out to `out`; portrait (mobile)
	// ones, much narrower, from `mobileIn` to `mobileOut`, both farther.
	// Landscape screens start `start` of the way from their zoom in to their
	// zoom out on the zoom's log scale (0.5: the knob on the horizontal),
	// portrait ones `mobileStart` of the way. The zoom sets the sensor height
	// too, from `sensorOut` zoomed out to `sensorIn` zoomed in (zoomSensor(),
	// src/ui/hudLayout.js): a smaller sensor, farther away for the same
	// framing, deepens the focus up close.
	zoom: {
		in: num(180, 60, 1000, 0.5, 'mm', 'uniform', 'desktop zoom in distance'),
		out: num(480, 60, 1000, 0.5, 'mm', 'uniform', 'zoom out distance'),
		mobileIn: num(268, 60, 1000, 0.5, 'mm', 'uniform', 'mobile zoom in distance'),
		mobileOut: num(811, 60, 1000, 0.5, 'mm', 'uniform', 'mobile zoom out distance'),
		sensorIn: num(24, 8, 36, 0.1, 'mm', 'uniform', 'sensor height zoomed in'),
		sensorOut: num(24, 8, 36, 0.1, 'mm', 'uniform', 'sensor height zoomed out'),
		start: num(0.5, 0, 1, 0.01, '', 'uniform', 'desktop start (zoom in → out, log)'),
		mobileStart: num(0.5, 0, 1, 0.01, '', 'uniform', 'mobile start (zoom in → out, log)'),
		duration: num(1.2, 0, 4, 0.05, 's', 'uniform', 'zoom duration'),
		elasticity: num(0.12, 0, 0.25, 0.01, '', 'uniform', 'zoom drag overshoot'),
	},
	// The HUD's aperture knob (desktop only, main.js): the camera.fNumber it
	// sets, from `open` by Zoom out to `closed` by Zoom in, on a log
	// scale, as f-stops run; 10 and 22.5 put the default f/15 halfway (their
	// geometric mean). A drag can pull it past either end by up to
	// `elasticity` of its track (resisted, as the zoom's), and released there
	// it springs back; kept small, so the f-number stays inside its range.
	aperture: {
		open: num(10, 1.4, 32, 0.1, '', 'uniform', 'widest f-number (by −)'),
		closed: num(22.5, 1.4, 32, 0.1, '', 'uniform', 'narrowest f-number (by +)'),
		elasticity: num(0.05, 0, 0.1, 0.01, '', 'uniform', 'aperture drag overshoot'),
	},
	// The pointer controls (src/camera/cameraControls.js): how far the mouse
	// turns the view toward itself at the window's edge, zoomed in and zoomed
	// out (linear in the zoom level between, src/camera/orbitMotion.js), how
	// slowly the view follows it (a time constant; 0 follows at once), how
	// slowly the camera eases to the distance the wheel sets (a time
	// constant; 0 jumps there), and the time constant an orbit's speed decays
	// with after a drag (it coasts speed × inertia; 0 stops at once).
	controls: {
		parallax: num(1.5, 0, 6, 0.1, 'deg', 'uniform', 'mouse parallax (zoomed in)'),
		parallaxOut: num(3, 0, 12, 0.1, 'deg', 'uniform', 'mouse parallax (zoomed out)'),
		parallaxLag: num(0.4, 0, 2, 0.01, 's', 'uniform', 'parallax lag'),
		zoomLag: num(0.15, 0, 1, 0.01, 's', 'uniform', 'wheel zoom lag'),
		inertia: num(0.2, 0, 1, 0.01, 's', 'uniform', 'orbit inertia'),
	},
	// The sound design (src/audio/, docs/AUDIO.md): the master volume, the
	// volume of each sound of the camera foley and of the ambience, how far a
	// sound's pitch varies from one play to the next, the zoom ring's detents
	// across the knob's track and the aperture ring's per stop, the aperture's
	// ticks (a bicycle freewheel's or synthesized fine ones), how Random eye
	// advances the film (a lever or a motor), and the ambience, a glass harp:
	// how many quiet glasses sing at once, how many louder ones a minute rise
	// over them, the key they are tuned to, how slowly it fades in at the
	// first gesture and how quickly where it was after a mute, which pauses
	// it, and how far a drag can pull the volume slider's handle
	// past its right end (resisted, as the HUD's knobs), the music playing up
	// to `stretchRate` times as fast as it is pulled; pulled past its left end
	// it squeezes the credit line as a spring, up to `squeeze` of its width,
	// the music slowing to `squeezeRate` of its speed. The mute is the viewer's, kept by the
	// browser, not a parameter; the volume slider by the sound toggle sets
	// the master volume (main.js), which the browser keeps too.
	sound: {
		volume: num(0.64, 0, 1, 0.01, '', 'uniform', 'master volume'),
		volumes: {
			press: num(0.35, 0, 1, 0.01, '', 'uniform', 'button press'),
			hover: num(0.3, 0, 1, 0.01, '', 'uniform', 'hover'),
			zoom: num(0.2, 0, 1, 0.01, '', 'uniform', 'zoom ring'),
			aperture: num(0.15, 0, 1, 0.01, '', 'uniform', 'aperture ring'),
			strain: num(0.35, 0, 1, 0.01, '', 'uniform', 'creak past an end'),
			advance: num(0.42, 0, 1, 0.01, '', 'uniform', 'film advance (Random eye)'),
			shutter: num(0.56, 0, 1, 0.01, '', 'uniform', 'shutter (Snapshot)'),
			mirror: num(0.35, 0, 1, 0.01, '', 'uniform', 'mirror (photo mode)'),
			beep: num(0.08, 0, 1, 0.01, '', 'uniform', 'focus beep'),
			glasses: num(0.22, 0, 1, 0.01, '', 'uniform', 'music: quiet glasses'),
			lead: num(0.3, 0, 1, 0.01, '', 'uniform', 'music: louder glasses'),
		},
		variation: num(60, 0, 200, 1, 'cents', 'uniform', 'pitch variation'),
		zoomDetents: num(16, 2, 60, 1, '', 'uniform', 'zoom detents across the track'),
		detents: num(6, 1, 16, 1, 'per stop', 'uniform', 'aperture detents per stop'),
		apertureTicks: choice('freewheel', ['freewheel', 'fine'], 'uniform', 'aperture ticks'),
		film: choice('lever', ['lever', 'motor'], 'uniform', 'Random eye film advance'),
		glasses: num(3, 0, 6, 1, '', 'uniform', 'quiet glasses at once'),
		leadRate: num(1.5, 0, 6, 0.1, 'per min', 'uniform', 'louder glasses per minute'),
		glassKey: choice('D', ['C', 'D', 'E', 'F', 'G', 'A'], 'uniform', 'glasses key'),
		fadeIn: num(10, 0, 30, 0.5, 's', 'uniform', 'music fade in'),
		resumeFade: num(2, 0, 10, 0.1, 's', 'uniform', 'music fade in after a mute'),
		stretch: num(200, 0, 400, 1, 'px', 'uniform', 'volume handle run past the end'),
		stretchRate: num(2, 1, 4, 0.05, '×', 'uniform', 'music speed at full overshoot'),
		squeeze: num(0.5, 0, 0.8, 0.01, '', 'uniform', 'credit squeeze at the spring limit'),
		squeezeRate: num(0.5, 0.25, 1, 0.05, '×', 'uniform', 'music speed at full squeeze'),
	},
	// The easter egg's glitch (src/eye/terminator.js, docs/RENDERING.md): the
	// volume cannon's shot (main.js) sends a shockwave over the eye from its
	// axis for `duration`, the T-800's eye behind its front. The front reaches
	// `peak` of the globe's radius, holds there while the photo is taken, and
	// draws back. While the cannon is armed, a hint of it shows, its front
	// reaching `charge`, and the lights and the backdrop turn `chargeFlash`
	// of the way to the shot's red flash. `amount` shows it for tuning (0 in
	// use). On the front,
	// a band `band` either side, the two glitch into each other: rows `cell`
	// high torn sideways up to `tear`, the image pulled toward the front by
	// `ripple`, red and blue seeing it `split` apart, in blocks as much as
	// `blocks`, the pattern ticking on `speed` times a second; some blocks
	// jump up to `jump`, and `flicker` sets how often rows drop out, blocks
	// flicker, blocks jump, and the front jumps, flips or flashes. While a
	// shot runs, the band, the rows, the tears, the ripple, the split, the
	// jumps and the flicker jump to random multiples of their values, each
	// holding a few ticks (src/eye/glitch.js); `chaos` sets how far. A shot
	// also flashes the scene red: the lights turn `light`, their brightest
	// channel `lightGain` times their luminance, and the backdrop `backdrop`,
	// rising over `flashIn`, holding while the glitch lasts and fading over
	// `flashOut` after it.
	glitch: {
		amount: num(0, 0, 1, 0.01, '', 'uniform', 'still preview (front reach)'),
		peak: num(0.65, 0, 1, 0.01, '', 'uniform', 'front reach at the photo'),
		charge: num(0.07, 0, 0.5, 0.01, '', 'uniform', 'front reach while armed'),
		chargeFlash: num(0.5, 0, 1, 0.01, '', 'uniform', 'flash share while armed'),
		duration: num(0.8, 0.1, 3, 0.05, 's', 'uniform', 'shot glitch duration'),
		band: num(1.5, 0.2, 6, 0.05, 'mm', 'uniform', 'glitch band half-width'),
		cell: num(0.3, 0.05, 3, 0.01, 'mm', 'uniform', 'row height'),
		tear: num(0.8, 0, 4, 0.01, 'mm', 'uniform', 'row tear'),
		ripple: num(0.4, 0, 2, 0.01, 'mm', 'uniform', 'ripple'),
		split: num(0.6, 0, 3, 0.01, 'mm', 'uniform', 'color split'),
		blocks: num(0.7, 0, 1, 0.01, '', 'uniform', 'blockiness'),
		jump: num(1, 0, 4, 0.01, 'mm', 'uniform', 'block jumps'),
		flicker: num(0.6, 0, 1, 0.01, '', 'uniform', 'flicker'),
		chaos: num(0.8, 0, 1, 0.01, '', 'uniform', 'settings jumping'),
		light: color('#ff1408', 'uniform', 'flash: light color'),
		lightGain: num(1, 0, 6, 0.05, '×', 'uniform', 'flash: light gain'),
		backdrop: color('#5c0a06', 'uniform', 'flash: backdrop color'),
		flashIn: num(0.1, 0, 1, 0.01, 's', 'uniform', 'flash: rise'),
		flashOut: num(0.5, 0, 3, 0.05, 's', 'uniform', 'flash: fade'),
		speed: num(24, 1, 60, 1, 'per s', 'uniform', 'pattern ticks'),
	},
	// The T-800's eye under the glitch: its lens' glow (× a white surface
	// under the rig), red and at its white-hot core, and the tint and
	// roughness of its socket's chrome.
	terminator: {
		glow: num(1.2, 0, 10, 0.05, '×', 'uniform', 'lens glow'),
		lensColor: color('#ff1a0a', 'uniform', 'lens color'),
		coreColor: color('#ffd2a0', 'uniform', 'core color'),
		chrome: color('#c9ced6', 'uniform', 'chrome tint'),
		roughness: num(0.15, 0, 1, 0.01, '', 'uniform', 'chrome roughness'),
	},
	// The Sharingan easter egg (src/eye/sharingan.js, docs/IRIS.md#sharingan):
	// once the checklist is done, the HUD's tomoe button puts one of the
	// Uchiha's eyes on the iris, or with odds `rinnegan` the Rinnegan. Its
	// pigment is `red` and `ink` (the Rinnegan's `lavender` and `violet`) over
	// the tissue, which still shades it by `tissue`; it glows `glow` times a
	// white surface under the rig, and the pupil narrows to `pupil`. It spins
	// `turns` turns into place over `duration`; the Rinnegan's lavender
	// spreads over the sclera in `spread`, ringed every `ringSpacing` along
	// the globe, `ringWidth` either side. `preview` shows a pattern still, for
	// tuning ('off' in use).
	sharingan: {
		preview: choice('off', ['off', ...PATTERN_NAMES], 'uniform', 'still preview'),
		red: color('#9e0b08', 'uniform', 'red'),
		ink: color('#0b0505', 'uniform', 'ink'),
		lavender: color('#9b74d6', 'uniform', 'Rinnegan lavender'),
		violet: color('#6d43b5', 'uniform', 'Rinnegan violet'),
		tissue: num(0.6, 0, 1, 0.01, '', 'uniform', 'tissue showing through'),
		glow: num(0.08, 0, 4, 0.01, '×', 'uniform', 'glow'),
		pupil: num(2.2, 1.5, 8, 0.05, 'mm', 'uniform', 'pupil diameter'),
		duration: num(1.2, 0.2, 4, 0.05, 's', 'uniform', 'spin duration'),
		turns: num(1.5, 0, 6, 0.05, '', 'uniform', 'spin turns'),
		spread: num(1.4, 0.2, 5, 0.05, 's', 'uniform', 'Rinnegan spread'),
		rinnegan: num(0.02, 0, 1, 0.005, '', 'uniform', 'Rinnegan odds'),
		ringSpacing: num(1.05, 0.3, 3, 0.01, 'mm', 'uniform', 'Rinnegan ring spacing'),
		ringWidth: num(0.045, 0, 0.3, 0.005, 'mm', 'uniform', 'Rinnegan ring half-width'),
	},
	post: {
		toneMapping: choice('agx', ['agx', 'aces', 'neutral', 'reinhard', 'linear'], 'define'),
		grain: num(0.035, 0, 0.3, 0.001),
		vignette: num(0.5, 0, 1.5, 0.01),
		chromaticAberration: num(0.4, 0, 3, 0.01, 'px', 'uniform', 'chromatic aberration'),
		saturation: num(1, 0, 2, 0.01),
		contrast: num(1, 0.5, 1.5, 0.01),
	},
	quality: {
		adaptiveResolution: toggle(true, 'uniform', 'adaptive resolution'),
		minPixelRatio: num(0.9, 0.5, 2, 0.05, '', 'uniform', 'min pixel ratio'),
		photoSamples: discrete(num(256, 1, 4096, 1, '', 'uniform', 'photo samples')),
		irisSteps: discrete(num(64, 16, 192, 1, '', 'uniform', 'iris march steps')),
		irisShadowSteps: discrete(num(10, 0, 48, 1, '', 'uniform', 'iris shadow steps')),
		irisAoSteps: discrete(num(5, 0, 8, 1, '', 'uniform', 'iris AO samples')),
		interactiveShadowSteps: discrete(num(4, 0, 48, 1, '', 'uniform', 'shadow steps while moving')),
		interactiveAoSteps: discrete(num(3, 0, 8, 1, '', 'uniform', 'AO samples while moving')),
		splitShading: toggle(true, 'uniform', 'blur at half res while moving'),
		antialias: toggle(true, 'uniform', 'antialias while moving'),
	},
	debug: {
		view: choice('beauty', DEBUG_VIEWS, 'define'),
	},
}

// The schema with the defaults of defaults.json. The panel does not export the
// `debug` group, so the debug view starts at its fallback.
const project = withDefaults(BASE_PARAM_SCHEMA, PROJECT_DEFAULTS)
if (project.unknown.length > 0)
	console.warn(`defaults.json names unknown parameters: ${project.unknown.join(', ')}`)
export const PARAM_SCHEMA = project.schema
