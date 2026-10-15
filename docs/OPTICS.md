# Optics

## Eye Space

- Units are millimeters, and the globe (sclera sphere) is centered at the origin.
- +Z is the optical axis, out of the corneal apex. +Y is superior.
- +X is nasal for a right eye and temporal for a left one (`eye.laterality`; `nasalSign` is +1 for a right eye).
- A camera at azimuth 0 looks down −Z, so +X is the right of the picture.

The eye turns about a center of rotation 13.5 mm behind the apex ([`src/eye/eyeRig.js`](../src/eye/eyeRig.js)). The animator aims the **visual axis**, which lies `eye.kappa` degrees nasal of the optical axis, so the corneal reflex of a light at the camera sits slightly nasal of the pupil center.

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
  - Where the hit lies under the lids (negative fissure distance, [`docs/ADNEXA.md`](ADNEXA.md#fissure-map)), it sees the skin.
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

[`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js) renders the shadows of the lids and lashes from emitter 0, when it is a panel or a window.

- **Camera**: an orthographic camera at the light looks at a point 4 mm behind the apex.
- **Casters**: objects on `SHADOW_LAYER` (1), drawn with the lid follow applied.
- **Map**: a 2048² float depth map covering ±26 mm.
- **Filtering** (`key-shadow.glsl`):
  - Interactive frames filter it with Poisson PCF over about 0.35 mm.
  - Accumulation samples move the light to a point on the emitter's area (`sample.light`) and compare hard. The mean of the samples is the true penumbra.
- **Receivers**: the skin, lashes, tear film and sclera. The iris samples the shadow where its light ray enters the cornea, then adds its own soft self-shadow.

## Physical Camera

[`src/camera/cameraOptics.js`](../src/camera/cameraOptics.js) and [`src/camera/physicalCamera.js`](../src/camera/physicalCamera.js):

- **Placement**: the camera orbits a target at `camera.distance`, which is also the focus distance. The target is the entrance pupil (its depth behind the apex) turned about the center of rotation along the eye's settled line of sight ([`docs/ANIMATION.md`](ANIMATION.md#framing)), plus `camera.targetX` and `camera.targetY`. The iris therefore stays framed and in focus when the eye turns.
- **Field of view**: that of a thin lens focused there, fov = 2·atan(h / 2s_i) with s_i = f·s / (s − f).
  - The field narrows as the focus gets closer (focus breathing).
  - At the default 185 mm with the default 110 mm lens, the magnification is about 1.5:1. The reference presets use 100 mm, about 1.2:1.
- **Accumulation samples**:
  - They move the camera across the aperture (radius f / 2N, concentric-disk samples) and shear the projection so the focus plane stays fixed, plus a subpixel jitter.
  - The mean of the samples is the physically correct depth of field, reflections and refraction included.
- **Interactive frames**: they approximate the same blur with a gather ([`docs/RENDERING.md`](RENDERING.md#depth-of-field)).
