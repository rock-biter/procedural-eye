# Adnexa and Sclera

The eyelids, their skin and lashes, the visible tear film and the scleral vessels. They live in world space, except the vessels, which are drawn on the eyeball in eye space. They do not turn with the gaze, but the lids follow its vertical component ([`docs/ANIMATION.md`](ANIMATION.md#lid-follow)). Every generator is pure and seeded; the data behind the defaults is in [`docs/RESEARCH.md`](RESEARCH.md).

## Fissure

`createFissure()` ([`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js)) draws the palpebral fissure as an almond in the front plane.

- **Margins**:
  - From the medial to the lateral canthus, the upper margin arches up to `lids.mrd1` above the pupil center, and the lower margin down to `lids.mrd2` below it.
  - The arch amplitudes are solved by bisection, so the distances hold with any tilt or peak position.
  - Neither margin is a perfect arch: each wanders off it by up to 0.12 mm × `lids.irregularity`, in two or three undulations seeded by `lids.seed` that vanish at the canthi. The bisection includes the wander, so MRD1 and MRD2 still hold.
- **Corners**: `lids.fissureWidth` apart, with the lateral canthus raised by `lids.canthalTilt` and the medial one at `lids.medialHeight`. By default the canthi lie low (the medial one 3 mm below the pupil center, the lateral one 7° higher), so the upper margin arches high over the line between them and the lower one stays shallow.
- **Shape**: the arches peak at `upperPeak` (nasal when negative) and `lowerPeak`, with the profiles `upperShape` and `lowerShape`.
- **Side**: the nasal side follows `eye.laterality`.
- **Along**: `fissure.along(t)` is the share of each margin's arc length from the medial (0) to the lateral canthus (1), and `fissure.lengths` the two margin lengths.

Everything built on the fissure uses it: the lid mesh, the lash roots, the tear meniscus and the fissure map stay consistent with any seed.

## Lid Mesh

`createLidMesh()` builds a ring of 480 × 144 quads around the fissure: `t` runs along the loop and `s` across the lid profile (`LID_PROFILE`). The loop normals it averages are memoized per fissure. `EyeApp` rebuilds the mesh, and the fissure map, only when the lids or the eye geometry change.

| s | Part | Shape |
| --- | --- | --- |
| [0, 0.07) | Intermarginal strip | The posterior margin rests on the eye surface (cornea included, which the upper lid covers) and the strip rises `lids.marginThickness` off the globe, tapering to nothing at the canthi. Away from the canthi the thickness varies by up to ±20% × `lids.irregularity` along the lid. |
| [0.07, 0.14) | Anterior edge | A rounded edge, where the lashes grow; its radius varies like the thickness. |
| [0.14, 1] | Skin | The lid band, then the face around the orbit, out to 34 mm. |

The surface is blocked out in volumes, as in a sculpting reference (`references/Four-view anatomical eye sculpt reference.png`): the globe, the two lid bands, the brow ridge, the cheek, the nose and the temple.

### Lid Bands

Each lid is a convex crescent band wrapped over the globe (`lidBand()`, `lidShell()`):

| | Upper lid | Lower lid |
| --- | --- | --- |
| Height (from the margin, along the skin) | To the crease: `creaseHeight` in the middle | To the lid–cheek junction: `lowerHeight` |
| Thickness off the globe | `lidThickness` | 0.7 of it |
| Fullness (swell around 0.6 of the height: the lid over the tarsus and the fat behind the septum) | `fullness` | `bags` |
| Groove at its edge | The crease, `creaseDepth` deep | The lid–cheek junction, shallower and wider |

- **Crescents**: the heights narrow to 2 mm at the canthi, where the two bands meet; the upper one peaks a little nasally, the lower one a little temporally. Thickness, fullness and grooves blend across the canthi, so the ring has no seam.
- **Thickness**: it rises from the margin's within 2.5 mm in the middle of the lid, over 6 mm at the canthi, where the lids wrap past the globe's outline.
- **Shell**: near the margin the lid is the eye surface (cornea included) offset along the smooth sphere normal, so the corneal bulge does not fold it; within 3 mm it turns into a dome over the globe (the sclera sphere grown by the thickness, continued past 0.88 of its radius by its tangent).
- **The lower lid** rests on the cheek too, where the cheek stands in front of that dome: it does not sink between the globe and the cheek. The upper one rides the globe only, so its crease slips under the brow.

### Face Around the Orbit

`faceDepth()` gives the face's depth behind the corneal apex as a height field, summed from volumes:

| Volume | Shape |
| --- | --- |
| Orbital opening | About 38 × 34 mm around the eye, where the face falls back behind the lids: 4 mm under the brow, 0.5 mm above the cheek. The rim is 6 mm behind the apex. |
| Brow ridge | An arch over the eye, 18.5 mm up in the middle and bending down laterally, at `browDepth` (3 mm in front of the apex by default); its underside is steeper than its top. It fades laterally toward the orbital rim and medially into the glabella. |
| Cheek | A broad swell below and lateral of the eye at `cheekDepth`; the cheekbone keeps it forward under the lateral canthus. |
| Nose | Its side rising medially to the bridge about 31 mm from the axis, 7 mm in front of the apex. |
| Lateral rim and temple | 7 mm further back from 12–22 mm lateral, at the canthus and above, and `templeDepth` more toward the temple. |
| Forehead, lower face | Receding above the brow and far below. |
| Asymmetry | Seeded noise (`irregularity`) outside the orbital opening. |

Past the edge of each band the skin turns from the lid into the face over 3.5 mm (upper) or 4.5 mm (lower): from the crease up the underside of the brow, from the lid–cheek junction onto the cheek. Where the face is merged with a dome over the globe (smooth maximum), neither can cut into the other.

- **Canthi**:
  - The outward directions are averaged over a window that widens away from the margin, so the skin fans evenly around the corners.
  - The window's samples sit on grids fixed along the loop, with a smooth compact kernel, so the fan turns smoothly across the corner where the loop normal jumps. The grid steps are powers of two, blended around the window's width, so the average also changes smoothly with the width.
  - The canthi of a 27 mm fissure lie beyond the outline of a 24 mm globe. Past 0.96 of the sclera radius, the margin's support surface leaves the sphere tangentially and its slope eases off over 1.5 mm (`supportProfile()`). The margin there stays smooth, outside the globe and about at the equator, instead of collapsing onto the outline.

### Relief

`skinRelief()` adds a seeded displacement (`lids.seed`) along the surface normal averaged over 2.5 mm, kept 0.3 mm clear of the globe:

| Feature | Shape | Parameters |
| --- | --- | --- |
| Unevenness | Soft lumps of the tissue, 2–5 mm across, from 1 mm off the margin. | `irregularity` |
| Tear trough | A groove from below the medial canthus down and out, clear of the margin. | `bags` |
| Crow's feet | Folds fanning out of the lateral canthus from 3 to 22 mm, wandering and broken. | `folds` |
| Lid folds | Soft folds along both lids from about 2 mm off the margin, irregularly spaced and broken, giving way to the crow's feet laterally; finer and deeper on the thin lower lid. | `folds` |

The fine wrinkles that a vertex row cannot hold are shaded ([Skin Shading](#skin-shading)).

Each vertex carries:
- `lid` = (t, s, millimeters from the margin, upper);
- `relief` = (the front-plane direction in which the distance from the margin grows, the depth of the grooves in mm (≤ 0: the crease, the lid–cheek junction, the folds), the share of the way along the margin from the medial canthus): the skin program orients and shades its fine detail by it;
- `follow` = (upper share, follow weight), where the weight is 1 over the inner half of the lid band and 0 from 3 mm past its edge: the brow and the cheek stay put.

All of the relief is in the mesh positions, so the key-light shadow pass, which draws the same mesh with the lid follow, casts the same folds.

### Fornix

`createFornixMesh()` fills the canthi. Where the fissure reaches past the globe's outline, the opening would otherwise show the background.

- **Surface**: an annulus on the support surface, from 0.96 of the sclera radius out to 16 mm, falling back past 14 mm behind the skin, which recedes there toward the temple.
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
