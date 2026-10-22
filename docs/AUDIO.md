# Audio

The interface sounds like a camera. Every control of the HUD makes the mechanical noise of the part it stands for: the zoom and the aperture click through the detents of their rings, the buttons click, Random eye advances the film, and Snapshot beeps for focus and fires a shutter. The recorded sounds are real cameras (CC0 recordings from Freesound); the hover's tick, the focus beep, the creak of a knob pulled past its end and one choice of the aperture's ticks are synthesized with Web Audio. Under them plays a soft glass harp, wine glasses rubbed with a wet finger far off in a long reverb, synthesized too: a few quiet glasses singing in turn, now and then a louder one, fading in slowly at the first gesture. There is no audio library. Every sound pauses while the page is hidden or the window has lost the focus.

## Engine

[`src/audio/audioEngine.js`](../src/audio/audioEngine.js) (`AudioEngine`) owns the Web Audio graph.

- **Start**: a page may make sound only after a gesture. The recordings are fetched when the page loads, but the `AudioContext` is created at the first press or key (capture-phase listeners on `window`), and the recordings are decoded then. A sound asked for while they decode plays if they arrive within 0.15 s. So the first press of a control is heard, and no autoplay warning is logged.
- **Graph**: the controls bus (the foley) and the ambience bus feed the master gain (`sound.volume`, the master volume). From there the signal goes through a limiter (a `DynamicsCompressorNode`: threshold −6 dB, ratio 12, attack 2 ms) and an analyser (for `getSoundStats()`) to the output.
- **One-shots**: `play(name, { gain, rate, pan, delay })` plays a sound of the bank on the controls bus, `delay` s from now.
  - Each play draws a take other than the last one, a rate within ±`sound.variation` cents and a gain within ±1.5 dB, both scaled by the sound's `vary`.
  - A sound may have at most `voices` copies playing at once. A sound asked for less than `gap` s after the last one plays no new voice; half its level is added to the last one's instead (detents passed in a single frame sound as one louder click).
  - Each decoded buffer starts 1 ms before its sound comes within 40 dB of its peak, past any silence a decoder put before it.
- **Mute**: the master fades to 0 (time constant 0.08 s) and the context then suspends, so the ambience pauses where it is, as below; turned back on, it goes on from there ([fade in](#the-ambience)).
- **Pause**: while the page is hidden (`visibilitychange`) or the window has lost the focus (`blur`), the master fades out the same way and the context suspends, so every sound stops where it is, the ambience included. Back (`focus`, the page shown again, or a press in it), the context resumes, unless muted, and the master fades in with a time constant of 0.3 s.
- **Stats**: `stats()` returns the context's state, whether the sounds are decoded, the mute, the pause and the play count of each sound (with the glass harp's quiet `glass`es and louder `glass-lead`s), plus the peak and RMS of the master (dBFS) since the last call. The analyser is read once a frame, so a sound played while the main thread is blocked (`capture()` while Snapshot saves) can escape the peak while it still plays in full.

The sound exists only with the interface: [`main.js`](../main.js) builds it inside the `?gui=0` check, so captures never create a context. `pnpm brand` renders the Open Graph image with the interface, but presses nothing, so it never creates one either.

[`main.js`](../main.js) wires it:
- It creates `AudioEngine`, `CameraFoley` and `Ambience`.
- It passes `onCue` to the HUD.
- Its own `requestAnimationFrame` loop calls `audio.update()`, `ambience.update()` and `foley.update(dt, …)`, with the knobs' levels (`zoomProgress()` and `apertureProgress()`, unclamped), their elasticities, the f-number, `app.frozen` and `app.converged`.
- A listener on `app.listeners` cues the mirror on `'frozen'`, and `savePng()` cues the focus beep and the shutter.

The app itself emits no events; everything is read per frame.

## The Camera Foley

[`src/audio/cameraFoley.js`](../src/audio/cameraFoley.js) (`CameraFoley`) turns the HUD's cues and the camera's motion into sounds. [`src/audio/foley.js`](../src/audio/foley.js) * holds its arithmetic, [`src/audio/soundBank.js`](../src/audio/soundBank.js) * the bank (takes or synth, with `synthTakes` buffers of a synth, the `sound.volumes` leaf of the gain, `vary`, `voices`, `gap`) and [`src/audio/synth.js`](../src/audio/synth.js) * the synthesized buffers.

| Event | Where it comes from | Sound |
| --- | --- | --- |
| A press on +, −, a skin tone, Random eye, More info or the sound toggle | `pointerdown` (or a click from the keyboard, `detail` 0): `sounding()` in [`src/ui/hud.js`](../src/ui/hud.js) and `main.js` | `press`: a DSLR button's click (3 takes). A skin tone makes this click only. |
| A tap on a knob (a click without a drag), and the volume slider let go or stepped by a key | `trackKnob()`'s release; the slider's `pointerup` and `keydown` in `main.js` | `press`, 0.6 as loud (for the slider, at its new level) |
| A mouse entering a control (the HUD's buttons and knobs, Snapshot, More info, the sound toggle, the volume slider, the credit's **rockbiter** link) | `pointerenter` (mouse only), and only if the mouse moved in the last 150 ms, so a knob sliding under a still mouse is silent | `tick`: 4 ms of high noise (synthesized) |
| The zoom moving | `crossings()` of `zoomProgress()`, `sound.zoomDetents` (16) across the knob's track: a drag, the wheel (over the canvas or the knob), the keys, + and −'s glide, a snap, a spring back | `zoom`: a Nikon FM2's dial (5 takes) played 1.3 to 1.45 times as fast, higher as it zooms in |
| The f-number moving | `crossings()` of `stops()` (2·log₂ N), `sound.detents` (6) per stop, about 14 across the knob's track: the knob, the wheel over it, a right-drag, the keys, a glide | finer and lighter than the zoom's, by `sound.apertureTicks`: `aperture`, the pawl of a bicycle's freewheel (5 ticks, 23–30 ms, `freewheel`), or `apertureFine`, a synthesized tick (`fine`: a 0.25 ms knock ringing three small metal modes near 4.2, 6.9 and 9.8 kHz that die in 0.6–1.4 ms, 6 ms in all, 5 tunings); played 1 to 1.15 times as fast, higher as it stops down |
| A knob pulled past its end | `overshoot()` of the level against its elasticity | the creak: a sawtooth (stick-slip, 16–62 Hz) ringing a band-pass (650–1750 Hz, Q 9) as it is pulled further, louder while it moves (`strainDrive()`) |
| Random eye | its click (`random` cue) | `advance`: the film advance lever of a Minolta XE-7 (`sound.film` `lever`), or `wind`: the motor winder of a point-and-shoot (`motor`) |
| Snapshot (and the panel's Save PNG) | `savePng()` | `beep`, then 0.22 s later `shutter`: a Minolta XE-7 firing |
| Photo mode on and off | the `'frozen'` notification | `mirrorUp` and `mirrorDown`: the first and the last part of the same shot |
| The photo converging | `app.converged` turning true while frozen, at most once a second | `beep`: two 2.8 kHz blips of 55 ms, 45 ms apart, the autofocus confirmation (synthesized) |

- **Detents**: `crossings(from, to, step)` counts a detent when it is reached, not when it is left, signed with the move. A move that starts on a detent does not count it again. The detents a frame crossed (at most 8) play spread evenly over the next frame's time (`delay`), so a fast turn keeps its density at any frame rate; clicks closer than a sound's `gap` (12 ms for the zoom, 8 ms for the aperture) merge. The zoom's detents follow the camera, whatever moves it, so a glide of + or − runs through them as a quick ratchet.
- **Panning**: a cue's control pans with its place on the screen, 0.6 at the window's edges, so the tones sound from the left and the zoom from the right. The detents and the beep of a converged photo pan a little to the right; the mirror sits in the middle.
- **Smoothing**: the creak follows the knobs' speeds with a time constant of 0.04 s (`follow()` of [`src/camera/orbitMotion.js`](../src/camera/orbitMotion.js)), and its gain, rate and resonance follow with 0.03 s.

## The Ambience

[`src/audio/ambience.js`](../src/audio/ambience.js) (`Ambience`) plays a glass harp on the ambience bus; [`src/audio/soundscape.js`](../src/audio/soundscape.js) * holds its arithmetic and [`src/audio/impulse.js`](../src/audio/impulse.js) * its reverb. A wine glass rubbed with a wet finger sings a nearly pure tone: its fundamental, a few weak harmonics from the finger's stick-slip, and a slow beat between the two halves of its rim's mode. The tone rises with the finger's pressure, swells with its speed and rings on once the finger lifts.

- **Tuning** (`glassNotes()`): the major pentatonic of `sound.glassKey`, from a fourth below its tonic to a little over an octave above, ten glasses (in D, A4 at 440 Hz to F♯6 at 1480 Hz; the keys span D4 to A6 between them). A pentatonic has no semitones, so no two glasses clash.
- **Quiet glasses**: whenever fewer than `sound.glasses` are still rising or singing, after a wait of 1.5–6 s (`nextQuietGlass()`), a new one starts, so they take turns and overlap. A glass ringing on after its finger lifts leaves room for the next.
- **Louder glasses**: `sound.leadRate` a minute on average (`nextLoudGlass()`: an exponential wait of at least 8 s), one at a time, in the upper half of the glasses.
- **The note** (`pickNote()`): a glass not already sounding, likelier the better it sounds with those that are (`consonance()`: thirds, fourths, fifths, sixths and octaves +1 each, seconds and sevenths −1, weighted by e to the sum).
- **The voice** (`glassVoice()`): each glass draws its own:

  | | Quiet | Louder |
  | --- | --- | --- |
  | Level | 0.45–1 of 0.08 | 0.85–1 of 0.24 |
  | Rise (a sin² curve) | 2.5–5 s | 1.5–3 s |
  | Hold | 6–14 s | 3–7 s |
  | Ring on (a time constant) | 1.2–2.5 s | 2–3.5 s |
  | Beat (Hz) | 0.4–1.8 | 0.8–2.4 |
  | Swell (rate, depth) | 0.12–0.3 Hz, 10–22% | 0.12–0.3 Hz, 20–30% |
  | Harmonics | as below | 1.6 times louder |
  | Pan | ±0.6 | ±0.3 |

- **The tone**: the fundamental at 1 − `twin` and a twin `beat` Hz above it at `twin` (0.15–0.35), which beat together; the 2nd, 3rd and 4th harmonics at 0.07, 0.025 and 0.01 (`GLASS_HARMONICS`), none above 0.9 of the Nyquist frequency. While the finger rubs, a whisper of friction joins them: a looped white noise shared by every glass, through a band-pass on the note (Q 30), about 35 dB under the tone.
- **The space**: 35% of the glasses ring dry, and all of them go through a convolution reverb whose impulse response is synthesized (`impulseResponse()`: two channels of seeded noise falling 60 dB in 7 s, their highs dying sooner, after a 12 ms predelay). The quiet glasses and the louder ones have their own volumes, `sound.volumes.glasses` and `.lead`.
- **Speed**: `setSpeed(rate)` plays the glass harp `rate` times as fast, as a tape sped up: a constant source holds 1200·log₂ `rate` cents and feeds the detune of every glass's oscillators (the fundamentals, the twins, the harmonics and the swell) and of its friction band, so the glasses sound higher, beat and swell faster, eased with a time constant of 0.03 s. The volume slider pulled past its right end sets it, from 1 up to `sound.stretchRate` at the furthest the handle can run, and pulled past its left end (a spring squeezing the credit line), from 1 down to `sound.squeezeRate` at the limit ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)).
- **Fade in**: once the sound starts (the first press or key), the ambience rises from silence along a sin² curve over `sound.fadeIn` s (`fadeCurve()`), its first glass starting at once. Only then: a mute (the sound toggle, M, or the volume slider down to zero) pauses it with the context, and turned back on it rises again along the same curve, but over `sound.resumeFade` s, its glasses going on where they were (`resume()`); a first fade in still under way goes on instead.

## Parameters

The `sound` group of [`src/params/paramSchema.js`](../src/params/paramSchema.js): every leaf is `uniform`, read once a frame or at each play. The mute is the viewer's, not a parameter. The viewer's volume is `volume` itself: the slider beside the sound toggle sets it (in the params and a running transition's target, without a change that would restart the image; the panel reads it back), the browser keeps it (`random-eyes:volume`) over the default, and a preset keeps it.

| Leaf | Default | Effect |
| --- | --- | --- |
| `volume` | 0.64 | The master volume, over every sound; the volume slider sets it. |
| `volumes.press`, `.hover`, `.zoom`, `.aperture`, `.strain`, `.advance`, `.shutter`, `.mirror`, `.beep` | 0.35, 0.3, 0.2, 0.15, 0.35, 0.42, 0.56, 0.35, 0.08 | Each sound's own volume, under the master (`advance` also sets `wind`, `aperture` both kinds of ticks, `beep` both beeps). |
| `volumes.glasses`, `.lead` | 0.22, 0.3 | The glass harp's quiet glasses and its louder ones. |
| `variation` | 60 cents | How far a sound's pitch varies from one play to the next. |
| `zoomDetents` | 16 | The zoom ring's detents across the knob's track. |
| `detents` | 6 per stop | The aperture ring's detents. |
| `apertureTicks` | `freewheel` | The aperture's ticks: `freewheel` (recorded) or `fine` (synthesized). |
| `film` | `lever` | Random eye's film advance: `lever` or `motor`. |
| `glasses` | 3 | The quiet glasses singing at once; 0 for none. |
| `leadRate` | 1.5 per minute | The louder glasses, on average; 0 for none. |
| `glassKey` | `D` | The key the glasses are tuned to: `C`, `D`, `E`, `F`, `G` or `A`. |
| `fadeIn` | 10 s | How slowly the glass harp fades in at the first gesture. |
| `resumeFade` | 2 s | How quickly it fades back in where it was after a mute. |
| `stretch` | 200 px | How far the volume slider's handle can run past its right end. |
| `stretchRate` | 2× | The glass harp's speed with the handle at that limit. |
| `squeeze` | 0.5 | How far the volume slider pulled past its left end squeezes the credit line, as a share of its width. |
| `squeezeRate` | 0.5× | The glass harp's speed with the credit line squeezed that far. |

## Recordings

The recorded sounds are cut from CC0 recordings on Freesound. CC0 needs no attribution; [`src/audio/sounds/CREDITS.md`](../src/audio/sounds/CREDITS.md) names them anyway.

| Source | Freesound | Sounds |
| --- | --- | --- |
| Minolta XE-7, single shots and film advance (kyles) | [637342](https://freesound.org/s/637342/) | `shutter`, `mirror-up`, `mirror-down`, `advance` |
| 80s point-and-shoot film camera (RealSquink) | [851291](https://freesound.org/s/851291/) | `wind` |
| Nikon FM2 dial (hmilleo) | [412546](https://freesound.org/s/412546/) | `dial-1` to `dial-5` |
| DSLR camera sounds (Rvgerxini) | [571483](https://freesound.org/s/571483/) | `press-1` to `press-3` |
| Bike freewheel (donkpow) | [161966](https://freesound.org/s/161966/) | `freewheel-1` to `freewheel-5` (single ticks, high-passed at 1.5 kHz to drop the hub's hum) |

`pnpm sounds` ([`scripts/sounds.mjs`](../scripts/sounds.mjs), which needs ffmpeg with libmp3lame) builds them into [`src/audio/sounds/`](../src/audio/sounds/), about 100 KB in all.
- **Download**: it fetches each source's HQ preview, which needs no account, into `node_modules/.cache/eye-sounds/`.
- **Cutting**: [`scripts/sounds.json`](../scripts/sounds.json) gives each cut: `start` and `duration` (s), an optional `highpass` (Hz, 40 by default), `gate` (dB under the peak below which the floor is pushed down), `fadeIn` and `fadeOut`, `peak` (dBFS, −1 by default) and `loop`.
- **Processing**: each cut is high-passed and gated. A one-shot is moved to start 2 ms before its 1 ms loudness first comes within 20 dB of its peak, faded, normalized and written as mono MP3 at 44.1 kHz (VBR, `-q:a 2`). A loop (none at present) has its last `loop` s crossfaded into its head and is written as WAV, whose decoders add no padding.
- **Credits**: the script writes `CREDITS.md`. It does not delete the files of cuts removed from the manifest.

The files are committed, so ffmpeg is needed only to cut them again. Vite inlines the files under 4 KB as data URLs.

The cuts were chosen from measurements (onsets, transients, spectral flatness and centroid, waveforms and spectrograms), not by ear. To change a sound, edit its cut or source in the manifest and run `pnpm sounds` (`--only <name>` for one).

## Tuning and Checking

- **By ear**: with `#debug`, the panel's `sound` folder holds the master volume, a `volumes` folder with each sound's volume, then **listen to** (a list of the bank's sounds) and **Play sound** (`audition` in `main.js`), then the rest of the group. **Export defaults JSON** writes them into `defaults.json`.
- **By numbers**: `__EYE__.getSoundStats()` (with the interface only). The measured levels in headless Chrome at 1600 × 1000 with the defaults (dBFS) are:

  | Sound | Peak |
  | --- | --- |
  | The clicks, the film advance, the mirror and the shutter | −11 to −16 |
  | The hover's tick | −17 |
  | The zoom's detents | −15 to −21 |
  | The aperture's ticks (either kind) | −16 to −23 |

  The glass harp alone, measured as RMS over 15 s windows: its quiet glasses rise to −44 dBFS about 12 s after the first press with the 10 s fade (−86, −58, −46 and −44 dBFS at 3, 6, 9 and 12 s), then sing at −41 to −46 dBFS, peaking at −32 to −35; the louder glasses peak at −27 dBFS.

  The foley is silent at rest, and so is the orbit.
