# Adnexa and Sclera

The eyelids, their skin and lashes, the visible tear film and the scleral vessels. They live in world space, except the vessels, which are drawn on the eyeball in eye space. They do not turn with the gaze, but the lids follow its vertical component ([`docs/ANIMATION.md`](ANIMATION.md#lid-follow)). Every generator is pure and seeded; the data behind the defaults is in [`docs/RESEARCH.md`](RESEARCH.md).

## Fissure

`createFissure()` ([`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js)) draws the palpebral fissure as an almond in the front plane.

- **Margins**:
  - From the medial to the lateral canthus, the upper margin arches up to `lids.mrd1` above the pupil center, and the lower margin down to `lids.mrd2` below it.
  - The arch amplitudes are solved by bisection, so the distances hold with any tilt or peak position.
  - Neither margin is a perfect arch: each wanders off it by up to 0.12 mm × `lids.irregularity`, in two or three undulations seeded by `lids.seed` that vanish at the canthi. The bisection includes the wander, so MRD1 and MRD2 still hold.
- **Corners**: `lids.fissureWidth` apart, with the lateral canthus raised by `lids.canthalTilt` and the medial one at `lids.medialHeight`.
- **Shape**: the arches peak at `upperPeak` (nasal when negative) and `lowerPeak`, with the profiles `upperShape` and `lowerShape`.
- **Side**: the nasal side follows `eye.laterality`.
- **Along**: `fissure.along(t)` is the share of each margin's arc length from the medial (0) to the lateral canthus (1), and `fissure.lengths` the two margin lengths.

Everything built on the fissure uses it: the lid mesh, the lash roots, the tear meniscus and the fissure map stay consistent with any seed.

## Lid Mesh

`createLidMesh()` builds a ring of 480 × 144 quads around the fissure: `t` runs along the loop and `s` across the lid profile (`LID_PROFILE`). The loop normals it averages are memoized per fissure; the mesh builds in about 0.3 s.

| s | Part | Shape |
| --- | --- | --- |
| [0, 0.07) | Intermarginal strip | The posterior margin rests on the eye surface (cornea included, which the upper lid covers) and the strip rises `lids.marginThickness` off the globe, tapering to nothing at the canthi. Away from the canthi the thickness varies by up to ±20% × `lids.irregularity` along the lid. |
| [0.07, 0.14) | Anterior edge | A rounded edge, where the lashes grow; its radius varies like the thickness. |
| [0.14, 1] | Skin | The skin out to 34 mm. |

The skin keeps `lids.lidThickness` off the globe:
- **Surface**: a sphere grown by that offset, merged by smooth maximum into the face plane (`lids.browDepth` above, `lids.cheekDepth` below, blended by height). Offsetting first and merging second keeps the concave orbit rim from folding the surface.
- **Temple**: the face plane recedes by `lids.templeDepth`, reached about 16 mm lateral of the axis. The lateral canthus lies about at the globe's equator, and the skin slopes back past it instead of standing up in a wall in front of it.
- **Relief** (`skinRelief()`): a seeded displacement (`lids.seed`) along the skin normal averaged over 2.5 mm. The true normal turns too fast where the globe's offset meets the face plane, and a fold or fat pad there would fold the offset surface over. The displaced skin stays 0.3 mm clear of the globe. Its features are in the table below.
- **Canthi**:
  - The outward directions are averaged over a window that widens away from the margin, so the skin fans evenly around the corners.
  - The window's samples sit on a grid fixed along the loop, with a smooth compact kernel, so the fan turns smoothly across the corner where the loop normal jumps.
  - The canthi of a 27 mm fissure lie beyond the outline of a 24 mm globe. Past 0.96 of the sclera radius, the margin's support surface leaves the sphere tangentially and its slope eases off over 1.5 mm (`supportProfile()`). The margin there stays smooth, outside the globe and about at the equator, instead of collapsing onto the outline.

The relief of the skin:

| Feature | Shape | Parameters |
| --- | --- | --- |
| Unevenness | Soft lumps of the tissue, 2–5 mm across, from 1 mm off the margin. | `irregularity` |
| Upper crease | A fold at `creaseHeight` in the middle, 62% of it at the canthi, wandering and varying in depth along the lid. | `creaseHeight`, `creaseDepth`, `irregularity` |
| Hooding | The preseptal skin rolling down onto the crease, fullest on the lateral side. | `hooding` |
| Accessory crease | A broken, shallower fold about 3 mm above the crease. | `folds`, `creaseDepth` |
| Lower lid | The pretarsal roll under the lash line, the lower-lid sulcus about 4.5 mm down, and three fat pads below it, the central one fullest. | `bags`, `irregularity` |
| Tear trough | A groove from below the medial canthus down and out, clear of the margin. | `bags` |
| Crow's feet | Folds fanning out of the lateral canthus from 3 to 22 mm, wandering and broken. | `folds` |
| Lid folds | Soft folds along both lids, irregularly spaced and broken, giving way to the crow's feet laterally. | `folds` |

Every term that depends on the place along the lid vanishes at the canthi, where the upper and lower halves of the ring meet; the rest depends on the front-plane position only. The fine wrinkles that a vertex row cannot hold are shaded ([Skin Shading](#skin-shading)).

Each vertex carries:
- `lid` = (t, s, millimeters from the margin, upper);
- `relief` = (the front-plane direction in which the distance from the margin grows, the depth of the folds in mm (≤ 0), the share of the way along the margin from the medial canthus): the skin program orients and shades its fine detail by it;
- `follow` = (upper share, follow weight), where the weight is 1 within 3 mm of the margin and 0 from 14 mm up the skin.

All of the relief is in the mesh positions, so the key-light shadow pass, which draws the same mesh with the lid follow, casts the same folds.

### Fornix

`createFornixMesh()` fills the canthi. Where the fissure reaches past the globe's outline, the opening would otherwise show the background.

- **Surface**: an annulus on the support surface, from 0.96 of the sclera radius out to 22 mm.
- **Seam**: it dips 0.06 mm under the globe at its inner edge, so the sclera meets it in a clean line.
- **Rendering**: [`src/adnexa/lids.js`](../src/adnexa/lids.js) merges it into the lid mesh. The skin program shades it as wet mucosa (`lid` s = 0, `relief` radial and without folds), and it does not follow the gaze.
- **Visibility**: the lids cover all of it but the corners, where it stands in for the conjunctival fornix and the caruncle.

### Skin Shading

`skin-fragment.glsl` with `lit-surface.glsl` and `skin-relief.glsl`. Every pattern is evaluated at the rest position in the front plane, so it stays on the skin when the lids follow the gaze. Nothing is periodic: patterns are hashed per cell and seeded by `lids.seed`.

- **Micro-relief** (heights in mm with analytic gradients):
  - the primary furrows: three families of straight grooves 60° apart, broken into segments, that cross into rhomboid and triangular plateaus, the family along the skin tension lines the deepest. The tension lines run along the margin on the lids and radially out of the lateral canthus;
  - a fine network of shallow grooves inside the plateaus (Worley cell borders, only some of them, in patches) and pores at a few cell centers (`skin.pores`), fewer near the lash line and on the upper lid;
  - fine wrinkles (`skin.wrinkles`): irregular, broken lines along the lids, crossed at a slant by shorter, shallower ones (the crepe of thin lid skin), and the crow's feet fanning out of the lateral canthus.
  - The footprint they are filtered by is the pixel's, widened by the depth of field's blur circle on the skin (`uDefocus`: aperture × defocus / focus distance). The furrows and wrinkles fade where it is wider than about 0.1 mm, the network, the pores and the orifices from 0.015 mm: blurred, they would only average out. Narrower than the footprint, a groove widens and grows shallower, keeping its darkness, so fresh frames do not flicker.
- **Albedo**: `skin.color` under three absorbers:
  - melanin: mottling at 6 and 1.3 mm, freckles in loose clusters (`skin.freckles`), and darker skin in the folds (the `relief` depth), under the eye and at the canthi (`skin.pigmentation`);
  - blood: mottling at 3 and 0.7 mm, pinker thin skin toward the lash line and in the canthi (`skin.redness`);
  - veins: a violet tint over the upper lid and under the eye, and single veins seen through the thin skin, soft and in stretches (`skin.veins`).
  - The furrows are a little darker, the lash roots darker still.
- **Margin**, from the posterior border to the lash line, mottled along its length: the wet conjunctiva, Marx's line (the mucocutaneous junction), the row of meibomian orifices (34 above, 24 below, a few closed, some capped with meibum), the grey line, the keratinized anterior margin. Its fine bumps break the wet reflection into glints. They and the orifices are shaded in the strip's own frame, from screen-space derivatives of `relief`'s place along the margin and of `s`.
- **Lighting**:
  - per-channel wrap diffuse (`skin.translucency`) with subsurface-tinted shadows;
  - GGX specular from each emitter's representative point (`skin.roughness`, lower in oily patches on the lids);
  - a mirror reflection of the rig where it is wet (`skin.wetness`, toward the margin);
  - ambient and specular occlusion in the folds and grooves;
  - the key-light shadow.

## Lashes

`generateLashes()` ([`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js)) places `lashes.upperCount` and `lashes.lowerCount` lashes along the lashed part of each margin.

- **Rows and roots**: the upper lashes sit in 3 irregular rows, the lower in 2. Roots are on the rounded anterior edge.
- **Length**: `upperLength` and `lowerLength`. Lashes are shorter toward the medial canthus and in the back rows, with random variation.
- **Direction**:
  - Each lash leaves the lid tilted away from the fissure by `upperLift` / `lowerLift`, measured from the skin normal just past the edge.
  - It then curls further that way (`upperCurl` / `lowerCurl`), with `randomness` in lift, sideways deviation and curl.
- **Clumps**: runs of 2–5 neighbors whose tips draw together (`clumping`).

[`src/adnexa/lashes.js`](../src/adnexa/lashes.js) sweeps tapered tubes along the 14-segment centerlines. The lash material (`lash-fragment.glsl`) uses Kajiya–Kay diffuse and two shifted specular lobes along the hair: a white one off the cuticle (`lashes.shine`) and a dimmer, colored one through the fiber. Tips are lighter. Lashes and lids cast the key-light shadow (layer 1).

## Tear Film

[`src/adnexa/tearFilm.js`](../src/adnexa/tearFilm.js):

- **Meniscus** (`createMeniscusMesh()`): a concave water fillet in the corner between the intermarginal strip and the eye surface, along both margins.
  - Its radius is `lids.meniscusLower` (0.36 mm) and `lids.meniscusUpper`, tapering at the canthi.
- **Bubbles**: `lids.bubbles` tiny spheres caught in the lower meniscus (an instanced mesh, up to 60).
- **Material** (`tear-fragment.glsl`): water. A smooth mirror of the rig with water's Fresnel, over a faint transmitted tint of what lies behind. It is drawn opaque, to keep the alpha contract ([`docs/RENDERING.md`](RENDERING.md#alpha-contract)).

## Fissure Map

[`src/adnexa/fissureMap.js`](../src/adnexa/fissureMap.js) bakes the signed distance to the fissure outline, in the front plane at the lids' rest position.
- **Map**: 256², covering ±20 × ±16 mm, positive inside the opening.
- **Upload**: `EyeApp` uploads it as a half-float texture on every rebuild.
- **Lookup**: shaders look it up through `lidRestPosition()`, which undoes the lid follow rotation.
- **Uses**:
  - lid occlusion of the globe and of the iris's ambient light;
  - redder sclera near the lids;
  - the lid and lash reflections in the cornea ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)).

## Scleral Vessels

[`src/sclera/vesselGenerator.js`](../src/sclera/vesselGenerator.js) grows a seeded network on the globe. It works in polar coordinates around the optical axis: φ around, ψ from the axis, over `SCLERA_PSI` = 0.42–1.45 rad. Each vessel turns persistently at random, tapers, and branches by generations.

| Population | Count | Start | Course | Width |
| --- | --- | --- | --- | --- |
| Episcleral (deep) | `sclera.vessels.episcleral` | At the outer edge | Fairly straight, toward the limbus | Wider: 0.06–0.12 mm |
| Conjunctival (superficial) | `sclera.vessels.conjunctival` | Anywhere | Tortuous (`tortuosity`), branching more | Fine: 0.02–0.05 mm |

- **Limbus**: near it, vessels may end in small loops (the limbal arcade).
- **Outer edge**: a branch that turns back past the map's outer edge stops; it would be under the lids.

[`src/sclera/scleraMaps.js`](../src/sclera/scleraMaps.js) rasterizes the network with Canvas2D into a 2048×512 polar texture (u = φ / 2π, repeating; v over ψ).
- **Red channel**: superficial vessels, sharp.
- **Green channel**: deep vessels, blurred as seen through the conjunctiva and Tenon's capsule.

`scleraAlbedo()` (`sclera.glsl`) builds the color on `sclera.color`:
- yellower with `sclera.yellowing`;
- pinker toward the lids and in the corners (`sclera.redness`);
- the deep vessels mixed in violet-red and the superficial ones in bright red, both stronger with `redness`.

The conjunctival micro-relief (`sclera.irregularity`, 3D gradient noise) perturbs the mirror normal, so the wet reflection on the sclera breaks up.
