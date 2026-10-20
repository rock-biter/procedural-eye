# Audio

The interface sounds like a camera. Every control of the HUD makes the mechanical noise of the part it stands for, Snapshot fires a shutter, and a slow generative drone, which follows the eye, plays under everything. The recorded sounds are real cameras (CC0 recordings from Freesound). The continuous voices and the drone are synthesized with Web Audio. There is no audio library.

## Engine

[`src/audio/audioEngine.js`](../src/audio/audioEngine.js) (`AudioEngine`) owns the Web Audio graph.

- **Start**: a page may make sound only after a gesture. The recordings are fetched when the page loads, but the `AudioContext` is created at the first press or key (capture-phase listeners on `window`), and the recordings are decoded then. A sound asked for while they decode plays if they arrive within 0.15 s. So the first press of a control is heard, and no autoplay warning is logged.
- **Graph**: two buses, `controls` (the foley) and `ambient` (the drone), meet in the master gain (`sound.volume`). From there the signal goes through a limiter (a `DynamicsCompressorNode`: threshold −6 dB, ratio 12, attack 2 ms) and an analyser (for `getSoundStats()`) to the output.
- **One-shots**: `play(name, { gain, rate, pan })` plays a sound of the bank on the controls bus.
  - Each play draws a take other than the last one, a rate within ±`sound.variation` cents and a gain within ±1.5 dB, both scaled by the sound's `vary`.
  - A sound may have at most `voices` copies playing at once. A sound asked for less than `gap` s after the last one plays no new voice; half its level is added to the last one's instead (detents passed in a single frame sound as one louder click).
  - Each decoded buffer starts 1 ms before its sound comes within 40 dB of its peak, past any silence a decoder put before it.
- **Loops and noise**: `loop(name)` returns a looped recording, silent, for a caller to drive (the motor). `noise(samples)` returns a looped synthesized buffer.
- **Mute**: the master fades to 0 (time constant 0.08 s) and the context then suspends. A hidden page suspends it too, and a visible page resumes it unless muted.
- **Stats**: `stats()` returns the context's state, whether the sounds are decoded, the mute and the play count of each sound, plus the peak and RMS of the master (dBFS) since the last call. The analyser is read once a frame.

The sound exists only with the interface: [`main.js`](../main.js) builds it inside the `?gui=0` check, so captures and `pnpm brand` never create a context.

[`main.js`](../main.js) wires it:
- It creates `AudioEngine`, `CameraFoley` and `AmbientDrone`.
- It passes `onCue` to the HUD.
- Its own `requestAnimationFrame` loop calls `audio.update()`, `foley.update(dt, …)` and `drone.update(dt, …)`, with the knobs' levels (`zoomProgress()` and `apertureProgress()`, unclamped), the f-number, the orbit angles, `app.frozen` and `app.converged`, plus, for the drone, `irisStructure.seed`, `app.pupilDiameter` and `app.lastPose.blink`.
- A listener on `app.listeners` cues the mirror on `'frozen'`, and `savePng()` cues the shutter.

The app itself emits no events; everything is read per frame.

## The Camera Foley

[`src/audio/cameraFoley.js`](../src/audio/cameraFoley.js) (`CameraFoley`) turns the HUD's cues and the camera's motion into sounds. [`src/audio/foley.js`](../src/audio/foley.js) * holds its arithmetic, and [`src/audio/soundBank.js`](../src/audio/soundBank.js) * holds the bank (takes or synth, the `sound.*` leaf of the gain, `vary`, `voices`, `gap`).

| Event | Where it comes from | Sound |
| --- | --- | --- |
| A press on +, −, a skin tone, Random eye, More info or the sound toggle | `pointerdown` (or a click from the keyboard, `detail` 0): `sounding()` in [`src/ui/hud.js`](../src/ui/hud.js) and `main.js` | `press`: a DSLR button's click (3 takes) |
| A tap on a knob (a click without a drag) | `trackKnob()`'s release | `press`, 0.6 as loud |
| A mouse entering a control | `pointerenter` (mouse only), and only if the mouse moved in the last 150 ms, so a knob sliding under a still mouse is silent | `tick`: 4 ms of high noise (synthesized) |
| The zoom moving, not held | the speed of `zoomProgress()` per frame: the buttons' glide, a snap, the wheel, the keys | `motor`: the power zoom of a compact camera, looped; gain and rate rise with the speed (`motorDrive()`), the rate 3% higher zooming in, 3% lower out |
| The zoom knob dragged by hand | the same speed, while the knob is held (cues `grab` and `release`) | the ring: band-passed noise plus sparse grit clicks played faster as it turns faster (`ringDrive()`) |
| A knob's level reaching an end from inside | `endEvent()` on the zoom's and the aperture's levels | `stop`: an SLR lens locking into its mount |
| A level coming back to an end from past it (the spring back) | `endEvent()` | `settle`: a softer lens click, 0.7 as loud |
| A knob pulled past its end | `overshoot()` of the level against its elasticity | the creak: a sawtooth (stick-slip, 16–62 Hz) ringing a band-pass (650–1750 Hz, Q 9) as it is pulled further, louder while it moves (`strainDrive()`) |
| The f-number crossing a detent | `crossings()` of `stops()` (2·log₂ N), `sound.detents` per stop: the knob, the wheel over it, a right-drag, the keys, a glide | `detent`: the dial played 1.3 to 1.45 times as fast, higher as it stops down |
| The skin tones turning | `toneShift.steps` from GSAP's `onUpdate` in `turnToTone()` (`tones` cues, `start` at the start of a turn) | `dial`: a Nikon FM2's dial, one detent per place passed, in the elastic bounce too |
| Random eye | its click (`random` cue) | `advance`: the film advance lever of a Minolta XE-7 (`sound.film` `lever`), or `wind`: the motor winder of a point-and-shoot (`motor`) |
| Snapshot (and the panel's Save PNG) | `savePng()` | `shutter`: a Minolta XE-7 firing |
| Photo mode on and off | the `'frozen'` notification | `mirrorUp` and `mirrorDown`: the first and the last part of the same shot |
| The photo converging | `app.converged` turning true while frozen, at most once a second | `beep`: two 2.8 kHz blips, the autofocus confirmation (synthesized) |
| The orbit | the speed of `camera.azimuth` and `camera.elevation` (without the mouse parallax): a drag, its coasting, a glide | the swish of a fluid head: noise through a band-pass of 260–960 Hz (`orbitDrive()`) |

- **Detents**: `crossings(from, to, step)` counts a detent when it is reached, not when it is left, signed with the move. A move that starts on a detent does not count it again.
- **Panning**: a cue's control pans with its place on the screen, 0.6 at the window's edges, so the tones sound from the left and the zoom from the right. The continuous voices sit in the middle; the end stops and detents pan a little to the right.
- **Smoothing**: the speeds follow their frame values with a time constant of 0.04 s (`follow()` of [`src/camera/orbitMotion.js`](../src/camera/orbitMotion.js)), and the voices' gains, rates and filters follow with 0.03 s. A keyed zoom step (an instant jump) gives a short blip of the motor.

## The Ambient Drone

[`src/audio/ambientDrone.js`](../src/audio/ambientDrone.js) (`AmbientDrone`) plays a slow pad on the ambient bus, fading in over about 4 s once the sound starts.

- **Harmony** ([`src/audio/droneHarmony.js`](../src/audio/droneHarmony.js) *):
  - The seed `irisStructure.seed` draws a root (A1, B1, C2, D2 or E2), a mode (dorian, aeolian, mixolydian, lydian) and a cycle of four chords. The cycle starts on the tonic and moves to other degrees, the fourth and the sixth likelier.
  - Each chord has five notes in an open shape (sus2/add9, quartal stacks, open fifths): the bass in the octave above the root, and the upper voices kept between A2 and E5.
  - Every `sound.droneChord` s, each voice glides to the next chord (a time constant of 2 s). The bass moves to the new bass; each upper voice moves to the nearest note of the chord that no voice has taken yet (`voiceLead()`).
  - A new eye (Random eye) changes the seed, so the voices glide to the new harmony.
- **Voices**:
  - Five voices, each a sine and a triangle detuned ±4 cents, with a seeded swell: a sine of 7–17 s that swings the voice's level by half either way. The voices are panned apart, the bass in the middle.
  - Under them, the air: pink noise in a band-pass that wanders around 900 Hz over 23 s.
- **Filter and reverb**: one low-pass (Q 0.5) feeds a dry path and a convolution reverb. The reverb's impulse response is synthesized ([`src/audio/impulse.js`](../src/audio/impulse.js) *): two channels of seeded noise falling 60 dB in 4.5 s, its highs dying sooner, after a 12 ms predelay.
- **Modulation**, continuous, without accents:
  - The pupil moves the low-pass `sound.droneMotion` octaves either way of `sound.droneBrightness`: brighter as it constricts toward 2 mm, darker as it dilates toward 7 mm.
  - A blink closes it by up to 75% as the lids close, and lowers the dry path by up to 25%.
  - The zoom sets the reverb: the wet level is `sound.droneReverb` × (0.6 zoomed in to 1 zoomed out). Up close the drone is nearer and drier.
- **Photo mode**: the swells and the air's wander slow to a stop where they are, no chord changes, and the drone drops 4 dB. Back to a living eye, they go on from there.

## Parameters

The `sound` group of [`src/params/paramSchema.js`](../src/params/paramSchema.js): every leaf is `uniform`, read once a frame or at each play. The mute is the viewer's, not a parameter.

| Leaf | Default | Effect |
| --- | --- | --- |
| `volume`, `controls`, `ambient` | 0.8, 0.8, 0.5 | The master and the two buses. |
| `press`, `hover`, `dial`, `detent`, `stop`, `strain`, `motor`, `ring`, `orbit`, `advance`, `shutter`, `mirror`, `beep` | 0.5, 0.12, 0.45, 0.3, 0.5, 0.5, 0.35, 0.4, 0.3, 0.6, 0.8, 0.5, 0.12 | Each sound's level (`stop` also sets `settle`; `advance` also sets `wind`). |
| `variation` | 60 cents | How far a sound's pitch varies from one play to the next. |
| `detents` | 3 per stop | The aperture ring's detents. |
| `film` | `lever` | Random eye's film advance: `lever` or `motor`. |
| `droneBrightness` | 700 Hz | The drone's low-pass at a mid pupil. |
| `droneMotion` | 0.6 oct | How far the pupil moves it, either way. |
| `droneReverb` | 0.55 | The drone's reverb. |
| `droneChord` | 24 s | The time between the drone's chords. |

## Recordings

The recorded sounds are cut from CC0 recordings on Freesound. CC0 needs no attribution; [`src/audio/sounds/CREDITS.md`](../src/audio/sounds/CREDITS.md) names them anyway.

| Source | Freesound | Sounds |
| --- | --- | --- |
| Minolta XE-7, single shots and film advance (kyles) | [637342](https://freesound.org/s/637342/) | `shutter`, `mirror-up`, `mirror-down`, `advance` |
| 80s point-and-shoot film camera (RealSquink) | [851291](https://freesound.org/s/851291/) | `wind` |
| Nikon FM2 dial (hmilleo) | [412546](https://freesound.org/s/412546/) | `dial-1` to `dial-5` |
| DSLR camera sounds (Rvgerxini) | [571483](https://freesound.org/s/571483/) | `press-1` to `press-3` |
| Old SLR manual lens, out and back in (khenshom) | [516490](https://freesound.org/s/516490/) | `stop`, `settle` |
| Modern compact: lens, AF and shutter (RealSquink) | [826117](https://freesound.org/s/826117/) | `motor` (the zoom motor's steady part) |

`pnpm sounds` ([`scripts/sounds.mjs`](../scripts/sounds.mjs), which needs ffmpeg with libmp3lame) builds them into [`src/audio/sounds/`](../src/audio/sounds/), about 124 KB in all.
- **Download**: it fetches each source's HQ preview, which needs no account, into `node_modules/.cache/eye-sounds/`.
- **Cutting**: [`scripts/sounds.json`](../scripts/sounds.json) gives each cut: `start` and `duration` (s), an optional `highpass` (Hz, 40 by default), `gate` (dB under the peak below which the floor is pushed down), `fadeIn` and `fadeOut`, `peak` (dBFS, −1 by default) and `loop`.
- **Processing**: each cut is high-passed and gated. A one-shot is moved to start 2 ms before its 1 ms loudness first comes within 20 dB of its peak, faded, normalized and written as mono MP3 at 44.1 kHz (VBR, `-q:a 2`). A loop (`motor`) has its last `loop` s crossfaded into its head and is written as WAV, whose decoders add no padding.
- **Credits**: the script writes `CREDITS.md`.

The files are committed, so ffmpeg is needed only to cut them again. Vite inlines the files under 4 KB as data URLs.

The cuts were chosen from measurements (onsets, transients, spectral flatness and centroid, waveforms and spectrograms), not by ear. To change a sound, edit its cut or source in the manifest and run `pnpm sounds` (`--only <name>` for one).

## Tuning and Checking

- **By ear**: with `#debug`, the panel has a **sound** list and **Play sound** after its actions (`audition` in `main.js`), and the `sound` folder holds the levels. **Export defaults JSON** writes them into `defaults.json`.
- **By numbers**: `__EYE__.getSoundStats()` (with the interface only). The measured levels in headless Chrome at 1600 × 1000 with the defaults (dBFS, over windows of 0.6–6 s) are:

  | Sound | Peak | RMS |
  | --- | --- | --- |
  | The clicks, stops and shutter | −9 to −16 | — |
  | The motor (one glide of + or −) | −18 | −33 |
  | The ring (a drag) | −20 | −37 |
  | The orbit's swish (a drag) | −29 | −44 |
  | The drone alone | −25 | −36 |
  | The drone in photo mode | −24 | −38 |

  The hover tick peaks around −25.
