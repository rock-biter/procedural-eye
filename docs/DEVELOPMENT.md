# Development Guide

## Prerequisites

- Node.js `^20.19.0` or `>=22.13.0`. The capture script needs Node 22+ for the global `WebSocket`.
- pnpm `9.15.9`, pinned by the `packageManager` field (pnpm switches to it automatically).
- A browser with WebGL2 and `EXT_color_buffer_float`; every desktop browser on Apple Silicon has both.
- Google Chrome for the capture script. Elsewhere than the default install path, pass `--chrome <path>` or set `CHROME_PATH`.

## Commands

```bash
pnpm install
pnpm dev            # Vite with --host
pnpm test           # node:test over test/*.test.js
pnpm lint           # ESLint (correctness rules only)
pnpm format         # Prettier (tabs, no semicolons, single quotes, 100 columns)
pnpm format:check
pnpm build          # production bundle in dist/
pnpm preview
pnpm capture        # headless captures, contact sheet, optional bench (docs/QUALITY.md)
```

`pnpm test` loads `test/support/register.mjs`, whose hooks let Node import modules written for Vite:
- extensionless relative imports;
- `.glsl` files, as their source with the `#include` chunks inlined;
- `?url` assets.

## Toolchain

- **Vite 8** builds the ES-module application. `vite-plugin-glsl` makes shader files importable and removes repeated `#include`s (`vite.config.js`). Shader chunks also carry `#ifndef` guards, because the Node hooks inline every include.
- **three** ^0.186.1, with `WebGLRenderer` (WebGL2) and GLSL `ShaderMaterial`s.
- **`postprocessing`** (pmndrs) provides the effect composer. Its `three` peer range must include the installed three version.
- **`tweakpane` 4** with `@tweakpane/plugin-essentials` builds the panel.
  - The terrain project uses lil-gui; Tweakpane is used here for its folders, color pickers and FPS graph.
  - The panel is generated from the schema, so the library stays replaceable.
- **`alea`** seeds the CPU generators.
- Plain JavaScript, no TypeScript step.

## Code Conventions

- **Modules**
  - Systems that own three.js objects are ES modules with default-export classes.
  - Pure modules (geometry, optics, sampling, params, priors, generators, color model, animation) import no three.js objects or browser state, and are tested in Node.
- **Parameters**: every tunable value is a leaf of `PARAM_SCHEMA` ([`src/params/paramSchema.js`](../src/params/paramSchema.js)) with a range, unit and `kind`. Code reads values from the params object, never from duplicated constants.
  - The default values live in [`src/params/defaults.json`](../src/params/defaults.json) ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#parameters-presets-and-the-random-eye)). To change them, tune the eye in the panel, press **Export defaults JSON**, and replace the file with the download.
  - A new leaf needs only its fallback `default` in the schema; the next export writes it into the file.
- **Uniforms and defines**
  - Uniforms use a `u` prefix.
  - Constants that the CPU also needs reach GLSL as material defines, for example `MAX_EMITTERS`, `EMITTER_VEC4S`, `IRIS_ATLAS_HEIGHT`, `IRIS_LUT_*` and `DEBUG_VIEW`.
- **Shader files**
  - Shader sources live in `src/shaders/` as `.glsl` files: `*-vertex.glsl` and `*-fragment.glsl` for program entry points, plain names for chunks.
  - A chunk used by several programs gets an `#ifndef` include guard.
- **Shader rules for ANGLE-Metal**
  - GLSL loops that call heavy functions start at `ZERO`, a uniform that is always 0, so the compiler does not unroll them.
  - `irisField()` is called from loops only: march, normal, AO and shadow.
  - Hashes are integer PCG (`pcgHash()` in `common.glsl`, twin of `pcg()` in `src/random.js`), never `fract(sin())`.
  - Texture reads inside loops and branches use `textureLod`, because derivatives are undefined there and θ wraps.
  - Sampled maps are half float.
  - The RGBA32F accumulation history is read with `texelFetch`.
- **Name clashes and gotchas**
  - three defines `luminance()` for every non-raw material; the shared Rec. 709 helper here is `luma()`.
  - A `postprocessing` `Effect` must not define a method named `update`, because the effect pass calls `update(renderer, inputBuffer, deltaTime)` every frame.
- **Comments** explain constraints and non-obvious behavior only.

## URL Flags

| Flag | Effect |
| --- | --- |
| `?preset=<name>` | Starts from a preset of `src/params/presets.js` (`default`, the values of `src/params/defaults.json`, otherwise). |
| `?state=<string>` | Applies the non-default values encoded by **Copy state URL** or **Save PNG** (base64url JSON), on top of the preset. |
| `?photo=<n>` | Sets `quality.photoSamples` to `n` and starts in photo mode (frozen clock); the accumulation stops after `n` samples. |
| `?view=<name>` | Sets `debug.view`; see [`docs/RENDERING.md`](RENDERING.md#debug-views) for the list. |
| `?gui=0` | Hides the panel (captures). |
| `?dpr=<ratio>` | Pins the pixel ratio (0.5–2) and turns the adaptive resolution off. |
| `?debug=1` | Exposes the app object as `window.__EYE_APP__` for console debugging. |

## Controls

- Drag orbits the camera (`camera.azimuth`, `camera.elevation`).
- Shift-drag or right-drag pans the target (`camera.targetX`, `camera.targetY`).
- The wheel changes `camera.distance`, which is also the focus distance.
- **Space** toggles photo mode when the page, not a panel control, has the focus.

**The dock** holds three buttons outside the panel, always in view: bottom right, or bottom center on phones and tablets (`style.css`). Each blurs itself after a click, so Space still toggles photo mode.

- **Zoom out** and **Zoom in** (magnifiers) glide `camera.distance` over `zoom.duration`:
  - Zoom out to `zoom.out`, which frames the whole figure; portrait screens (phones held upright), much narrower, to `zoom.mobileOut`.
  - Zoom in back to the distance the camera started at, on every screen.
- Portrait screens start, and load presets, with `camera.targetZ` 0.
- **Random eye**.

The panel starts collapsed. When its open folders outgrow the viewport it scrolls, and it stops above the dock (`style.css`). It has the actions **Photo (freeze / live)**, **Save PNG**, **Export defaults JSON** (downloads the values as `defaults.json`, see Parameters above) and **Copy state URL**, the **random ancestry** of the random eye, and **transition (s)**, how long a preset or a random eye takes to glide in (0 switches at once).

## Console API

`window.__EYE__` always exposes:

| Member | Purpose |
| --- | --- |
| `params` | The live params object (change it through `setParams`). |
| `getAccumulation()` | `{ samples, target, converged }`. |
| `getRenderStats()` | Frame telemetry and the adaptive pixel ratio state. |
| `getState()` | The non-default values as a `?state=` string. |
| `getParams()` | A deep copy of the params. |
| `setParams(overrides)` | Ends a running transition, applies a deep partial override at once, rebuilds, and returns the unknown paths. |
| `transitionTo(params, duration)` | Glides to a full params object over `duration` seconds ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#transitions)). |
| `getTargetParams()`, `isTransitioning()` | The params a running transition is heading for (the current ones otherwise); whether one runs. |
| `capture()` | The current accumulated image as a PNG data URL. |
| `toggleFrozen()`, `isFrozen()` | Photo mode. |
| `measure(frames)` | Interactive frames back to back; resolves with frame statistics. |
| `measureSync(frames)` | The same, each frame finished with a synchronous read; returns mean, median, minimum and maximum ms. |
| `getCompileMs()` | The time spent compiling programs at start-up. |
| `getEyeGeometry()` | `{ apexZ, focusDepth }`. |
| `getPresetNames()`, `getPresetInfo(name)` | Preset names, labels and reference photographs. |
| `loadPreset(name, duration)`, `randomEye(ancestry, seed, duration)` | Glide to a preset or to a random eye, as the panel does; `randomEye` returns the sampled features and the color shade. |
| `zoom('in' \| 'out')` | Glide the camera as the dock's zoom buttons do. |

## Debugging Notes

- Shader compilation errors appear in the browser console, not in `pnpm build`. They also make `pnpm capture` fail.
- A uniformly grey or black image usually means a NaN or an alpha problem.
  - Check the raw scene with `?view=normals`.
  - Then read pixels through `window.__EYE_APP__`; the accumulation history is `app.post.accumulation.history`.
- A living eye restarts the accumulation every frame. Press Space, or turn `animation.enabled` off, to let the image converge.
- Once `quality.photoSamples` samples are accumulated, the loop stops rendering and the canvas keeps the last image. Any change restarts it.
- `?view=iris-steps` shows the march cost per pixel: red where it hits the step limit. The other `iris-*` views isolate the field, its normals, AO and atlas.
