# Roadmap

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold: tooling, CI, docs, params schema, capture script | Done |
| 1 | Vertical slice: eyeball profile mesh, two-surface refraction, tear-film Fresnel, analytic light rig, accumulation with thin-lens depth of field, tone mapping, grain | Done |
| 2 | Iris SDF core: rest space, shell bounds, over-relaxed march, structure atlas, normals, AO, soft shadows, ray-cone LOD | Done |
| 3 | Iris structure: crypts with undercuts, radial vessels and collagen arcs bridging them, ruff, nodules, micro striations | Done |
| 4 | Iris color: spectral Kubelka–Munk lookup, pigment atlas (heterochromia, freckles, periphery), depth-dependent albedo, white balance | Done |
| 5 | Photo pipeline: interactive gather DOF fading into the accumulated lens samples, area-light jitter, autofocus on the entrance pupil, PNG export with the state in a `tEXt` chunk | Done |
| 6 | Lids, skin, lashes, key-light shadows | Done |
| 7 | Reflections of the lids and lashes in the cornea, tear meniscus, bubbles, wet skin | Done |
| 8 | Sclera and limbus: vessel network, elliptical limbus, limbal ring, broken-up wet reflection | Done |
| 9 | Animation: pupil light reflex and hippus, gaze, saccades, microsaccades, drift, lid follow, photo mode | Done |
| 10 | Presets per reference photograph, random eye from population priors | Done |
| 11 | Optional refinements (below) | Open |

## Changes From the Plan

- **Near-field reflections**: the plan's cube capture with distance impostors was replaced by an analytic model ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)): a lid sphere, the fissure map and a lash comb. It is exact at the margins and free per frame. The `capture` parameter kind went with it.
- **Shadows**: accumulation samples jitter the light across the emitter area, which gives the exact penumbra. Interactive frames use PCSS on the skin (the face shadows itself) and a fixed Poisson PCF on the eye's receivers.
- **Post-processing**: no bloom and no SMAA. The accumulation antialiases the image.
- **Benchmarks**: the planned `scripts/bench.mjs` is `pnpm capture --bench`.
- **Vessel generation** runs on the main thread: about 11 ms at the maximum counts, on bakes only. No worker is needed.

## Known Gaps

- **Iris**: fiber translucency (light through thin bridging fibers) is not modeled; fibers are opaque.
- **Lid geometry**:
  - Extreme shapes still crease the skin near the medial lower lid: a fissure under 25 mm with a full pretarsal roll (`lowerRoll` near 1).
  - The upper lid's fold cannot overhang its crease: the skin row runs outward without turning back, so hooding (the preseptal skin folding down over the crease, common with age) and the lateral overlap are shaped as steps, not undercuts.
  - The lids pass in front of the globe toward the canthi. Where the margin leaves the globe, the meniscus fades, and a small gap under the margin shows the conjunctiva behind it.
- **Face**: a thin-plate spline through anatomical landmarks, kept as a hint (softer than the measured brow, nose and cheek projections) and without eyebrow hairs. The skin is a patch about 76 × 80 mm: wide or grazing framings show its edge, and from the side, past its edge, the back of the globe and the conjunctiva.
- **Blink**: `lids.closure` closes the lids as a rebuild (a still pose). The mesh keeps its layout at any closure, so an animated blink can morph between an open and a closed mesh in the vertex shader; that, the cornea pushing the closing lid out, and Bell's phenomenon are not implemented.
- **Skin**:
  - The fine relief is evaluated in the front plane, so it stretches where the skin turns away from it, deep in the canthi.
  - There are no vellus hairs.
- **Lashes**: they have no minimum on-screen width, so far-off fine lashes alias in interactive frames until the accumulation resolves them.
- **Export**: **Save PNG** writes the canvas resolution. Tiled high-resolution export is not implemented.
- **Pupil**: the panel has no light-step button and no D(t) graph. The dynamics are covered by unit tests.
- **Age**: `eye.age` only changes the pupil, not the scleral yellowing, the limbal ring, or the lids (folds, bags, hooding).
- **Self-test**: there is no `?selftest=1` comparison of GLSL twins against their JS versions. Shader–CPU agreement is checked visually (the refraction checker, captures).
- **Gaze and orbit**: a living eye with `animation.gaze` = `camera` turns toward the camera as it orbits. Use the default `wander`, `fixed`, photo mode, or a still eye to look at grazing angles.

## Future Work

- Limbus: palisades of Vogt; arcus senilis with age.
- Caruncle and plica shading: today they share the wet-mucosa shading of the conjunctiva (no fine hairs, no sebaceous texture).
- Skin relief in the geometry: the lid folds, the tear trough and the crow's feet are shaded only (the rewritten lids carry the crease, the pretarsal roll and the lateral overlap).
- Purkinje III/IV refinements, the red reflex with coaxial light, corneal and limbal caustics.
- Axial chromatic fringing.
- A 3D bake of the iris field for cheaper interactive frames.
- Tiled high-resolution export.
