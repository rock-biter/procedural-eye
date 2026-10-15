// Seeded generator of the scleral vessel network (pure): polylines on the
// globe in polar coordinates around the optical axis, φ (azimuth, radians)
// and ψ (angle from the axis, radians). Two populations (EyeWiki,
// Review of Optometry: docs/RESEARCH.md):
// - episcleral vessels: deep, wider, fairly straight, running radially from
//   the periphery toward the limbus, branching as they go;
// - conjunctival vessels: superficial, fine, tortuous, branching often.
// Near the limbus the vessels end in small loops (the limbal arcade).
// Segments: { phi0, psi0, phi1, psi1, width (mm), depth (0 superficial, 1 deep) }.
import { createRandom } from '../random'

export const SCLERA_PSI = Object.freeze({ min: 0.42, max: 1.45 })

function grow(segments, random, start, options) {
	const stack = [{ ...start, generation: 0 }]
	while (stack.length > 0 && segments.length < options.maxSegments) {
		const vessel = stack.pop()
		let { phi, psi, heading, width } = vessel
		const steps = Math.round(options.steps * (0.6 + 0.6 * random()))
		for (let k = 0; k < steps; k++) {
			const stepLength = options.stepLength * (0.6 + 0.8 * random())
			// Heading: 0 points toward the limbus (decreasing ψ); tortuosity is a
			// persistent random turn.
			heading += (random() - 0.5) * options.tortuosity
			heading *= 0.97
			const sinPsi = Math.max(Math.sin(psi), 0.2)
			const nextPsi = psi - (Math.cos(heading) * stepLength) / options.radius
			const nextPhi = phi + (Math.sin(heading) * stepLength) / (options.radius * sinPsi)
			segments.push({
				phi0: phi,
				psi0: psi,
				phi1: nextPhi,
				psi1: nextPsi,
				width,
				depth: options.depth,
			})
			phi = nextPhi
			psi = nextPsi
			width *= options.taper
			// A branch that turns back past the map's outer edge is under the lids anyway.
			if (psi > SCLERA_PSI.max + 0.03) break
			if (psi < options.limbus || width < options.minWidth) {
				// The limbal arcade: a short loop running along the limbus.
				if (psi < options.limbus + 0.04 && random() < options.loops) {
					const direction = random() < 0.5 ? -1 : 1
					for (let j = 0; j < 4; j++) {
						const p1 = phi + direction * 0.045
						const s1 = psi + 0.012 * Math.sin(((j + 1) / 4) * Math.PI)
						segments.push({
							phi0: phi,
							psi0: psi,
							phi1: p1,
							psi1: s1,
							width: width * 0.8,
							depth: options.depth,
						})
						phi = p1
						psi = s1
					}
				}
				break
			}
			if (random() < options.branching && vessel.generation < options.generations) {
				stack.push({
					phi,
					psi,
					heading: heading + (random() < 0.5 ? -1 : 1) * (0.5 + 0.7 * random()),
					width: width * (0.55 + 0.25 * random()),
					generation: vessel.generation + 1,
				})
			}
		}
	}
}

export function generateVessels(settings, scleraRadius) {
	const random = createRandom(`vessels:${settings.seed}`)
	const segments = []
	const limbus = SCLERA_PSI.min + 0.08
	const deepCount = Math.round(settings.episcleral)
	for (let i = 0; i < deepCount; i++) {
		grow(
			segments,
			random,
			{
				phi: ((i + random() * 0.8) / Math.max(deepCount, 1)) * Math.PI * 2,
				psi: SCLERA_PSI.max - random() * 0.1,
				heading: (random() - 0.5) * 0.3,
				width: 0.06 + 0.06 * random(),
			},
			{
				radius: scleraRadius,
				depth: 1,
				steps: 60,
				stepLength: 0.22,
				tortuosity: 0.35,
				taper: 0.985,
				minWidth: 0.012,
				branching: 0.06,
				generations: 3,
				limbus,
				loops: 0.3,
				maxSegments: 20000,
			},
		)
	}
	const fineCount = Math.round(settings.conjunctival)
	for (let i = 0; i < fineCount; i++) {
		grow(
			segments,
			random,
			{
				phi: random() * Math.PI * 2,
				psi: SCLERA_PSI.min + 0.15 + random() * (SCLERA_PSI.max - SCLERA_PSI.min - 0.2),
				heading: (random() - 0.5) * 2.2,
				width: 0.02 + 0.03 * random(),
			},
			{
				radius: scleraRadius,
				depth: 0,
				steps: 45,
				stepLength: 0.12,
				tortuosity: 1.1 * settings.tortuosity,
				taper: 0.982,
				minWidth: 0.006,
				branching: 0.09,
				generations: 4,
				limbus,
				loops: 0.6,
				maxSegments: 40000,
			},
		)
	}
	return segments
}
