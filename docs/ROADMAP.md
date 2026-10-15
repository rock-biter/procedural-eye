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
- **Shadows**: the plan's PCSS became two parts. Interactive frames use Poisson PCF; accumulation samples jitter the light across the emitter area, which gives the exact penumbra.
- **Post-processing**: no bloom and no SMAA. The accumulation antialiases the image.
- **Benchmarks**: the planned `scripts/bench.mjs` is `pnpm capture --bench`.
- **Vessel generation** runs on the main thread: about 11 ms at the maximum counts, on bakes only. No worker is needed.

## Known Gaps

- **Iris**: fiber translucency (light through thin bridging fibers) is not modeled; fibers are opaque.
- **Lid geometry**:
  - At the canthi the two lids meet in a sharp crease.
  - Extreme shapes crease the skin within a few millimeters of the canthi: very open or very thick lids, or MRD2 above about 6 mm.
  - Strongly tilted, wide fissures, and ptosis, fold the far skin about 19 mm or more from the axis, which is out of view in macro framings.
  - The lid surface is a ring offset from the fissure loop. A fold-free parameterization of the far skin, such as a conformal map of the annulus, would remove these.
- **Skin**:
  - The hooding is a bulge over the crease; it does not overhang it.
  - The fine relief is evaluated in the front plane, so it stretches where the skin turns away from it, deep in the canthi.
  - There are no vellus hairs.
- **Lashes**: they have no minimum on-screen width, so far-off fine lashes alias in interactive frames until the accumulation resolves them.
- **Export**: **Save PNG** writes the canvas resolution. Tiled high-resolution export is not implemented.
- **Pupil**: the panel has no light-step button and no D(t) graph. The dynamics are covered by unit tests.
- **Age**: `eye.age` only changes the pupil, not the scleral yellowing, the limbal ring, or the lids' hooding, bags and folds.
- **Self-test**: there is no `?selftest=1` comparison of GLSL twins against their JS versions. Shader–CPU agreement is checked visually (the refraction checker, captures).
- **Gaze and orbit**: a living eye with `animation.gaze` = `camera` turns toward the camera as it orbits. Use the default `wander`, `fixed`, photo mode, or a still eye to look at grazing angles.

## Future Work

- Limbus: palisades of Vogt; arcus senilis with age.
- A detailed caruncle and plica semilunaris at the medial canthus. Today a smooth wet fornix surface fills both canthi.
- Purkinje III/IV refinements, the red reflex with coaxial light, corneal and limbal caustics.
- Axial chromatic fringing.
- A 3D bake of the iris field for cheaper interactive frames.
- Tiled high-resolution export.
