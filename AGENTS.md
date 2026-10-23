# Project Guidelines

## Project Overview

**Random-eyes** (the procedural eye) is a browser-based three.js experience, built with Vite, that renders a hyper-realistic human eye in macro close-up: cornea, iris, pupil, sclera, eyelids with skin and lashes, and the tear film. Everything is procedural and driven by one parameter schema, so different structures, colors and shades come from parameter values and seeds.

- **Optics**: the anterior cornea is a conic joined to the sclera sphere; rays refract through both corneal surfaces into the anterior chamber; mirror reflections intersect the emitters of an analytic light rig exactly.
- **Iris**: a signed-distance field raymarched after the corneal refraction. The stroma is carved by crypts and bridged by radial vessels and collagen arcs, and colored by a spectral Kubelka–Munk model of its layers ([`docs/IRIS.md`](docs/IRIS.md)).
- **Air**: dust fibers and flakes at their real size, blurred by the thin lens, a light haze that grows with the distance and a few soft light shafts give the space around the eye its depth; the patch casts a soft shadow on an unseen floor.
- **Animation**: the eye lives (pupil light reflex with hippus, saccades, microsaccades, drift, lids following the gaze, blinks) until photo mode freezes it.
- **Photo mode**: a physical thin-lens camera and progressive accumulation give true macro depth of field.
- **Sound**: the controls sound like a camera: CC0 recordings of real ones (buttons, the detents of the zoom and aperture rings, the film advance, the shutter) and a few synthesized sounds, over a soft glass harp (synthesized wine glasses rubbed with a wet finger) that fades in at the first gesture ([`docs/AUDIO.md`](docs/AUDIO.md)). Every sound pauses while the page is hidden or out of focus.

[`README.md`](README.md) is the short human-facing introduction. This file is the entry point for coding agents and routes detailed work to the owning guide.

## Read The Relevant Guide

| Task | Guide |
| --- | --- |
| Install, commands, dependencies, source conventions, URL flags, the console API, or debugging | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Bootstrap, frame loop, module ownership, parameter routing, presets, the random eye, or coordinate spaces | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Eye geometry, corneal optics, reflections of the lids, the light rig, the key-light shadow, or the physical camera | [`docs/OPTICS.md`](docs/OPTICS.md) |
| Materials, uniforms, GLSL, the render pipeline, accumulation, depth of field, the dust and the haze, or post-processing | [`docs/RENDERING.md`](docs/RENDERING.md) |
| The iris model (structure, raymarching, shading, color, dilation) | [`docs/IRIS.md`](docs/IRIS.md) |
| Eyelids, skin, lashes, tear film, or the scleral vessels | [`docs/ADNEXA.md`](docs/ADNEXA.md) |
| Pupil dynamics, eye movements, lid follow, blinks, or photo mode | [`docs/ANIMATION.md`](docs/ANIMATION.md) |
| The sound design: the camera foley of the controls, the ambience, the recordings and `pnpm sounds` | [`docs/AUDIO.md`](docs/AUDIO.md) |
| Anatomical and optical data, parameter ranges, and references | [`docs/RESEARCH.md`](docs/RESEARCH.md) |
| Checks, the capture script, visual verification, or performance measurement | [`docs/QUALITY.md`](docs/QUALITY.md) |
| Phases, known gaps, and future work | [`docs/ROADMAP.md`](docs/ROADMAP.md) |

Read the owning source file and the relevant guide before editing. When a change crosses boundaries, read each affected guide.

## Documentation Sync

Every task that modifies workspace files must use the [`documentation-sync` skill](.github/skills/documentation-sync/SKILL.md) after implementation and before final validation, and report which documentation changed or why none had to.

## Essential Commands

Use Node.js `^20.19.0` or `>=22.13.0` and pnpm `9.15.9` (pinned by `packageManager`).

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm format
pnpm build
pnpm capture
pnpm compare
pnpm brand
pnpm sounds
```

## Source Map

- [`main.js`](main.js) is the bootstrap (URL flags, params, renderer, app, panel actions). [`src/app.js`](src/app.js) owns the systems and the frame loop.
- [`src/params/`](src/params/): the parameter schema, its default values (`defaults.json`), the params helpers, the presets and the population priors of the random eye.
- [`src/eye/`](src/eye/): the eye geometry and optics twins, the eyeball mesh and materials, and the eye rig (gaze transform).
- [`src/iris/`](src/iris/): rest space, seeded features and the spectral color model, plus the GPU atlas bake and the color lookup texture.
- [`src/adnexa/`](src/adnexa/): the fissure, the surfaces around the eye (support, conjunctiva, face), lid geometry, the back shell closing the skin patch, the lash generator and the fissure map, plus the lid, lash and tear-film meshes.
- [`src/sclera/`](src/sclera/): the vessel generator and the polar vessel map.
- [`src/animation/`](src/animation/): pupil dynamics, eye movements and the animator.
- [`src/lighting/`](src/lighting/): the analytic light rig, color temperature, the rig uniforms, the key-light shadow map, the soft shadow coverages and the light shafts' light.
- [`src/camera/`](src/camera/): thin-lens optics and sampling, the physical camera and the pointer controls.
- [`src/atmosphere/`](src/atmosphere/): the dust field (seeded motes in a cube around the eye), the lights the haze scatters and the light shafts (seeded beams and their cookie).
- [`src/render/`](src/render/): the post-processing chain, accumulation, depth of field, the dust pass, the backdrop with the floor shadow and PNG metadata.
- [`src/audio/`](src/audio/): the audio engine, the camera foley and the ambience, with their pure parts (the foley's arithmetic, the sound bank, the synthesized buffers, the glass harp's tuning and voices, the reverb's impulse response) and the recorded sounds in `sounds/`.
- [`src/debug/`](src/debug/) holds the development tools, loaded only on request (`devTools.js`: the console API, the frame telemetry, the panel, the mesh tree with `?meshtree=1`), and the debug view numbering; [`src/ui/`](src/ui/) the HUD around the eye, its layout and its SVG assets, the intro's timeline, and the checklist of tasks and achievements; [`src/shaders/`](src/shaders/) holds every GLSL file.
- _Pure_ modules (marked in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)) import no three.js objects or browser state and are tested in Node.
- [`references/`](references/) holds the user's reference photographs and an unused PBR skin texture set (`skin-pbr/`), none of it shipped. [`scripts/capture.mjs`](scripts/capture.mjs) renders presets next to them and benchmarks frames; [`scripts/compare.mjs`](scripts/compare.mjs) measures captures against a baseline; [`scripts/brand.mjs`](scripts/brand.mjs) renders the icons and the social image into [`public/`](public/); [`scripts/sounds.mjs`](scripts/sounds.mjs) cuts the recorded sounds from their CC0 sources (`scripts/sounds.json`).

## Project Rules

- Keep the params schema the single source of truth for what is tunable: every tunable value is a leaf with a range, a unit and a `kind`. Its default values come from [`src/params/defaults.json`](src/params/defaults.json), exported by the panel; the `default` in the schema is only the fallback for a leaf the file does not name, and the value the tests use (`BASE_PARAM_SCHEMA`).
- Treat CPU twins and GLSL as one contract, and change both sides together:

  | CPU | GLSL |
  | --- | --- |
  | [`src/eye/eyeProfile.js`](src/eye/eyeProfile.js) | `eye-profile.glsl` |
  | [`src/eye/cornealOptics.js`](src/eye/cornealOptics.js) | `cornea-optics.glsl` |
  | [`src/lighting/envRig.js`](src/lighting/envRig.js) | `env-rig.glsl` |
  | [`src/iris/irisSpace.js`](src/iris/irisSpace.js) | `iris-space.glsl` |
  | `irisThickness()` in [`src/iris/irisFeatures.js`](src/iris/irisFeatures.js) | the copy in `iris-bake-fragment.glsl` |
  | the lid follow weights of [`src/adnexa/lidGeometry.js`](src/adnexa/lidGeometry.js) | `lid-follow.glsl` |
  | [`src/random.js`](src/random.js) `pcg()` | `pcgHash()` |
  | `hgPhase()` in [`src/atmosphere/dustField.js`](src/atmosphere/dustField.js) | `scattering.glsl` |
  | `beamIntegral()` and `erf()` in [`src/atmosphere/lightShafts.js`](src/atmosphere/lightShafts.js) | `applyShafts()` and `shaftErf()` in `light-shafts.glsl` |
  | `bakeShaftCookie()` (over `cookieBlades()`) in [`src/atmosphere/lightShafts.js`](src/atmosphere/lightShafts.js) | `shaft-cookie-fragment.glsl` |
- Keep development-only code (the console API, telemetry, benchmarks, the panel) in the development tools of [`src/debug/devTools.js`](src/debug/devTools.js), which `main.js` imports only on request: a plain page neither downloads nor runs it.
- Scene materials write the apparent focus distance in alpha. Only the accumulation history keeps it; the effects receive opaque alpha (see [`docs/RENDERING.md`](docs/RENDERING.md)).
- In shaders:
  - use the `ZERO` loop bound (ANGLE-Metal compile times);
  - use `highp` integer hashes (fp16);
  - read the polar atlases with `textureLod` at the ray-footprint level.
- Reference presets keep the living eye off, so their tuned pupil and gaze hold and the camera can circle them.
- Do not silently resolve unrelated known gaps. Document intentional architectural changes in the same change.

If documentation disagrees with the source or package metadata, the implementation is the source of truth; correct the documentation as part of the task.

## Validation Baseline

1. Run `pnpm lint`, `pnpm format:check`, and `pnpm test`.
2. Run `pnpm build`.
3. Run `pnpm capture` for the affected presets and debug views. Look at the captures, and check that it reports no console errors.

A successful build does not prove that shaders compile; the capture script does. Report any check that could not be performed.
