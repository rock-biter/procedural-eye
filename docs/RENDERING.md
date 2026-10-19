# Rendering

## Pipeline

Every frame renders one sample ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)):

1. **Key-light shadow pass** ([`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js)): the lids and lashes (layer 1) into a float depth map from emitter 0, 2048² for accumulation samples and 1024² for interactive frames ([`docs/OPTICS.md`](OPTICS.md#key-light-shadow)). One material draws every caster, with the lid follow and the blink ([Blink Morph](#blink-morph)). Fresh frames then reduce the map into the key's soft coverage, and the light shafts draw the same casters from their own direction into theirs ([`docs/OPTICS.md`](OPTICS.md#soft-coverage)); both are kept until the light, the softness or the lids change.
2. **Scene pass** ([`src/render/scenePass.js`](../src/render/scenePass.js), in place of pmndrs' `RenderPass`, into an RGBA16F buffer with depth). The draw order is written out per mesh in [`src/render/drawOrder.js`](../src/render/drawOrder.js) rather than left to the renderer's sort (WebGL sorts one `renderOrder` by material, WebGPU by distance): the lashes first, then the lids, the back shell, the tear film, and the eyeball last but for the backdrop. The depth test then skips the costly optics wherever the lids and lashes cover the eye. Frames that pass through the accumulation are split ([Split Frames](#split-frames)).
   - **Eyeball**: a surface of revolution in eye space with two index groups, coarsely tessellated ([`src/eye/eyeballGeometry.js`](../src/eye/eyeballGeometry.js)): the programs refine the exact surface, and small triangles would make the GPU shade the 2×2 quads along their edges, which cost the optics program dearly. The mesh only has to cover the surface tightly, at the silhouette and for the depth test (the conjunctiva dips 0.06 mm under the globe). Its rings follow the meridian's bend and each ring takes the columns its tolerance asks for ([`src/meshLayout.js`](../src/meshLayout.js)): a chord strays inside the surface by at most 4 µm on the cap, 7 µm on the sclera where it can show, 40 µm where the lids always cover it (more than 45–60° above or below the horizontal plane through the axis, the fissure's half height plus the gaze's travel, and past 100–115° from the axis), blended between; a triangle's middle and its diagonals stray up to about twice as far. The pole is one vertex and the inner rings have few columns; rings of different counts are zipped by angle. About 2 000 vertices (5 472 at 96 × 57): within 10 µm on the cornea and 14 µm on the sclera that shows (13 µm before), 46 µm where the lids cover it. Over the limbus' sulcus, where the profile is concave, a chord passes up to 5 µm in front of the surface; the cap program refines onto it all the same.
     - Group 0, the cornea and limbus cap, uses `eyeball-cap-fragment.glsl`: tear-film reflection, two-surface refraction, the iris trace and shading, the limbus and the limbal ring.
     - Group 1, the sclera beyond the cap, uses `eyeball-sclera-fragment.glsl`: the exact sphere point, then a wet, broken-up reflection over the vessel-mapped diffuse white. Behind the world plane `uGlobeCut` it discards the globe, which lies there under the conjunctiva, inside the back shell ([`docs/ADNEXA.md`](ADNEXA.md#back-shell)).
   - **Lids**: the skin program, in world space, including the conjunctiva and caruncle that fill the canthi and the palpebral conjunctiva that closes the sac behind them. Its pigment patterns come from a texture baked with the lid mesh; outside `#debug` its relief and freckles do too ([`docs/ADNEXA.md`](ADNEXA.md#skin-shading)).
   - **Back shell**: the skin program compiled with `SKIN_SHELL`, closing the skin patch behind ([`docs/ADNEXA.md`](ADNEXA.md#back-shell)). It draws after the lids, so from the front the depth test skips it; it is not on the shadow layer.
   - **Lashes**: tubes with the lash program.
   - **Tear meniscus**: the water program.
   - **Backdrop** ([`src/render/backdrop.js`](../src/render/backdrop.js)): a full-screen triangle at the far plane, drawn last in every view, so the depth test leaves it the pixels nothing else covered: the clear color, with the patch's shadow in the beauty view ([Backdrop Shadow](#backdrop-shadow)).
   - The lids, the lashes and the meniscus blink ([Blink Morph](#blink-morph)).
3. **Accumulation** ([`src/render/accumulationPass.js`](../src/render/accumulationPass.js)):
   - Each frame is blended into an RGBA32F history at weight 1/(n+1), read with `texelFetch`. The first frame (weight 1) replaces the history without reading it.
   - A frame with NaN or Inf keeps the history.
   - The pass writes no output buffer (`needsSwap` false): the next pass reads the mean from `history`.
   - A fresh frame that the next one restarts anyway (a living eye, a running transition: `EyeApp.restartsEveryFrame`) passes through: the history is not written, `history` is the scene buffer itself, and the samples stay at 0. The full-resolution float copy of every living frame is saved.
4. **Depth of field** ([`src/render/dofPass.js`](../src/render/dofPass.js)): the interactive gather, faded out as lens samples accumulate, composited over the mean with an opaque alpha (see [Depth of Field](#depth-of-field)). The haze and the light shafts join the image here ([Dust and Haze](#dust-and-haze), [Light Shafts](#light-shafts)).
5. **Dust** ([`src/render/dustPass.js`](../src/render/dustPass.js)): the motes as their blurred images, added into the composite's buffer (no swap) ([Dust and Haze](#dust-and-haze)).
6. **Effect pass**, in the order pmndrs compiles its effects (`EffectPass` sorts those that read their neighbors first, whatever order they are passed in):
   1. chromatic aberration: `post.chromaticAberration` pixels, radially modulated;
   2. color grade: white balance from `camera.whiteBalance`, saturation and contrast, in linear light;
   3. vignette (`post.vignette`);
   4. tone mapping: `post.toneMapping`, with exposure 2^`camera.exposure` through `renderer.toneMappingExposure`.
7. **Antialiasing pass** (`FreshFrameFXAA` in [`src/render/postProcessing.js`](../src/render/postProcessing.js)), in order:
   1. FXAA of the fresh frames (`quality.antialias`), which have one sample per pixel: the outlines and the iris's speckle, the detail finer than a pixel that the photo averages over its samples. It fades out with the depth of field's `dof.weight`, as the accumulated samples antialias the photo by their pixel jitter.
      - **After tone mapping**: an edge between the bright skin and the backdrop blended in HDR stays stepped once tone mapped. It has a pass of its own because it reads its neighbors in the pass's input, like the chromatic aberration.
      - **Thresholds**: it finds the edges in the tone-mapped output in linear light, where its usual sRGB thresholds are about twice as large in the mid-tones: half of them (0.0156 and 0.0625).
      - **Why not SMAA**: it cleaned the outlines as well but left most of the iris's speckle, for 2 to 4 ms at 3440×1440 on the M1 against a few tenths of a millisecond.
   2. static film grain, in display space: after the antialiasing, which would find it and blend it.

The canvas has no depth, alpha or MSAA: everything reaches it through the composer.

**Backdrop**: past the skin and the back shell the scene shows the clear color, set every frame by `EyeApp`: the tone of the HUD's light skin lit (`#b88264`, the light tone of `src/params/skinTones.js`, whatever the default `skin.color`: its albedo raised to 1.3, as saturated as the subsurface shading makes it, times the rig's luminance), `skin.backdrop` as bright, so it blends with that skin a little darker. It keeps the default tone whatever `skin.color` becomes, so the page does not change with the skin tones. The backdrop triangle draws the same color in every view, with the patch's soft shadow in the beauty view ([Backdrop Shadow](#backdrop-shadow)), so the image never shows the clear itself: three converts the clear color for the target bound when it is set, and `EyeApp` sets it with the canvas bound, so frames that drew no shadow before the scene (no key light, as in `outdoor`) cleared to its sRGB encoding, too light. **Photo mode** is the same pipeline with the eye frozen: samples accumulate until `quality.photoSamples`, then rendering stops.

## Alpha Contract

Scene materials write the **apparent focus distance** (mm from the camera) into alpha.

- **Opaque surfaces** (sclera, skin, lashes, tear film): the true distance.
- **The cornea**: the distance of what is seen through it or in it. For refraction, that is the paraxial image of the refracted point. For reflection, it is the convex-mirror image R/2 behind the surface. The two are blended by luminance.
- **Background**: the clear alpha is `FOCUS_AT_INFINITY` (6e4 mm, [`src/renderSetup.js`](../src/renderSetup.js)). It must stay finite in the half-float scene buffer (at most 65504): an infinite alpha made the accumulation drop every background sample, so the background kept earlier frames. The renderer clears without premultiplied alpha, which would multiply that alpha into the clear color.

The accumulation history keeps the alpha for the depth of field and the dust's occlusion. The effects receive alpha 1, because `postprocessing`'s blend functions read alpha as opacity. A future transparent material must not overwrite it (`blendSrcAlpha` Zero, `blendDstAlpha` One). The tear film is drawn opaque for this reason, and the dust is not part of the scene: it is drawn after the depth of field, with that blending.

## Depth of Field

- **Accumulated samples**: their lens positions give the exact depth of field ([`docs/OPTICS.md`](OPTICS.md#physical-camera)).
- **Fresh interactive frames**: Gustafsson's single-pass bokeh gather at half resolution, and a full-resolution blur of the circles under 3 px in the composite.
  - **Prepare** (`dof-prepare-fragment.glsl`): each half-resolution texel (RGBA16F, nearest) holds the signed blur radius of the last of its 2×2 texels of the history (the texel a nearest lookup at its center reads) and the mean color of those of the four at that radius (within `dofRadiusTolerance()`: a pixel, plus a quarter of the radius); where a split frame shaded at half resolution, the texel of that share. The radius (`dofRadius()`, `dof-radius.glsl`) is the thin lens's blur circle from the focus distance in alpha, c = (f²/N)·(d − s) / (d·(s − f)), in sensor millimeters converted to pixels, negative in front of the focus plane: it grows with the distance, so comparing radii compares distances.
    - **Why not the plain mean**: across a silhouette a texel whose last pixel is the backdrop took the skin's color with the backdrop's radius, and the gather spread that color over the backdrop's whole reach (18 px): a light halo along the patch's outline, strong where the beams light the skin (about 16 times the backdrop in linear light).
  - **Tiles** (`dof-tiles-fragment.glsl`, `dof-dilate-fragment.glsl`): per tile of 10×10 half-resolution texels (20 px, more than the gather's reach), the largest blur radius and whether every texel is the backdrop (a radius past the one halfway to `FOCUS_AT_INFINITY`); then the largest radius and the backdrop flag over the tile and its eight neighbors.
  - **Gather** (`dof-gather-fragment.glsl`): it walks a golden-angle spiral (maximum radius 18 px, step 1.6), turned by a constant rotation, with one texel read per tap. A tap counts where its blur circle reaches the pixel; what lies behind the pixel shows through the pixel's own circle and reaches no farther than twice it, so a blurred lash over the sharp skin turns translucent as well as spreading. The spiral stops past the largest radius around the pixel's tile, where no tap could reach it any more, and a pixel whose neighboring tiles are all backdrop keeps its own color: both leave the result as the full spiral gives it, and skip most taps in focus and over the backdrop.
- **Composite** (`dof-composite-fragment.glsl`):
  - It reads the sharp mean from the history (in a split frame's half-resolution share, the nearest texel of that share) and writes an opaque alpha for the effects.
  - It upsamples the gather from the four half-resolution texels around the pixel, each weighed by the bilinear filter and by how close its prepared radius lies to the pixel's own (from the sharp mean's alpha, within the same tolerance); where none does, the bilinear filter alone. A silhouette then follows the full-resolution outline: the bilinear lookup drew it in 2 px steps and mixed the other side's gather into the pixels along it.
  - **Near blur**: under 2 px of blur radius it blurs the sharp mean itself, at full resolution (`nearBlur()`), with the gather's rules: each of the 20 pixels within √5 px whose blur circle reaches the pixel adds its color, weighed by 1 / the circle's area (at least a pixel's); what lies behind the pixel shows through its own circle, as spread as it is, and reaches no farther than twice it. In focus (no circle over half a pixel around) that is the sharp mean. From 2 to 3 px (`NEAR_RADIUS` ± 0.5) it fades into the gather, shown in full from there on. The gather is too coarse for small circles (its first tap lies 1.6 px out and its texels are 2 px wide): the lashes, the lid margins and the skin near the focus plane stayed sharp and aliased in fresh frames while the photo blurred them. Tiles whose neighborhood is all in focus skip it; it adds about 0.3 ms to the composite at 3440×1440 on the M1.
  - It fades out over the first 16 accumulated samples (`dof.weight`), so the transition to the true depth of field is seamless.

## Dust and Haze

The air between the camera and the eye and behind it: dust motes and a haze, both off in the debug views and in the reference presets.

- **Motes** ([`src/atmosphere/dustField.js`](../src/atmosphere/dustField.js), `dust-vertex.glsl`): `dust.count` seeded motes (`dust.seed`) at their real size: fibers of a median length `dust.size` (log-normal), thin whatever their length, a few bent, some crossed in pairs, and round flakes a fifth as long. In a macro frame they are a few pixels: only the ones near the focus plane read as specks, the others spread into faint blobs.
  - **Where**: a cube of side `dust.extent` centered on the globe, fixed in world space. They drift very slowly on an air current (`dust.drift`, across the face, a little backward and settling), wander (`dust.turbulence`, over a minute or two) and turn (under a turn per minute), and wrap along the cube's world axes, fading in from its faces so they never pop. A turning camera (an orbit, the mouse parallax) moves them only by their parallax.
  - **Image**: a quad per mote, turned with it, around its center line (none for a flake) blurred over the thin-lens blur circle (the formula of `dofRadius()` in `dof-radius.glsl`, without the gather's 18 px reach), its own width and a pixel. The pinhole camera of the frame places it (`PhysicalCamera.pinhole`), so the lens samples do not blur it twice: fresh frames and photo mode show the same dust. Blurs wider than 60 px (at 1440 px of height) fade out; off-screen and faded motes are culled in the vertex shader.
  - **Light**: each emitter's irradiance on a face turned to it (`emitterIrradiance()` of `env-rig.glsl`) times the Henyey–Greenstein phase of the angle between the light and the view (`dust.forward`: forward scattering, so motes in front of a light glow), plus the background's radiance, times `dust.brightness`. The key's term (emitter 0) is shadowed where a mote passes behind the lids and the face, as seen from the key (`keyCover()`, `dust.shadow`); inside a light shaft the beams add theirs, unless the casters hide the mote from their direction (`shaftCover()`, [Light Shafts](#light-shafts)).
  - **Shape** (`dust-fragment.glsl`): the kernel (1 − s²)² around the center line; the mote keeps its image's light, divided by the kernel's integral, so a blurred one is wider and fainter.
  - **Occlusion**: the scene's focus distance in the accumulated mean (alpha; the half-resolution share where a split frame left −1) hides the motes behind a surface, with a soft margin. The backdrop's distance hides none.
  - **Motion**: the dust's clock runs unless the eye is frozen; a converged image is shown again every frame with the moving dust ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)).
- **Haze** (`veil.glsl`): over a distance d the image keeps T = exp(−σ·d) (σ: `dust.haze` per meter) and the air adds (1 − T) times what it scatters along the pixel's ray: the background's radiance plus the irradiance of the brightest emitters (at most 4, `veilLights()`) times the phase of their angle to the ray. The distance stops at the far side of the dust's cube (`camera.distance` + `dust.extent` / 2), so the backdrop takes a finite haze. `dof-prepare-fragment.glsl` adds it to the color the gather blurs, `dof-composite-fragment.glsl` to the sharp mean; in photo mode the accumulated alpha, a mean of distances, softens it at blurred edges.

## Light Shafts

A few blades of the key light (emitter 0, when it casts) cutting across the air around the eye, from a source `shafts.distance` (260 mm) from the globe's center, in the key's direction turned by `shafts.azimuth` and `shafts.elevation` (25° higher by default, so they fall steeply). From a finite distance they spread, so in perspective they fan out from the source. Off in the debug views and in the reference presets; the `shafts` group tunes them live.

- **Blades** ([`src/atmosphere/lightShafts.js`](../src/atmosphere/lightShafts.js)): `shafts.count` Gaussian blades, seeded (`shafts.seed`), σ `shafts.width` across (log-normal, `shafts.widthVariation`) and `shafts.elongation` times that along their long side, which lies along `shafts.angle` in their cross-section (the plane through the globe's center facing the source, its width level with the horizon). Their centers are scattered within `shafts.spread` of (`shafts.offsetX`, `shafts.offsetY`), or side by side across their long sides, like slats, as `shafts.alignment` goes to 1. Down their axis they fade as a Gaussian of σ `shafts.length`.
- **Motion** (`animateShafts()`): each blade sways in the cross-section by up to `shafts.sway` (mm) and flickers down to 1 − `shafts.flicker` of its intensity, slowly (periods of about nine seconds over `shafts.speed`, each at its own rate and phases from the seed), on the dust's clock, frozen in photo mode. While they move the image restarts every frame, as with a living eye (`EyeApp.shaftsMove`).
- **Cookie**: their profile over the cross-section, baked on the CPU into a 256² half-float texture: the texture of the projected rays. A new layout bakes it whole (about a millisecond); moving blades bake it again every frame, clearing and converting only the texels they cover (about half a millisecond). A point reads it where the line from the source through it meets the cross-section, so the blades widen away from the source. [`src/lighting/shaftLight.js`](../src/lighting/shaftLight.js) owns it with the source, the frame and three sets of uniforms.
- **Shadow**: the casters drawn from the source in perspective into a 512² map, reduced into the shafts' soft coverage ([`docs/OPTICS.md`](OPTICS.md#soft-coverage)).
- **On the surfaces** (`shaft-light.glsl`): the skin and the back shell, the lashes, the tear film and the sclera add the blades' irradiance (`shaftIrradiance()`: the key's irradiance × `shafts.intensity` × `shafts.light` × `shafts.color` × the cookie × their cosine toward the source), where the casters' sharp outline seen from the source lets it through (`shaftCut()`, taken 2 mm off the surface along the normal, with 6 mm of slack, so the face lights itself): a stripe of light with soft edges, none on what lies behind the face. The iris, lit through the cornea, scales the key's term by the blades where it enters the cornea (`keyBeams()`). The cornea's mirror reflections are unchanged: the beams have no visible source.
- **On the dust**: the key's irradiance × `shafts.intensity` × `shafts.dust` × `shafts.color` times the cookie, with the phase toward the source, under the shafts' coverage ([Dust and Haze](#dust-and-haze)): motes crossing a blade flash bright, motes in its shadow behind the patch keep only the rest of the light.
- **In the air** (`light-shafts.glsl`, in the depth of field's prepare and composite passes, like the haze): along each pixel's ray, from the camera to the focus distance in alpha, each blade's density integrates in closed form. Across, along its long side and down its axis it is a Gaussian, so along the ray too, with erf (Winitzki's approximation) at the segment's ends: no singular view, and no cut where the densest point passes behind the camera. σ widens with the distance from the source, taken at the ray's densest point. The result is weighted by the ray's sin² against the blade's axis, so a blade shows most when the camera looks across it and fades when seen end on. The casters cut it where it passes behind them as seen from the source, along their sharp outline however far behind (`shaftCut()` at the ray's densest point, `shafts.shadow`): a blade does not go on past the face. The light the air scatters is the key's irradiance × `shafts.intensity` × `shafts.air` (1/m) × `shafts.color` with an isotropic phase. No geometry: a blade fades softly into the skin it passes through, is blurred by the gather with the surfaces under it, and costs the same at any zoom (a loop over at most 12 blades, skipping those whose density along the ray stays under e⁻⁶ of their peak). The composite skips it where the gather covers the pixel.
- **Twins**: `beamIntegral()` and `erf()` in `lightShafts.js` are the CPU twins of the loop of `applyShafts()` and `shaftErf()`.

## Backdrop Shadow

The skin patch casts a soft shadow from the light shafts' source ([Light Shafts](#light-shafts): in the key's direction, raised by `shafts.elevation`, `shafts.distance` away) onto a plane that shows nothing else: a floor `backdrop.distance` (70 mm) below the globe's center by default, turned up about the world x axis toward a wall behind the face (z = −distance) as `backdrop.tilt` goes to 90°. The light being high, the shadow lies under the patch, a little to the side away from it, and, the source being near, larger than the patch.

- **Drawn** by the backdrop triangle ([Pipeline](#pipeline)): each pixel's ray, unprojected through the sample's camera (`inverse(projectionMatrix * viewMatrix)` in the vertex shader, so the lens offset and shear hold), meets the plane; the color is the backdrop's times 1 − `backdrop.shadow` × `shaftCover()` at that point ([`docs/OPTICS.md`](OPTICS.md#soft-coverage)): sharper where the patch nearly touches the plane, `backdrop.softness` 60 mm behind it and farther.
- **Faded out** where the ray grazes the plane, and as the light turns away from it. Only a camera on the plane's side sees it: a floor below the patch does not show from below (the default camera, 37.6° below, sees none), and at the eye's height it is seen edge-on, a thin band. 70 mm down, it is in the frame from about 800 mm out; `backdrop.distance` brings it up.
- **Contract**: alpha stays `FOCUS_AT_INFINITY`, so the depth of field and the dust treat it as the backdrop, and an unshadowed pixel equals the clear color. In the scene, it accumulates and blurs with the rest.

## Split Frames

A frame that passes through the accumulation (a living eye, a transition) shades at full resolution only what the depth of field keeps sharp. Where the blur radius passes 3 px the composite shows the half-resolution gather anyway: there the scene is shaded at half resolution (`quality.splitShading`, on by default).

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
- **Antialiasing**: fresh frames get FXAA (`quality.antialias`), accumulated samples their pixel jitter ([Pipeline](#pipeline)).

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
| `uShaftCookie`, `uShaftFrame`, `uShaftSource`, `uShaftCookieExtent`, `uShaftReach`, `uShaftLight`, `uShaftIrradiance` | The light shafts' cookie, the cross-section's axes and the blades' direction (columns), the source and its distance (mm), the cookie's half side and the blades' σ down their axis (mm), their light on the iris as a share of the key's, their irradiance on a surface facing the source (0 when off). Shared by every receiver and the dust. |
| `uKeyCoverage…`, `uShaftCoverage…` (`…`, `…Matrix`, `…Params`, `…Eye`, `…Forward`) | The key's and the shafts' soft coverages ([`docs/OPTICS.md`](OPTICS.md#soft-coverage)): map, world → its clip, (enabled, unused, the distance of the softest shadow, unused), the light's position and view direction. The receivers, the dust, the shafts in the air and the backdrop. |
| `uLidFollow` | Rotation of the upper and lower lid with the gaze (radians). |
| `uLidBlink` | The blink's closure (0 open, 1 closed): the eye's fissure lookups blend toward the closed fissure by it. The lid meshes morph by their own weights ([Blink Morph](#blink-morph)). |
| **Eyeball** | |
| `uCameraEye`, `uPixelAngle` | Camera position in eye space (per sample); radians per pixel (ray cones). |
| `uLimbus`, `uLimbusOverlap` | Limbus opacity range, ring width and strength, vertical overlap. |
| `uScleraColor`, `uSclera`, `uScleraVessels`, `uScleraPsi` | Sclera base color; (redness, yellowing, irregularity); vessel map and its ψ range. |
| `uGlobeCut` | The world z (mm) behind which the sclera program discards the globe (`GLOBE_CUT` × the sclera radius). |
| `uFissureMap`, `uFissureExtent` | Signed distance to the fissure (r where the lids rest, g closed) and its extent. |
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
| `uSkinRelief`, `uSkinReliefTexel`, `uSkinFreckles`, `uSkinFrecklesTexel` | With `SKIN_BAKED`: the baked relief (the lids', or the shell's in its program) and freckles over the same box, and their texel sizes (mm), which set the mip level they are read at ([`src/adnexa/skinRelief.js`](../src/adnexa/skinRelief.js)). |
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
| `uDustShadow`, `uShaftDust` | How much the casters darken the motes behind them; the beams' light on the motes (rgb, 0 when off). |
| `uShaftCenters`, `uShaftAxes`, `uShaftSides`, `uShaftCount`, `uShaftAir`, `uShaftAirParams`, `uShaftOrigin` | The shafts in the air: per blade its center and intensity, its axis from the source and the source's distance, its thin side and σ; their count (0 when off); the light scattered per mm of blade; (elongation, how much the casters cut them); the pinhole camera's position. |
| **Backdrop** | |
| `uBackdropColor`, `uShadowPlane`, `uShadowStrength` | The clear color; the shadow plane's unit normal and offset; the shadow's strength (faded as the key turns away, 0 outside the beauty view). |

Defines:
- `MAX_EMITTERS` and `EMITTER_VEC4S` (from `envRig.js`); `MAX_SHAFTS` (from `lightShafts.js`);
- `IRIS_ATLAS_HEIGHT` and `IRIS_LUT_MELANIN`, `IRIS_LUT_EUMELANIN`, `IRIS_LUT_STROMA`;
- `PIGMENT_PASS` (atlas bake);
- `SKIN_SHELL`: the back shell's variant of the skin program (its own pattern coordinates, no margin, freckles or veins);
- `SKIN_BAKED`: the skin and back shell programs read the baked relief and freckles; set outside `#debug` (`Lids.setBaked()`, [`docs/ADNEXA.md`](ADNEXA.md#skin-shading));
- `RELIEF_UNDERLAY`, `FRECKLES` (relief bake): the full-screen pass under the lid ring (the shell's relief), the freckles;
- `DEBUG_VIEW`, from `params.debug.view` and numbered in `src/debug/debugViews.js` and `debug-views.glsl`.

## Blink Morph

The lids, the lashes and the tear meniscus blink by three.js morph targets ([`src/adnexa/lidBlink.js`](../src/adnexa/lidBlink.js)); the frames themselves are in [`docs/ADNEXA.md`](ADNEXA.md#blink-frames).

- **Targets**: `BLINK_FRAMES` (4) absolute frames per geometry (`morphTargetsRelative` false, so the open mesh weighs 1 − the frames' weights). Positions and normals, and in the colors' slot the lids' occlusion (x) and the lashes' tangents. three packs them into a float `DataArrayTexture` per geometry and sets `morphTargetsTexture`, `morphTargetsTextureSize`, `morphTargetInfluences` and `morphTargetBaseInfluence` per object, with the defines `USE_MORPHTARGETS`, `MORPHTARGETS_COUNT` and `MORPHTARGETS_TEXTURE_STRIDE`: about 19 MB for the lids, 4 MB for the lashes.
- **Blend**: `lidMorph()` (`lid-morph.glsl`, a `ZERO` loop) adds the frames whose weight is not 0, before the lid follow and in its rest frame. The weights are a Catmull–Rom spline's (`blinkWeights()`): four at most, some negative; all 0 when the lids are open, so an open eye fetches nothing.
- **Consumers**: `skin-vertex.glsl` (the skin patterns keep the open position, so they stay on the skin as it stretches), `lash-vertex.glsl`, `tear-vertex.glsl` and `shadow-depth-vertex.glsl`. The shadow pass draws every caster with one material: the renderer sets the morph uniforms per object, so it morphs them too. The back shell has no targets.
- **Placeholders**: each new geometry carries its own attributes as frames, so its programs are compiled with the morph targets from the start (`compileAsync()`) and keep their variant when the real frames arrive. Swapping them in disposes the geometry (three caches a geometry's morph texture), which uploads it anew on the next frame. The relief bake's lid ring has its own attributes for that reason.

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
| `lid-morph.glsl` | The blink: `lidMorph()` blends a vertex's position, normal or color with its morph targets. |
| `key-shadow.glsl` | Shadow map lookup: hard, Poisson PCF, or estimated penumbra with a slope-scaled bias for the skin. |
| `shadow-coverage.glsl`, `shadow-coverage-reduce-fragment.glsl`, `shadow-coverage-blur-fragment.glsl` | The soft coverages: `keyCover()` and `shaftCover()`, the share of a light blocked behind the casters, softer farther behind; the reduce of a shadow map with the globe's disc; the separable blur. |
| `shaft-light.glsl`, `light-shafts.glsl` | The light shafts: the cookie seen from the source, `shaftIrradiance()` and `keyBeams()` for the receivers; the blades' closed-form integral along a ray (`applyShafts()`). |
| `lit-surface.glsl` | Shared lighting of the world-space surfaces (wrap diffuse, GGX with representative points, wet mirror). |
| `skin-relief.glsl`, `noise3.glsl` | Skin micro-relief with analytic gradients (furrows, fine network, pores, wrinkles, crow's feet), prefiltered by the pixel footprint, gathered by `skinMicroRelief()`, and its encoding for the bake; the skin's pigment patterns (mottling, freckles, veins); 3D gradient noise with derivatives. |
| `skin-pattern-fragment.glsl` | Bake of the pigment patterns that depend only on the rest position (mottling, veins, oily patches). |
| `skin-relief-bake-vertex.glsl`, `skin-relief-bake-fragment.glsl` | Bake of the skin relief (the lid ring laid onto the front-plane box, or a full-screen pass) and of the freckles. |
| `debug-views.glsl` | Debug view numbering. |
| `dof-radius.glsl` | The interactive depth of field's signed blur radius (`dofRadius()`) and the tolerance within which two radii lie at one depth (`dofRadiusTolerance()`), for its prepare and composite passes. |
| `scattering.glsl`, `veil.glsl`, `dust-vertex.glsl`, `dust-fragment.glsl` | The Henyey–Greenstein phase; the haze and the pixel's ray (`veilRay()`); the dust motes' blurred images. |
| `backdrop-vertex.glsl`, `backdrop-fragment.glsl` | The backdrop triangle and the patch's shadow on the shadow plane. |
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
