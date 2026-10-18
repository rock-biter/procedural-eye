# Animation

The living eye: the pupil answers the light, the eye fixates and moves, the lids follow and blink. [`src/animation/`](../src/animation/) is pure and seeded. `EyeApp.pose()` ([`src/app.js`](../src/app.js)) applies its result every frame:
- the pupil diameter to the eyeball uniforms;
- the gaze rotation to the eye rig;
- the lid angles to `uLidFollow`;
- the blink's closure to the lid meshes' morph weights and `uLidBlink` (`LidBlink.set()`).

The measurements behind the models are in [`docs/RESEARCH.md`](RESEARCH.md).

## Modes

| Mode | When | Pose |
| --- | --- | --- |
| Living | `animation.enabled` on, live | The animator steps with the frame time, and every frame restarts the accumulation. |
| Photo | Space, the **Photo** action, or `?photo=` at start | The clock stops and the eye keeps its instant, but a blink under way ends: the photo shows the lids open. Samples accumulate until `quality.photoSamples`. A frozen start takes one step: the steady state, lids open. The dust stops too. |
| Still | `animation.enabled` off | The eye is posed by its parameters alone whenever the image restarts: the pupil is `iris.pupilDiameter`, the line of sight is `animation.yaw` / `animation.pitch`, the lids rest at `lids.closure`, and nothing moves. The camera can circle a still subject. |

The reference presets are still eyes, so their tuned pupil and gaze hold in captures.

The dust drifts in every mode but photo: over a still eye's converged image, it is redrawn every frame without rendering the scene ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#frame-loop)).

**Transitions**: a preset or a random eye glides in ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md#transitions)). When it changes where the pose comes from (a still eye coming alive or the reverse, another gaze mode, the reflex toggled), `EyeApp` blends the pose from where it was with the transition's progress: pupil, gaze, lids (follow and blink) and framing.

## Pupil

[`src/animation/pupilDynamics.js`](../src/animation/pupilDynamics.js):

- **Steady state**: Watson & Yellott's unified formula.
  - Its inputs are the luminance, a field area of 1250 deg², `eye.age`, and both eyes open.
  - The luminance is the rig's `sceneLuminance()` toward the line of sight × `animation.adaptation`, which converts rig units to cd/m².
  - **Line of sight**: each emitter counts with a Gaussian of its angle from the line of sight (σ 30°), an approximation of the pupil's weaker response to peripheral light; the background surrounds the eye and counts fully. Looking toward a light constricts the pupil.
  - The default studio gives about 2.9 mm, looking straight ahead.
- **Looks**: each gaze shift (microsaccades excluded) brings its own pupil change within ±`animation.pupilResponse` mm.
  - It is 0.5·N(0, 1) + (pitch of the look − `animation.pitch`) / 25°, clamped to ±1, times `pupilResponse`.
  - Interest dilates the pupil (the psychosensory response); nearer things constrict it (the near response), and they lie more often below, so looks down constrict on average.
  - The change eases in through two cascaded 0.3 s lags, then goes through the dynamics below.
- **Dynamics**: Pamplona et al.'s model in M = atanh((D − 4.9) / 3).
  - **Latency**: the pupil answers the target of 0.23 s ago, kept in a history buffer.
  - **Approach**: exponential in M, with time constants of 0.22 s when constricting and 0.7 s when dilating.
  - **Speed**: capped at 4.2 mm/s when constricting and 1.1 mm/s when dilating.
  - **Step**: fixed sub-steps of 1/240 s, so the result does not depend on the frame rate.
- **Hippus**: five seeded sines from 0.05 to 2.3 Hz, with amplitude `animation.hippus` (RMS about half of it).
- **Toggle**: with `animation.pupilReflex` off, the pupil is `iris.pupilDiameter` (no look changes either).

The iris follows any diameter through its rest space ([`docs/IRIS.md`](IRIS.md#rest-space-and-dilation)).

## Gaze

[`src/animation/gaze.js`](../src/animation/gaze.js) and [`src/animation/animator.js`](../src/animation/animator.js). Angles are in degrees; yaw is positive toward +X (the right of the picture) and pitch is positive up.

- **Targets** (`animation.gaze`):

  | Mode | Target |
  | --- | --- |
  | `wander` (default) | Looks around `animation.yaw` / `animation.pitch`, straight ahead by default (below) |
  | `camera` | The camera, seen from the globe center |
  | `cursor` | The pointer over the canvas, up to ±25° by ±18° |
  | `fixed` | `animation.yaw`, `animation.pitch` |

  A still eye ignores the mode and looks along `animation.yaw` / `animation.pitch`.
- **Looking around** (`wander`):
  - The first look is the center. Each look holds for about `animation.lookInterval` seconds (log-normal, σ 0.4).
  - Looks fall within `animation.lookRange` of the center, vertically 0.6 of it.
  - One look in three comes back near the center (within 0.15 of the range); the others land at least a third of the range from the last one.
- **Saccades**: they start when the target is more than 0.6° away.
  - The duration follows the main sequence, 2.2 ms per degree + 21 ms, stretched by `animation.saccadeSlowdown` (5 by default, 1 is physiological); the physiological peak velocity is ≈ 500·(1 − e^(−A/14)) °/s.
  - **Slowdown**: a real 10° saccade lasts 43 ms, two or three frames, and reads as a jump in a macro close-up. Five times slower it lasts 0.2 s.
  - The profile is minimum-jerk.
- **Micro-movements** (`animation.microMovements`, 0.3 by default) scale the microsaccades and the drift: 1 is physiological, 0 none.
  - **Microsaccades**: a Poisson process at 1.5 Hz × the scale during fixation. Amplitudes are log-normal around 0.35° × the scale, capped at 1°. Each also corrects half of the line of sight's error, and is slowed like the saccades.
  - **Drift**: smooth. Its velocity is an Ornstein–Uhlenbeck process (RMS 0.5 °/s × the scale, correlation time 0.2 s), and the offset returns at 2.5 /s toward the saccadic position. At full scale that is about 0.11° RMS, without frame-to-frame jitter.
- **Visual axis**: the target is aimed by the visual axis; the optical axis turns `eye.kappa` temporal of it.
- **Orientation**: `gazeQuaternion()` gives the shortest-arc rotation from primary position (Listing's law, no torsion). `EyeRig` applies it about the globe's center ([`docs/OPTICS.md`](OPTICS.md#eye-space)).
- **Start**: the first living step starts at rest on its target, so a frozen start is the steady state for the gaze as well as for the pupil.

## Framing

The camera aims and focuses at the entrance pupil, turned about the globe's center along the eye's *settled* line of sight (`framing` in the step result). The micro-movements are left out, so they move the eye within a still frame.

| Pose | Framed line of sight |
| --- | --- |
| Still eye, or `fixed` gaze | `animation.yaw`, `animation.pitch` |
| `camera` gaze | The camera, so the eye looking into the lens stays centered and sharp as the camera orbits. The first frame starts at the settled point (the eye looking along the orbit). |
| `wander` | `animation.yaw`, `animation.pitch`: the center of the looks, so the eye looks around within a still frame |
| `cursor` | Straight ahead, so the eye roams within a still frame |

- **Photo mode**: the framing stays with the frozen eye, so the camera can circle it.
- **Offset**: the framed point ignores κ, so a straight-ahead eye frames as if κ were 0; an eye turned to the camera sits about 0.9 mm off center.

## Lid Follow

The lids follow the vertical gaze: the upper margin by 0.9 of the pitch and the lower by 0.35, both scaled by `animation.lidFollow`.

- **Rotation**: `lid-follow.glsl` rotates lid-attached vertices about the X axis through the globe center, so they slide over the globe like a shutter. A gaze up turns the globe by −pitch about X (its front rises); the lids turn the same way (`lidFollowAngle()` negates `uLidFollow`), so they rise with it.
- **Weights**: each vertex is weighted by its `follow` attribute ([`docs/ADNEXA.md`](ADNEXA.md#lid-mesh)): the upper share across the canthi, and full follow near the margin fading to none up the skin.
- **Consumers**: the skin, lashes, tear film and shadow-depth programs share the rotation. Lookups of the fissure map undo it (`lidRestPosition()`).

## Blink

[`src/animation/blink.js`](../src/animation/blink.js): `BlinkModel` gives the blink's closure, 0 with the lids where `lids.closure` rests them, 1 closed. It draws from its own seeded stream, so the looks and the pupil are those of an eye that does not blink.

- **Rate**: spontaneous blinks come `animation.blinkRate` times a minute (15 by default, 15.5 at rest in Argilés 2015; 0 turns blinking off).
  - The intervals are log-normal (σ 0.7, a coefficient of variation of about 0.8), as measured (Borges 2010): now and then a blink follows another within a second, sometimes the eye stays open for ten.
  - The timer runs in mean intervals at the current rate, so a new rate applies at once.
  - A blink can start before the lids are fully open (a burst), from where they are.
- **Kinematics** (`BLINK`, at `animation.blinkSlowdown` 1, the measured spontaneous blink), stretched by `blinkSlowdown`: 0.75 by default, a quarter quicker (a 75 ms closing, within the measured 50–130 ms, *tuned*):
  - closing: 0.10 s, eased in and out (the lid's speed rises and falls);
  - closed: 30 ms, for a complete blink;
  - opening: nine tenths of the way in 0.21 s, the last tenth creeping on to 0.5 s (Kwon 2013's late opening). At its peak the closing is about twice as fast.
- **Depth**: 15% of the blinks stop short, between 0.5 and 0.9 of the way (Argilés 2015 *(the depth estimated)*), and open again at once.
- **Gaze-evoked blinks**: a gaze shift (a saccade to a new target, not a microsaccade) brings a blink with it, with a chance rising from 0 at 12° to 0.9 past 36° (nearly every shift over 33° in Evinger 1994, *(the ramp estimated)*). It counts as the spontaneous one, which is rescheduled. With the default look range few shifts reach it; following the cursor across the canvas does.
- **When**: only a living eye blinks. A still eye and a frozen start are open. Entering photo mode ends a blink under way, so a photo shows the lids open; after it the eye goes on open.
- **Frames**: the lids, lashes and meniscus morph through closed frames that a worker builds after every rebuild ([`docs/ADNEXA.md`](ADNEXA.md#blink-frames)). Until they arrive (a few seconds after start or after a lid change) the lids stay open; the blink's clock runs on.
- **On demand**: `window.__EYE__.blink()` starts one ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#console-api)).
