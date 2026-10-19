# Optics

## Eye Space

- Units are millimeters, and the globe (sclera sphere) is centered at the origin.
- +Z is the optical axis, out of the corneal apex. +Y is superior.
- +X is nasal for a right eye and temporal for a left one (`eye.laterality`; `nasalSign` is +1 for a right eye).
- A camera at azimuth 0 looks down −Z, so +X is the right of the picture.

The eye turns about the globe's center ([`src/eye/eyeRig.js`](../src/eye/eyeRig.js)), not about the measured center of rotation, 13.5 mm behind the apex (0.4 mm behind the globe's center by default). The conjunctiva, the margins' support and the tear meniscus are built on the globe at rest and stay with the face, so the globe has to turn in place under them: turning about a point behind its center would shift the sphere, by about half a millimeter in depth at the fornix for 20° of gaze, and the conjunctiva and sclera would cut through each other in the canthi ([`docs/ADNEXA.md`](ADNEXA.md#conjunctiva)). The animator aims the **visual axis**, which lies `eye.kappa` degrees nasal of the optical axis, so the corneal reflex of a light at the camera sits slightly nasal of the pupil center.

## Eye Geometry

[`src/eye/eyeProfile.js`](../src/eye/eyeProfile.js) (twin: `src/shaders/eye-profile.glsl`) derives every surface from the params:

- **Sclera**: a sphere of `globe.scleraRadius` (12 mm).
- **Anterior cornea**: a conic of revolution with `cornea.radius` R and `cornea.asphericity` Q, sag w(r) = r² / (R·[1 + √(1 − (1+Q)r²/R²)]).
  - The apex height is chosen so the conic meets the sphere at the limbus radius `cornea.diameter / 2`.
  - A C2 smootherstep blend of `cornea.limbusBlend` width joins the two surfaces. It runs slightly inside both, like the corneoscleral sulcus.
  - The defaults reproduce the measured corneoscleral sag within 0.1 mm at chords of 10, 12.3 and 15 mm.
- **Posterior cornea**: a sphere of `cornea.posteriorRadius`, `cornea.thickness` behind the apex.
- **Anterior lens**: a Navarro conic (R 10.2, Q −3.1316), `chamber.depth` behind the posterior cornea.
- **Iris back surface** (the pigment epithelium): a paraboloid z = irisBaseZ − c·r² through the pupil margin.
  - The margin rests on the lens at the rest pupil radius; the surface drops `iris.rootDrop` to the root at `iris.rootRadius` (the forward bowing).
  - In the default eye the pupil margin is 3.76 mm behind the apex.
  - The iris field lives in a shell above this surface ([`docs/IRIS.md`](IRIS.md)).

`pack()` returns the uniform vectors `uGlobe`, `uCornea`, `uIor`, `uLens` and `uIrisShape`.

## Ray Path Through the Cornea

`eyeball-cap-fragment.glsl` (twin: [`src/eye/cornealOptics.js`](../src/eye/cornealOptics.js)):

1. **Surface point**: three Newton steps refine the rasterized point onto the analytic surface along the view ray (`refineOnSurface()`). The normal comes from the analytic slope, so catchlights stay smooth at any magnification.
2. **Reflection**: unpolarized dielectric Fresnel at the tear film (`cornea.tearIor`, 2.1% at normal incidence) of the mirror ray. The ray goes into the light rig, with the lids and lashes in front of it (next section). Past the limbus, the mirror normal takes the conjunctival micro-relief, so the wet sclera breaks the reflection up.
3. **Refraction**:
   - Snell into the stroma (`cornea.ior`), then at the posterior sphere into the aqueous (`chamber.aqueousIor`).
   - A ray that misses the posterior surface, or is totally reflected, sees nothing through the cornea.
4. **Anterior chamber** (`chamber.glsl`):
   - The refracted ray is traced against the iris field (`traceIris()`) with the cone of its pixel footprint.
   - Beyond the root, the iridocorneal angle is dark.
   - Through the pupil, the anterior lens reflects a little (Purkinje III, Fresnel at 1.42/1.336) over an almost black fundus.

With the default eye, the paraxial entrance pupil is 3.039 mm deep and magnified ×1.131 (Gullstrand: 3.047, ×1.133).

The iris is lit through the cornea too. Each emitter's light reaches it along the direction refracted at the anterior cornea, using the single-surface keratometric index 1.3375, and scaled by the Fresnel transmission there (`lightThroughCornea()` in `iris-shade.glsl`).

## Reflections of the Lids and Lashes

The lids and lashes are too close to the eye to be part of the light rig. `lidReflection()` (`sclera.glsl`) places them in every mirror ray of the cornea and the sclera:

- **Skin**:
  - The ray, in world space, is intersected with a sphere around the globe of radius `globe.scleraRadius` + 0.6·`lids.lidThickness`.
  - Where the hit lies under the lids (negative fissure distance, [`docs/ADNEXA.md`](ADNEXA.md#fissure-map)), it sees the skin. The distance follows the blink, so the reflected lid comes down with the lid.
  - The skin radiance is `uLidRadiance`: the skin color lit by the rig's luminance.
- **Lashes**:
  - Just past the margins, a comb of dark strands, 4.5 per mm, gives the lashes (`uLashRadiance`).
  - The comb reaches 0.7 of `lashes.upperLength` above the eye, and 0.55 of that below.

## Limbus

- **Opacity**: `limbus.opacityInner` and `limbus.opacityOuter` set where the clear cornea fades into the opaque sclera around the limbus radius.
- **Shape**: the radius is stretched vertically by `limbus.verticalOverlap`, because the sclera overlaps the cornea more at the top and bottom. The visible iris is therefore wider than tall.
- **Limbal ring**: it darkens the refracted image over `limbus.ringWidth` inside the opaque edge, by `limbus.ringStrength`.

## Light Rig

[`src/lighting/envRig.js`](../src/lighting/envRig.js) builds the emitters in world space around the eye. Colors come from black-body temperatures (unit luminance) or sRGB colors times an intensity, in arbitrary linear units (exposure is applied in post).

- **Placement**
  - The studio key and fill panels and the window are placed by azimuth (0 is straight in front of the eye, positive toward +X), elevation and distance, and face the eye.
  - The ring light, the LED ring, the camera lens, the camera body and the photographer are mounted on the camera and follow it.
- **Types**: rect, disk, octagon, window (panes, mullions, sky gradient, skyline), ring, LEDs, lens (dark, with a bright barrel rim), blocker.

`env-rig.glsl` uses the packed emitters (six vec4s each, in the material's space):

- `envRadiance(origin, dir)`: the nearest emitter hit by the ray, blended over the background by its edge coverage. Mirror reflections therefore have exact shapes and sharp edges.
- `emitterIrradiance()`: Lambert's polygon formula on the emitter's quad (scaled by the shape's fill factor), or solid angle × cosine for the LEDs.
- `backgroundRadiance()` / `backgroundIrradiance()`:
  - by default, the room (color, floor darkening);
  - with `lighting.sky.enabled`, an outdoor sky with a horizon and a ragged tree line.

`sceneLuminance()` sums the light reaching the eye. The animator turns it into the pupil's light level ([`docs/ANIMATION.md`](ANIMATION.md)).

## Key-Light Shadow

[`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js) renders the shadows of the lids, the lashes and the face around them from emitter 0, when it is a panel or a window.

- **Camera**: an orthographic camera at the light looks at a point 4 mm behind the apex.
- **Casters**: objects on `SHADOW_LAYER` (1), drawn with the lid follow and the blink applied ([`docs/RENDERING.md`](RENDERING.md#blink-morph)). They are lighter stand-ins of the lids and the lashes, which the camera never sees ([Shadow Proxies](#shadow-proxies)); the meshes the camera sees are not on the layer.
- **Shadow proxies** ([`src/adnexa/shadowProxy.js`](../src/adnexa/shadowProxy.js), [`src/adnexa/shadowCaster.js`](../src/adnexa/shadowCaster.js)): the map's texels are 0.04 and 0.08 mm, so the casters need not be as fine as the meshes. Each proxy vertex is a fixed blend of at most two of its mesh's vertices: the blink's frames of the mesh give the proxy's, and its vertices follow the gaze as theirs do.
  - **Lids** (about 5 500 vertices of 13 200): every other column of the ring, the conjunctiva and the palpebral conjunctiva (which hangs from the ring's margin at the same columns); the intermarginal strip by its ends and every other row of the anterior edge, which turn with the gaze as a whole; every row of the skin. As the lids follow the gaze their turn fades out across the skin (`lid-follow.glsl`) and bends it far more than at rest: with every other row the proxy cast a lighter shadow on the top of the eye looking up. The conjunctiva casts too: as the upper lid lifts off it, it shadows the globe.
  - **Lashes** (24 vertices a lash, 90 in the mesh): every other ring and the tip's, a 3-sided tube whose corners blend each side's vertex with the one opposite, pushed out to 1.21 times the radius, so that its width averaged over its directions (its perimeter over π) is the tube's.
  - **Check**: rendered against the meshes as casters, the proxies change the image by at most a few levels (PSNR 50–60 dB, the lids' alone 56–63 dB), at rest, looking up and down and close up; the lashes' shadows differ by their outline only.
- **Map**: a float depth map covering ±40 mm, the whole skin patch: 2048² for accumulation samples, 1024² for interactive frames, whose filters are wider than its texels and whose taps then stay in the texture cache. The lookup fades out toward its border, so a receiver past it shows no edge.
- **Filtering** (`key-shadow.glsl`):
  - Accumulation samples move the light to a point on the emitter's area (`sample.light`) and compare hard. The mean of the samples is the true penumbra.
  - Interactive frames filter. The eye's receivers, shadowed by the lids and lashes close by, use a Poisson filter over about 0.35 mm.
  - The skin, shadowed by the face's own relief too, estimates the penumbra (percentage-closer soft shadows): 12 samples find the occluders within reach of a light of its apparent size (`uKeyShadowParams.w`, the emitter's size over its distance), their mean distance times that size is the penumbra's width, and 12 more filter over it (from 0.35 mm up to about 5 mm). The disk turns per pixel. A lash on the lid stays sharp; the brow's or the nose's shadow is as soft as the accumulated one.
  - **Self-shadowing**: the skin casts and receives, so its lookup (`keyShadow(position, normal)`) adds a slope-scaled bias: the filter's radius and a texel and a half, times the tangent of the angle between the normal and the light, capped at 6. Otherwise the tilted skin shadows itself in part of the filter's samples and darkens uniformly inside the map. The light direction and the map's scales come from the shadow matrix.
- **Receivers**: the skin, lashes, tear film and sclera. The iris samples the shadow where its light ray enters the cornea, then adds its own soft self-shadow. The light shafts add their own light under their own shadow ([`docs/RENDERING.md`](RENDERING.md#light-shafts)).

### Soft Coverage

[`src/lighting/shadowCoverage.js`](../src/lighting/shadowCoverage.js) shadows what lies around the casters: the dust, the light shafts on the surfaces and in the air, and the floor under the face ([`docs/RENDERING.md`](RENDERING.md#backdrop-shadow)).

- **Two of them**: the key's, reduced from the interactive map of the fresh frames (the accumulation samples, whose light moves across the emitter, keep it, so the dust does not flicker); the light shafts', from the casters drawn from their source in perspective into a 512² map with the same material (`KeyShadow.renderCasters()`).
- **Reduce**: a 128² RGBA16F map over three times the shadow map's field (its matrix with x and y scaled by a third): per texel, a 4×4 grid of the float map read with `texelFetch`, its depth made linear (mm from the light along its view, for the orthographic and the perspective map alike). The lids and lashes are the only casters, so the globe is added as a disc at its front depth: without it the fissure would let the light through.
- **Channels**: r the share blocked and g that times the casters' depth, blurred over 1.5 mm; b and a the same, blurred over `backdrop.softness` (two separable passes).
- **Lookup** (`shadow-coverage.glsl`, `keyCover()` and `shaftCover()`): the point's clip position with the perspective divide, its depth from the light's position along its view; a point behind the casters' mean depth (less a slack for surfaces that cast too) takes the coverage, from the light blur at the casters to the soft one 60 mm behind (the penumbra widens with the distance); a point in front of them is lit. Outside the map and when the light casts nothing, 0. `shaftCut()` keeps the light blur at any distance behind, for the light shafts, which must vanish in the shadow; the soft blend far behind (whose peak a small outline lowers to about a half) is for the dust and the floor.
- **Kept**: the passes and the shafts' caster draw cost about a millisecond each, so a coverage is redrawn only when the light's direction or source, `backdrop.softness`, the globe or the lid mesh change: the gaze follow and the blink move the lids inside the patch's outline, and the globe fills the fissure anyway.

## Physical Camera

[`src/camera/cameraOptics.js`](../src/camera/cameraOptics.js) and [`src/camera/physicalCamera.js`](../src/camera/physicalCamera.js):

- **Placement**: the camera orbits a target at `camera.distance`, which is also the focus distance. The target is the entrance pupil (its depth behind the apex) turned about the globe's center along the eye's settled line of sight ([`docs/ANIMATION.md`](ANIMATION.md#framing)), plus `camera.targetX`, `camera.targetY` and `camera.targetZ` (world axes, mm; +Z out of the face). The iris therefore stays framed and in focus when the eye turns. The offsets carry the camera and its focus with the target, so `targetZ` moves the plane in focus forward or back.
- **Field of view**: that of a thin lens focused there, fov = 2·atan(h / 2s_i) with s_i = f·s / (s − f).
  - The field narrows as the focus gets closer (focus breathing).
  - At the default 185 mm with the default 110 mm lens, the magnification is about 1.5:1. The reference presets use 100 mm, about 1.2:1.
- **Depth of field and the sensor**: for one framing, the depth of field depends only on the f-number and the magnification, about 2·N·c·(1 + m)/m², with c the blur circle of a pixel (the sensor height over the image's). A smaller sensor frames the same field at a lower magnification, from farther away, so its focus is deeper; the focal length does not change it. The zoom uses this: it shrinks the sensor as it goes in ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)), where the focus of a macro framing is thinnest. Diffraction, which would soften a small sensor at a high f-number, is not modeled.
- **Accumulation samples**:
  - They move the camera across the aperture (radius f / 2N, concentric-disk samples) and shear the projection so the focus plane stays fixed, plus a subpixel jitter.
  - The mean of the samples is the physically correct depth of field, reflections and refraction included.
- **Interactive frames**: they approximate the same blur with a gather ([`docs/RENDERING.md`](RENDERING.md#depth-of-field)).
- **Dust**: the motes draw their images blurred by the thin lens analytically, placed by the camera before the sample's jitter (`pinhole`), so they look the same in both modes ([`docs/RENDERING.md`](RENDERING.md#dust-and-haze)).
