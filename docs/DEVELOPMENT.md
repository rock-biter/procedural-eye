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
pnpm brand          # renders the favicon, the touch icons and the Open Graph image into public/
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
- **JetBrains Mono** (Google Fonts, SIL OFL 1.1) sets the title, the credit line and the frame rate. Its latin subset of weight 400 is a file of the repository, [`fonts/`](../fonts/) with its `OFL.txt`, which Vite bundles from `style.css`; the page loads no font from a CDN.
- Plain JavaScript, no TypeScript step.

## Site Assets

- **Head** ([`index.html`](../index.html)): the title and description of **Random-eyes**, the icons, the Open Graph and Twitter cards.
- **Images** ([`public/`](../public/), copied as they are into `dist/`): `favicon.ico` (16, 32 and 48 px), `icon-192.png` and `apple-touch-icon.png` (180 px, square, opaque), all the default eye's iris seen from the front, and `og-image.jpg` (1200×630), the opening desktop scene. [`scripts/brand.mjs`](../scripts/brand.mjs) (`pnpm brand [--samples 128]`) renders them with the app in headless Chrome, converged in photo mode: rerun it when the default eye or the opening framing changes.
  - The iris: a still eye from the front, without the lids, lashes and tear meniscus, cut to a circle around the limbus as the camera projects it.
  - The scene: `?gui=0` at 1200×630, rendered at twice the size and scaled down.
- **`VITE_SITE_URL`** ([`.env`](../.env), empty by default): the site's origin, such as `https://example.com`. Social cards need absolute image URLs; Vite writes it in front of `/og-image.jpg` at build time. Set it on the host or in `.env.production.local`.

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
| `?gui=0` | Hides the frame, the HUD, the title, the credit line, the frame rate and the panel (captures). |
| `?dpr=<ratio>` | Pins the pixel ratio (0.5–2) and turns the adaptive resolution off. |
| `?debug=1` | Exposes the app object as `window.__EYE_APP__` for console debugging. |
| `#debug` | Shows the panel (it is not even loaded otherwise). It follows the hash: adding or removing `#debug` on an open page shows or hides it. |

## Controls

- Drag orbits the camera (`camera.azimuth`, `camera.elevation`). Let go while moving and the orbit coasts: its speed over the last tenth of a second decays with the time constant `controls.inertia` (0.2 s, so it coasts speed × 0.2 s), and stops at the limits of the two angles. A drag held still before letting go does not coast; a new press, a preset, a zoom or `setParams()` stops it.
- The mouse turns the view a little toward itself, as a short drag from the center would: up to a reach of azimuth and elevation at the window's edges that grows as the camera zooms out: `controls.parallax` (3° by default) zoomed in, `controls.parallaxOut` (6°) zoomed out, linear in the HUD's zoom level between (a log scale of the distance, as the wheel and the dial move; `parallaxReach()` in [`src/camera/orbitMotion.js`](../src/camera/orbitMotion.js)). The view follows it with the time constant `controls.parallaxLag` (0.4 s). It is a turn of the orbit outside the params (`CameraControls.parallax`, added by `PhysicalCamera.orbitOffset`), so it is not in the state URL. It follows only a living eye; in photo mode and on a still eye it settles back to none, so the image that accumulates is the one the params describe. Touch does not move it, and a mouse leaving the window lets it settle back.
- Shift-drag or right-drag pans the target (`camera.targetX`, `camera.targetY`).
- The wheel changes `camera.distance`, which is also the focus distance, between the HUD's zoom-in and zoom-out distances (`CameraControls.distanceLimits`); from outside them it only moves back toward them.
- **Space** toggles photo mode when the page, not a panel control, has the focus.

**The frame** runs around the page, 24 px inside the window's safe area (8 px on phones and tablets): a cross of 1 px arms at each corner (14 px, 12 px on phones and tablets; white at 25%) and a dashed line along each side (an SVG pattern of `FRAME_DASH` px dashes every `FRAME_DASH_PERIOD` px, in `main.js`: 3 every 8; white at 15%). The lines run across the whole window, past the crosses, and are cut `--frame-cut` (14 px) to either side of each cross. Each side is two lines, from either window edge to the middle, the second mirrored, so the four corners look the same; the dashes are centered every 8 px from the edge and the insets are multiples of 8, so the cuts fall between dashes. On phones and tablets nothing is left beyond the crosses. It is an overlay that never takes the pointer. The rest of the interface stays inside it, 16 px in (12 px on phones and tablets): `--frame-inset`, `--frame-gap` and `--ui-inset` in `style.css` place everything, the panel included.

**The HUD** ([`src/ui/hud.js`](../src/ui/hud.js)) puts every button on a dashed circle around the eye, centered in the frame. The circle is inscribed in the box inside the frame (460 px on a 1600 × 1000 window), or smaller where its buttons would not fit in that box, as on phones (`hudLayout()` in [`src/ui/hudLayout.js`](../src/ui/hudLayout.js)). The buttons are round glass of one size (44 px), the zoom knob half of it (22 px). Angles run clockwise from the right (`HUD` in `hudLayout.js`):

- The five skin tones in the bottom-left quadrant, fair highest, 60 px apart around 165° (on a 1600 × 1000 window from 150° up to the left side); where that would take them out of the quadrant (a small circle) they move toward its middle.
- At the right, around 5°: **Zoom in** (+) above **Zoom out** (−), 30° apart (or 160 px, on a small circle), with the zoom knob on the arc between them; below, **Random eye** (a shuffle icon) at 50°, or 60 px past Zoom out.
- On a small circle the tones and Random eye therefore spread over a wider angle without overlapping. Phones and tablets keep this layout on a smaller circle.
- The circle's line has the frame's dashes (3 px every 8 px, adjusted to a whole number around; white at 30%) and stops 6 px short of each button and of the knob, through an SVG mask that follows the tones as they grow and shrink and the knob as it slides.
- A second, fainter dashed circle (white at 20%) follows the zoom (`HUD.orbit`, `orbitRing()`): its radius is 80 px smaller zoomed in (inside the circle) and 250 px larger zoomed out, linear in the zoom level between (it crosses the circle and the buttons on the way), and it turns a quarter turn over the zoom, clockwise as it zooms in, against the knob. Its dashes are the circle's, 3 px every 8 px zoomed in: it keeps their number and length, so its gaps widen as it grows (to 15 px periods zoomed out). It is not cut around the buttons, and runs on past the HUD's box to the window's edges.
- Only the buttons take the pointer, so drags across the rest still orbit the camera. Each blurs itself after a click, so Space still toggles photo mode.

The buttons are liquid glass (the `glass` class), clear (a 2px blur) and defined by their edges. `style.css` draws a glossy dome of light on the upper half and a faint glow above the bottom edge, soft specular rims at the top-right and bottom-left edges, a faint dark line inside the edge, and the hover and press. On Chromium, [`src/ui/liquidGlass.js`](../src/ui/liquidGlass.js) also bends the scene near each rim: it gives every button an SVG filter of its own size, with a unique id, as `backdrop-filter` (through `--glass-refraction`), rebuilt when the button resizes. The filter carries the blur too, because Chromium drops the CSS filter functions that follow an SVG one. It is detected through `navigator.userAgentData`, which exists only in secure contexts, so over plain HTTP on the LAN (`pnpm dev --host`) Chromium also keeps the CSS glass.

- **Zoom out** and **Zoom in** (− and +) glide `camera.distance` over `zoom.duration`:
  - Zoom out to `zoom.out`, which frames the whole figure; portrait screens (phones held upright), much narrower, to `zoom.mobileOut`.
  - Zoom in to `zoom.in` (180 mm by default); portrait screens to the start-up `camera.distance`, where they start.
  - Landscape (desktop) screens start `zoom.start` of the way from the zoom-in to the zoom-out distance (0.35 by default, 285 mm), unless the URL sets `?preset=` or `?state=`; portrait screens start zoomed in.
  - The wheel stays between the zoom-in and zoom-out distances of the screen.
  - They are faint (30% opacity), clearer when hovered (80%), and in full while the zoom is at their end (`at-level`, set with the knob's level).
- **The zoom knob**, a small empty glass button, slides along the circle from − (zoomed out, level 0) to + (zoomed in, level 1), over them, so the pointer always reaches it. Its place is the zoom level: where `camera.distance` lies between the screen's zoom-out and zoom-in distances, on a log scale as the wheel steps (`zoomLevel()` in `hudLayout.js`). It follows the camera every frame, during a glide too.
  - It is a slider (`role="slider"`): drag it along the arc, scroll over it, or use the arrow keys (a tenth), Page Up and Page Down (a quarter), Home and End. It moves the camera at once, as the wheel does, and stops a zoom gliding.
  - Dragged within `HUD.zoom.snap` (28 px) of + or − (overlapping it a little) or past it, it snaps there: the camera glides to that end in 0.25 s. Dragged back out, it follows the pointer again.
  - At either end, over + or −, its glass is lighter. Dragged, it swells; clicked, it bounces and a ring spreads from it.
- Portrait screens start, and load presets, with `camera.targetZ` 0.
- **Random eye**.

**The skin tones**: five buttons, each with a bead of its color, shaded from a lighter one (30% toward white) at the top right through the color (from 45% of the way) to a darker one (35% toward black) at the bottom left. A click glides `skin.color` to that tone ([`src/params/skinTones.js`](../src/params/skinTones.js): fair, light, medium, brown, deep) over the panel's **transition (s)**; nothing else of the skin changes, and the other params keep heading where they were. The button of the color the params are heading for is pressed (`aria-pressed`), also after the panel or a preset changes the color; a color of no tone presses none. The pressed one is full size and opaque, its bead larger (26 px against 18); the others shrink to 75% (`HUD.toneScale`) at 30% opacity, the whole button (glass and bead), and grow and brighten (80%) when hovered.

**The title and the credit line** in JetBrains Mono (`style.css`): **Random-eyes** at 32 px in white at the top left, the credit line at 12 px at the bottom left. The credit links **rockbiter** to the author's X account; only the link takes the pointer, so drags across the text still orbit the camera, and it blurs itself after a click. On narrow screens it wraps, aligned left.

**The frame rate**, top right in the credit line's style, counts the frames the page shows per second, over half a second, with a `requestAnimationFrame` loop of its own in `main.js`. A converged photo draws nothing, so it then shows the display's refresh rate.

The panel shows only while the URL ends in `#debug`, and starts collapsed, below the frame rate (and, on phones, below the title). When its open folders outgrow the viewport it scrolls, and it stops at the frame (on phones above the credit line, which wraps there; `style.css`). It has the actions **Photo (freeze / live)**, **Save PNG**, **Export defaults JSON** (downloads the values as `defaults.json`, see Parameters above) and **Copy state URL**, the **random ancestry** of the random eye, and **transition (s)**, how long a preset or a random eye takes to glide in (0 switches at once).

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
| `capture()` | The current accumulated image as a PNG data URL (a living eye keeps no frame: it renders one first). |
| `toggleFrozen()`, `isFrozen()` | Photo mode. |
| `measure(frames)` | Interactive frames back to back; resolves with frame statistics. |
| `measureSync(frames)` | The same, each frame finished with a synchronous read; returns mean, median, minimum and maximum ms. |
| `getCompileMs()` | The time spent compiling programs at start-up. |
| `getEyeGeometry()` | `{ apexZ, focusDepth }`. |
| `getPresetNames()`, `getPresetInfo(name)` | Preset names, labels and reference photographs. |
| `loadPreset(name, duration)`, `randomEye(ancestry, seed, duration)` | Glide to a preset or to a random eye, as the panel does; `randomEye` returns the sampled features and the color shade. |
| `zoom('in' \| 'out', duration)` | Glide the camera as the HUD's zoom buttons do, over `zoom.duration` unless given. |
| `getZoomLevel()`, `setZoomLevel(level)` | The zoom level of the HUD's knob (0 zoomed out, 1 in); setting it moves the camera at once, as dragging the knob does. |
| `skinTone(name, duration)` | Glide `skin.color` to a tone of `src/params/skinTones.js`, as the HUD's skin tones do; `false` for an unknown name. |

## Debugging Notes

- Shader compilation errors appear in the browser console, not in `pnpm build`. They also make `pnpm capture` fail.
- A uniformly grey or black image usually means a NaN or an alpha problem.
  - Check the raw scene with `?view=normals`.
  - Then read pixels through `window.__EYE_APP__`; the accumulation history is `app.post.accumulation.history`.
- A living eye restarts the accumulation every frame and keeps none of them in the history. Press Space, or turn `animation.enabled` off, to let the image converge.
- Once `quality.photoSamples` samples are accumulated, the loop stops rendering and the canvas keeps the last image. Any change restarts it.
- `?view=iris-steps` shows the march cost per pixel: red where it hits the step limit. The other `iris-*` views isolate the field, its normals, AO and atlas.
