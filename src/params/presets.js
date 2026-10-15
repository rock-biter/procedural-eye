// Named starting points: deep partial overrides of the schema defaults. The
// URL picks one with ?preset=<name>; ?state= then applies on top. Each
// reference preset is tuned on a photograph of references/ (`references`).

// The frontal 100 mm framing the reference presets were tuned with (the
// default camera sits off to the side with a longer lens).
const frontal = { focalLength: 100, azimuth: 0, elevation: 0 }
// Close iris macro framing: about 2:1 on the iris, shallow focus.
const macro = { camera: { ...frontal, distance: 150, fNumber: 11 } }
const living = { animation: { enabled: false } }

export const PRESETS = {
	default: { label: 'Default (hazel)', params: {} },
	'amber-lattice': {
		label: 'Amber lattice (01)',
		references: ['eye-01.jpg'],
		params: {
			...living,
			camera: {
				...macro.camera,
				azimuth: -6,
				elevation: 3,
				targetX: 1.2,
				exposure: 0.4,
				whiteBalance: 4600,
			},
			iris: { pupilDiameter: 3.4 },
			irisColor: {
				ablMelanin: 0.55,
				eumelanin: 0.22,
				fiberAbl: 0.95,
				saturation: 1.35,
				heterochromia: { amount: 0.35, melanin: 0.75, eumelanin: 0.3, extent: 0.04 },
				periphery: { amount: 0.25 },
			},
			irisStructure: {
				seed: 11,
				crypts: { grade: 3.4, size: 1.05, band: 0.42, roundness: 0.15, wall: 0.05, depth: 0.36 },
				fibers: { radialCount: 120, radialHeight: 1.0, arcCount: 40 },
				collarette: { amplitude: 0.04, height: 0.09 },
			},
			lighting: {
				key: { azimuth: 62, elevation: 12, intensity: 12, width: 500, height: 700 },
				fill: { enabled: false },
				window: {
					enabled: true,
					azimuth: -55,
					elevation: 8,
					intensity: 6,
					skyTop: '#a58fe0',
					skyBottom: '#d6c8f0',
				},
			},
		},
	},
	'blue-grey-phone': {
		label: 'Blue-grey phone macro (02)',
		references: ['eye-02.jpg'],
		params: {
			...living,
			camera: { ...frontal, distance: 170, fNumber: 2.8, exposure: 0.3, whiteBalance: 6200 },
			iris: { pupilDiameter: 3.0 },
			irisColor: {
				ablMelanin: 0.07,
				eumelanin: 0.8,
				rayleighShare: 0.55,
				stromaScattering: 3,
				fiberAbl: 0.3,
				heterochromia: { amount: 0.4, melanin: 0.28, eumelanin: 0.3, extent: 0.02 },
			},
			irisStructure: {
				crypts: { grade: 0.8 },
				fibers: { radialCount: 180, radialThickness: 0.025 },
			},
			lighting: {
				key: { intensity: 4, azimuth: 10, elevation: 30 },
				fill: { enabled: false },
				ring: { enabled: true, innerRadius: 8, outerRadius: 11, intensity: 400 },
				camera: { lensRadius: 6, bodyWidth: 70, bodyHeight: 140 },
			},
		},
	},
	'brown-crypts': {
		label: 'Brown crypts (03, 06)',
		references: ['eye-03.png', 'eye-06.jpg'],
		params: {
			...living,
			camera: { ...macro.camera, exposure: 0.5, whiteBalance: 4800 },
			iris: { pupilDiameter: 4.2 },
			irisColor: {
				ablMelanin: 0.72,
				eumelanin: 0.7,
				fiberAbl: 1,
				saturation: 1.25,
				periphery: { amount: 0.4 },
			},
			irisStructure: {
				seed: 23,
				crypts: {
					grade: 4,
					size: 1.1,
					band: 0.48,
					roundness: 0.1,
					wall: 0.045,
					depth: 0.4,
					peripheral: 0.8,
				},
				fibers: { radialCount: 90, radialHeight: 1.02, radialThickness: 0.04, arcCount: 35 },
				collarette: { amplitude: 0.06, height: 0.11, teeth: 12 },
			},
			lighting: {
				key: { enabled: false },
				fill: { intensity: 1.2 },
				window: { enabled: true, azimuth: 55, elevation: 5, intensity: 30, distance: 1400 },
			},
		},
	},
	'green-heterochromia': {
		label: 'Green, central heterochromia (04)',
		references: ['eye-04.jpg'],
		params: {
			...living,
			camera: { ...frontal, distance: 158, fNumber: 9, exposure: 0.6, whiteBalance: 5600 },
			iris: { pupilDiameter: 3.6 },
			irisColor: {
				ablMelanin: 0.3,
				eumelanin: 0.08,
				rayleighShare: 0.95,
				saturation: 1.6,
				heterochromia: {
					amount: 0.95,
					melanin: 0.62,
					eumelanin: 0.12,
					extent: 0.06,
					softness: 0.035,
				},
				freckles: { count: 1, size: 0.35, melanin: 0.95, eumelanin: 0.7 },
			},
			irisStructure: {
				crypts: { grade: 1.2 },
				collarette: { amplitude: 0.07, teeth: 18, height: 0.08 },
			},
			lighting: {
				key: { enabled: false },
				fill: { enabled: false },
				sky: { enabled: true, intensity: 9, horizonHeight: -4 },
			},
		},
	},
	'blue-orange-collarette': {
		label: 'Blue, orange collarette (05, 07)',
		references: ['eye-05.jpg', 'eye-07.avif'],
		params: {
			...living,
			camera: {
				...frontal,
				distance: 175,
				fNumber: 5.6,
				azimuth: -12,
				exposure: 0.2,
				whiteBalance: 6000,
			},
			iris: { pupilDiameter: 3.2 },
			irisColor: {
				ablMelanin: 0.05,
				eumelanin: 0.85,
				fiberAbl: 0.15,
				saturation: 1.3,
				heterochromia: {
					amount: 0.9,
					melanin: 0.55,
					eumelanin: 0.12,
					extent: -0.02,
					softness: 0.02,
				},
				freckles: { count: 7, size: 0.18, melanin: 0.75, eumelanin: 0.15 },
			},
			irisStructure: {
				crypts: { grade: 1.6, roundness: 0.7 },
				fibers: {
					radialCount: 200,
					radialThickness: 0.028,
					radialHeight: 1.0,
					radialWaviness: 0.3,
				},
				collarette: { amplitude: 0.08, teeth: 20, height: 0.09 },
			},
			lighting: {
				key: { enabled: false },
				window: { enabled: true, azimuth: -45, elevation: 12, intensity: 18 },
			},
		},
	},
	'hazel-nevi': {
		label: 'Hazel with nevi (08)',
		references: ['eye-08.avif'],
		params: {
			...living,
			camera: { ...frontal, distance: 190, fNumber: 8, exposure: 0.4 },
			iris: { pupilDiameter: 3.3 },
			irisColor: {
				ablMelanin: 0.25,
				eumelanin: 0.55,
				rayleighShare: 0.6,
				saturation: 1.3,
				heterochromia: { amount: 0.9, melanin: 0.7, eumelanin: 0.18, extent: 0.12, softness: 0.06 },
				freckles: { count: 9, size: 0.32, melanin: 0.95, eumelanin: 0.35, inferotemporal: 0.4 },
				fiberAbl: 0.3,
			},
			irisStructure: { crypts: { grade: 1.0 } },
			lighting: {
				key: { shape: 'disk', azimuth: 28, elevation: 4, width: 220, height: 220, intensity: 30 },
				fill: { shape: 'disk', azimuth: -28, elevation: 4, width: 220, height: 220, intensity: 30 },
				leds: { enabled: true, count: 8, radius: 14, size: 1.2, intensity: 600 },
			},
		},
	},
	'blue-crypts': {
		label: 'Blue crypts (09)',
		references: ['eye-09.jpg'],
		params: {
			...living,
			camera: { ...macro.camera, distance: 140, exposure: 0.5, whiteBalance: 6500 },
			iris: { pupilDiameter: 3.0 },
			irisColor: {
				ablMelanin: 0.025,
				eumelanin: 0.9,
				stromaScattering: 3.5,
				rayleighShare: 0.85,
				fiberAbl: 0.0,
				saturation: 1.2,
				freckles: { count: 6, size: 0.2, melanin: 0.5, eumelanin: 0.05 },
			},
			irisStructure: {
				crypts: { grade: 2.4, roundness: 0.85, size: 0.85 },
				fibers: { radialCount: 220, radialHeight: 1.03, radialThickness: 0.03, arcCount: 60 },
				ruff: { width: 0.09 },
			},
			lighting: {
				key: { azimuth: 0, elevation: 35, intensity: 10 },
				fill: { azimuth: 0, elevation: -35 },
			},
		},
	},
	'refraction-checker': {
		label: 'Refraction checker (debug)',
		params: { ...living, camera: frontal, debug: { view: 'refraction-checker' } },
	},
	outdoor: {
		label: 'Outdoor sky',
		params: {
			lighting: {
				key: { enabled: false },
				fill: { enabled: false },
				sky: { enabled: true },
				camera: { photographer: false },
			},
		},
	},
}
