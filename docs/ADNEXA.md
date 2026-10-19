# Adnexa and Sclera

The eyelids, their skin and lashes, the visible tear film, the back shell that closes the skin patch behind, and the scleral vessels. They live in world space, except the vessels, which are drawn on the eyeball in eye space. They do not turn with the gaze, but the lids follow its vertical component ([`docs/ANIMATION.md`](ANIMATION.md#lid-follow)) and blink ([`docs/ANIMATION.md`](ANIMATION.md#blink), [Blink Frames](#blink-frames)). Every generator is pure and seeded; the data behind the defaults is in [`docs/RESEARCH.md`](RESEARCH.md).

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
| Face (`createFace()`) | A thin-plate spline. It follows closely a ring of 64 points of the open lids' shell (on the lower lid, its front's junction with the cheek), laid out like the mesh's columns so the canthi's fans get points too, so the lids flow into it, and passes loosely through its anatomical landmarks, so it stays smooth. The landmarks are:<br>- the brow (`browHeight`, `browProjection`) and the forehead;<br>- the glabella, the nasion and the nasal dorsum (`noseDistance`, `noseProjection`), and the nasal sidewall;<br>- a recess beside the medial canthus;<br>- the lateral orbital rim (`rimDepth`) and the temple;<br>- the infraorbital rim and the cheek (`cheekProjection`). |

## Lid Mesh

`createLidMesh()` ([`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js)) builds one ring of quads around the fissure: the upper lid from the medial to the lateral canthus, the lower lid back. Its columns and rows follow the curvature of the surface ([Layout](#layout)): about 190 × 50 by default.

- **Columns**:
  - They are laid out on the open fissure, along a weight that grows with their length along the loop plus 3 mm per radian of turning; the layout places them along it.
  - The canthi are rounded as the columns go round them, by a cubic Bézier tangent to both margins: the medial angle into a U around the caruncle (1 mm radius), the lateral one into an acute corner (0.5 mm).
- **Rows**: each column is traced outward in the front plane to the edge of the patch, an ellipse about 65 × 68 mm centered on the pupil (`LID_PATCH`). The outer row is returned as `rim`, the patch's edge, where the [back shell](#back-shell) starts.
  - Near the margin a row follows the margin's normal; far out it follows a ray from the fissure's center, so rows never cross.
  - The trace ends exactly at the patch's edge, so neighboring rows stay even.
  - `a` is the distance traveled, in mm.
- **Profile** (`s` across, `LID_PROFILE`):

| s | Part | Shape |
| --- | --- | --- |
| [0, 0.07) | Intermarginal strip | The posterior margin rests on the support. The strip rises `lids.marginThickness` off it (0.8 of that on the lower lid), thinning toward the canthi to 0.6 of it medially and 0.35 laterally, where the margins merge into the skin without a rim. |
| [0.07, 0.14) | Anterior edge | A quarter round of `lids.marginRadius`, where the lashes grow. On the lower lid it rounds off square to the margin's normal, so the lid's front leaves it at the margin's tilt. |
| [0.14, 1] | Skin | The upper lid's shell or the lower lid's front, turning into the face. |

- **Shell**:
  - The margin stands off the support along the support's normal at the margin, its tilt from the front eased toward 35° (smoothly: a hard limit leaves a line on the skin where the support's tilt crosses it).
  - Past the margin's edge that sideways shift fades out over 6 mm, and the thickness is taken upright, blended in over 3 mm. Shifting every row along its own normal would pull rows back where the support bends from the globe to the canthi, and crease the skin there.
  - Its thickness grows from the margin's at the edge to `lidThickness` within 2.5 mm on the upper lid.
  - Toward each canthus the thickness tapers over a third of the margin. A faster taper would part neighboring columns into creases. Every taper along the margin is a smootherstep or a sine: a plain smoothstep's curvature jumps at its ends, which the shading shows as a line down the lid.
- **Lower lid's front**: the lower lid is a wedge, not a shell. Under it the globe recedes steeply (about 50° from the front laterally), and a skin that followed it fell back under the lid and climbed again to the cheek, in a groove 3–4 mm below the margin. The orbicularis and the orbital fat fill in front of the globe instead:
  - from the anterior edge the front leaves at the margin's tilt (at most about 35°), and its slope turns evenly (a smoothstep) to the face's at the junction with the cheek, `lowerHeight` (6.5 mm) below the margin (the lid–cheek junction lies 5–12 mm below it in youth, [`docs/RESEARCH.md`](RESEARCH.md#eyelids-and-lashes)). The face's slope there comes from a first build of the face, so the face is built twice;
  - its curvature is so spread over the whole lid, about 0.2 per mm at most, against 0.7 in the groove before;
  - toward the canthi the junction comes nearer the margin like the ring below; across the canthi the front blends with the upper lid's shell by the upper share.
- **Into the face**: away from the margin the skin turns into the face. The turn ends 2 mm past the ring the face follows, and toward the canthi it starts right past the margin's edge, so the margin does not stand as a rim with a moat behind it around the corners; the lower lid's front turns into it from 1.5 mm before its junction to 2.5 mm past it. The ring lies before the globe curves away under the upper lid, about 2 mm above the fold, and at the lower lid's junction with the cheek, nearer the margin toward the canthi (down to 0.3 of that at the corners). Lid and face meet on that ring, so there is no seam, and the lids do not fall back with the globe into a bag.
- **Over it**:
  - The upper lid's crease, `creaseDepth` deep at `creaseHeight` from the margin, a little lower toward the canthi and fading out before them (it does not run into the corners). This is the pretarsal show: with the eye open, the skin above folds down over the crease, here as a fold of `creaseFold`.
  - The lower lid's pretarsal roll (`lowerRoll`), broad and fullest in the middle.
  - The lower lid's fullness (`lowerFullness`): the lid bulges out between its edge and the cheek, fading out 1.5 mm past the junction, its curvature easing in and out at both ends. A lid shorter than 6.5 mm bulges less (as the square of its height, so the bulge keeps its curvature), and it fades toward the canthi.
  - The lateral overlap (`lateralOverlap`): along a fold out of the lateral canthus, slanting down, the upper lid's skin stands over the lower lid's. The step stays within a few millimeters of the fold.
  - However deep the crease, the skin stays at least 0.6 mm off the globe.
- **Closure**:
  - As the lids close, each column's margin slides to the closing margin. The lid stretches over the globe up to 12 mm from the margin, and the fold above the crease unfolds by 4 mm.
  - The face is built from the open lids, so it stays put.
  - The mesh keeps its layout at any closure, so the blink morphs through closed copies of it ([Blink Frames](#blink-frames)).

Each vertex carries:
- `lid` = (t, s, millimeters from the margin, upper share);
- `relief` = (the front-plane direction in which the distance from the margin grows, the depth of the grooves in mm, the share of the way along the margin from the medial canthus):
  - the depth is ≤ 0 and records the crease and the lateral fold;
  - the skin program orients and shades its fine detail by this attribute;
- `follow` = (upper share, follow weight): the weight is 1 over the inner half of the lid band and 0 from 3 mm past its edge, so the brow and the cheek stay put;
- `ao`: the baked ambient occlusion, 1 open to 0 closed ([Baked Occlusion](#baked-occlusion)).

The upper share is 1 on the upper lid and 0 on the lower one, blended across the canthi by the column's direction. All of the relief is in the mesh positions, so the key-light shadow pass, which draws the same mesh with the lid follow, casts the same folds. `lidFace()` returns the face the lids turn into.

### Layout

`lidLayout()` lays the ring out from the curvature of the lids being built, so the vertices gather where the skin bends and thin out where it is flat. A chord of length h across a bend of curvature k strays from the surface by its sagitta, k h² / 8; the layout keeps it under a tolerance of 5 µm (a third of a pixel at the closest zoom, about 0.014 mm per pixel), then thins the density by zone (`LAYOUT.density`):

| Zone | Share of the density | Sagitta at most |
| --- | --- | --- |
| The anterior edge and the lids: at least 8 mm past the edge, and 4 mm past where the lid meets the face (its ring: a high crease takes the lid further) | 0.75 | about 9 µm |
| The face around them, from 6 mm further on | 0.3 | about 55 µm |
| The patch's edge, its outline, within 1.5 mm | 0.75 | about 9 µm |

A share f of the density lengthens the steps by 1 / f. The steps stay between 0.02 mm (a sharper bend is a kink, not a shape to follow) and 1 mm before the share.

- **Rows**: the intermarginal strip is straight and takes 2 steps, for its occlusion; the anterior edge, a quarter round, takes (π / 2) √(r / 8 tolerance) steps for its widest radius r, times the share. The skin rows come from the bends measured down 64 columns, every 0.01 mm up to 1 mm past the edge (where the canthi bend the skin most) and every 0.04 mm on to 15 mm; the rows per millimeter are the skin's own length per millimeter (it stretches where a closing lid slides over the globe and down a deep crease's walls) over the step its bend allows, the highest of the columns, each peak widened by 0.1 mm (a crease whose height changes along the margin may peak between two probes). Up to 15 mm past the edge the rows lie at the same distances on every column (less on short columns, at most 0.8 of their length, the two blended over 2 mm so the rows do not kink); further out they spread to the patch's edge at the same shares of the rest.
- **Columns**: across 512 columns, on up to 64 of the rows and always on the patch's edge, each gap between two of them needs as many columns as its widest share of a step (the bend along the rows, the posterior margin's and the patch's outlines included); the columns fall evenly under that need.
- **Diagonals**: each quad is split along the diagonal closer to the surface. For a bend S along both directions and a twist T over the quad, the middle of one diagonal strays by S + T, the other's by S − T: where they have the same sign the other one is closer (a crease running across the quads at a slant, as the upper lid's does where its height changes along the margin, then lies along a diagonal). Both come from the quad's and its neighbors' vertices.
- **Counts**: the vertices follow the shape: about 9 600 by default, 12 500 with a deep crease, 11 700 half closed. With the conjunctiva and the palpebral conjunctiva the lid mesh has about 13 200 (it had 100 960 at a fixed 560 × 150).
- **Blink**: the lids closing keep the layout of the lids at rest, its rows, columns and diagonals, so the frames' vertices and triangles are theirs ([Blink Frames](#blink-frames)).
- **Cost**: the measurement takes about as long as the mesh; the whole ring builds in about 0.3 s, as at 560 × 150.
- **Check**: a test builds the mesh refined by halves (a column and a row between each two of the layout's) and measures, along the surface's normal, how far the middle of every edge and diagonal strays from it: within 12 µm on the lids, 10 µm along the posterior margin and the patch's edge, 20 µm on the lids' diagonals and 80 µm far out, under 13 000 vertices, for the defaults, a deep crease on a left eye and a half-closed lid.

### Baked Occlusion

`bakeLidOcclusion()` ([`src/adnexa/lidOcclusion.js`](../src/adnexa/lidOcclusion.js)) bakes ambient occlusion into the lid and conjunctiva vertices on every rebuild, in about 35 ms.

- **Field**: the skin, the conjunctiva and the globe are drawn into a height field seen from the front (0.1 mm cells over ±24 × ±18 mm).
- **Horizon**: each vertex looks for the horizon over that field in 8 directions, out to 3 mm, against its tangent plane; nearer occluders count more (horizon-based ambient occlusion, Bavoil 2008).
- **Where**: the lid band (up to 10 mm from the margin), the conjunctiva and the palpebral conjunctiva; the face beyond it stays open. It darkens the canthi's pockets most, then the posterior margins against the globe and the crease.
- **Into the sac**: the field sees the palpebral conjunctiva only edge-on, so its vertices darken with their depth below the margin instead, by e^(−depth / 0.8 mm) (`OCCLUSION.sac`).
- **Rest**: it is baked with the lids at rest and does not follow the gaze. The blink's frames bake their own ([Blink Frames](#blink-frames)). The skin program scales it by `skin.occlusion`.

### Blink Frames

`createBlinkFrames()` ([`src/adnexa/blinkFrames.js`](../src/adnexa/blinkFrames.js)) closes what blinks by `BLINK_FRAMES` (4) even steps, from where `lids.closure` rests the lids to closed (`blinkClosures()`). The lid meshes morph through them ([`docs/RENDERING.md`](RENDERING.md#blink-morph)), with the weights of the blink's closure ([`docs/ANIMATION.md`](ANIMATION.md#blink)).

- **Lid ring**: the lid mesh rebuilt at each closure, with the layout of the lids at rest ([Layout](#layout)), with its normals (area-weighted, as three.js computes them) and its occlusion, baked as the rest's over the lid band against the conjunctiva. The closed frame is the lid of `lids.closure` 1.
- **Around it**: the conjunctiva stays; each column of the palpebral conjunctiva moves with its margin's vertex (the ring's first row), so the sac stays closed.
- **Meniscus and lashes**: rebuilt on the closing margins. Each lash's rings keep the orientation of the open lash's (`lashTubes()`'s `references`), so the frames' vertices correspond and a blended tube keeps its width.
- **Fissure map**: the fissure closed, the map's second channel ([Fissure Map](#fissure-map)).
- **What stays**: the other attributes (`lid`, `relief`, `follow`) and the skin patterns are the open mesh's: the patterns are evaluated at the rest position, so they stretch with the skin.
- **Spline**: a Catmull–Rom spline through the open mesh and the frames keeps the margin within 0.08 mm of the lid rebuilt at that closure, where a straight blend from open to closed would stray up to 1.5 mm, into the cornea. The rest of the lid stays within 0.35 mm: the fold over the crease unfolds as the lid closes, so its groove sweeps across the rows, and between two frames it is their blend.
- **Cost**: about 1.3 s (in Node on an M1), mostly the lids at rest (for their layout), the four lid rings and their occlusion; a quarter of a second for the meniscus and the lashes alone. A worker builds them ([`src/adnexa/blinkFrames.worker.js`](../src/adnexa/blinkFrames.worker.js), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)).

### Conjunctiva

`createConjunctivaMesh()` fills the canthi. Where the lids pass in front of the receding globe, the opening shows the conjunctiva, the caruncle and the plica, not the background.

- **Surface**: an annulus on `conjunctivaZ()`, from 0.9 of the sclera radius out to just past the canthi (16.5 mm medially, 15 mm laterally). At its outer edge it falls back behind the skin. Where the fornix would reach past the back shell, under the lids, it is kept inside it ([Back Shell](#back-shell)).
- **Seam**: it dips 0.06 mm under the globe where it is the globe, so the sclera meets it in a clean line. Past the fornix's start it leaves the globe only tangentially, so the seam holds only because the globe turns in place, about its own center ([`docs/OPTICS.md`](OPTICS.md#eye-space)): a globe shifted by a tenth of a millimeter would cut through it in facets.
- **Mesh**: 104 columns × 24 rows (denser toward the globe). It shows only in the canthi, its caruncle and plica medially; elsewhere the lids cover it. Its columns crowd there, up to 8 times as close within about 0.35 rad of each canthus (a Gaussian), and spread out under the lids.
- **Rendering**: [`src/adnexa/lids.js`](../src/adnexa/lids.js) merges it into the lid mesh. The skin program shades it as wet mucosa (`lid` s = 0, `relief` radial and without grooves). It does not follow the gaze.

### Palpebral Conjunctiva

`createPalpebralMesh()` closes the conjunctival sac. The lid is a single sheet and the conjunctiva a height field, so without it a line of sight could pass under a posterior margin, between the margin and the eye, and run behind the lids to the background: from the side, from above or below, in the pockets behind both canthi (and along the globe's outline).

- **Surface**: a curtain hanging from each posterior margin straight back, to 1.5 mm under the conjunctiva or the globe, whichever is lower; its deep end in the canthi is kept inside the back shell ([Back Shell](#back-shell)). Its top row is the lid mesh's posterior margin (the same columns: it takes the lid's layout), its 6 rows denser near the margin. Straight, not slanting out under the lid: a line of sight running out of a pocket meets it at the margin's outline.
- **Where it shows**: in the canthi's pockets, where the margins stand in front of the receding globe, and wherever a margin stands off the globe. Where the margin rests on the globe it stays inside it.
- **Rendering**: merged into the lid mesh like the conjunctiva and shaded as the margin's posterior border (`lid` s = 0), its front faces toward the opening. It follows the gaze with its margin, so the sac stays closed as the lids follow; its bottom lies near the axis the lids turn about, and barely moves.
- **Check**: a test projects the lids, the conjunctiva and the curtain (kept inside the back shell) and the globe (in front of its cut) in orthographic views up to 60° to the side and 40° up or down, and requires every line of sight that enters the fissure within 5 mm of a canthus to land on a front face. Views further round (80° to the side, 60° up or down) still let a few hundredths of a square millimeter through.

### Skin Shading

`skin-fragment.glsl` with `lit-surface.glsl` and `skin-relief.glsl`. Every pattern is evaluated at the rest position in the front plane (the open mesh's), so it stays on the skin when the lids follow the gaze or blink. Nothing is periodic: patterns are hashed per cell and seeded by `lids.seed`.

- **Micro-relief** (heights in mm with analytic gradients):
  - the primary furrows: three families of straight grooves 60° apart, broken into segments, that cross into rhomboid and triangular plateaus, the family along the skin tension lines the deepest. The tension lines run along the margin on the lids and radially out of the lateral canthus;
  - a fine network of shallow grooves inside the plateaus (Worley cell borders, only some of them, in patches) and pores at a few cell centers (`skin.pores`), fewer near the lash line and on the upper lid;
  - fine wrinkles (`skin.wrinkles`): irregular, broken lines along the lids, crossed at a slant by shorter, shallower ones (the crepe of thin lid skin), and the crow's feet fanning out of the lateral canthus.
  - The footprint they are filtered by is the pixel's, widened by the depth of field's blur circle on the skin (`uDefocus`: aperture × defocus / focus distance). The furrows and wrinkles fade where it is wider than about 0.1 mm, the network, the pores and the orifices from 0.015 mm: blurred, they would only average out. Narrower than the footprint, a groove widens and grows shallower, keeping its darkness, so fresh frames do not flicker.
  - `skinMicroRelief()` in `skin-relief.glsl` computes all three, with the tension lines; the skin program and the relief bake both call it.
  - **Baked outside `#debug`**: the relief depends only on the lid mesh at rest, `lids.seed`, `skin.pores` and `skin.wrinkles`. [`src/adnexa/skinRelief.js`](../src/adnexa/skinRelief.js) bakes it on the GPU (`skin-relief-bake-*.glsl`) over the patterns' front-plane box, and the skin program reads it (`SKIN_BAKED`) instead of hashing some hundred cells per pixel:
    - **Lid texture**: 4096² RGBA8, about 0.016 mm per texel, mipmapped. It holds the gradient of the whole height (rg), the furrows' and network's albedo term (b) and the occlusion term (a), all linear in the heights (`encodeRelief()`). It is drawn from the lid ring itself, laid onto the box with the rest z as depth (nearest the viewer wins), so the lid frame (`a`, `along`, the tension direction, the skin share) is exact. Under it lies the shell's relief, for the texels the ring leaves uncovered: drawn first, in a render of its own, so the ring always lies over it (drawn together, WebGL's sort put the underlay last, over the whole ring, and the lids read the shell's relief, without their wrinkles or crow's feet).
    - **Shell texture**: the back shell's relief at 2048².
    - **Prefilter**: the bake evaluates the relief with a footprint of one texel. The skin reads it with `textureLod` at the level of 0.7 × its footprint, so the mipmaps take over the prefilter's work. It still applies the relief's fade and the keratinized share; the network's earlier fade is left to the mipmaps.
    - **When it bakes**: at start-up, before the first frame. It bakes again after a lid rebuild or when `lids.seed`, `skin.pores`, `skin.wrinkles` or `skin.freckles` change, once no transition is running (outside `#debug` nothing changes them). A new bake takes about 30 ms; the first, compiling its programs, about 0.6 s.
    - **In `#debug`**: the skin evaluates the relief per pixel, as before, so the panel's edits show at once. Leaving `#debug` bakes the current values and switches back. Up close, the baked furrows read the same as the per-pixel ones.
- **Albedo**: `skin.color` (the skin buttons glide it among five tones, [`src/params/skinTones.js`](../src/params/skinTones.js)) under three absorbers:
  - melanin: mottling at 6 and 1.3 mm, freckles in loose clusters (`skin.freckles`), and darker skin in the folds (the `relief` depth), under the eye and at the canthi (`skin.pigmentation`);
  - blood: mottling at 3 and 0.7 mm, pinker thin skin toward the lash line and in the canthi (`skin.redness`);
  - veins: a violet tint over the upper lid and under the eye, and single veins seen through the thin skin, soft and in stretches (`skin.veins`).
  - The furrows are a little darker, the lash roots darker still.
  - **Baked patterns**: the melanin and blood mottling, the single veins and the oily patches depend only on the rest position and `lids.seed`. [`src/adnexa/skinPattern.js`](../src/adnexa/skinPattern.js) bakes them on the GPU (`skin-pattern-fragment.glsl`, the functions of `skin-relief.glsl`) into a mipmapped 2048² RGBA8 texture over the front-plane box of the lid mesh (about 0.03 mm per texel) whenever the lids are rebuilt, so the skin reads one texel instead of hashing about a hundred cells per pixel, and the far skin is filtered. The freckles depend on `skin.freckles` too: outside `#debug` they are baked with the relief (a 2048² R8 texture), in `#debug` evaluated per pixel.
- **Margin**, from the posterior border to the lash line, mottled along its length: the wet conjunctiva, Marx's line (the mucocutaneous junction), the row of meibomian orifices (34 above, 24 below, a few closed, some capped with meibum), the grey line, the keratinized anterior margin. Its fine bumps break the wet reflection into glints. They and the orifices are shaded in the strip's own frame, from screen-space derivatives of `relief`'s place along the margin and of `s`.
- **Lighting**:
  - per-channel wrap diffuse (`skin.translucency`) with subsurface-tinted shadows;
  - GGX specular from each emitter's representative point (`skin.roughness`, lower in oily patches on the lids);
  - a mirror reflection of the rig where it is wet: the margin, fading out within half a millimeter onto the skin (`skin.wetness`). Further out the moisture follows the relief and reflects as the GGX lobe; a mirror there showed the emitters as pale blots in the canthi's folds, where the skin turns grazing;
  - ambient and specular occlusion in the folds and grooves, and the baked occlusion (`ao`, scaled by `skin.occlusion`);
  - the key-light shadow;
  - the light shafts crossing the skin, a stripe of light under their own shadow ([`docs/RENDERING.md`](RENDERING.md#light-shafts)).

## Back Shell

[`src/adnexa/backShell.js`](../src/adnexa/backShell.js) closes the skin patch behind. Seen from the side or from below, the posterior structures (the globe past the lids, the conjunctiva and the palpebral conjunctiva) would show behind the face; the shell hides them, and what would reach past it, all of it hidden from the front, is cut or brought inside. From the front the image is unchanged.

- **Band**: from the patch's edge (the lid mesh's `rim`), a flat band runs straight back `shell.band` mm (1 by default), the cut edge of the patch.
- **Dome** (`backShellSurface()`): from the band's back edge it follows the face the lids turn into (the lid mesh's `face`, smoothed by a 6 mm Gaussian so it keeps the face's shape but not its every bump, and brought exactly to the edge), set back by a thickness that grows from nothing at the band toward the middle as a spherical cap (50° half-angle). It leaves the band at an angle, so the band keeps an edge on both sides.
- **Thickness**: the least that keeps `shell.clearance` (1.5 mm) behind what can show:
  - the globe in front of its cut (below), at any gaze: it turns about its center, so its lowest is the disk of the cut;
  - the lid mesh (except near the edge, where the skin stands on the band), its vertices also turned to either end of the lids' follow (60° of pitch: an eye that looks at the camera follows it up to its elevation limit).

  By default it is about 14 mm in the middle, set by the upper lid turned up with such a gaze; the dome's deepest point lies about 21 mm behind the corneal apex. A deeper face (a prominent nose) makes it thicker.
- **What is cut or brought inside**:
  - **The globe** behind the world plane `GLOBE_CUT` × the sclera radius in front of its center (2.4 mm by default): the sclera program discards it there ([`docs/RENDERING.md`](RENDERING.md#pipeline)). The globe turns with the gaze, so its mesh reaches 125° from the axis; behind the plane it lies under the conjunctiva, which leaves it at 0.96 of its radius, 3.4 mm in front of the center, and it never shows through the opening.
  - **The conjunctiva and the palpebral conjunctiva** (`keepInside()`): every vertex is raised until it stands the clearance in front of the dome, the palpebral conjunctiva's also at either end of the lids' follow, and its depth into the sac shrinks with the rise. Only what lies under the lids moves: the fornix past the globe's outline (the upper fornix by up to 7 mm, under the brow) and the palpebral conjunctiva's deep end in the medial canthus (about 1 mm). The pockets of the canthi look the same.
- **Mesh** (`createBackShell()`): the band and the dome's edge ring keep the lid mesh's columns, so the band meets the lids vertex for vertex; the band's edges have their own vertices, so they stay sharp. The dome's inner rings and their columns follow its bend (`domeLayout()`, [`src/meshLayout.js`](../src/meshLayout.js)): its chords stray from it by at most 0.1 mm (it shows only from the side or from behind, past the patch's edge), the bend measured along 32 meridians and around each ring; the columns, shared by the inner rings, are zipped to the edge ring by angle. About 1 050 vertices, three quarters of them along the edge (3 rings of the lid mesh's columns), the dome under 500. Its skin coordinates take the arc length along each meridian finely, not along its chords. It is built with the lids (about 60 ms more), when they, the eye or `shell.clearance` and `shell.band` change. It stays put (no lid follow) and casts no key-light shadow: it lies behind the skin the light falls on.
- **Shading**: the skin program compiled with `SKIN_SHELL`.
  - Its pattern coordinates (`coords`) are the band and the dome unrolled into the front plane, the dome by arc length along its meridians, so the patterns do not stretch where it turns away. They run on from the patch's edge over the band onto the dome and stay inside the patch, where the patterns are baked.
  - It is skin far from the lids (`lid` a = 60 mm): the baked mottling, the furrows, the fine network and the pores. Its tension lines wander over about a centimeter: along the edge they streaked where the shell turns away, and furrows all as shallow crossed into a regular lattice. The relief's gradient is carried onto the surface by the gradients of the coordinates themselves, because the band stands edge-on to the front plane.
  - No freckles, veins, canthi or margin; the albedo is `shell.tone` (0.6) of the skin's, so it is darker.

## Lashes

`generateLashes()` ([`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js)) places `lashes.upperCount` and `lashes.lowerCount` lashes along the lashed part of each margin.

- **Rows and roots**: the upper lashes sit in 3 irregular rows, the lower in 2. Roots are on the rounded anterior edge, along the lashed part of each margin: from the lacrimal punctum, about a fifth of the way from the medial canthus, to the lateral canthus.
- **Length**: `upperLength` and `lowerLength`. Lashes are shorter toward the medial canthus and in the back rows, with random variation.
- **Direction**:
  - Each lash leaves the lid tilted away from the fissure by `upperLift` / `lowerLift`, measured from the skin normal just past the edge. On the lower lid that normal is the margin's (its front leaves the edge at the margin's tilt), more frontal than the globe's, hence the larger `lowerLift`.
  - It then curls further that way (`upperCurl` / `lowerCurl`), with `randomness` in lift, sideways deviation and curl.
- **Clumps**: runs of 2–5 neighbors whose tips draw together (`clumping`).
- **Zoomed out**: the lashes thicken as the camera zooms out, so they read fuller from afar without more of them: by `lashes.zoomOut` (0.3) of their radius at the zoom-out distance, none at the zoom-in one, linear between on the log of the distance, as the HUD's zoom level runs (`lashWidening()`; the screen's zoom distances, portrait ones on phones). The lash program pushes each vertex off the centerline along its ring's normal by that share of the ring's radius (the `lashRadius` attribute), so the tips stay fine. Their shadow proxies keep the lashes' width.

`lashTubes()` sweeps tapered tubes along the 14-segment centerlines, and [`src/adnexa/lashes.js`](../src/adnexa/lashes.js) makes them a geometry. The lash material (`lash-fragment.glsl`) uses Kajiya–Kay diffuse and two shifted specular lobes along the hair: a white one off the cuticle (`lashes.shine`) and a dimmer, colored one through the fiber. Tips are lighter. Lashes and lids cast the key-light shadow through lighter stand-ins, their shadow proxies ([`docs/OPTICS.md`](OPTICS.md#key-light-shadow)).

## Tear Film

[`src/adnexa/tearFilm.js`](../src/adnexa/tearFilm.js):

- **Meniscus** (`createMeniscusMesh()`): a concave water fillet in the corner between the intermarginal strip and the support, along both margins, 128 columns along the loop × 5 across (640 vertices). Its normals are exact, so the mesh only follows its shape: 4 steps across a quarter round of 0.36 mm stray 7 µm from it, 128 columns along margins bending over about 15 mm 3 µm; at the canthi, where the margins turn sharply, it has tapered to nothing.
  - Its radius is `lids.meniscusLower` (0.36 mm) and `lids.meniscusUpper`. It tapers at the canthi and where the margin leaves the globe (`supportLift()`): the water needs the globe to hold it.
- **Blink**: the meniscus closes with the margins ([Blink Frames](#blink-frames)).
- **Material** (`tear-fragment.glsl`): water. A smooth mirror of the rig with water's Fresnel, over a faint transmitted tint of what lies behind. It is drawn opaque, to keep the alpha contract ([`docs/RENDERING.md`](RENDERING.md#alpha-contract)).

## Fissure Map

[`src/adnexa/fissureMap.js`](../src/adnexa/fissureMap.js) bakes the signed distance to the fissure outline, in the front plane at the lids' rest position.
- **Map**: 256², covering ±20 × ±16 mm, positive inside the opening.
- **Channels**: a half-float RG texture. `EyeApp` writes r, the lids where they rest, on every lid rebuild; g, the fissure closed, comes with the blink's frames ([Blink Frames](#blink-frames)).
- **Lookup**: shaders look it up through `lidRestPosition()`, which undoes the lid follow rotation, and blend r toward g by the blink's closure (`uLidBlink`, `fissureDistances()` in `sclera.glsl`). Only the upper margin moves, linearly, so the blend is the distance to the closing margin.
- **Uses**:
  - lid occlusion of the globe and of the iris's ambient light;
  - redder sclera near the lids (at rest: the tissue does not change with a blink);
  - the lid and lash reflections in the cornea ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)).

## Scleral Vessels

[`src/sclera/vesselGenerator.js`](../src/sclera/vesselGenerator.js) grows a seeded network on the globe. It works in polar coordinates around the optical axis: φ around, ψ from the axis, over `SCLERA_PSI` = 0.42–1.45 rad. Each vessel turns persistently at random, tapers, and branches by generations.

| Population | Count | Start | Course | Width |
| --- | --- | --- | --- | --- |
| Episcleral (deep) | `sclera.vessels.episcleral` | At the outer edge | Fairly straight, toward the limbus | Wider: 0.06–0.12 mm |
| Conjunctival (superficial) | `sclera.vessels.conjunctival` | Anywhere | Tortuous (`tortuosity`), branching more | Fine: 0.02–0.05 mm |

- **Limbus**: near it, vessels may end in small loops (the limbal arcade).
- **Outer edge**: a branch that turns back past the map's outer edge stops; it would be under the lids.

[`src/sclera/scleraMaps.js`](../src/sclera/scleraMaps.js) rasterizes the network with Canvas2D into a 2048×512 polar texture (u = φ / 2π, repeating; v over ψ). The canvas's first row is ψ min and the texture is not flipped (`flipY` false), so v = 0 lies at the limbus, where `sclera.glsl` reads it; three's default flip had put the limbus' end of the network at the periphery.
- **Red channel**: superficial vessels, sharp.
- **Green channel**: deep vessels, blurred as seen through the conjunctiva and Tenon's capsule.

`scleraAlbedo()` (`sclera.glsl`) builds the color on `sclera.color`:
- yellower with `sclera.yellowing`;
- pinker toward the lids and in the corners (`sclera.redness`);
- the deep vessels mixed in violet-red and the superficial ones in bright red, both stronger with `redness`.

The conjunctival micro-relief (`sclera.irregularity`, 3D gradient noise) perturbs the mirror normal, so the wet reflection on the sclera breaks up.
