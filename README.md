# Random-eyes

An exploratory demo of a digital eye configurator: a hyper-realistic, fully procedural human eye in three.js, seen as in macro photography.

- **Cornea, limbus and sclera** are analytic surfaces. Light refracts through both corneal surfaces onto the iris.
- **The iris** is raymarched as a 3D field of crypts, vessels and collagen arcs, and colored by a spectral model of its pigments.
- **The frame around it**: eyelids with skin and lashes, the tear meniscus and the scleral vessels.
- **Light and life**: an analytic light rig gives exact reflections; the pupil reacts to light, the eye moves like a living one and blinks now and then.
- **Air**: tiny fibers and flakes of dust drift very slowly around the eye, sharp near the focus and soft away from it, over a light haze that deepens with distance.
- **Photo mode**: a thin-lens camera with progressive accumulation renders real macro depth of field.

Every structure and color is a parameter.

```bash
pnpm install
pnpm dev        # then open the printed URL
pnpm capture    # renders presets headlessly next to the reference photos
```

**Controls**

- Drag to orbit (it coasts a little when you let go; the view also turns slightly toward the mouse), shift- or right-drag to pan, scroll to change the distance between the zoom-in and zoom-out framings (the focus stays on the pupil plane).
- The buttons sit on a dashed circle around the eye.
- **Zoom out** / **Zoom in** (the − and + at the bottom right of the circle): glide out to the whole figure and back. The knob between them shows the zoom; drag it along the circle (or scroll over it) to zoom.
- **Skin tone** (the dots at the left of the circle): glide the skin color from fair to deep.
- **Space** toggles photo mode: the eye freezes (open, even mid-blink) and the image converges.

**Random eye** (the eye button, below the zoom): an eye drawn from measured population data for the chosen ancestry.

**Panel** (collapsed at the top, only with `#debug` at the end of the URL; `?gui=0` hides the buttons too)

- Every parameter.
- One preset per reference photograph.
- Presets and random eyes glide in, so the eye transforms in place.
- **Save PNG**: the file carries the state string of its eye.
- **Copy state URL**.

Agents and contributors: start at [`AGENTS.md`](AGENTS.md). The science behind the defaults is in [`docs/RESEARCH.md`](docs/RESEARCH.md).
