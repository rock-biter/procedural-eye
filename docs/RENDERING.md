# Rendering

## Pipeline

Every frame renders one sample ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)):

1. **Key-light shadow pass** ([`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js)): the lids and lashes (layer 1) into a 2048² float depth map from emitter 0 ([`docs/OPTICS.md`](OPTICS.md#key-light-shadow)).
2. **Scene pass** (pmndrs `RenderPass` into an RGBA16F buffer):
   - **Eyeball**: a surface of revolution in eye space with two index groups.
     - Group 0, the cornea and limbus cap, uses `eyeball-cap-fragment.glsl`: tear-film reflection, two-surface refraction, the iris trace and shading, the limbus and the limbal ring.
     - Group 1, the sclera beyond the cap, uses `eyeball-sclera-fragment.glsl`: the exact sphere point, then a wet, broken-up reflection over the vessel-mapped diffuse white.
   - **Lids**: the skin program, in world space, including the conjunctiva and caruncle that fill the canthi.
   - **Lashes**: tubes with the lash program.
   - **Tear meniscus and bubbles**: the water program; the bubbles are an `InstancedMesh`.
3. **Accumulation** ([`src/render/accumulationPass.js`](../src/render/accumulationPass.js)):
   - Each frame is blended into an RGBA32F history at weight 1/(n+1), read with `texelFetch`.
   - A frame with NaN or Inf keeps the history.
   - The pass then presents the mean with an opaque alpha.
4. **Depth of field** ([`src/render/dofPass.js`](../src/render/dofPass.js)): the interactive gather, faded out as lens samples accumulate (see [Depth of Field](#depth-of-field)).
5. **Effect pass**, in order:
   1. color grade: white balance from `camera.whiteBalance`, saturation and contrast, in linear light;
   2. chromatic aberration: `post.chromaticAberration` pixels, radially modulated;
   3. vignette (`post.vignette`);
   4. tone mapping: `post.toneMapping`, with exposure 2^`camera.exposure` through `renderer.toneMappingExposure`;
   5. static film grain, in display space.

The canvas has no depth, alpha or MSAA: everything reaches it through the composer.

**Backdrop**: past the skin's outer edge the scene shows the clear color, set every frame by `EyeApp`: the tone of the lit skin (its albedo raised to 1.3, as saturated as the subsurface shading makes it, times the rig's luminance), `skin.backdrop` as bright, so it blends with the skin a little darker. **Photo mode** is the same pipeline with the eye frozen: samples accumulate until `quality.photoSamples`, then rendering stops.

## Alpha Contract

Scene materials write the **apparent focus distance** (mm from the camera) into alpha.

- **Opaque surfaces** (sclera, skin, lashes, tear film): the true distance.
- **The cornea**: the distance of what is seen through it or in it. For refraction, that is the paraxial image of the refracted point. For reflection, it is the convex-mirror image R/2 behind the surface. The two are blended by luminance.
- **Background**: the clear alpha is `FOCUS_AT_INFINITY` (6e4 mm, [`src/renderSetup.js`](../src/renderSetup.js)). It must stay finite in the half-float scene buffer (at most 65504): an infinite alpha made the accumulation drop every background sample, so the background kept earlier frames. The renderer clears without premultiplied alpha, which would multiply that alpha into the clear color.

The accumulation history keeps the alpha for the depth of field. The effects receive alpha 1, because `postprocessing`'s blend functions read alpha as opacity. A future transparent material must not overwrite it (`blendSrcAlpha` Zero, `blendDstAlpha` One). The tear film is drawn opaque for this reason.

## Depth of Field

- **Accumulated samples**: their lens positions give the exact depth of field ([`docs/OPTICS.md`](OPTICS.md#physical-camera)).
- **Fresh interactive frames**: Gustafsson's single-pass bokeh gather at half resolution (`dof-gather-fragment.glsl`).
  - It walks a golden-angle spiral (maximum radius 18 px, step 1.6).
  - It uses the signed blur circle of the thin lens, computed from the focus distance in alpha: c = (f²/N)·|d − s| / (d·(s − f)), in sensor millimeters converted to pixels.
- **Composite** (`dof-composite-fragment.glsl`):
  - It keeps the sharp frame where the blur is under a pixel.
  - It fades out over the first 16 accumulated samples (`dof.weight`), so the transition to the true depth of field is seamless.

## Shading Tiers

`eyeball.update(…, interactive)` chooses the iris tier per frame:
- **Fresh frames** (`quality.interactiveShadowSteps`, `quality.interactiveAoSteps`) are cheaper.
- **Accumulated samples** (`quality.irisShadowSteps`, `quality.irisAoSteps`) are full.
- **Common to both**: the march limit `quality.irisSteps`, plus the ray-footprint LOD of the atlases and the micro detail.
- **Adaptive resolution**: the pixel ratio adapts on fresh frames only (`quality.adaptiveResolution`, `quality.minPixelRatio`).

## Materials and Uniforms

| Uniform | Content |
| --- | --- |
| **Shared** | |
| `uZero` | Always 0: the `ZERO` loop start (`common.glsl`). |
| `uGlobe`, `uCornea`, `uIor`, `uLens`, `uIrisShape` | Eye geometry from `createEyeGeometry().pack()` ([`docs/OPTICS.md`](OPTICS.md)). |
| `uPupil` | Pupil center (nasal decentration, eye space) and radius. |
| `uEyeToWorld` | Eye → world matrix (shadow, fissure and reflection lookups from eye space). |
| `uEmitters`, `uEmitterCount`, `uRoom`, `uSkyZenith`, `uSkyHorizon`, `uSkyGround`, `uEnvUp` | The light rig: `LightRig.eyeUniforms` for the eyeball, `LightRig.worldUniforms` for the rest. |
| `uKeyShadowMap`, `uKeyShadowMatrix`, `uKeyShadowParams` | Key-light shadow: map, world → shadow clip, (filter radius, bias, enabled). |
| `uLidFollow` | Rotation of the upper and lower lid with the gaze (radians). |
| **Eyeball** | |
| `uCameraEye`, `uPixelAngle` | Camera position in eye space (per sample); radians per pixel (ray cones). |
| `uLimbus`, `uLimbusOverlap` | Limbus opacity range, ring width and strength, vertical overlap. |
| `uScleraColor`, `uSclera`, `uScleraVessels`, `uScleraPsi` | Sclera base color; (redness, yellowing, irregularity); vessel map and its ψ range. |
| `uFissureMap`, `uFissureExtent` | Signed distance to the fissure and its extent. |
| `uLidReflection`, `uLidRadiance`, `uLashRadiance` | Lid and lash reflections ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)). |
| `uIrisAtlas`, `uIrisPigment`, `uIrisColorLut` | Structure atlas, pigment atlas, color lookup ([`docs/IRIS.md`](IRIS.md)). |
| `uIrisRest`, `uIrisThicknessResponse`, `uIrisSeed` | Rest space and the seed of the analytic parts. |
| `uFiberRadial`, `uFiberArc`, `uFiberMisc`, `uRuff` | Fiber families, coverage, fusion, undercut, ruff and micro striations. |
| `uIrisColorMisc`, `uIrisTint` | ABL share over the radial vessels, saturation, LUT stroma range; tint. |
| `uIrisSteps`, `uIrisShadowSteps`, `uIrisAoSteps` | The quality tier of the frame. |
| **Skin, lashes, tear film** | |
| `uSkinColor`, `uSkin`, `uSkin2`, `uSkin3`, `uPixelAngle` | Skin color; (redness, roughness, wetness, pores); (wrinkles, translucency, lid profile ends); (freckles, veins, pigmentation, `lids.seed`). |
| `uCanthi`, `uMarginLength`, `uDefocus` | The medial and lateral canthi in the front plane at rest; the upper and lower margin lengths; the camera's aperture diameter and focus distance, which widen the footprint of the skin's fine relief by the blur circle ([`docs/ADNEXA.md`](ADNEXA.md#skin-shading)). |
| `uLashColor`, `uLashShine` | Lash fiber color and cuticle shine. |
| `uTearTint` | What the water shows of what lies behind. |

Defines:
- `MAX_EMITTERS` and `EMITTER_VEC4S` (from `envRig.js`);
- `IRIS_ATLAS_HEIGHT` and `IRIS_LUT_MELANIN`, `IRIS_LUT_EUMELANIN`, `IRIS_LUT_STROMA`;
- `PIGMENT_PASS` (atlas bake);
- `DEBUG_VIEW`, from `params.debug.view` and numbered in `src/debug/debugViews.js` and `debug-views.glsl`.

## Shader Files

| File | Role |
| --- | --- |
| `common.glsl` | Constants, `ZERO`, `luma()`, PCG hashes, `smin`/`smax`, `smootherstep`. |
| `eye-profile.glsl` | Surface profile, slope, normal, Newton refinement, iris back paraboloid, shared eye uniforms. |
| `cornea-optics.glsl` | Fresnel, sphere/conic/paraboloid intersections, `traceCornea()`. |
| `env-rig.glsl` | Analytic emitters: radiance along rays, irradiance (shadowed variant), background. |
| `chamber.glsl` | `traceChamber()`: the iris, the angle, the pupil and the lens. |
| `iris-space.glsl`, `iris-noise.glsl`, `iris-sdf.glsl`, `iris-trace.glsl`, `iris-shade.glsl` | The iris: rest space, periodic noise, distance field, sphere tracing (normal, AO, soft shadow), lighting and color. |
| `iris-bake-fragment.glsl` | Structure and pigment atlas bake. |
| `sclera.glsl` | Sclera albedo with vessels, conjunctival micro-relief, fissure distance, lid occlusion and lid reflections. |
| `lid-follow.glsl` | Lid rotation with the gaze and its inverse for rest-space lookups. |
| `key-shadow.glsl` | Shadow map lookup: hard, Poisson PCF, or estimated penumbra with a slope-scaled bias for the skin. |
| `lit-surface.glsl` | Shared lighting of the world-space surfaces (wrap diffuse, GGX with representative points, wet mirror). |
| `skin-relief.glsl`, `noise3.glsl` | Skin micro-relief with analytic gradients (furrows, fine network, pores, wrinkles, crow's feet), prefiltered by the pixel footprint, and the skin's pigment patterns (mottling, freckles, veins); 3D gradient noise with derivatives. |
| `debug-views.glsl` | Debug view numbering. |
| `eyeball-*.glsl`, `skin-*.glsl`, `lash-*.glsl`, `tear-*.glsl`, `shadow-depth-*.glsl` | Scene program entry points. |
| `fullscreen-vertex.glsl`, `accumulate-fragment.glsl`, `present-fragment.glsl`, `dof-gather-fragment.glsl`, `dof-composite-fragment.glsl`, `color-grade-fragment.glsl`, `film-grain-fragment.glsl` | Pass and effect programs. |

## Debug Views

`?view=` or the **debug › view** control. Each view is compiled as a `DEBUG_VIEW` define, so the beauty programs carry no debug branches.

| View | Shows |
| --- | --- |
| `beauty` | The image. |
| `refraction-checker` | A 0.5 mm / 15° polar grid on the iris through the cornea. |
| `normals` | Surface normals of the eyeball, skin and lashes. |
| `fresnel` | Corneal and scleral Fresnel (×20). |
| `reflection-only`, `refraction-only` | One term of the cornea. |
| `limbus-mask` | The limbus opacity. |
| `iris-clay` | The iris field in grey, lit as usual. |
| `iris-steps` | March steps per pixel, blue to red; bright red at the limit. |
| `iris-normals`, `iris-ao` | Normals and ambient occlusion of the iris field. |
| `iris-atlas` | Structure atlas channels: height, pupillary zone, collarette distance. |
