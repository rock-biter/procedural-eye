# Procedural eye

A hyper-realistic, fully procedural human eye in three.js, seen as in macro photography.

- **Cornea, limbus and sclera** are analytic surfaces. Light refracts through both corneal surfaces onto the iris.
- **The iris** is raymarched as a 3D field of crypts, vessels and collagen arcs, and colored by a spectral model of its pigments.
- **The frame around it**: eyelids with skin and lashes, the tear meniscus and the scleral vessels.
- **Light and life**: an analytic light rig gives exact reflections; the pupil reacts to light and the eye moves like a living one.
- **Photo mode**: a thin-lens camera with progressive accumulation renders real macro depth of field.

Every structure and color is a parameter.

```bash
pnpm install
pnpm dev        # then open the printed URL
pnpm capture    # renders presets headlessly next to the reference photos
```

**Controls**

- Drag to orbit, shift- or right-drag to pan, scroll to change the distance (the focus stays on the pupil plane).
- **Space** toggles photo mode: the eye freezes and the image converges.

**Panel** (`?gui=0` hides it)

- Every parameter.
- One preset per reference photograph.
- **Random eye**: an eye drawn from measured population data for the chosen ancestry.
- Presets and random eyes glide in, so the eye transforms in place.
- **Save PNG**: the file carries the state string of its eye.
- **Copy state URL**.

Agents and contributors: start at [`AGENTS.md`](AGENTS.md). The science behind the defaults is in [`docs/RESEARCH.md`](docs/RESEARCH.md).
