// Eye geometry in eye space, in millimeters: the globe (sclera sphere) is
// centered at the origin and the optical axis points +Z, out of the cornea
// apex. +Y is superior; +X is nasal for a right eye and temporal for a left
// one (the camera looks down -Z, so +X is the right of the picture).
// Twin of src/shaders/eye-profile.glsl; pack() produces its uniforms.
//
// - The anterior cornea is a conic of revolution (radius R, asphericity Q)
//   placed so that it meets the sclera sphere at the limbus radius
//   (HVID / 2). A C2 blend of `limbusBlend` width joins the two; it runs
//   slightly inside both, as the shallow corneoscleral sulcus does.
// - The posterior cornea is a sphere `thickness` behind the apex.
// - The anterior lens (Navarro: R 10.2, Q -3.1316) sits `chamber.depth`
//   behind the posterior cornea; the pupil margin rests on it.
// - The iris back surface (pigment epithelium) is the paraboloid
//   z = irisBaseZ - irisCurvature * r^2 through the pupil margin, dropping
//   `rootDrop` toward the root (the forward bowing over the lens).
import { smootherstep, smootherstepDerivative } from '../math'

// Navarro 1985 / Escudero-Sanz 1999 lens, fixed: only its front face and the
// pupil it supports matter to the picture.
export const LENS = Object.freeze({
	radius: 10.2,
	asphericity: -3.1316,
	posteriorRadius: -6.0,
	thickness: 4.0,
	ior: 1.42,
})

// Depth w(r) behind the apex of a conic of revolution: r^2 / (R (1 + sqrt(1 - (1+Q) r^2 / R^2))).
export function conicSag(r, R, Q) {
	const disc = 1 - ((1 + Q) * r * r) / (R * R)
	if (disc < 0) return NaN
	return (r * r) / (R * (1 + Math.sqrt(disc)))
}

// dw/dr of conicSag().
export function conicSagSlope(r, R, Q) {
	return r / Math.sqrt(R * R - (1 + Q) * r * r)
}

export function createEyeGeometry(params) {
	const scleraRadius = params.globe.scleraRadius
	const corneaRadius = params.cornea.radius
	const corneaQ = params.cornea.asphericity
	const limbusRadius = params.cornea.diameter / 2
	const limbusBlend = params.cornea.limbusBlend
	const limbusZ = Math.sqrt(scleraRadius * scleraRadius - limbusRadius * limbusRadius)
	const apexZ = limbusZ + conicSag(limbusRadius, corneaRadius, corneaQ)

	const posteriorRadius = params.cornea.posteriorRadius
	const posteriorApexZ = apexZ - params.cornea.thickness
	const lensApexZ = posteriorApexZ - params.chamber.depth

	const restPupilRadius = params.iris.restPupilDiameter / 2
	const pupilMarginZ = lensApexZ - conicSag(restPupilRadius, LENS.radius, LENS.asphericity)
	const irisRootRadius = params.iris.rootRadius
	const irisCurvature =
		params.iris.rootDrop / (irisRootRadius * irisRootRadius - restPupilRadius * restPupilRadius)
	const irisBaseZ = pupilMarginZ + irisCurvature * restPupilRadius * restPupilRadius
	const nasalSign = params.eye.laterality === 'left' ? -1 : 1

	const blendStart = limbusRadius - limbusBlend / 2
	const blendEnd = limbusRadius + limbusBlend / 2

	const corneaZ = (r) => apexZ - conicSag(r, corneaRadius, corneaQ)
	const scleraZ = (r) => Math.sqrt(Math.max(scleraRadius * scleraRadius - r * r, 0))

	// Height of the outer surface at distance r from the optical axis.
	function surfaceZ(r) {
		if (r <= blendStart) return corneaZ(r)
		if (r >= blendEnd) return scleraZ(r)
		const s = smootherstep(blendStart, blendEnd, r)
		return corneaZ(r) + s * (scleraZ(r) - corneaZ(r))
	}

	// dz/dr of surfaceZ().
	function surfaceSlope(r) {
		const corneaSlope = -conicSagSlope(r, corneaRadius, corneaQ)
		const scleraSlope = -r / scleraZ(r)
		if (r <= blendStart) return corneaSlope
		if (r >= blendEnd) return scleraSlope
		const s = smootherstep(blendStart, blendEnd, r)
		const ds = smootherstepDerivative(blendStart, blendEnd, r)
		return corneaSlope + s * (scleraSlope - corneaSlope) + ds * (scleraZ(r) - corneaZ(r))
	}

	// Back surface of the iris (pigment epithelium) at radius r from the axis.
	const irisBackZ = (r) => irisBaseZ - irisCurvature * r * r

	const tearIor = params.cornea.tearIor
	const corneaIor = params.cornea.ior
	const aqueousIor = params.chamber.aqueousIor

	return {
		scleraRadius,
		corneaRadius,
		corneaQ,
		limbusRadius,
		limbusBlend,
		blendStart,
		blendEnd,
		limbusZ,
		apexZ,
		posteriorRadius,
		posteriorApexZ,
		posteriorCenterZ: posteriorApexZ - posteriorRadius,
		lensApexZ,
		restPupilRadius,
		pupilMarginZ,
		irisRootRadius,
		irisCurvature,
		irisBaseZ,
		nasalSign,
		tearIor,
		corneaIor,
		aqueousIor,
		corneaZ,
		scleraZ,
		surfaceZ,
		surfaceSlope,
		irisBackZ,
		// Uniform vectors of src/shaders/eye-profile.glsl.
		pack() {
			return {
				uGlobe: [scleraRadius, limbusRadius, limbusBlend, apexZ],
				uCornea: [corneaRadius, corneaQ, posteriorRadius, posteriorApexZ],
				uIor: [tearIor, corneaIor, aqueousIor, LENS.ior],
				uLens: [LENS.radius, LENS.asphericity, lensApexZ, LENS.thickness],
				uIrisShape: [irisBaseZ, irisCurvature, irisRootRadius, restPupilRadius],
			}
		},
	}
}
