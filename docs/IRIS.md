# Iris

The iris is a signed-distance field, raymarched in the anterior chamber after the corneal refraction:

- `chamber.glsl` refracts the ray into the chamber;
- `traceIris()` (`iris-trace.glsl`) marches the field;
- `shadeIris()` (`iris-shade.glsl`) lights and colors the hit.

The field has real relief:
- fibers bridge over crypts;
- crypt walls are undercut;
- the relief shadows and occludes itself.

It therefore holds at any magnification. Published real-time eyes refract once onto a plane, a height field or a parallax map. The comparison and the data behind every choice are in [`docs/RESEARCH.md`](RESEARCH.md).

Three kinds of data feed the field:
- whatever depends only on the rest position (θ, ρ) is baked into two polar atlases when parameters change;
- the fibers, the ruff and the micro detail are analytic;
- the color is a spectral model baked into a 3D lookup.

## Rest Space and Dilation

[`src/iris/irisSpace.js`](../src/iris/irisSpace.js) (twin: `iris-space.glsl`) defines a rest space where every feature lives, so a change of pupil size never needs a re-bake. Radii are measured from the pupil center, which is decentered nasally by `iris.pupilDecentration` (iris space = eye space minus the pupil center).

- **Rest radii**:
  - the rest pupil r_p0 = `iris.restPupilDiameter` / 2;
  - the root R = `iris.rootRadius`;
  - the rest collarette r_c0 at `irisStructure.collarette.position` of the way from the pupil to the root.
- **Pupillary zone**: it keeps its area, because the sphincter does not stretch and the collarette follows the pupil.
  - r_c = √(r_p² + r_c0² − r_p0²)
  - r0 = √(r² − r_p² + r_p0²)
- **Ciliary zone**: it stretches linearly, r0 = r_c0 + (r − r_c)·(R − r_c0)/(R − r_c).
- **Thickness**: it scales with the change of area to the power −`irisStructure.thicknessResponse`. With an exponent below 1, the iris loses volume as it dilates (Quigley 2009).
- **Distances**: the field is computed in rest millimeters, then scaled by the inverse of the largest stretch, so it stays a conservative bound.
- **ρ**: the normalized rest radius, 0 at the pupil margin and 1 at the root.

## Structure Atlas

[`src/iris/irisAtlas.js`](../src/iris/irisAtlas.js) bakes `iris-bake-fragment.glsl` on the GPU into a mipmapped 2048×256 RGBA16F texture that repeats in θ (u = θ / 2π, v = ρ). The seeded curves come from [`src/iris/irisFeatures.js`](../src/iris/irisFeatures.js).

| Channel | Content |
| --- | --- |
| r | Uncarved surface height above the pigment epithelium (rest mm). |
| g | Crypt opening: > 0 inside a crypt (mm from its edge), < 0 on the walls. |
| b | Crypt depth below the uncarved surface (mm; 0 without a crypt). |
| a | Signed distance to the collarette (mm; negative in the pupillary zone). |

The uncarved surface is built from:
- **Thickness profile**: from `marginThickness` up to `collaretteThickness` at the collarette, then down to `rootThickness` (AS-OCT and UBM profiles).
- **Collarette**: a zig-zag curve with `teeth` jittered teeth of seeded `amplitude` (`irregularity`) and a slow wobble, sampled at 2048 angles. It carries a ridge of `height` and `width`.
- **Contraction furrows**: `count` concentric grooves on ρ 0.58–0.93, each covering `extent` of the circle (Larsson's grades), with seeded depth, width and wobble.
- **Surface texture**: radial streaks (`surface.radialNoise` at `radialFrequency` around) and a slow `undulation`.
- **Wölfflin nodules**: `nodules.count` rounded bumps of `size` on a ring at `ring`.

**Crypts of Fuchs** are Voronoi cells in a radially stretched metric (`crypts.elongation`), in two bands:

| Band | Where | Cells | Opening probability | Depth |
| --- | --- | --- | --- | --- |
| Collarette | Hugs the collarette on its ciliary side, `crypts.band` of the iris width wide | `crypts.size` | 0.1 + 0.22·grade | ×1 |
| Peripheral | ρ 0.72–0.97 | 0.55 × `crypts.size` | `crypts.peripheral` · 0.2 · grade | ×0.55 |

- The grade is the Edwards/Larsson scale, 0–4.
- Each open cell has a seeded depth of `crypts.depth` × 0.55–1.45, scaled by the band's factor.
- The wall half-width is `crypts.wall`, thicker at low grades.
- `roundness` shapes the opening from the Voronoi polygon to a lens.
- The walls between open cells are the trabeculae.
- The lattice is fixed per band, from a reference radius, so the cells do not reshuffle across ρ.

## Pigment Atlas

The same bake with `PIGMENT_PASS` writes the pigment atlas, with the same layout:

| Channel | Content |
| --- | --- |
| r | ABL melanin (0–1): `irisColor.ablMelanin` with radial streaks and sectors (`variation`), central heterochromia (`heterochromia.*`: amount, melanin, eumelanin share, extent past the collarette, softness, following the zig-zag), darker periphery (`periphery.*`). |
| g | Eumelanin share. |
| b | Freckle mask: `freckles.count` seeded elliptic blobs of `size` on the ciliary zone, biased toward the inferior-temporal side (`inferotemporal`, Schwab 2017). |
| a | Nodule mask (paler stroma). |

## Distance Field

`iris-sdf.glsl` builds `IrisParts` at a point, each in rest millimeters with the pupil cut applied per part, and combines them by smooth union (`fibers.blend`):

- **Stroma**: the slab between the back paraboloid (pigment epithelium) and the uncarved surface, carved by the crypt cavities.
  - Their walls widen below the surface by `crypts.undercut`, so the openings overhang.
  - The height field is turned into a distance with a Lipschitz factor of 0.6.
- **Fibers**: three families by polar domain repetition. Each evaluates its own cell and its neighbor on the near side; the far neighbor only when one of its fibers could come closer than the best so far (its center lies at least 0.75 − waviness cells away, and the slant of the sweep and the wave shortens that lateral gap at most by a factor computed per family), so the distance is unchanged. Hashing is PCG per cell.
  - **Radial vessels**: `radialCount` tubes of radius `radialThickness` (×0.65–1.35). They wave by `radialWaviness` cells (1.5–5 waves across the width) at `radialHeight` of the uncarved surface (±5%), over a seeded stretch of ρ, on `radialCoverage` of the cells.
  - **Collagen arcs**: `arcCount` tubes each way, of radius `arcThickness`, sweeping `arcSpan` from root to margin (Rohen, Wyatt) at `arcHeight`.
    - The counter-clockwise family sweeps 0.85 as far, slightly deeper.
    - `arcCoverage` sets the share of cells with an arc.
  - Heights are shares of the *uncarved* surface, so where a crypt removes the stroma, the fibers bridge over it.
  - A vertical bound skips the cells when the point is far from the family's band.
- **Pupillary ruff**: a crenated rim of the pigment epithelium on the margin (`ruff.width`, `ruff.crenations`), evaluated only near the margin.
- **Micro striations**: `micro.amplitude` at `micro.frequency` around, faded out by the ray-footprint LOD. Fresh interactive frames also leave them out where the depth of field's gather will blur them away: the field estimates, for the points near the surface (`defocusBlur()` of the trace's distance `gIrisT`), the blur radius of the point from its apparent (paraxial) distance against the focus distance (`uDefocus`, as the gather computes it), and the striations fade once it passes both two of their widths and the 3 px from which the gather shows in full. In the default oblique framing most of the iris lies outside the millimeter of macro depth of field; the accumulated samples always draw them.

## Tracing

`iris-trace.glsl`:

- **Shell**: the ray is clipped to the shell between the back paraboloid and a paraboloid 1.3 mm above it (closed-form intersections, path at most 4 mm).
- **March**: over-relaxed sphere tracing (Keinert et al. 2014), with ω = 1.5 and a step back when the relaxation overshoots.
  - At most `quality.irisSteps` steps.
  - The hit tolerance is half the pixel footprint: a ray cone from the camera's pixel angle through the refraction.
- **Atlas LOD**: atlas lookups use `textureLod` at the mip level whose texels match the footprint.
- **Hit**: the march's last evaluation is the hit's (`IrisHit.parts`): the shading takes its parts from there instead of evaluating the field again.
- **Normal**: forward differences from the field at the hit (its parts, which the shading reads anyway), three evaluations in a loop, with an epsilon of half the footprint (at least 2 µm).
- **Ambient occlusion**: `quality.irisAoSteps` samples along the normal, spaced quadratically from 12 µm to 0.3 mm. This covers fiber crevices and whole crypts.
- **Soft shadow**: iq's improved penumbra toward the key light, along its refracted direction, over `quality.irisShadowSteps` steps.

Fresh interactive frames use `quality.interactiveShadowSteps` and `quality.interactiveAoSteps` ([`docs/RENDERING.md`](RENDERING.md#shading-tiers)).

## Shading

`iris-shade.glsl`:

- **Light** reaches the iris through the cornea ([`docs/OPTICS.md`](OPTICS.md#ray-path-through-the-cornea)).
  - The key light is shadowed by the lids and lashes where it enters the cornea, then by the relief (soft shadow); the light shafts crossing it there add to it ([`docs/RENDERING.md`](RENDERING.md#light-shafts)).
  - Ambient light is the background irradiance, occluded by the relief and dimmed under the lids.
- **Materials**: the nearest parts dominate, with weights exp(−Δd / 8 µm) over stroma, radial vessels, arcs and ruff.
- **Albedo**: a lookup of the color model by ABL melanin, eumelanin share and the stroma thickness under the point (the height above the epithelium).

  | Part | ABL melanin used |
  | --- | --- |
  | Stroma | The atlas melanin, ×0.6 inside crypts (the ABL is missing there), paler on nodules |
  | Radial vessels | `irisColor.fiberAbl` of it |
  | Collagen arcs | 0.8 of it |
  | Ruff | None: a fixed near-black pigment epithelium |

  Crypt floors darken physically: less stroma lies over the black epithelium. Then come `irisColor.saturation` and `irisColor.tint`. Beyond the root, the albedo fades into the pigmented iridocorneal angle.

  `irisColor.glow` *(artistic, 0 by default)* gives the iris a light of its own: the albedo times the glow times the radiance of a white diffuse surface lit by the rig (`lightRig.luminance`), so it keeps its look under any lighting. Neither the lids' shadow nor the occlusion dims it. The mako eyes of the random eye use it.

## Color Model

[`src/iris/irisColor.js`](../src/iris/irisColor.js) computes the spectral reflectance of the layered iris by Kubelka–Munk theory, from 400 to 700 nm in 10 nm steps:

- **Anterior border layer (ABL)**:
  - thickness `ablThickness`;
  - melanin `ablMelanin` (up to a 25% volume share), with `eumelanin` as the eumelanin share;
  - reduced scattering `ablScattering` ∝ λ^−0.5, plus `melanosomeScattering` per unit of melanin.
- **Stroma**:
  - melanin (`stromaMelanin` + 0.6·`ablMelanin`) × 4% (darker irides carry far more stromal melanin);
  - blood `blood`;
  - reduced scattering `stromaScattering` (at 500 nm), with `rayleighShare` following λ^−4 and the rest λ^−1;
  - its thickness is the lookup's third axis.
- **Pigment epithelium**: a background of reflectance 0.03.
- **Absorption**: eumelanin 6.6·10¹⁰ λ^−3.33 and pheomelanin 2.9·10¹⁴ λ^−4.75 per mm (Donner & Jensen 2006), the tissue baseline, and Prahl's oxyhemoglobin.
- **Combination**: one KM layer each, combined as R = R₁ + T₁²·R₂₃ / (1 − R₁·R₂₃).
- **Integration**: CIE 1931 matching functions (Wyman–Sloan–Shirley fit) under an equal-energy white, to linear sRGB.

Little melanin over the dark epithelium gives blue (Rayleigh scattering); pheomelanin gives green and amber; eumelanin gives brown.

`IRIS_COLOR_LUT` holds 32 (ABL melanin, 0–1) × 8 (eumelanin share, 0–1) × 16 (stroma thickness, 0–0.8 mm) entries. [`src/iris/irisColorLut.js`](../src/iris/irisColorLut.js) uploads it as a half-float `Data3DTexture` whenever a `bake` color parameter changes. Building a table takes a few milliseconds in JS (3 ms warm on an M1, in Node: `buildIrisColorLut()` evaluates each term once at the level of the loops it depends on, the wavelength's alone, the epithelium's layers per melanin and eumelanin share, the stroma's per thickness and eumelanin share). It keeps the last 32 by their layer model, and `prepare()` builds those of irises known ahead (the intro's shuffle) in up to four workers ([`src/iris/irisColorLut.worker.js`](../src/iris/irisColorLut.worker.js)): switching to them then only uploads a table.

## Sharingan

An easter egg ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)): once the checklist is done (or by the Konami code, or `?unlock=sharingan`), the HUD's tomoe button puts one of the Uchiha's eyes of *Naruto* on the iris, at random, one of the 18 of [`references/sharingan-hd.jpg`](../references/sharingan-hd.jpg) and [`references/sharingan.jpg`](../references/sharingan.jpg) (one, two and three tomoe, Baru, Fugaku, Indra, Izuna, Obito, Madara, Naka, Naori, Rai, Sasuke, Shin, Itachi, Madara's and Sasuke's eternal ones, Shisui); the awakening that unlocks it puts a first one on the eye at random ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)); once all 18 have been seen (the checklist's **Meet the whole Uchiha clan**, or `?unlock=rinnegan`), one press in 50 the Rinnegan of [`references/rinnegan.jpg`](../references/rinnegan.jpg), which covers the whole eye. The structure stays the eye's own: the pattern is pigment over it.

- **Patterns** ([`src/eye/sharinganPatterns.js`](../src/eye/sharinganPatterns.js)): compass constructions, as the designs are drawn. A pattern is a base color and up to 24 shapes painted over it in order, each the intersection of up to four terms (a disc, its outside, a half-plane, an Archimedean spiral; a term may be a stroke along its edge, a shape its own outline), repeated up to six times around the center and turned. The builders give the tomoe (the magatama of a yin-yang: a head and a tail trailing clockwise), curved blades (two arcs through three points meeting at the tip, within the wedge about the inner arc's center), spokes, lenses (the stars of Sasuke) and rings. Each shape keeps the radii it lies between (`shapeBounds()`), which the evaluation skips it outside.
- **Disc**: the pattern lies in a disc of radius 1 with a pupil of 0.17 (`SHARINGAN_PUPIL`); rest ρ from the pupil's margin to 0.88 (`SHARINGAN_EDGE`, where the limbus leaves the iris in view) maps onto the ring between them linearly, so the drawing follows the tissue as the pupil moves and always hugs it. Past the disc, the base color goes on under the limbus (black for the Sharingan's rim, lavender for the Rinnegan's).
- **Fields** (`patternField()`): what the iris reads of a pattern is the signed distance to its ink (the union of its ink shapes, each other shape cutting itself out), saturating softly at 0.2 (`FIELD.reach`, C·tanh(d/C)), and the weights of red, lavender and violet under the ink (the base, or the pattern's `under` color on an ink base, with the other shapes painted over it).
- **Maps** ([`src/eye/sharingan.js`](../src/eye/sharingan.js)): each pattern shown is baked on the GPU (`sharingan-bake-fragment.glsl` over `sharinganField()` of `sharingan-paint.glsl`, the twin of `patternField()`) into a mipmapped 1024² RGBA16F map of its field over ±1.04 of its disc (`SHARINGAN_MAP`): a distance field keeps its edges sharp under magnification. Two maps take turns for the morph, and a third holds the Rinnegan for its hint; each is made at its first bake. The iris reads them at its footprint's mip level, its edges as wide as the footprint, and the palette (`sharingan.*` colors) stays live.
- **Morph** (`morphField()`, twin of the morph in `sharinganIris()`): a new pattern grows out of the old one through their fields: the new ink grows in over the first 0.65 of the morph (`FIELD.grow`, eroded by 1.25 C, `FIELD.erode`, down to nothing) while the old one is still whole, then the old one thins away after 0.35 (`FIELD.thin`); their union is a smooth minimum whose radius peaks at `sharingan.melt` (0.12 of the disc) halfway and is 0 at the ends, so the two inks melt together; the colors under them crossfade. The saturated distance thins even a broad ink steadily.
- **Shading** (`irisAlbedo()`, `sharinganIris()` in `sharingan.glsl`): the pattern's color, darker by the pupil and at the rim as the drawings are (`sharinganShade()`, twin `patternShade()`), replaces the albedo by its amount; the tissue still shows through by `sharingan.tissue`: darker down the crypts, a little lighter on the fibers; the ruff stays the dark epithelium. Relief, shadows, occlusion, the cornea and the depth of field are the eye's. It glows `sharingan.glow` instead of `irisColor.glow`.
- **Pupil**: it narrows to `sharingan.pupil` (2.2 mm) with the amount, the pupil the drawings have.
- **Rinnegan**: its iris is lavender with a violet disc round the pupil, rings and six tomoe; over the sclera (`rinneganSclera()` at the end of `scleraAlbedo()`, so on the limbus of the cap as on the sclera), lavender with a little of the white's own variations (vessels, the redness by the lids), ringed every `sharingan.ringSpacing` along the globe from the limbus, a front spreading out from the limbus over `sharingan.spread` and drawing back when it goes.
- **Hint** (`Sharingan.hint()`): the press that completes the Uchiha clan, once its pattern is in place, shows the Rinnegan through the whole eye for an instant (`hintEnvelope()`: rising, holding and fading over `sharingan.hintDuration`, 0.6 s, at most `sharingan.hint`, 0.45), unturned, over iris and sclera alike; it counts for nothing.
- **Owners**: each pattern keeps the character whose eye it is (`owner`: the reference's caption, Madara and Sasuke for their eternal ones, Sasuke for the Rinnegan; none for the tomoe, every Sharingan's first stages), whose name a photo of it takes (`photoWords()`: `itachi`, `madara-eternal`, `sasuke-rinnegan`, else the pattern's own, `tomoe-2`; [`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)).
- **Motion** (`Sharingan.step()`, its own clock, in photo mode too, restarting the image while it moves): the pattern fades in over 0.6 of `sharingan.duration` while it spins `sharingan.turns` turns into place counterclockwise, the tomoe's heads leading, slowing to a stop; a new one spins a turn while the old one morphs into it (above); Random eye fades it out. With reduced motion nothing spins and every change takes 0.3 s. `sharingan.preview` shows a pattern still, for tuning.

## Parameters by Effect

| Want | Parameters |
| --- | --- |
| Blue, grey | Low `irisColor.ablMelanin` (< 0.1), high `eumelanin`, `stromaScattering` 2.5–3.5, `fiberAbl` near 0 |
| Deep, vivid blue | `ablMelanin` < 0.025 (a trace greys it), `ablScattering` < 1.5, `stromaScattering` 0.7–2.5 (lower is deeper), `stromaMelanin` near 0, `saturation` 1.8–2.6 |
| Green, hazel | Medium `ablMelanin` (0.2–0.35), low `eumelanin` (pheomelanin), central `heterochromia` |
| Amber, orange | `ablMelanin` 0.6–0.95 with `eumelanin` < 0.15, low `rayleighShare` (0.05–0.3) and `stromaScattering` 4.5–7, `saturation` 1.4–1.8 |
| Brown | High `ablMelanin` (> 0.6), `fiberAbl` near 1 |
| Lattice of deep crypts | `crypts.grade` 3–4, `size` > 1, `band` 0.4–0.5, low `roundness` |
| Fine radial texture | `fibers.radialCount` 180–220, `radialThickness` ≈ 0.028 |
| Orange collarette ring | `heterochromia.amount` ≈ 0.9 with a small `extent` |

The reference presets ([`src/params/presets.js`](../src/params/presets.js)) are worked examples.
