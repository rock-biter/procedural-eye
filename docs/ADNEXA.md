# Adnexa and Sclera

The eyelids, their skin and lashes, the visible tear film and the scleral vessels. They live in world space, except the vessels, which are drawn on the eyeball in eye space. They do not turn with the gaze, but the lids follow its vertical component ([`docs/ANIMATION.md`](ANIMATION.md#lid-follow)). Every generator is pure and seeded; the data behind the defaults is in [`docs/RESEARCH.md`](RESEARCH.md).

## Fissure

`createFissure()` ([`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js)) draws the palpebral fissure as an almond in the front plane.

- **Margins**:
  - From the medial to the lateral canthus, the upper margin arches up to `lids.mrd1` above the pupil center, and the lower margin down to `lids.mrd2` below it.
  - The arch amplitudes are solved by bisection, so the distances hold with any tilt or peak position.
- **Corners**: `lids.fissureWidth` apart, with the lateral canthus raised by `lids.canthalTilt` and the medial one at `lids.medialHeight`.
- **Shape**: the arches peak at `upperPeak` (nasal when negative) and `lowerPeak`, with the profiles `upperShape` and `lowerShape`.
- **Side**: the nasal side follows `eye.laterality`.

## Lid Mesh

`createLidMesh()` builds a ring of quads around the fissure: `t` runs along the loop and `s` across the lid profile (`LID_PROFILE`).

| s | Part | Shape |
| --- | --- | --- |
| [0, 0.07) | Intermarginal strip | The posterior margin rests on the eye surface (cornea included, which the upper lid covers) and the strip rises `lids.marginThickness` off the globe, tapering to nothing at the canthi. |
| [0.07, 0.14) | Anterior edge | A rounded edge, where the lashes grow. |
| [0.14, 1] | Skin | The skin out to 34 mm. |

The skin keeps `lids.lidThickness` off the globe:
- **Surface**: a sphere grown by that offset, merged by smooth maximum into the face plane (`lids.browDepth` above, `lids.cheekDepth` below, blended by height). Offsetting first and merging second keeps the concave orbit rim from folding the surface.
- **Crease**: the upper lid folds at `lids.creaseHeight` by `lids.creaseDepth`.
- **Canthi**:
  - The outward directions are averaged over a window that widens away from the margin, so the skin fans evenly around the corners.
  - The window's samples sit on a grid fixed along the loop, with a smooth compact kernel, so the fan turns smoothly across the corner where the loop normal jumps.
  - The canthi of a 27 mm fissure lie beyond the outline of a 24 mm globe. Past 0.96 of the sclera radius, the margin's support surface leaves the sphere tangentially and its slope eases off over 1.5 mm (`supportProfile()`). The margin there stays smooth, outside the globe and about at the equator, instead of collapsing onto the outline.

Each vertex carries:
- `lid` = (t, s, millimeters from the margin, upper);
- `follow` = (upper share, follow weight), where the weight is 1 within 3 mm of the margin and 0 from 14 mm up the skin.

### Fornix

`createFornixMesh()` fills the canthi. Where the fissure reaches past the globe's outline, the opening would otherwise show the background.

- **Surface**: an annulus on the support surface, from 0.96 of the sclera radius out to 22 mm.
- **Seam**: it dips 0.06 mm under the globe at its inner edge, so the sclera meets it in a clean line.
- **Rendering**: [`src/adnexa/lids.js`](../src/adnexa/lids.js) merges it into the lid mesh. The skin program shades it as wet mucosa (`lid` s = 0), and it does not follow the gaze.
- **Visibility**: the lids cover all of it but the corners, where it stands in for the conjunctival fornix and the caruncle.

### Skin Shading

`skin-fragment.glsl` with `lit-surface.glsl` and `skin-relief.glsl`:

- **Micro-relief**: Worley cell borders at two scales, giving the network of fine grooves; pores at some cell centers (`skin.pores`); fine wrinkles parallel to the margin (`skin.wrinkles`). Evaluated in 2D in the front plane, faded by the pixel footprint.
- **Albedo**: `skin.color`, mottled; pinker thin skin toward the lash line (`skin.redness`); the wet mucosa of the intermarginal strip.
- **Lighting**:
  - per-channel wrap diffuse (`skin.translucency`) with subsurface-tinted shadows;
  - GGX specular from each emitter's representative point (`skin.roughness`);
  - a mirror reflection of the rig where it is wet (`skin.wetness`);
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
