# Adnexa and Sclera

The eyelids, their skin and lashes, the visible tear film and the scleral vessels. They live in world space, except the vessels, which are drawn on the eyeball in eye space. They do not turn with the gaze, but the lids follow its vertical component ([`docs/ANIMATION.md`](ANIMATION.md#lid-follow)). Every generator is pure and seeded; the data behind the defaults is in [`docs/RESEARCH.md`](RESEARCH.md).

## Fissure

`createFissure()` ([`src/adnexa/fissure.js`](../src/adnexa/fissure.js)) draws the palpebral fissure in the front plane.

- **Canthi**: `lids.fissureWidth` apart horizontally, the medial one `lids.medialShare` of it nasal of the pupil center at `lids.medialHeight`, the lateral one raised by `lids.canthalTilt`. By default (29 mm, 0.505, −3.2 mm, 2°) the medial canthus lies 14.6 mm nasal of the pupil center and 3.2 mm below it, the lateral one 14.4 mm temporal and 1 mm higher, so the iris sits about in the middle of the fissure.
- **Margins**: each is a height above the chord between the canthi, in two cubic Hermite parts.
  - The first leaves the medial canthus at `upperMedialAngle` / `lowerMedialAngle` and rises to the extreme at `upperPeak` / `lowerPeak` (shares of the chord from the medial canthus).
  - The second falls from there to the lateral canthus, which it meets at `upperAngle` / `lowerAngle`.
  - The slopes are capped so each part stays monotonic.
  - The amplitudes are solved by bisection, so the upper margin reaches `lids.mrd1` above the pupil center and the lower one `lids.mrd2` below it.
- **Closure**: `lids.closure` (0 to 1) brings the upper margin down onto the lower one, which hardly moves: about 9 mm of travel, as in a spontaneous blink.
- **Side**: the nasal side follows `eye.laterality`.
- **Loop**: `fissure.loop(t)` runs along the upper margin from medial to lateral over t ∈ [0, 0.5), and back along the lower one.
  - `normal(t)` points away from the opening.
  - `along(t)` is the share of each margin's arc length from the medial (0) to the lateral canthus (1).
  - `lengths` holds the two margin lengths and `chord` the canthi's frame.

Everything built on the fissure uses it: the lid mesh, the lash roots, the tear meniscus and the fissure map stay consistent.

## Surfaces Around the Eye

[`src/adnexa/periocular.js`](../src/adnexa/periocular.js) holds the surfaces the lids are built between. Depths are behind the corneal apex.

| Surface | Shape |
| --- | --- |
| Support (`supportZ()`, `supportAt()`) | What the posterior margins rest on. It merges (smooth maximum over 4 mm) two surfaces: the globe, and a surface through the canthi at `lids.medialDepth` and `lids.lateralDepth`, receding above and below the chord.<br>The globe term includes the cornea, its limbal sulcus bridged by a 0.8 mm smooth maximum; past 0.88 of the sclera radius it is continued by a slope that eases off over 2 mm.<br>Toward the canthi the lids therefore pass in front of the receding globe.<br>Its normal is the sphere's over the globe and the support's elsewhere, averaged over 3 mm. |
| Conjunctiva (`conjunctivaZ()`) | What lies behind the margins:<br>- the globe, which past 0.96 of its radius turns back into the fornix (over 1.6 mm laterally, 0.9 mm medially);<br>- in the medial canthus the floor of the lacus lacrimalis (`LACUS`), 1.2 mm behind the margins at the canthus, falling toward the globe past the caruncle's center (2.2 mm per mm) and receding above and below the chord; it meets the globe just lateral of the plica, so the pocket behind the medial canthus is shallow, not a moat down to the fornix;<br>- the caruncle on it, an elliptic mound about 2.3 × 3.4 mm, centered 1.3 mm from the medial canthus, its top 0.45 mm behind the margins;<br>- the plica semilunaris, a crescent fold 0.3 mm high about 2.9 mm from the canthus. |
| Face (`createFace()`) | A thin-plate spline. It follows closely a ring of 64 points of the open lids' shell, laid out like the mesh's columns so the canthi's fans get points too, so the lids flow into it, and passes loosely through its anatomical landmarks, so it stays smooth. The landmarks are:<br>- the brow (`browHeight`, `browProjection`) and the forehead;<br>- the glabella, the nasion and the nasal dorsum (`noseDistance`, `noseProjection`), and the nasal sidewall;<br>- a recess beside the medial canthus;<br>- the lateral orbital rim (`rimDepth`) and the temple;<br>- the infraorbital rim and the cheek (`cheekProjection`). |

## Lid Mesh

`createLidMesh()` ([`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js)) builds one ring of 560 × 150 quads around the fissure: the upper lid from the medial to the lateral canthus, the lower lid back.

- **Columns**:
  - They are laid out on the open fissure, spaced by their length along the loop plus 3 mm per radian of turning, so the corners get enough columns.
  - The canthi are rounded as the columns go round them, by a cubic Bézier tangent to both margins: the medial angle into a U around the caruncle (1 mm radius), the lateral one into an acute corner (0.5 mm).
- **Rows**: each column is traced outward in the front plane to the edge of the patch, an ellipse about 65 × 68 mm centered on the pupil.
  - Near the margin a row follows the margin's normal; far out it follows a ray from the fissure's center, so rows never cross.
  - The trace ends exactly at the patch's edge, so neighboring rows stay even.
  - `a` is the distance traveled, in mm.
- **Profile** (`s` across, `LID_PROFILE`):

| s | Part | Shape |
| --- | --- | --- |
| [0, 0.07) | Intermarginal strip | The posterior margin rests on the support. The strip rises `lids.marginThickness` off it (0.8 of that on the lower lid), thinning toward the canthi to 0.6 of it medially and 0.35 laterally, where the margins merge into the skin without a rim. |
| [0.07, 0.14) | Anterior edge | A quarter round of `lids.marginRadius`, where the lashes grow. |
| [0.14, 1] | Skin | The lid's shell, turning into the face. |

- **Shell**:
  - The margin stands off the support along the support's normal at the margin, its tilt from the front eased toward 35° (smoothly: a hard limit leaves a line on the skin where the support's tilt crosses it).
  - Past the margin's edge that sideways shift fades out over 6 mm, and the thickness is taken upright, blended in over 3 mm. Shifting every row along its own normal would pull rows back where the support bends from the globe to the canthi, and crease the skin there.
  - Its thickness grows from the margin's at the edge to `lidThickness` within 2.5 mm on the upper lid, and to `lowerThickness` over 4.5 mm on the lower one, which so slopes down from its margin instead of standing in a shelf over the globe.
  - Toward each canthus the thickness tapers over a third of the margin. A faster taper would part neighboring columns into creases. Every taper along the margin is a smootherstep or a sine: a plain smoothstep's curvature jumps at its ends, which the shading shows as a line down the lid.
- **Into the face**: away from the margin the skin turns into the face. The turn ends 2 mm past the ring the face follows, and toward the canthi it starts right past the margin's edge, so the margin does not stand as a rim with a moat behind it around the corners. The ring lies before the globe curves away under the lid: about 2 mm above the fold, 3.5 mm below the lower margin, and nearer the margin toward the canthi (down to 0.3 of that at the corners). Lid and face meet on that ring, so there is no seam, and the lids do not fall back with the globe into a bag.
- **Over it**:
  - The upper lid's crease, `creaseDepth` deep at `creaseHeight` from the margin, a little lower toward the canthi and fading out before them (it does not run into the corners). This is the pretarsal show: with the eye open, the skin above folds down over the crease, here as a fold of `creaseFold`.
  - The lower lid's pretarsal roll (`lowerRoll`), broad and fullest in the middle.
  - The lateral overlap (`lateralOverlap`): along a fold out of the lateral canthus, slanting down, the upper lid's skin stands over the lower lid's. The step stays within a few millimeters of the fold.
  - However deep the crease, the skin stays at least 0.6 mm off the globe.
- **Closure**:
  - As the lids close, each column's margin slides to the closing margin. The lid stretches over the globe up to 12 mm from the margin, and the fold above the crease unfolds by 4 mm.
  - The face is built from the open lids, so it stays put.
  - The mesh keeps its layout at any closure, so a blink can morph between two meshes ([`docs/ROADMAP.md`](ROADMAP.md)).

Each vertex carries:
- `lid` = (t, s, millimeters from the margin, upper share);
- `relief` = (the front-plane direction in which the distance from the margin grows, the depth of the grooves in mm, the share of the way along the margin from the medial canthus):
  - the depth is ≤ 0 and records the crease and the lateral fold;
  - the skin program orients and shades its fine detail by this attribute;
- `follow` = (upper share, follow weight): the weight is 1 over the inner half of the lid band and 0 from 3 mm past its edge, so the brow and the cheek stay put;
- `ao`: the baked ambient occlusion, 1 open to 0 closed ([Baked Occlusion](#baked-occlusion)).

The upper share is 1 on the upper lid and 0 on the lower one, blended across the canthi by the column's direction. All of the relief is in the mesh positions, so the key-light shadow pass, which draws the same mesh with the lid follow, casts the same folds. `lidFace()` returns the face the lids turn into.

### Baked Occlusion

`bakeLidOcclusion()` ([`src/adnexa/lidOcclusion.js`](../src/adnexa/lidOcclusion.js)) bakes ambient occlusion into the lid and conjunctiva vertices on every rebuild, in about 0.15 s.

- **Field**: the skin, the conjunctiva and the globe are drawn into a height field seen from the front (0.1 mm cells over ±24 × ±18 mm).
- **Horizon**: each vertex looks for the horizon over that field in 8 directions, out to 3 mm, against its tangent plane; nearer occluders count more (horizon-based ambient occlusion, Bavoil 2008).
- **Where**: the lid band (up to 10 mm from the margin), the conjunctiva and the palpebral conjunctiva; the face beyond it stays open. It darkens the canthi's pockets most, then the posterior margins against the globe and the crease.
- **Into the sac**: the field sees the palpebral conjunctiva only edge-on, so its vertices darken with their depth below the margin instead, by e^(−depth / 0.8 mm) (`OCCLUSION.sac`).
- **Rest**: it is baked with the lids at rest and does not follow the gaze. The skin program scales it by `skin.occlusion`.

### Conjunctiva

`createConjunctivaMesh()` fills the canthi. Where the lids pass in front of the receding globe, the opening shows the conjunctiva, the caruncle and the plica, not the background.

- **Surface**: an annulus on `conjunctivaZ()`, from 0.9 of the sclera radius out to just past the canthi (16.5 mm medially, 15 mm laterally). At its outer edge it falls back behind the skin.
- **Seam**: it dips 0.06 mm under the globe where it is the globe, so the sclera meets it in a clean line. Past the fornix's start it leaves the globe only tangentially, so the seam holds only because the globe turns in place, about its own center ([`docs/OPTICS.md`](OPTICS.md#eye-space)): a globe shifted by a tenth of a millimeter would cut through it in facets.
- **Rendering**: [`src/adnexa/lids.js`](../src/adnexa/lids.js) merges it into the lid mesh. The skin program shades it as wet mucosa (`lid` s = 0, `relief` radial and without grooves). It does not follow the gaze.

### Palpebral Conjunctiva

`createPalpebralMesh()` closes the conjunctival sac. The lid is a single sheet and the conjunctiva a height field, so without it a line of sight could pass under a posterior margin, between the margin and the eye, and run behind the lids to the background: from the side, from above or below, in the pockets behind both canthi (and along the globe's outline).

- **Surface**: a curtain hanging from each posterior margin straight back, to 1.5 mm under the conjunctiva or the globe, whichever is lower. Its top row is the lid mesh's posterior margin (the same columns), its rows denser near the margin. Straight, not slanting out under the lid: a line of sight running out of a pocket meets it at the margin's outline.
- **Where it shows**: in the canthi's pockets, where the margins stand in front of the receding globe, and wherever a margin stands off the globe. Where the margin rests on the globe it stays inside it.
- **Rendering**: merged into the lid mesh like the conjunctiva and shaded as the margin's posterior border (`lid` s = 0), its front faces toward the opening. It follows the gaze with its margin, so the sac stays closed as the lids follow; its bottom lies near the axis the lids turn about, and barely moves.
- **Check**: a test projects the lids, the conjunctiva, the curtain and the globe in orthographic views up to 60° to the side and 40° up or down, and requires every line of sight that enters the fissure within 5 mm of a canthus to land on a front face. Views further round (80° to the side, 60° up or down) still let a few hundredths of a square millimeter through.

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
  - **Baked patterns**: the melanin and blood mottling, the single veins and the oily patches depend only on the rest position and `lids.seed`. [`src/adnexa/skinPattern.js`](../src/adnexa/skinPattern.js) bakes them on the GPU (`skin-pattern-fragment.glsl`, the functions of `skin-relief.glsl`) into a mipmapped 2048² RGBA8 texture over the front-plane box of the lid mesh (about 0.03 mm per texel) whenever the lids are rebuilt, so the skin reads one texel instead of hashing about a hundred cells per pixel, and the far skin is filtered. The freckles stay analytic: `skin.freckles` glides in transitions.
- **Margin**, from the posterior border to the lash line, mottled along its length: the wet conjunctiva, Marx's line (the mucocutaneous junction), the row of meibomian orifices (34 above, 24 below, a few closed, some capped with meibum), the grey line, the keratinized anterior margin. Its fine bumps break the wet reflection into glints. They and the orifices are shaded in the strip's own frame, from screen-space derivatives of `relief`'s place along the margin and of `s`.
- **Lighting**:
  - per-channel wrap diffuse (`skin.translucency`) with subsurface-tinted shadows;
  - GGX specular from each emitter's representative point (`skin.roughness`, lower in oily patches on the lids);
  - a mirror reflection of the rig where it is wet: the margin, fading out within half a millimeter onto the skin (`skin.wetness`). Further out the moisture follows the relief and reflects as the GGX lobe; a mirror there showed the emitters as pale blots in the canthi's folds, where the skin turns grazing;
  - ambient and specular occlusion in the folds and grooves, and the baked occlusion (`ao`, scaled by `skin.occlusion`);
  - the key-light shadow.

## Lashes

`generateLashes()` ([`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js)) places `lashes.upperCount` and `lashes.lowerCount` lashes along the lashed part of each margin.

- **Rows and roots**: the upper lashes sit in 3 irregular rows, the lower in 2. Roots are on the rounded anterior edge, along the lashed part of each margin: from the lacrimal punctum, about a fifth of the way from the medial canthus, to the lateral canthus.
- **Length**: `upperLength` and `lowerLength`. Lashes are shorter toward the medial canthus and in the back rows, with random variation.
- **Direction**:
  - Each lash leaves the lid tilted away from the fissure by `upperLift` / `lowerLift`, measured from the skin normal just past the edge.
  - It then curls further that way (`upperCurl` / `lowerCurl`), with `randomness` in lift, sideways deviation and curl.
- **Clumps**: runs of 2–5 neighbors whose tips draw together (`clumping`).

[`src/adnexa/lashes.js`](../src/adnexa/lashes.js) sweeps tapered tubes along the 14-segment centerlines. The lash material (`lash-fragment.glsl`) uses Kajiya–Kay diffuse and two shifted specular lobes along the hair: a white one off the cuticle (`lashes.shine`) and a dimmer, colored one through the fiber. Tips are lighter. Lashes and lids cast the key-light shadow (layer 1).

## Tear Film

[`src/adnexa/tearFilm.js`](../src/adnexa/tearFilm.js):

- **Meniscus** (`createMeniscusMesh()`): a concave water fillet in the corner between the intermarginal strip and the support, along both margins.
  - Its radius is `lids.meniscusLower` (0.36 mm) and `lids.meniscusUpper`. It tapers at the canthi and where the margin leaves the globe (`supportLift()`): the water needs the globe to hold it.
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
