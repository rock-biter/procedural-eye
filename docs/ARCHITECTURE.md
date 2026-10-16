# Architecture

## Runtime Map

`*` marks pure modules: no three.js objects or browser state, unit-tested in Node.

| Module | Responsibility |
| --- | --- |
| [`main.js`](../main.js) | Bootstrap: URL flags, params (preset, then `?state=`), `RenderSetup`, `EyeApp`, `window.__EYE__`, and, unless `?gui=0`, the dock (Zoom out, Zoom in, Random eye), the credit line, the frame rate and, while the URL ends in `#debug`, the collapsed panel with its actions (loaded on demand). Builds the target params of presets, random eyes and zooms; on portrait screens the start-up params and presets take `camera.targetZ` 0. |
| [`src/app.js`](../src/app.js) | `EyeApp`: owns every system and the frame loop; routes parameter changes by schema `kind`; runs transitions; poses the eye; drives the accumulation; exposes the API. |
| [`src/renderSetup.js`](../src/renderSetup.js) | Renderer, scene, window size, adaptive pixel ratio, frame telemetry. |
| **Parameters** | |
| [`src/params/paramSchema.js`](../src/params/paramSchema.js) * | `PARAM_SCHEMA`: every tunable value with default, range, unit and `kind`, the defaults taken from `defaults.json`; `BASE_PARAM_SCHEMA`, the same with the fallback defaults; `DEBUG_VIEWS`. |
| [`src/params/defaults.json`](../src/params/defaults.json) | The default values, as exported by the panel's **Export defaults JSON**. |
| [`src/params/params.js`](../src/params/params.js) * | Create, sanitize, get/set by path, diff, overrides, state encoding, all values (the export) and schema defaults from values. |
| [`src/params/paramTransition.js`](../src/params/paramTransition.js) * | Transitions: numbers and colors glide to a target, the rest switches, lights fade. |
| [`src/params/presets.js`](../src/params/presets.js) * | Named partial overrides, one per reference photograph. |
| [`src/params/populationPriors.js`](../src/params/populationPriors.js) * | The random eye: features sampled from measured frequencies by ancestry, mapped onto parameters. |
| **Eye** | |
| [`src/eye/eyeProfile.js`](../src/eye/eyeProfile.js) * | Eye geometry in eye space (profile, chamber, lens, iris shell) and its uniform packing. |
| [`src/eye/cornealOptics.js`](../src/eye/cornealOptics.js) * | Snell, Fresnel, ray–surface intersections, two-surface corneal trace, entrance pupil. |
| [`src/eye/eyeballGeometry.js`](../src/eye/eyeballGeometry.js) | The eyeball mesh with its cap and sclera groups. |
| [`src/eye/eyeball.js`](../src/eye/eyeball.js) | The eyeball mesh, its two `ShaderMaterial`s and their shared uniforms (optics, iris, sclera, lid reflections). |
| [`src/eye/eyeRig.js`](../src/eye/eyeRig.js) | Pivot (center of rotation, gaze) and eye-space group; world↔eye matrices. |
| **Iris** ([`docs/IRIS.md`](IRIS.md)) | |
| [`src/iris/irisSpace.js`](../src/iris/irisSpace.js) * | Rest space and its deformation with the pupil. |
| [`src/iris/irisFeatures.js`](../src/iris/irisFeatures.js) * | Thickness profile, collarette curve, furrows, freckles (seeded). |
| [`src/iris/irisAtlas.js`](../src/iris/irisAtlas.js) | GPU bake of the structure and pigment atlases. |
| [`src/iris/irisColor.js`](../src/iris/irisColor.js) * | Spectral Kubelka–Munk model of the iris layers and its lookup table. |
| [`src/iris/irisColorLut.js`](../src/iris/irisColorLut.js) | The lookup as a half-float `Data3DTexture`, rebuilt when the layer model changes, crossfaded during transitions. |
| **Adnexa and sclera** ([`docs/ADNEXA.md`](ADNEXA.md)) | |
| [`src/adnexa/fissure.js`](../src/adnexa/fissure.js) * | The palpebral fissure: the margins between the canthi, their closure. |
| [`src/adnexa/periocular.js`](../src/adnexa/periocular.js) * | The margins' support, the conjunctiva and caruncle, the face around the orbit (thin-plate spline). |
| [`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js) * | The lid ring (columns, profile, shell turning into the face), the conjunctiva and meniscus meshes. |
| [`src/adnexa/lidOcclusion.js`](../src/adnexa/lidOcclusion.js) * | Ambient occlusion baked into the lid and conjunctiva vertices (horizon-based, over a front height field). |
| [`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js) * | Seeded lash rows, curves and clumps. |
| [`src/adnexa/fissureMap.js`](../src/adnexa/fissureMap.js) * | Signed distance to the fissure, baked for the shaders. |
| [`src/adnexa/lids.js`](../src/adnexa/lids.js), [`lashes.js`](../src/adnexa/lashes.js), [`tearFilm.js`](../src/adnexa/tearFilm.js) | The lid, lash, meniscus and bubble meshes with their materials. |
| [`src/adnexa/skinPattern.js`](../src/adnexa/skinPattern.js) | The skin's pigment patterns baked on the GPU over the lid mesh at rest. |
| [`src/sclera/vesselGenerator.js`](../src/sclera/vesselGenerator.js) * | Seeded episcleral and conjunctival vessel network. |
| [`src/sclera/scleraMaps.js`](../src/sclera/scleraMaps.js) | The network rasterized into the polar vessel map, when its parameters or the globe change. |
| **Animation** ([`docs/ANIMATION.md`](ANIMATION.md)) | |
| [`src/animation/pupilDynamics.js`](../src/animation/pupilDynamics.js) * | Watson–Yellott steady state, Pamplona dynamics, hippus. |
| [`src/animation/gaze.js`](../src/animation/gaze.js) * | Saccades, microsaccades, drift, Listing's law. |
| [`src/animation/animator.js`](../src/animation/animator.js) * | Pupil, gaze and lid follow per step; the still pose. |
| **Lighting and camera** ([`docs/OPTICS.md`](OPTICS.md)) | |
| [`src/lighting/envRig.js`](../src/lighting/envRig.js) * | Builds and packs the analytic emitters; background terms; scene luminance. |
| [`src/lighting/colorTemperature.js`](../src/lighting/colorTemperature.js) * | Black-body and sRGB color conversions. |
| [`src/lighting/lightRig.js`](../src/lighting/lightRig.js) | Per-frame env uniforms in eye space and in world space. |
| [`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js) | The key light's shadow map of the lids and lashes. |
| [`src/camera/cameraOptics.js`](../src/camera/cameraOptics.js) * | Thin-lens formulas, blur circle, lens-shift projection shear. |
| [`src/camera/lensSampling.js`](../src/camera/lensSampling.js) * | Halton and concentric-disk samples (pixel, lens, light). |
| [`src/camera/physicalCamera.js`](../src/camera/physicalCamera.js) | The macro `PerspectiveCamera`, placed and sheared per sample. |
| [`src/camera/cameraControls.js`](../src/camera/cameraControls.js) | Pointer orbit, pan and distance, written into `params.camera`. |
| **Render and tools** ([`docs/RENDERING.md`](RENDERING.md)) | |
| [`src/render/postProcessing.js`](../src/render/postProcessing.js) | The composer: render pass, accumulation, depth of field, effects. |
| [`src/render/accumulationPass.js`](../src/render/accumulationPass.js) | Progressive mean of still frames in a float history; living frames pass through. |
| [`src/render/dofPass.js`](../src/render/dofPass.js) | Interactive depth of field (half-resolution prepare, tile bounds and gather), composited over the accumulated mean. |
| [`src/render/pngMetadata.js`](../src/render/pngMetadata.js) * | `tEXt` chunks and CRC for exported PNGs. |
| [`src/debug/gui.js`](../src/debug/gui.js) | Tweakpane panel generated from the schema. |
| [`src/debug/debugViews.js`](../src/debug/debugViews.js) * | Debug view numbering (`DEBUG_VIEW` define). |
| [`src/ui/liquidGlass.js`](../src/ui/liquidGlass.js) | The dock's glass refraction on Chromium: a displacement map per button (a convex bevel refracting by Snell's law), in an SVG filter that also holds the blur of its backdrop. |
| [`src/math.js`](../src/math.js) *, [`src/random.js`](../src/random.js) * | Scalar and vector helpers; seeds, PCG hash twin, weighted picks, Gaussian samples. |
| [`src/frameStats.js`](../src/frameStats.js), [`src/adaptivePixelRatio.js`](../src/adaptivePixelRatio.js) * | Frame telemetry and the adaptive resolution rules (from the terrain project). |

## Frame Loop

`EyeApp.start()` applies the initial rebuild and bake and renders one frame. It then compiles every program with `renderer.compileAsync()` (recorded as `getCompileMs()`) before the first animation frame. `EyeApp.frame()` then runs on every animation frame:

1. **Transition** ([below](#transitions)): a running transition writes its next values, marks their kinds dirty, crossfades the color lookup and restarts the accumulation. Its time step is capped at 0.1 s, so a long frame does not skip it.
2. **Pending dirty kinds**
   - `rebuild`:
     - the eye geometry (`createEyeGeometry()`);
     - the entrance-pupil depth the camera aims at;
     - the rig transform and the eyeball mesh;
     - the lid mesh, its skin patterns (baked on the GPU) and the fissure map (baked in JS into a half-float texture), only when the lids or the eye geometry changed: together they take about half a second;
     - the lashes and the tear film.

     A rebuild always bakes too.
   - `bake`:
     - the iris rest space;
     - the structure and pigment atlases (GPU, under a millisecond);
     - the color lookup (spectral model in JS, about 35 ms), only when the layer model changed, and not while it crossfades;
     - the scleral vessel map, only when its parameters or the globe changed.
   - `define`: the debug view define of the eyeball, lid and lash materials. The tone-mapping mode is set by the post-processing every frame; `postprocessing` recompiles it.
3. **Pose** (`pose()`, [`docs/ANIMATION.md`](ANIMATION.md))
   - A living eye steps the animator and restarts the accumulation.
   - In photo mode it keeps its instant.
   - A still eye (`animation.enabled` off) is posed by its parameters whenever the image restarts.
   - The pose also gives the line of sight the camera frames.
4. **Convergence**: once the accumulation holds `quality.photoSamples` samples, the frame returns. The canvas keeps the converged image.
5. **Adaptive resolution**: before a fresh frame is drawn, the interval since the last frame feeds the adaptive pixel ratio. Accumulating frames do not, because a resize restarts the accumulation. The resize comes before drawing: a canvas resized after it is cleared, and the browser would show a black frame.
6. **Render one sample** (`renderSample()`)
   - The first frame after a change is a fresh (interactive) frame. It is a pinhole frame with the cheaper shading tier and the interactive depth of field. When the next frame restarts the image anyway (a living eye, a running transition), it is shown without being kept in the accumulation ([`docs/RENDERING.md`](RENDERING.md#pipeline)); `capture()` then renders and keeps one first.
   - Later frames take `accumulationSample(n)`: a subpixel jitter, a point on the lens and a point on the key light.
   - The steps, in order:
     1. `PhysicalCamera` places the camera.
     2. The eye rig updates its matrices.
     3. `LightRig` rebuilds the emitters and packs them in eye space and in world space.
     4. `KeyShadow` renders the lid and lash shadow map from emitter 0, when it is a panel or a window.
     5. The eyeball, lid and lash uniforms are refreshed from the params.
     6. The post-processing updates the lens of the depth of field and its fade, then the composer renders.

## Parameter Routing

The panel, the camera controls and `window.__EYE__.setParams()` all edit the one params object.
- **Changes**: `EyeApp.onParamChange(path)` looks up the schema leaf, records its `kind` as dirty and restarts the accumulation. Values of kind `uniform` need nothing else, because every frame reads the params.
- **Listeners**: those added to `app.listeners` hear every change. The panel refreshes after camera moves, and at the start and end of transitions. Tweakpane reports its own refreshes as changes; the panel ignores them, because they are not edits.
- **Bulk changes**: loading a preset, **Random eye** and the zoom buttons glide to their values ([Transitions](#transitions)); a zoom changes only `camera.distance`, over `zoom.duration`. `setParams()` ends a running transition, then replaces the values at once and marks everything for rebuild.

## Transitions

`EyeApp.transitionTo(target, duration)` carries the params to a full target params object, so the eye transforms in place. [`src/params/paramTransition.js`](../src/params/paramTransition.js) decides how each leaf gets there:

| Leaf | Change |
| --- | --- |
| Numbers and colors | Glide along a minimum-jerk curve; colors in linear sRGB. In-between values are not snapped to the slider step. |
| Toggles, choices, `discrete` numbers (seeds, counts), kinds `rebuild` and `define` | Switch at the start. Geometry cannot glide: a lid rebuild bakes the fissure map, which takes about 0.3 s. |
| A toggle that `fades` a sibling (a light's `enabled`) | Turns on at the start with its `intensity` gliding up from zero, or fades the intensity to zero and turns off at the end. |

- **Color lookup**: building it takes about 35 ms, too much for every frame. At the start, `IrisColorLut.beginBlend()` builds the target table once; every frame then mixes the old and the new table with the transition's progress (`setBlend()`). The pigment atlas re-bakes every frame (under a millisecond).
- **Pose**: when the transition changes where the pose comes from, the pose blends too ([`docs/ANIMATION.md`](ANIMATION.md#modes)).
- **Duration**: the panel's **transition (s)** (1 s by default; 0 switches at once); a zoom takes `zoom.duration`. Captures and `?preset=` at start-up do not glide.
- **Interruptions**:
  - Orbiting the camera cancels the camera's glides; the rest goes on.
  - A panel edit of a `uniform` leaf cancels that leaf's glide.
  - A panel edit of any other kind ends the transition on its target (the edited leaf keeps the edit), because the color lookup cannot crossfade under a rebuild.
  - A new preset or random eye starts from the current in-between values. A random eye keeps the target values of the groups it does not resample (`targetParams`).

## Parameters, Presets and the Random Eye

- **Schema**: [`src/params/paramSchema.js`](../src/params/paramSchema.js) defines the groups:
  - `eye`, `animation`;
  - `globe`, `cornea`, `chamber`, `limbus`;
  - `iris`, `irisStructure`, `irisColor`;
  - `lids`, `lashes`, `skin`, `sclera`;
  - `lighting`, `camera`, `zoom` (the dock's zoom distances and duration), `post`, `quality`, `debug`.
- **Leaves**: each leaf is `{ default, min, max, step, unit, kind, label }`. A `#rrggbb` default is a color, `options` make a choice, and a boolean is a toggle.
- **Defaults**: [`src/params/defaults.json`](../src/params/defaults.json) holds the default values; the schema keeps what is tunable and how.
  - `paramSchema.js` writes `BASE_PARAM_SCHEMA` with a `default` per leaf, then `withDefaults()` replaces each default the file names (sanitized like any override) to make `PARAM_SCHEMA`. A leaf the file does not name, such as a new one, keeps the default written in the schema; a name the file has but the schema lacks is reported with a console warning.
  - Everything that starts from the defaults follows the file: the start-up params, the `default` preset, the presets laid over it, the groups the random eye resets, and the `?state=` strings, which store only the values that differ from it. A state string or a PNG saved before the file changed decodes against the new defaults.
  - **Export defaults JSON** in the panel downloads `defaults.json`: every value of the panel's target params (where a running transition is heading), rounded like the state, in schema order, without the `debug` group, so the app never starts in a debug view. Replacing `src/params/defaults.json` with it makes the current eye the default.
  - The tests use `BASE_PARAM_SCHEMA`, so retuning the file does not change them; `params.test.js` checks that the file names only existing leaves with valid values.
  - `discrete: true` marks a seed or a count, which a transition switches instead of gliding.
  - `fades: 'intensity'` marks a light's `enabled` toggle, which a transition fades through the sibling leaf.
- **Seeds**: they are separate per subsystem (`irisStructure.seed`, `lashes.seed`, `lids.seed` for the lid shape, folds and skin patterns, `sclera.vessels.seed`), so a new crypt pattern keeps the same lashes.
- **Presets** ([`src/params/presets.js`](../src/params/presets.js)): deep partial overrides of the defaults.
  - Choosing one in the panel glides to its overrides on the defaults ([Transitions](#transitions)).
  - Each reference preset names its photographs (`references`, shown by the capture contact sheet).
  - Reference presets keep the living eye off, so their pupil and gaze are the tuned ones.
  - They also pin the frontal 100 mm framing they were tuned with (`frontal`). The default camera looks from 26° to the side and 7.8° below, with a 110 mm lens.
  - `refraction-checker` is a debug preset; `outdoor` swaps the studio for the sky.
- **Random eye** ([`src/params/populationPriors.js`](../src/params/populationPriors.js)): `randomEye(ancestry)`, with ancestry `european`, `east-asian` or `south-asian`.
  - It samples color class, crypt grade, furrow grade, pigment spots and Wölfflin nodules from Edwards et al. 2016.
  - A Gaussian copula carries the measured correlations between them.
  - Within its color class, a shade (`SHADES`: pale or deep blue, green, grey, hazel, light brown, amber, brown, chestnut, black) sets ranges for the whole layer model of the color and its `saturation` (`SHADE_COLORS`), not only the melanin; the shades and their shares are approximations ([`docs/RESEARCH.md`](RESEARCH.md#color)).
  - Larsson's peripupillary ring is added to 91% of green, hazel and light brown eyes.
  - A tenth of the eyes, of any ancestry (`MAKO_SHARE`), take the fantasy **mako** shade instead: the glowing green-blue of the mako eyes of Final Fantasy VII, a deep blue stroma tinted between green and cyan at full saturation with `irisColor.glow`, without a ring or pigment spots. It is drawn last, so the other eyes of a seed do not change.
  - The result maps onto the age, the pupil, the iris structure and color, the sclera and the skin color. The lashes stay as they are.
  - `main.js` resets those groups to their defaults before applying it, and glides to the result.
- **State**: `encodeState()` writes the non-default values as base64url JSON. **Copy state URL** puts it in `?state=`; **Save PNG** stores it in a `tEXt` chunk named `eye-state` ([`src/render/pngMetadata.js`](../src/render/pngMetadata.js)).

## Coordinate Spaces

- **World**: millimeters, with the globe center at the origin in primary gaze; +Y is up and a camera at azimuth 0 looks down −Z.
  - The lids, lashes and tear film live in world space; they do not turn with the gaze.
  - Lid-attached vertices rotate about the X axis through the globe center to follow the vertical gaze (`lid-follow.glsl`).
- **Eye space** ([`docs/OPTICS.md`](OPTICS.md#eye-space)) moves with the gaze.
  - `EyeRig.pivot` sits at the center of rotation, 13.5 mm behind the corneal apex; `EyeRig.eyeSpace` carries the eyeball.
  - The eyeball shaders work entirely in eye space. The light rig is packed into both spaces every frame.
- **Iris space** is eye space shifted to the decentered pupil center. Its features live in **rest space** ([`docs/IRIS.md`](IRIS.md)).
- **Polar maps**:
  - the iris atlases, with u = θ / 2π and v = rest ρ;
  - the vessel map, with u = φ / 2π and v over ψ ∈ `SCLERA_PSI` (angle from the optical axis);
  - the fissure map, over the front plane at the lids' rest position.
