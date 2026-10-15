// Rest space of the iris and its deformation with the pupil, the twin of
// src/shaders/iris-space.glsl. Every iris feature is defined at rest (pupil
// radius `restPupilRadius`); a current radius r maps to a rest radius r0:
// - the pupillary zone, between the pupil and the collarette, keeps its area
//   (the sphincter does not stretch, the collarette follows the pupil):
//   r0 = √(r² − r_p² + r_p0²);
// - the ciliary zone stretches linearly between the collarette and the root:
//   r0 = r_c0 + (r − r_c)·(R − r_c0)/(R − r_c).
// Thickness scales with the change of area to the power `thicknessResponse`
// (κ < 1: the iris loses volume as it dilates, Quigley 2009).

export function createIrisSpace({
	restPupilRadius,
	rootRadius,
	collaretteFraction,
	thicknessResponse,
}) {
	const rp0 = restPupilRadius
	const R = rootRadius
	const rc0 = rp0 + collaretteFraction * (R - rp0)
	const zoneArea = rc0 * rc0 - rp0 * rp0

	const collaretteRadius = (rp) => Math.sqrt(rp * rp + zoneArea)

	// Rest radius of current radius `r` with pupil radius `rp`, and the local
	// stretch factors (rest length per current length): `radial` = dr0/dr,
	// `tangential` = r0/r; `thickness` = current thickness / rest thickness.
	function toRest(r, rp) {
		const rc = collaretteRadius(rp)
		let r0
		let radial
		if (r <= rc) {
			r0 = Math.sqrt(Math.max(r * r - rp * rp + rp0 * rp0, 0))
			radial = r / Math.max(r0, 1e-6)
		} else {
			radial = (R - rc0) / (R - rc)
			r0 = rc0 + (r - rc) * radial
		}
		const tangential = r0 / Math.max(r, 1e-6)
		const thickness = (radial * tangential) ** thicknessResponse
		return { r0, radial, tangential, thickness }
	}

	function toCurrent(r0, rp) {
		const rc = collaretteRadius(rp)
		if (r0 <= rc0) return Math.sqrt(Math.max(r0 * r0 - rp0 * rp0 + rp * rp, 0))
		return rc + ((r0 - rc0) * (R - rc)) / (R - rc0)
	}

	// Scale from rest-space distances to a conservative current-space bound:
	// the inverse of the largest stretch.
	function distanceScale(mapping) {
		return 1 / Math.max(mapping.radial, mapping.tangential, 1 / mapping.thickness)
	}

	// Normalized rest radius: 0 at the pupil margin, 1 at the root.
	const rho = (r0) => (r0 - rp0) / (R - rp0)

	return { rp0, R, rc0, zoneArea, collaretteRadius, toRest, toCurrent, distanceScale, rho }
}
