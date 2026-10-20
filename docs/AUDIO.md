# Audio

The interface sounds like a camera. Every control of the HUD makes the mechanical noise of the part it stands for: the zoom and the aperture click through the detents of their rings, the buttons click, Random eye advances the film, and Snapshot beeps for focus and fires a shutter. The recorded sounds are real cameras (CC0 recordings from Freesound); the hover's tick, the focus beep and the creak of a knob pulled past its end are synthesized with Web Audio. There is no audio library and, for now, no background sound: the first ambient drone was removed, to be replaced by another design.

## Engine

[`src/audio/audioEngine.js`](../src/audio/audioEngine.js) (`AudioEngine`) owns the Web Audio graph.

- **Start**: a page may make sound only after a gesture. The recordings are fetched when the page loads, but the `AudioContext` is created at the first press or key (capture-phase listeners on `window`), and the recordings are decoded then. A sound asked for while they decode plays if they arrive within 0.15 s. So the first press of a control is heard, and no autoplay warning is logged.
- **Graph**: the controls bus (`sound.controls`) feeds the master gain (`sound.volume`). From there the signal goes through a limiter (a `DynamicsCompressorNode`: threshold −6 dB, ratio 12, attack 2 ms) and an analyser (for `getSoundStats()`) to the output.
- **One-shots**: `play(name, { gain, rate, pan, delay })` plays a sound of the bank on the controls bus, `delay` s from now.
  - Each play draws a take other than the last one, a rate within ±`sound.variation` cents and a gain within ±1.5 dB, both scaled by the sound's `vary`.
  - A sound may have at most `voices` copies playing at once. A sound asked for less than `gap` s after the last one plays no new voice; half its level is added to the last one's instead (detents passed in a single frame sound as one louder click).
  - Each decoded buffer starts 1 ms before its sound comes within 40 dB of its peak, past any silence a decoder put before it.
- **Mute**: the master fades to 0 (time constant 0.08 s) and the context then suspends. A hidden page suspends it too, and a visible page resumes it unless muted.
- **Stats**: `stats()` returns the context's state, whether the sounds are decoded, the mute and the play count of each sound, plus the peak and RMS of the master (dBFS) since the last call. The analyser is read once a frame, so a sound played while the main thread is blocked (`capture()` while Snapshot saves) can escape the peak while it still plays in full.

The sound exists only with the interface: [`main.js`](../main.js) builds it inside the `?gui=0` check, so captures and `pnpm brand` never create a context.

[`main.js`](../main.js) wires it:
- It creates `AudioEngine` and `CameraFoley`.
- It passes `onCue` to the HUD.
- Its own `requestAnimationFrame` loop calls `audio.update()` and `foley.update(dt, …)`, with the knobs' levels (`zoomProgress()` and `apertureProgress()`, unclamped), their elasticities, the f-number, `app.frozen` and `app.converged`.
- A listener on `app.listeners` cues the mirror on `'frozen'`, and `savePng()` cues the focus beep and the shutter.

The app itself emits no events; everything is read per frame.

## The Camera Foley

[`src/audio/cameraFoley.js`](../src/audio/cameraFoley.js) (`CameraFoley`) turns the HUD's cues and the camera's motion into sounds. [`src/audio/foley.js`](../src/audio/foley.js) * holds its arithmetic, [`src/audio/soundBank.js`](../src/audio/soundBank.js) * the bank (takes or synth, the `sound.*` leaf of the gain, `vary`, `voices`, `gap`) and [`src/audio/synth.js`](../src/audio/synth.js) * the synthesized buffers.

| Event | Where it comes from | Sound |
| --- | --- | --- |
| A press on +, −, a skin tone, Random eye, More info or the sound toggle | `pointerdown` (or a click from the keyboard, `detail` 0): `sounding()` in [`src/ui/hud.js`](../src/ui/hud.js) and `main.js` | `press`: a DSLR button's click (3 takes). A skin tone makes this click only. |
| A tap on a knob (a click without a drag) | `trackKnob()`'s release | `press`, 0.6 as loud |
| A mouse entering a control | `pointerenter` (mouse only), and only if the mouse moved in the last 150 ms, so a knob sliding under a still mouse is silent | `tick`: 4 ms of high noise (synthesized) |
| The zoom moving | `crossings()` of `zoomProgress()`, `sound.zoomDetents` across the knob's track: a drag, the wheel (over the canvas or the knob), the keys, + and −'s glide, a snap, a spring back | `zoom`: a Nikon FM2's dial (5 takes) played 1.3 to 1.45 times as fast, higher as it zooms in |
| The f-number moving | `crossings()` of `stops()` (2·log₂ N), `sound.detents` per stop: the knob, the wheel over it, a right-drag, the keys, a glide | `aperture`: single ticks of a film advance lever's ratchet (5 takes, 30 ms), lighter than the zoom's, played 1 to 1.15 times as fast, higher as it stops down |
| A knob pulled past its end | `overshoot()` of the level against its elasticity | the creak: a sawtooth (stick-slip, 16–62 Hz) ringing a band-pass (650–1750 Hz, Q 9) as it is pulled further, louder while it moves (`strainDrive()`) |
| Random eye | its click (`random` cue) | `advance`: the film advance lever of a Minolta XE-7 (`sound.film` `lever`), or `wind`: the motor winder of a point-and-shoot (`motor`) |
| Snapshot (and the panel's Save PNG) | `savePng()` | `beep`, then 0.22 s later `shutter`: a Minolta XE-7 firing |
| Photo mode on and off | the `'frozen'` notification | `mirrorUp` and `mirrorDown`: the first and the last part of the same shot |
| The photo converging | `app.converged` turning true while frozen, at most once a second | `beep`: two 2.8 kHz blips of 55 ms, 45 ms apart, the autofocus confirmation (synthesized) |

- **Detents**: `crossings(from, to, step)` counts a detent when it is reached, not when it is left, signed with the move. A move that starts on a detent does not count it again. The zoom's detents follow the camera, whatever moves it, so a glide of + or − runs through them as a quick ratchet (ten across the whole track by default).
- **Panning**: a cue's control pans with its place on the screen, 0.6 at the window's edges, so the tones sound from the left and the zoom from the right. The detents and the beep of a converged photo pan a little to the right; the mirror sits in the middle.
- **Smoothing**: the creak follows the knobs' speeds with a time constant of 0.04 s (`follow()` of [`src/camera/orbitMotion.js`](../src/camera/orbitMotion.js)), and its gain, rate and resonance follow with 0.03 s.

## Parameters

The `sound` group of [`src/params/paramSchema.js`](../src/params/paramSchema.js): every leaf is `uniform`, read once a frame or at each play. The mute is the viewer's, not a parameter.

| Leaf | Default | Effect |
| --- | --- | --- |
| `volume`, `controls` | 0.8, 0.8 | The master and the controls bus. |
| `press`, `hover`, `zoom`, `aperture`, `strain`, `advance`, `shutter`, `mirror`, `beep` | 0.5, 0.3, 0.3, 0.3, 0.5, 0.6, 0.8, 0.5, 0.12 | Each sound's level (`advance` also sets `wind`; `beep` both beeps). |
| `variation` | 60 cents | How far a sound's pitch varies from one play to the next. |
| `zoomDetents` | 10 | The zoom ring's detents across the knob's track. |
| `detents` | 3 per stop | The aperture ring's detents. |
| `film` | `lever` | Random eye's film advance: `lever` or `motor`. |

## Recordings

The recorded sounds are cut from CC0 recordings on Freesound. CC0 needs no attribution; [`src/audio/sounds/CREDITS.md`](../src/audio/sounds/CREDITS.md) names them anyway.

| Source | Freesound | Sounds |
| --- | --- | --- |
| Minolta XE-7, single shots and film advance (kyles) | [637342](https://freesound.org/s/637342/) | `shutter`, `mirror-up`, `mirror-down`, `advance`, `ratchet-1` to `ratchet-5` |
| 80s point-and-shoot film camera (RealSquink) | [851291](https://freesound.org/s/851291/) | `wind` |
| Nikon FM2 dial (hmilleo) | [412546](https://freesound.org/s/412546/) | `dial-1` to `dial-5` |
| DSLR camera sounds (Rvgerxini) | [571483](https://freesound.org/s/571483/) | `press-1` to `press-3` |

The ratchet's ticks come from the louder advances of the Minolta recording (the first one, which `advance` plays, is too close to the recording's noise to cut single ticks from).

`pnpm sounds` ([`scripts/sounds.mjs`](../scripts/sounds.mjs), which needs ffmpeg with libmp3lame) builds them into [`src/audio/sounds/`](../src/audio/sounds/), about 100 KB in all.
- **Download**: it fetches each source's HQ preview, which needs no account, into `node_modules/.cache/eye-sounds/`.
- **Cutting**: [`scripts/sounds.json`](../scripts/sounds.json) gives each cut: `start` and `duration` (s), an optional `highpass` (Hz, 40 by default), `gate` (dB under the peak below which the floor is pushed down), `fadeIn` and `fadeOut`, `peak` (dBFS, −1 by default) and `loop`.
- **Processing**: each cut is high-passed and gated. A one-shot is moved to start 2 ms before its 1 ms loudness first comes within 20 dB of its peak, faded, normalized and written as mono MP3 at 44.1 kHz (VBR, `-q:a 2`). A loop (none at present) has its last `loop` s crossfaded into its head and is written as WAV, whose decoders add no padding.
- **Credits**: the script writes `CREDITS.md`. It does not delete the files of cuts removed from the manifest.

The files are committed, so ffmpeg is needed only to cut them again. Vite inlines the files under 4 KB as data URLs.

The cuts were chosen from measurements (onsets, transients, spectral flatness and centroid, waveforms and spectrograms), not by ear. To change a sound, edit its cut or source in the manifest and run `pnpm sounds` (`--only <name>` for one).

## Tuning and Checking

- **By ear**: with `#debug`, the panel has a **sound** list and **Play sound** after its actions (`audition` in `main.js`), and the `sound` folder holds the levels. **Export defaults JSON** writes them into `defaults.json`.
- **By numbers**: `__EYE__.getSoundStats()` (with the interface only). The measured levels in headless Chrome at 1600 × 1000 with the defaults (dBFS) are:

  | Sound | Peak |
  | --- | --- |
  | The clicks, the film advance, the mirror and the shutter | −9 to −14 |
  | The hover's tick | −16 |
  | The zoom's and the aperture's detents | −18 to −20 |

  Silence elsewhere: no sound plays at rest, and the orbit is silent.
