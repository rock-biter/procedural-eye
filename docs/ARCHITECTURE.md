# Architecture

## Runtime Map

`*` marks pure modules: no three.js objects or browser state, unit-tested in Node.

| Module | Responsibility |
| --- | --- |
| [`main.js`](../main.js) | Bootstrap: URL flags, params (preset, then `?state=`), `RenderSetup`, `EyeApp`, `window.__EYE__`, and the panel with its actions unless `?gui=0`. |
| [`src/app.js`](../src/app.js) | `EyeApp`: owns every system and the frame loop; routes parameter changes by schema `kind`; poses the eye; drives the accumulation; exposes the API. |
| [`src/renderSetup.js`](../src/renderSetup.js) | Renderer, scene, window size, adaptive pixel ratio, frame telemetry. |
| **Parameters** | |
| [`src/params/paramSchema.js`](../src/params/paramSchema.js) * | `PARAM_SCHEMA`: every tunable value with default, range, unit and `kind`; `DEBUG_VIEWS`. |
| [`src/params/params.js`](../src/params/params.js) * | Create, sanitize, get/set by path, diff, overrides, state encoding. |
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
| [`src/iris/irisColorLut.js`](../src/iris/irisColorLut.js) | The lookup as a half-float `Data3DTexture`. |
| **Adnexa and sclera** ([`docs/ADNEXA.md`](ADNEXA.md)) | |
| [`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js) * | Fissure, lid profile, skin surface, lid, fornix and meniscus meshes. |
| [`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js) * | Seeded lash rows, curves and clumps. |
| [`src/adnexa/fissureMap.js`](../src/adnexa/fissureMap.js) * | Signed distance to the fissure, baked for the shaders. |
| [`src/adnexa/lids.js`](../src/adnexa/lids.js), [`lashes.js`](../src/adnexa/lashes.js), [`tearFilm.js`](../src/adnexa/tearFilm.js) | The lid, lash, meniscus and bubble meshes with their materials. |
| [`src/sclera/vesselGenerator.js`](../src/sclera/vesselGenerator.js) * | Seeded episcleral and conjunctival vessel network. |
| [`src/sclera/scleraMaps.js`](../src/sclera/scleraMaps.js) | The network rasterized into the polar vessel map. |
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
| [`src/render/accumulationPass.js`](../src/render/accumulationPass.js) | Progressive mean of still frames in a float history. |
| [`src/render/dofPass.js`](../src/render/dofPass.js) | Interactive depth of field (half-resolution gather). |
| [`src/render/pngMetadata.js`](../src/render/pngMetadata.js) * | `tEXt` chunks and CRC for exported PNGs. |
| [`src/debug/gui.js`](../src/debug/gui.js) | Tweakpane panel generated from the schema. |
| [`src/debug/debugViews.js`](../src/debug/debugViews.js) * | Debug view numbering (`DEBUG_VIEW` define). |
| [`src/math.js`](../src/math.js) *, [`src/random.js`](../src/random.js) * | Scalar and vector helpers; seeds, PCG hash twin, weighted picks, Gaussian samples. |
| [`src/frameStats.js`](../src/frameStats.js), [`src/adaptivePixelRatio.js`](../src/adaptivePixelRatio.js) * | Frame telemetry and the adaptive resolution rules (from the terrain project). |

## Frame Loop

`EyeApp.start()` applies the initial rebuild and bake and renders one frame. It then compiles every program with `renderer.compileAsync()` (recorded as `getCompileMs()`) before the first animation frame. `EyeApp.frame()` then runs on every animation frame:

1. **Pending dirty kinds**
   - `rebuild`:
     - the eye geometry (`createEyeGeometry()`);
     - the entrance-pupil depth the camera aims at;
     - the rig transform and the eyeball mesh;
     - the lid mesh and the fissure map (baked in JS into a half-float texture);
     - the lashes and the tear film.

     A rebuild always bakes too.
   - `bake`:
     - the iris rest space;
     - the structure and pigment atlases (GPU);
     - the color lookup (spectral model in JS);
     - the scleral vessel map.
   - `define`: the debug view define of the eyeball, lid and lash materials. The tone-mapping mode is set by the post-processing every frame; `postprocessing` recompiles it.
2. **Pose** (`pose()`, [`docs/ANIMATION.md`](ANIMATION.md))
   - A living eye steps the animator and restarts the accumulation.
   - In photo mode it keeps its instant.
   - A still eye (`animation.enabled` off) is posed by its parameters whenever the image restarts.
3. **Convergence**: once the accumulation holds `quality.photoSamples` samples, the frame returns. The canvas keeps the converged image.
4. **Render one sample** (`renderSample()`)
   - The first frame after a change is a fresh (interactive) frame. It is a pinhole frame with the cheaper shading tier and the interactive depth of field.
   - Later frames take `accumulationSample(n)`: a subpixel jitter, a point on the lens and a point on the key light.
   - The steps, in order:
     1. `PhysicalCamera` places the camera.
     2. The eye rig updates its matrices.
     3. `LightRig` rebuilds the emitters and packs them in eye space and in world space.
     4. `KeyShadow` renders the lid and lash shadow map from emitter 0, when it is a panel or a window.
     5. The eyeball, lid and lash uniforms are refreshed from the params.
     6. The post-processing updates the lens of the depth of field and its fade, then the composer renders.
5. **Adaptive resolution**: fresh frames feed the adaptive pixel ratio. Accumulating frames do not, because a resize restarts the accumulation.

## Parameter Routing

The panel, the camera controls and `window.__EYE__.setParams()` all edit the one params object.
- **Changes**: `EyeApp.onParamChange(path)` looks up the schema leaf, records its `kind` as dirty and restarts the accumulation. Values of kind `uniform` need nothing else, because every frame reads the params.
- **Listeners**: those added to `app.listeners` hear every change. The panel refreshes after camera moves and preset loads.
- **Bulk changes**: loading a preset, **Random eye** and `setParams()` replace many values at once and mark everything for rebuild.

## Parameters, Presets and the Random Eye

- **Schema**: [`src/params/paramSchema.js`](../src/params/paramSchema.js) defines the groups:
  - `eye`, `animation`;
  - `globe`, `cornea`, `chamber`, `limbus`;
  - `iris`, `irisStructure`, `irisColor`;
  - `lids`, `lashes`, `skin`, `sclera`;
  - `lighting`, `camera`, `post`, `quality`, `debug`.
- **Leaves**: each leaf is `{ default, min, max, step, unit, kind, label }`. A `#rrggbb` default is a color, `options` make a choice, and a boolean is a toggle.
- **Seeds**: they are separate per subsystem (`irisStructure.seed`, `lashes.seed`, `sclera.vessels.seed`), so a new crypt pattern keeps the same lashes.
- **Presets** ([`src/params/presets.js`](../src/params/presets.js)): deep partial overrides of the defaults.
  - Each reference preset names its photographs (`references`, shown by the capture contact sheet).
  - Reference presets keep the living eye off, so their pupil and gaze are the tuned ones.
  - `refraction-checker` is a debug preset; `outdoor` swaps the studio for the sky.
- **Random eye** ([`src/params/populationPriors.js`](../src/params/populationPriors.js)): `randomEye(ancestry)`, with ancestry `european`, `east-asian` or `south-asian`.
  - It samples color class, crypt grade, furrow grade, pigment spots and Wölfflin nodules from Edwards et al. 2016.
  - A Gaussian copula carries the measured correlations between them.
  - Larsson's peripupillary ring is added to 91% of green and hazel eyes.
  - The result maps onto the age, the pupil, the iris structure and color, the sclera, the lash seed and the skin color.
  - The panel resets those groups to their defaults before applying it.
- **State**: `encodeState()` writes the non-default values as base64url JSON. **Copy state URL** puts it in `?state=`; **Save PNG** stores it in a `tEXt` chunk named `eye-state` ([`src/render/pngMetadata.js`](../src/render/pngMetadata.js)).

## Coordinate Spaces

- **World**: millimeters, with the globe center at the origin in primary gaze; +Y is up and the default camera looks down −Z.
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
