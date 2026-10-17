# Rendering

## Pipeline

Every frame renders one sample ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)):

1. **Key-light shadow pass** ([`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js)): the lids and lashes (layer 1) into a float depth map from emitter 0, 2048² for accumulation samples and 1024² for interactive frames ([`docs/OPTICS.md`](OPTICS.md#key-light-shadow)).
2. **Scene pass** ([`src/render/scenePass.js`](../src/render/scenePass.js), in place of pmndrs' `RenderPass`, into an RGBA16F buffer with depth). The lashes draw first (`renderOrder` −1) and the eyeball last (`renderOrder` 1): the depth test then skips the costly optics wherever the lids and lashes cover the eye. Frames that pass through the accumulation are split ([Split Frames](#split-frames)).
   - **Eyeball**: a surface of revolution in eye space with two index groups, coarsely tessellated (96 segments around, 32 rings on the cap, 24 on the sclera): the programs refine the exact surface, and small triangles would make the GPU shade the 2×2 quads along their edges, which cost the optics program dearly.
     - Group 0, the cornea and limbus cap, uses `eyeball-cap-fragment.glsl`: tear-film reflection, two-surface refraction, the iris trace and shading, the limbus and the limbal ring.
     - Group 1, the sclera beyond the cap, uses `eyeball-sclera-fragment.glsl`: the exact sphere point, then a wet, broken-up reflection over the vessel-mapped diffuse white. Behind the world plane `uGlobeCut` it discards the globe, which lies there under the conjunctiva, inside the back shell ([`docs/ADNEXA.md`](ADNEXA.md#back-shell)).
   - **Lids**: the skin program, in world space, including the conjunctiva and caruncle that fill the canthi and the palpebral conjunctiva that closes the sac behind them. Its pigment patterns come from a texture baked with the lid mesh ([`docs/ADNEXA.md`](ADNEXA.md#skin-shading)).
   - **Back shell**: the skin program compiled with `SKIN_SHELL`, closing the skin patch behind ([`docs/ADNEXA.md`](ADNEXA.md#back-shell)). It draws after the lids (a later material), so from the front the depth test skips it; it is not on the shadow layer.
   - **Lashes**: tubes with the lash program.
   - **Tear meniscus and bubbles**: the water program; the bubbles are an `InstancedMesh`.
3. **Accumulation** ([`src/render/accumulationPass.js`](../src/render/accumulationPass.js)):
   - Each frame is blended into an RGBA32F history at weight 1/(n+1), read with `texelFetch`. The first frame (weight 1) replaces the history without reading it.
   - A frame with NaN or Inf keeps the history.
   - The pass writes no output buffer (`needsSwap` false): the next pass reads the mean from `history`.
   - A fresh frame that the next one restarts anyway (a living eye, a running transition: `EyeApp.restartsEveryFrame`) passes through: the history is not written, `history` is the scene buffer itself, and the samples stay at 0. The full-resolution float copy of every living frame is saved.
4. **Depth of field** ([`src/render/dofPass.js`](../src/render/dofPass.js)): the interactive gather, faded out as lens samples accumulate, composited over the mean with an opaque alpha (see [Depth of Field](#depth-of-field)). The haze joins the image here ([Dust and Haze](#dust-and-haze)).
5. **Dust** ([`src/render/dustPass.js`](../src/render/dustPass.js)): the motes as their blurred images, added into the composite's buffer (no swap) ([Dust and Haze](#dust-and-haze)).
6. **Effect pass**, in order:
   1. color grade: white balance from `camera.whiteBalance`, saturation and contrast, in linear light;
   2. chromatic aberration: `post.chromaticAberration` pixels, radially modulated;
   3. vignette (`post.vignette`);
   4. tone mapping: `post.toneMapping`, with exposure 2^`camera.exposure` through `renderer.toneMappingExposure`;
   5. static film grain, in display space.

The canvas has no depth, alpha or MSAA: everything reaches it through the composer.

**Backdrop**: past the skin and the back shell the scene shows the clear color, set every frame by `EyeApp`: the tone of the default skin lit (the `skin.color` of `defaults.json`, the HUD's light tone: its albedo raised to 1.3, as saturated as the subsurface shading makes it, times the rig's luminance), `skin.backdrop` as bright, so it blends with that skin a little darker. It keeps the default tone whatever `skin.color` becomes, so the page does not change with the skin tones. **Photo mode** is the same pipeline with the eye frozen: samples accumulate until `quality.photoSamples`, then rendering stops.

## Alpha Contract

Scene materials write the **apparent focus distance** (mm from the camera) into alpha.

- **Opaque surfaces** (sclera, skin, lashes, tear film): the true distance.
- **The cornea**: the distance of what is seen through it or in it. For refraction, that is the paraxial image of the refracted point. For reflection, it is the convex-mirror image R/2 behind the surface. The two are blended by luminance.
- **Background**: the clear alpha is `FOCUS_AT_INFINITY` (6e4 mm, [`src/renderSetup.js`](../src/renderSetup.js)). It must stay finite in the half-float scene buffer (at most 65504): an infinite alpha made the accumulation drop every background sample, so the background kept earlier frames. The renderer clears without premultiplied alpha, which would multiply that alpha into the clear color.

The accumulation history keeps the alpha for the depth of field and the dust's occlusion. The effects receive alpha 1, because `postprocessing`'s blend functions read alpha as opacity. A future transparent material must not overwrite it (`blendSrcAlpha` Zero, `blendDstAlpha` One). The tear film is drawn opaque for this reason, and the dust is not part of the scene: it is drawn after the depth of field, with that blending.

## Depth of Field

- **Accumulated samples**: their lens positions give the exact depth of field ([`docs/OPTICS.md`](OPTICS.md#physical-camera)).
- **Fresh interactive frames**: Gustafsson's single-pass bokeh gather at half resolution.
  - **Prepare** (`dof-prepare-fragment.glsl`): each half-resolution texel (RGBA16F, nearest) holds the mean color of its 2×2 texels of the history and the signed blur radius of the last of them (the texel a nearest lookup at its center reads); where a split frame shaded at half resolution, the texel of that share. The radius is the thin lens's blur circle from the focus distance in alpha, c = (f²/N)·(d − s) / (d·(s − f)), in sensor millimeters converted to pixels, negative in front of the focus plane: it grows with the distance, so comparing radii compares distances.
  - **Tiles** (`dof-tiles-fragment.glsl`, `dof-dilate-fragment.glsl`): per tile of 10×10 half-resolution texels (20 px, more than the gather's reach), the largest blur radius and whether every texel is the backdrop (a radius past the one halfway to `FOCUS_AT_INFINITY`); then the largest radius and the backdrop flag over the tile and its eight neighbors.
  - **Gather** (`dof-gather-fragment.glsl`): it walks a golden-angle spiral (maximum radius 18 px, step 1.6), turned by a constant rotation, with one texel read per tap. The spiral stops past the largest radius around the pixel's tile, where no tap could reach it any more, and a pixel whose neighboring tiles are all backdrop keeps its own color: both leave the result as the full spiral gives it, and skip most taps in focus and over the backdrop.
- **Composite** (`dof-composite-fragment.glsl`):
  - It reads the sharp mean from the history (in a split frame's half-resolution share, the nearest texel of that share) and writes an opaque alpha for the effects.
  - It keeps the sharp frame where the blur is under a pixel and shows the gather in full from 2.5 px of blur radius on.
  - It fades out over the first 16 accumulated samples (`dof.weight`), so the transition to the true depth of field is seamless.

## Dust and Haze

The air between the camera and the eye and behind it: dust motes and a haze, both off in the debug views and in the reference presets.

- **Motes** ([`src/atmosphere/dustField.js`](../src/atmosphere/dustField.js), `dust-vertex.glsl`): `dust.count` seeded motes (`dust.seed`) at their real size: fibers of a median length `dust.size` (log-normal), thin whatever their length, a few bent, some crossed in pairs, and round flakes a fifth as long. In a macro frame they are a few pixels: only the ones near the focus plane read as specks, the others spread into faint blobs.
  - **Where**: a cube of side `dust.extent` centered on the globe, fixed in world space. They drift very slowly on an air current (`dust.drift`, across the face, a little backward and settling), wander (`dust.turbulence`, over a minute or two) and turn (under a turn per minute), and wrap along the cube's world axes, fading in from its faces so they never pop. A turning camera (an orbit, the mouse parallax) moves them only by their parallax.
  - **Image**: a quad per mote, turned with it, around its center line (none for a flake) blurred over the thin-lens blur circle (the formula of `dof-prepare-fragment.glsl`, without the gather's 18 px reach), its own width and a pixel. The pinhole camera of the frame places it (`PhysicalCamera.pinhole`), so the lens samples do not blur it twice: fresh frames and photo mode show the same dust. Blurs wider than 60 px (at 1440 px of height) fade out; off-screen and faded motes are culled in the vertex shader.
  - **Light**: each emitter's irradiance on a face turned to it (`emitterIrradiance()` of `env-rig.glsl`) times the Henyey–Greenstein phase of the angle between the light and the view (`dust.forward`: forward scattering, so motes in front of a light glow), plus the background's radiance, times `dust.brightness`.
  - **Shape** (`dust-fragment.glsl`): the kernel (1 − s²)² around the center line; the mote keeps its image's light, divided by the kernel's integral, so a blurred one is wider and fainter.
  - **Occlusion**: the scene's focus distance in the accumulated mean (alpha; the half-resolution share where a split frame left −1) hides the motes behind a surface, with a soft margin. The backdrop's distance hides none.
  - **Motion**: the dust's clock runs unless the eye is frozen; a converged image is shown again every frame with the moving dust ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)).
- **Haze** (`veil.glsl`): over a distance d the image keeps T = exp(−σ·d) (σ: `dust.haze` per meter) and the air adds (1 − T) times what it scatters along the pixel's ray: the background's radiance plus the irradiance of the brightest emitters (at most 4, `veilLights()`) times the phase of their angle to the ray. The distance stops at the far side of the dust's cube (`camera.distance` + `dust.extent` / 2), so the backdrop takes a finite haze. `dof-prepare-fragment.glsl` adds it to the color the gather blurs, `dof-composite-fragment.glsl` to the sharp mean; in photo mode the accumulated alpha, a mean of distances, softens it at blurred edges.

## Split Frames

A frame that passes through the accumulation (a living eye, a transition) shades at full resolution only what the depth of field keeps sharp. Where the blur radius passes 2.5 px the composite shows the half-resolution gather anyway: there the scene is shaded at half resolution (`quality.splitShading`, on by default).

- **Which share**: the last frame's prepared blur radii, their smallest over each texel and its eight neighbors (`shading-spread-fragment.glsl`). Under `SHARP_RADIUS` (3 px) the texel's four pixels are shaded at full resolution, otherwise the texel at half resolution. The neighbors cover the composite's bilinear lookup and some motion. A frame whose last frame left no radii (the first one, a resize, photo mode before it) is not split.
- **How**: the scene renders twice, into the full-resolution buffer and into `ScenePass.half` (half resolution, 4 samples per pixel). Each time a full-screen triangle draws first (`shading-block-fragment.glsl`, part of the scene and visible only then, because three invalidates a multisampled target after each render): over the pixels the pass leaves out it writes alpha −1 and the near plane's depth, so the depth test skips the scene there. The half-resolution pass doubles the materials' pixel angle (`uPixelAngle`), so their footprint-filtered detail matches.
- **The 4 samples**: lashes thinner than a half-resolution pixel break into dots without them; with them each texel covers four points, as the 2×2 mean of the full-resolution frame does. They cost little because the meshes' triangles are not tiny. A multisampled pass shades a triangle that covers any sample of a pixel at the pixel's center, though, which at the triangle's edge lies off it: plain varyings extrapolate there. On a lash's thin tube `vLash.x` ran far past 1 (a point hundreds of mm away), and the albedo, which grows with it cubed, flared to thousands; along the skin's edges and folds the lid frame, relief and occlusion ran past their ranges and the shading turned negative. The gather spread either over a few frames, as white or black blots (black where tone mapping makes a negative color NaN), mostly while the camera moved, at fractional adaptive pixel ratios. The lash and skin varyings are therefore `centroid` (`lash-vertex.glsl`, `skin-vertex.glsl`), which keeps them on the triangle; the skin's screen-space derivatives read plain copies interpolated at the pixel's center (`vCenterWorldPos`, `vCenterFrame`), because a centroid varying's derivatives jump where its sample point moves. Full-resolution frames are unchanged (without multisampling the centroid is the center). A future material in the scene needs the same.
- **Mispredictions**: a pixel shaded at half resolution that turns out sharp (a fast saccade) shows the nearest half-resolution texel for one frame. A 12° gaze jump between two frames shows no visible difference.

## Shading Tiers

`eyeball.update(…, interactive)` chooses the iris tier per frame:
- **Fresh frames** (`quality.interactiveShadowSteps`, `quality.interactiveAoSteps`) are cheaper.
- **Accumulated samples** (`quality.irisShadowSteps`, `quality.irisAoSteps`) are full.
- **Micro striations** ([`docs/IRIS.md`](IRIS.md)): fresh frames leave them out where the depth of field's gather will blur them over two of their widths (`uIrisMicroBlur`); accumulated samples always draw them.
- **Common to both**: the march limit `quality.irisSteps`, plus the ray-footprint LOD of the atlases and the micro detail.
- **Key-light shadow**: fresh frames filter a 1024² map, accumulated samples compare a 2048² one.
- **Split frames**: frames that are not kept shade the blurred share at half resolution ([Split Frames](#split-frames)); kept ones are whole.
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
| `uKeyShadowMap`, `uKeyShadowMatrix`, `uKeyShadowParams` | Key-light shadow: map (the interactive or the accumulation one), world → shadow clip, (filter radius, bias, enabled). |
| `uLidFollow` | Rotation of the upper and lower lid with the gaze (radians). |
| **Eyeball** | |
| `uCameraEye`, `uPixelAngle` | Camera position in eye space (per sample); radians per pixel (ray cones). |
| `uLimbus`, `uLimbusOverlap` | Limbus opacity range, ring width and strength, vertical overlap. |
| `uScleraColor`, `uSclera`, `uScleraVessels`, `uScleraPsi` | Sclera base color; (redness, yellowing, irregularity); vessel map and its ψ range. |
| `uGlobeCut` | The world z (mm) behind which the sclera program discards the globe (`GLOBE_CUT` × the sclera radius). |
| `uFissureMap`, `uFissureExtent` | Signed distance to the fissure and its extent. |
| `uLidReflection`, `uLidRadiance`, `uLashRadiance` | Lid and lash reflections ([`docs/OPTICS.md`](OPTICS.md#reflections-of-the-lids-and-lashes)). |
| `uIrisAtlas`, `uIrisPigment`, `uIrisColorLut` | Structure atlas, pigment atlas, color lookup ([`docs/IRIS.md`](IRIS.md)). |
| `uIrisRest`, `uIrisThicknessResponse`, `uIrisSeed` | Rest space and the seed of the analytic parts. |
| `uFiberRadial`, `uFiberArc`, `uFiberMisc`, `uRuff` | Fiber families, coverage, fusion, undercut, ruff and micro striations. |
| `uIrisColorMisc`, `uIrisTint` | ABL share over the radial vessels, saturation, LUT stroma range, glow radiance (`irisColor.glow` times a white surface lit by the rig); tint. |
| `uIrisSteps`, `uIrisShadowSteps`, `uIrisAoSteps`, `uIrisMicroBlur` | The quality tier of the frame. |
| `uDefocus` | The camera's aperture diameter and focus distance: the blur radius over the iris, which decides where fresh frames leave out the micro striations. |
| **Skin, lashes, tear film** | |
| `uSkinColor`, `uSkin`, `uSkin2`, `uSkin3`, `uPixelAngle` | Skin color; (redness, roughness, wetness, pores); (wrinkles, translucency, lid profile ends); (freckles, veins, pigmentation, `lids.seed`). |
| `uCanthi`, `uMarginLength`, `uDefocus` | The medial and lateral canthi in the front plane at rest; the upper and lower margin lengths; the camera's aperture diameter and focus distance, which widen the footprint of the skin's fine relief by the blur circle ([`docs/ADNEXA.md`](ADNEXA.md#skin-shading)). |
| `uOcclusion` | How strongly the skin applies its baked ambient occlusion (the `ao` attribute, [`docs/ADNEXA.md`](ADNEXA.md#baked-occlusion)). |
| `uSkinPattern`, `uSkinPatternBox` | The baked pigment patterns and the front-plane box they cover ([`src/adnexa/skinPattern.js`](../src/adnexa/skinPattern.js)). |
| `uShellTone` | The back shell's albedo, a share of the skin's (`shell.tone`); its program shares the skin's other uniforms. |
| `uLashColor`, `uLashShine` | Lash fiber color and cuticle shine. |
| `uTearTint` | What the water shows of what lies behind. |
| **Dust and haze** | |
| `uView`, `uProjection`, `uViewport` | The pinhole camera of the frame and the buffer size (px). |
| `uLens` | The depth of field's lens (`DofPass.setLens()`), for the motes' blur. |
| `uVolume` | The motes' cube: center (world) and side (mm). |
| `uTime`, `uWind`, `uTurbulence` | The dust's clock (s); the air current (mm/s, world); the wandering (mm). |
| `uSize`, `uForward`, `uAmbient`, `uBrightness` | Median fiber length (mm); phase g; background radiance; gain. |
| `uMaxRadius` | Largest blur radius drawn (px). |
| `uSharp`, `uHalf` | The accumulated mean and the half-resolution share, for the occlusion. |
| `uVeil`, `uVeilAmbient`, `uVeilLightDirection`, `uVeilLightIrradiance`, `uVeilLightCount`, `uVeilBasis`, `uVeilTan` | The haze: density (1/mm), far distance, phase g; background radiance; the lights; the camera's axes and the tangents of its half fields of view. |

Defines:
- `MAX_EMITTERS` and `EMITTER_VEC4S` (from `envRig.js`);
- `IRIS_ATLAS_HEIGHT` and `IRIS_LUT_MELANIN`, `IRIS_LUT_EUMELANIN`, `IRIS_LUT_STROMA`;
- `PIGMENT_PASS` (atlas bake);
- `SKIN_SHELL`: the back shell's variant of the skin program (its own pattern coordinates, no margin, freckles or veins);
- `DEBUG_VIEW`, from `params.debug.view` and numbered in `src/debug/debugViews.js` and `debug-views.glsl`.

## Shader Files

| File | Role |
| --- | --- |
| `common.glsl` | Constants, `ZERO`, `luma()`, PCG hashes, `smin`/`smax`, `smootherstep`. |
| `eye-profile.glsl` | Surface profile, slope, normal, Newton refinement, iris back paraboloid, shared eye uniforms. |
| `cornea-optics.glsl` | Fresnel, sphere/conic/paraboloid intersections, `traceCornea()`, the paraxial `apparentDepth()` behind the cornea. |
| `env-rig.glsl` | Analytic emitters: radiance along rays, irradiance (shadowed variant), background. |
| `chamber.glsl` | `traceChamber()`: the iris, the angle, the pupil and the lens. |
| `iris-space.glsl`, `iris-noise.glsl`, `iris-sdf.glsl`, `iris-trace.glsl`, `iris-shade.glsl` | The iris: rest space, periodic noise, distance field, sphere tracing (normal, AO, soft shadow), lighting and color. |
| `iris-bake-fragment.glsl` | Structure and pigment atlas bake. |
| `sclera.glsl` | Sclera albedo with vessels, conjunctival micro-relief, fissure distance, lid occlusion and lid reflections. |
| `lid-follow.glsl` | Lid rotation with the gaze and its inverse for rest-space lookups. |
| `key-shadow.glsl` | Shadow map lookup: hard, Poisson PCF, or estimated penumbra with a slope-scaled bias for the skin. |
| `lit-surface.glsl` | Shared lighting of the world-space surfaces (wrap diffuse, GGX with representative points, wet mirror). |
| `skin-relief.glsl`, `noise3.glsl` | Skin micro-relief with analytic gradients (furrows, fine network, pores, wrinkles, crow's feet), prefiltered by the pixel footprint, and the skin's pigment patterns (mottling, freckles, veins); 3D gradient noise with derivatives. |
| `skin-pattern-fragment.glsl` | Bake of the pigment patterns that depend only on the rest position (mottling, veins, oily patches). |
| `debug-views.glsl` | Debug view numbering. |
| `scattering.glsl`, `veil.glsl`, `dust-vertex.glsl`, `dust-fragment.glsl` | The Henyey–Greenstein phase; the haze; the dust motes' blurred images. |
| `eyeball-*.glsl`, `skin-*.glsl`, `lash-*.glsl`, `tear-*.glsl`, `shadow-depth-*.glsl` | Scene program entry points. |
| `fullscreen-vertex.glsl` (at the near plane with `NEAR_PLANE`), `shading-spread-fragment.glsl`, `shading-block-fragment.glsl`, `accumulate-fragment.glsl`, `dof-prepare-fragment.glsl`, `dof-tiles-fragment.glsl`, `dof-dilate-fragment.glsl`, `dof-gather-fragment.glsl`, `dof-composite-fragment.glsl`, `color-grade-fragment.glsl`, `film-grain-fragment.glsl` | Pass and effect programs. |

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
