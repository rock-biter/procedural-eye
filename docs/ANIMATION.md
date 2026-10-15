# Animation

The living eye: the pupil answers the light, the eye fixates and moves, the lids follow. [`src/animation/`](../src/animation/) is pure and seeded. `EyeApp.pose()` ([`src/app.js`](../src/app.js)) applies its result every frame:
- the pupil diameter to the eyeball uniforms;
- the gaze rotation to the eye rig;
- the lid angles to `uLidFollow`.

The measurements behind the models are in [`docs/RESEARCH.md`](RESEARCH.md).

## Modes

| Mode | When | Pose |
| --- | --- | --- |
| Living | `animation.enabled` on, live | The animator steps with the frame time, and every frame restarts the accumulation. |
| Photo | Space, the **Photo** action, or `?photo=` at start | The clock stops and the eye keeps its instant; samples accumulate until `quality.photoSamples`. A frozen start takes one step: the steady state. |
| Still | `animation.enabled` off | The eye is posed by its parameters alone whenever the image restarts: the pupil is `iris.pupilDiameter`, the line of sight is `animation.yaw` / `animation.pitch`, and nothing moves. The camera can circle a still subject. |

The reference presets are still eyes, so their tuned pupil and gaze hold in captures.

## Pupil

[`src/animation/pupilDynamics.js`](../src/animation/pupilDynamics.js):

- **Steady state**: Watson & Yellott's unified formula.
  - Its inputs are the luminance, a field area of 1250 deg², `eye.age`, and both eyes open.
  - The luminance is the rig's `sceneLuminance()` × `animation.adaptation`, which converts rig units to cd/m².
  - The default studio gives about 2.9 mm.
- **Dynamics**: Pamplona et al.'s model in M = atanh((D − 4.9) / 3).
  - **Latency**: the pupil answers the target of 0.23 s ago, kept in a history buffer.
  - **Approach**: exponential in M, with time constants of 0.22 s when constricting and 0.7 s when dilating.
  - **Speed**: capped at 4.2 mm/s when constricting and 1.1 mm/s when dilating.
  - **Step**: fixed sub-steps of 1/240 s, so the result does not depend on the frame rate.
- **Hippus**: five seeded sines from 0.05 to 2.3 Hz, with amplitude `animation.hippus` (RMS about half of it).
- **Toggle**: with `animation.pupilReflex` off, the pupil is `iris.pupilDiameter`.

The iris follows any diameter through its rest space ([`docs/IRIS.md`](IRIS.md#rest-space-and-dilation)).

## Gaze

[`src/animation/gaze.js`](../src/animation/gaze.js) and [`src/animation/animator.js`](../src/animation/animator.js). Angles are in degrees; yaw is positive toward +X (the right of the picture) and pitch is positive up.

- **Targets** (`animation.gaze`):

  | Mode | Target |
  | --- | --- |
  | `camera` | The camera, seen from the globe center |
  | `cursor` | The pointer over the canvas, up to ±25° by ±18° |
  | `wander` | A new random target every 0.8–3 s, within ±12° by ±7° |
  | `fixed` | `animation.yaw`, `animation.pitch` |

  A still eye ignores the mode and looks along `animation.yaw` / `animation.pitch`.
- **Saccades**: they start when the target is more than 0.6° away.
  - The duration follows the main sequence, 2.2 ms per degree + 21 ms; the peak velocity is ≈ 500·(1 − e^(−A/14)) °/s.
  - The profile is minimum-jerk.
- **Microsaccades** (`animation.microsaccades`): a Poisson process at 1.5 Hz during fixation.
  - Amplitudes are log-normal around 0.35°, capped at 1°.
  - Each also corrects half of the accumulated drift.
- **Drift**: an Ornstein–Uhlenbeck walk around the fixation point (σ 0.25 °/√s, return rate 2.5 /s).
- **Visual axis**: the target is aimed by the visual axis; the optical axis turns `eye.kappa` temporal of it.
- **Orientation**: `gazeQuaternion()` gives the shortest-arc rotation from primary position (Listing's law, no torsion). `EyeRig` applies it about the center of rotation.
- **Start**: the first living step starts at rest on its target, so a frozen start is the steady state for the gaze as well as for the pupil.

## Framing

The camera aims and focuses at the entrance pupil, turned about the center of rotation along the eye's *settled* line of sight (`framing` in the step result). The micro-movements are left out, so they move the eye within a still frame.

| Pose | Framed line of sight |
| --- | --- |
| Still eye, or `fixed` gaze | `animation.yaw`, `animation.pitch` |
| `camera` gaze | The camera, so the eye looking into the lens stays centered and sharp as the camera orbits. The first frame starts at the settled point (the eye looking along the orbit). |
| `cursor`, `wander` | Straight ahead, so the eye roams within a still frame |

- **Photo mode**: the framing stays with the frozen eye, so the camera can circle it.
- **Offset**: the framed point ignores κ, so a straight-ahead eye frames exactly as before; an eye turned to the camera sits about 0.9 mm off center.

## Lid Follow

The lids follow the vertical gaze: the upper margin by 0.9 of the pitch and the lower by 0.35, both scaled by `animation.lidFollow`.

- **Rotation**: `lid-follow.glsl` rotates lid-attached vertices about the X axis through the globe center, so they slide over the globe like a shutter.
- **Weights**: each vertex is weighted by its `follow` attribute ([`docs/ADNEXA.md`](ADNEXA.md#lid-mesh)): the upper share across the canthi, and full follow near the margin fading to none up the skin.
- **Consumers**: the skin, lashes, tear film and shadow-depth programs share the rotation. Lookups of the fissure map undo it (`lidRestPosition()`).
