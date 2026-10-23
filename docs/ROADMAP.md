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
| 7 | Reflections of the lids and lashes in the cornea, tear meniscus, wet skin | Done |
| 8 | Sclera and limbus: vessel network, elliptical limbus, limbal ring, broken-up wet reflection | Done |
| 9 | Animation: pupil light reflex and hippus, gaze, saccades, microsaccades, drift, lid follow, photo mode | Done |
| 10 | Presets per reference photograph, random eye from population priors | Done |
| 11 | Optional refinements (below) | Open |
| 12 | Sound: camera foley for every control (CC0 recordings: the buttons, the detents of the zoom and aperture rings, the film advance, the shutter; synthesized: the hover, the focus beep, the creak past a knob's end), a focus beep before Snapshot's shutter, the mirror and the focus beep in photo mode, a soft synthesized glass harp, fading in at the first gesture, every sound paused while the page is hidden or out of focus, mute toggle and M ([`docs/AUDIO.md`](AUDIO.md)) | Done |
| 13 | Performance, first pass: unused code and assets out of the build, the development tools loaded only on request, exact speed-ups of the bakes (the color lookup, the fissure map), the compile overlapped with the first rebuild, a 60 fps adaptive resolution on phones | Done |
| 14 | Performance, second pass: effects and grain in one pass without FXAA, the depth of field's composite with early outs, photo previews every 150 ms with several samples per frame, the iris march's last evaluation reused, the skin's lit emitters per vertex and its wet mirror only near the margin, the light shafts' cookie on the GPU | Done |

## Changes From the Plan

- **Near-field reflections**: the plan's cube capture with distance impostors was replaced by an analytic model ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)): a lid sphere, the fissure map and a lash comb. It is exact at the margins and free per frame. The `capture` parameter kind went with it.
- **Shadows**: accumulation samples jitter the light across the emitter area, which gives the exact penumbra. Interactive frames use PCSS on the skin (the face shadows itself) and a fixed Poisson PCF on the eye's receivers.
- **Post-processing**: no bloom. The accumulation antialiases the photo; fresh frames get FXAA, which SMAA did not beat on the iris for ten times the cost ([`docs/RENDERING.md`](RENDERING.md#pipeline)).
- **Benchmarks**: the planned `scripts/bench.mjs` is `pnpm capture --bench`.
- **Vessel generation** runs on the main thread: about 11 ms at the maximum counts, on bakes only. No worker is needed.

## Known Gaps

- **Iris**: fiber translucency (light through thin bridging fibers) is not modeled; fibers are opaque.
- **Lid geometry**:
  - Extreme shapes still crease the skin near the medial lower lid: a fissure under 25 mm with a full pretarsal roll (`lowerRoll` near 1).
  - The upper lid's fold cannot overhang its crease: the skin row runs outward without turning back, so hooding (the preseptal skin folding down over the crease, common with age) and the lateral overlap are shaped as steps, not undercuts.
  - The lids pass in front of the globe toward the canthi. Where the margin leaves the globe, the meniscus fades, and a small gap under the margin shows the palpebral conjunctiva behind it.
  - The surface steps where the anterior edge turns into the skin (`LID_PROFILE.edge`): the skin's relief (the fold over a low crease, the lower lid's roll and fullness) starts there at full height while the edge carries none, up to 0.28 mm with the defaults' crease 1 mm above the margin and about 0.1 mm on the lower lid. The mesh draws it across one row, a little ledge along the lash line.
  - The palpebral conjunctiva is a curtain hanging straight back from the margins, not the lid's back surface curving into the fornix: it closes the conjunctival sac, but its shape behind the canthi is a stand-in. From grazing views (80° to the side, 60° up or down) a few hundredths of a square millimeter of the pockets still show the background.
- **Face**: a thin-plate spline through anatomical landmarks, kept as a hint (softer than the measured brow, nose and cheek projections) and without eyebrow hairs. The skin is a patch about 65 × 68 mm around the eye, closed behind by the back shell (a flat band along its edge and a darker dome, [`docs/ADNEXA.md`](ADNEXA.md#back-shell)), not by a head: wide or grazing framings show its edge and the shell.
- **Baked occlusion**: it is baked with the lids at rest; as the lids follow the gaze it stays where it was baked. The blink's frames bake their own.
- **Blink** ([`docs/ANIMATION.md`](ANIMATION.md#blink)):
  - The lid meshes morph through four closed frames; between them the fold over the crease is a blend of two (up to 0.35 mm off the rebuilt lid, in motion only).
  - The eye does not move with the blink: neither its small turn down and in (1–5° in voluntary and reflex blinks, Collewijn 1985) nor Bell's phenomenon.
  - The cornea does not push the closing lid out: over its edge the lid's skin is only kept off the globe, which shows as a lighter arc on a closed lid (as with `lids.closure` 1).
  - The frames take about a second in a worker after a lid rebuild; until they arrive the eye does not blink.
- **Skin**:
  - The fine relief is evaluated in the front plane, so it stretches where the skin turns away from it, deep in the canthi.
  - Its bake costs about 0.35 s of GPU work on the M1, a hitch at start-up and at the end of a glide that changes `lids.seed` or the skin's structure; spread over several frames, it would not show.
  - Light scattered under the skin softens the relief in the diffuse by a share per channel, not by scale: the dimples of the pores fade in the red as much as the furrows.
  - There are no vellus hairs.
- **Lashes**: they have no minimum on-screen width, so far-off fine lashes alias in interactive frames until the accumulation resolves them.
- **Export**: **Save PNG** writes the canvas resolution. Tiled high-resolution export is not implemented.
- **Pupil**: the panel has no light-step button and no D(t) graph. The dynamics are covered by unit tests.
- **Age**: `eye.age` only changes the pupil, not the scleral yellowing, the limbal ring, or the lids (folds, bags, hooding).
- **Self-test**: there is no `?selftest=1` comparison of GLSL twins against their JS versions. Shader–CPU agreement is checked visually (the refraction checker, captures).
- **Dust**: a mote's occlusion compares its distance with the sharp one in the accumulated mean, so a surface out of focus cuts a blurred mote behind it along its sharp outline; the casters' shadow reaches the motes only through the soft coverages, which ignore the gaze follow and the blink; the motes' cube (`dust.extent`) is centered on the globe and covers the desktop zoom-out framing, so the portrait zoom-out shows fewer at its edges; the haze lifts the backdrop a little from the tone it is matched to (`skin.backdrop`).
- **Light shafts and floor shadow**: the blades' σ widens from the source at the ray's densest point only (an approximation of a cone); on the iris they scale the key's term instead of adding their own; the shafts' coverage ignores the gaze follow and the blink; the floor under the face is unseen from below (the default camera) and edge-on at the eye's height, and its shadow comes from the shafts' source even with the shafts off.
- **Sound** ([`docs/AUDIO.md`](AUDIO.md)):
  - The recordings were cut from measurements, not by ear, and the levels were balanced on headless meters: both need a listen and a pass in the panel.
  - The glass harp's timbre and levels were set from the model and headless meters, not by ear.
  - The pause follows the window's focus: the sound also stops while the focus is in the browser's own interface (the address bar, the developer tools).
  - The sounds are not placed in space beyond a pan by the control's place on the screen.
  - On iOS the ringer switch silences Web Audio.
- **Sharingan** ([`docs/IRIS.md`](IRIS.md#sharingan)): the patterns are compass approximations of the reference drawings (curves as arcs of circles; Obito's hooks stand apart from his blades, the spokes of Madara's eternal one are a symmetric guess); while one shows, the pupil holds at `sharingan.pupil`, without the light reflex or hippus; the spin turns the pigment over the still tissue; the Rinnegan's rings on the iris live in rest space and follow the tissue, those on the sclera are millimeters along the globe, so they only meet at the limbus; a morph melts only the ink: the colors under it (red, lavender, violet) crossfade; the awakening's shockwave starts from the middle of the frame, not from the eye, which most framings put near it; its chime and bowl are synthesized and were levelled on headless meters (−24 and −11 dBFS peaks), not yet by ear.
- **Gaze and orbit**: a living eye with `animation.gaze` = `camera` turns toward the camera as it orbits. Use the default `wander`, `fixed`, photo mode, or a still eye to look at grazing angles.

## Future Work

- Limbus: palisades of Vogt; arcus senilis with age.
- Caruncle and plica shading: today they share the wet-mucosa shading of the conjunctiva (no fine hairs, no sebaceous texture).
- Skin relief in the geometry: the lid folds, the tear trough and the crow's feet are shaded only (the rewritten lids carry the crease, the pretarsal roll and the lateral overlap).
- Purkinje III/IV refinements, the red reflex with coaxial light, corneal and limbal caustics.
- Axial chromatic fringing.
- A 3D bake of the iris field for cheaper interactive frames.
- Further performance work: the measurements of the second pass are in [`docs/QUALITY.md`](QUALITY.md#performance). Tried there and left out: split frames by default (they lose the thin wet highlights), a deferred cap shading (at most 0.65 ms of the cap's draw), and the smaller ones none of which was faster.
- Lighter meshes on phones (the layout's tolerance in the phone's pixels): estimated at 1–2% of a frame, left until `?stats` measures a phone. A skin relief baked at half size on phones was tried and left out: at the closest zoom it coarsens the wet glints along the lid margin.
- Tried and left out (October 2026): the iris noise's lattice gradients read from a baked table instead of hashed, for the micro striations and the ruff. The image was the same to the bit, but the eyeball's draw did not get measurably faster on the M1 (sine and cosine cost about what the texture read does).
- Tiled high-resolution export.
