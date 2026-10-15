# Quality

## Required Checks

For every source, shader, configuration or dependency change:

1. `pnpm lint`, `pnpm format:check`, `pnpm test`.
2. `pnpm build`.
3. `pnpm capture` with the affected presets and views. Look at the images and the contact sheet. Console errors, including shader compile errors, make it exit non-zero.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs lint, formatting, tests and the build on Node 22.

## Unit Tests

| Suite | Asserts |
| --- | --- |
| `eyeProfile.test.js` | Conic sag; measured corneoscleral sag at 10 / 12.3 / 15 mm within 0.1 mm; the cornea meets the sclera at the limbus; C1 continuity of the blend; analytic slope; pupil margin on the lens; iris behind the posterior cornea until the angle. |
| `cornealOptics.test.js` | Fresnel 2.08% (tear) and 2.5% (cornea) at normal incidence; Snell and total internal reflection; conic intersection and normal; an axial ray crosses undeviated; entrance pupil 3.05 ± 0.1 mm deep, ×1.13 ± 0.02. |
| `cameraOptics.test.js` | 1:1 macro; signed blur circle; macro depth of field ≈ 1 mm; the lens-shift shear keeps the focus plane fixed; Halton and disk samples. |
| `envRig.test.js` | Black-body colors (unit luminance, hue order); panel placement and orthonormal axes; camera-mounted emitters; packing and transforms; the scene luminance weighed by the angle from the line of sight. |
| `irisSpace.test.js` | Identity at rest; margin, collarette and root fixed for any pupil; monotonic round trip; area law of the pupillary zone; conservative distance scale; seeded collarette and features in range. |
| `irisColor.test.js` | Kubelka–Munk limits; white maps to white; reflectance in [0, 1]; little melanin is blue, eumelanin brown and dark, pheomelanin yellower; thinner stroma is darker; lookup layout. |
| `lidGeometry.test.js` | Fissure width, MRD1, MRD2 and tilt, also with seeded wandering margins; outward normals; the margin rests on the eye and no lid vertex enters the globe, also for the most irregular, full and baggy lids; no collapsed quads and no folds in view (outside the canthal crease) for realistic lid shapes, both eyes, the most irregular, full, baggy and folded lids, and a receding temple; the relief is seeded, and without irregularity and folds the seed changes nothing; the relief attributes (unit direction, grooves ≤ 0, the place along the margin from 0 to 1, the distance from the margin growing along every ring); lash counts, lengths, roots and directions; fissure distance signs. |
| `vessels.test.js` | The vessel network is seeded, stays on the visible sclera, has both layers, deep vessels wider. |
| `animation.test.js` | Watson–Yellott trends; latency, faster constriction than dilation, settling; frame-rate independence; saccade main sequence and the slowdown; a smooth drift that scales with the micro-movements; the animator's visual axis and lid follow; the still pose; a living start at rest on its target; the framed line of sight per gaze mode; looking around within the range; a smooth pupil change per look; the light along the line of sight. |
| `paramTransition.test.js` | Glide or switch per leaf; switches at the start, a minimum-jerk glide, an exact landing; lights fading in and out; cancelled glides; every preset reachable from every other within the ranges. |
| `params.test.js` | Defaults valid; clamping and choices; overrides and unknown paths; state round trip; presets name only existing parameters; random eyes valid with the measured marginals (±2% over 10k); PNG text chunks round-trip with a valid CRC. |

## Captures

`pnpm capture [--presets a,b|all] [--views beauty,iris-clay] [--samples 64] [--width 1600] [--height 1000] [--dpr 1] [--out captures] [--query key=value] [--bench <frames>] [--no-build] [--chrome <path>] [--timeout 600]`

The script:
1. builds the app into a temporary directory and serves it with `vite preview`;
2. drives headless Chrome over the DevTools protocol ([`scripts/lib/chrome.mjs`](../scripts/lib/chrome.mjs));
3. loads `?preset=…&gui=0&photo=<samples>`, plus `view=` and the extra query (the eye starts frozen);
4. waits until the accumulation converges, and saves `window.__EYE__.capture()`.

It writes into `captures/`, which is git-ignored:
- the PNGs;
- `report.json`, with the time per shot, the frame intervals and the console errors;
- `contact-sheet.html` / `.png`, with the captures above the reference photographs (each labeled with the photographs its preset is tuned on).

`--bench <frames>` also renders that many interactive frames per shot with `measureSync()`, and reports the mean, median, minimum and maximum milliseconds and the compile time.

To check an arbitrary framing, pass a state string: `--query state=$(node -e "process.stdout.write(Buffer.from(JSON.stringify({camera:{azimuth:60}})).toString('base64url'))")`.

## Visual Checks

- **Presets**: each one against its reference photographs on the contact sheet. Compare iris structure, color and collarette, the catchlight shapes, the lid and lash reflections in the cornea, the tear meniscus, and the vessels.
- **Iris**:
  - `?view=iris-clay` shows the relief without color: bridging fibers, undercut crypts, the ruff.
  - `?view=iris-steps` should stay blue over the iris; red marks pixels at the march limit.
- **Optics**: orbit a still eye (any reference preset) to grazing angles. The iris stays visible through the cornea and the limbus fades smoothly. `?preset=refraction-checker` shows the refraction as a polar grid.
- **Dilation**: sweep `iris.pupilDiameter` from 2 to 7 mm on a still eye. The collarette follows the pupil and the crypts stretch without re-baking.
- **Lids**: on a still eye, sweep `animation.pitch` over ±25°. The lids follow without opening a gap on the globe.
- **Background**: tilt the camera far (`camera.azimuth` 70, `camera.elevation` 45). The backdrop past the skin's edge is a darker skin tone, with no trace of earlier frames.
- **Lid shape**: against `references/Four-view anatomical eye sculpt reference.png` from the front, three-quarters, the side and below (`camera.distance` 300, `camera.fNumber` 22): the upper lid is a convex band whose crease slips under the brow ridge, the lower lid a lower band that flows into the cheek over a soft groove, the brow ridge stands over the upper lid in profile. Against `eye-shape-palpebra.jpg`: the upper margin arches high and the lower one is flatter.
- **Skin**: with a deep focus (`camera.fNumber` 32 through `--query state=…`), and with `--views normals`, the lids show the crease, the lower-lid folds, the crow's feet and the furrows, with no seam at the canthi and no repeating pattern. A wider framing (`camera.distance` 330) shows the whole periocular region.
- **Living eye and transitions** (`pnpm dev`): the default eye looks around straight ahead in smooth shifts, its pupil easing with each look. Switch presets and press **Random eye**: the camera, the colors and the pupil glide; seeds and counts switch at the start. Captures start frozen and do not show either.

## Performance

- **Interactive frames** set the budget: the iris march dominates. The adaptive pixel ratio (down to `quality.minPixelRatio`) and the cheaper interactive tier keep the eye responsive. Photo mode renders one full-quality sample per frame.
- **Measurement**:
  - Use `--bench` or `window.__EYE__.measureSync()` to compare builds on the same machine, at the same size and DPR.
  - `measure()` reads GPU timer queries where available (`EXT_disjoint_timer_query_webgl2`, Chrome only). They are about 2× inflated on ANGLE-Metal.

## Known Limitations

- **Timing**: frame timings in headless captures are not representative (no vsync, frame rate limit off). Wall-clock measurements swing widely on a loaded machine; repeat them and compare medians.
- **Safari**: the scene targets Chrome and Safari on Apple Silicon. The capture script runs Chrome only, so Safari needs a manual check.
