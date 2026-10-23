# Architecture

## Runtime Map

`*` marks pure modules: no three.js objects or browser state, unit-tested in Node.

| Module | Responsibility |
| --- | --- |
| [`main.js`](../main.js) | Bootstrap: URL flags, params (preset, then `?state=`; the presets imported only for `?preset=`), `RenderSetup`, `EyeApp`, and, unless `?gui=0`, the frame around the page, the HUD (the skin tones, Zoom in, the zoom knob, Zoom out, the aperture knob on desktops, Random eye, and the Sharingan on desktops), the title, the tab's title while the page is hidden, the T-800's eye in the console and its report of each shot of the volume cannon, the credit line with the sound toggle and the volume slider, the checklist (the controls' reports, one task at a time without a fine pointer, its progress kept in the browser with the skin tones worn, which unlock the hidden tone; a desktop's done in full unlocks the Sharingan, whose button picks the patterns (`pickPattern()`) and which Random eye and Reset take off), the viewport size, the frame rate and photo mode's state (desktops), the sound design (the audio engine and the camera foley, fed once a frame by a loop of their own), the intro (held until the app has started, the fonts have loaded and the color tables of its reel of random irises are built, then played; its camera's framings and moves, and the irises it switches through); on request only, the development tools ([`src/debug/devTools.js`](../src/debug/devTools.js), [`docs/DEVELOPMENT.md`](DEVELOPMENT.md#url-flags)). Builds the target params of presets (which keep the viewer's `sound.volume`), random eyes, zooms, the aperture knob's spring back and skin tones, and sets the zoom and aperture levels, including the HUD’s elastic drags and the right-drag over the image (`sideDrag`), and supplies unclamped progress for their return; on portrait screens the start-up params and presets take `camera.targetZ` 0. |
| [`src/app.js`](../src/app.js) | `EyeApp`: owns every system and the frame loop; routes parameter changes by schema `kind`; runs transitions, and switches leaves at once without one (`switchParams()`, the intro's shuffle of irises); poses the eye, its blinks held until the intro ends (`holdBlinks()`); drives the accumulation; the calls of the snapshot and the development tools (`getState()`, `setParams()`, `capture()`, `renderInteractive()`). |
| [`src/renderSetup.js`](../src/renderSetup.js) | Renderer, scene, window size, the phone profile (`mobile`) and the adaptive pixel ratio. |
| **Parameters** | |
| [`src/params/paramSchema.js`](../src/params/paramSchema.js) * | `PARAM_SCHEMA`: every tunable value with default, range, unit and `kind`, the defaults taken from `defaults.json`; `BASE_PARAM_SCHEMA`, the same with the fallback defaults; `DEBUG_VIEWS`. |
| [`src/params/defaults.json`](../src/params/defaults.json) | The default values, as exported by the panel's **Export defaults JSON**. |
| [`src/params/params.js`](../src/params/params.js) * | Create, sanitize, get/set by path, diff, overrides, state encoding, all values (the export) and schema defaults from values. |
| [`src/params/paramTransition.js`](../src/params/paramTransition.js) * | Transitions: numbers and colors glide to a target, the rest switches, lights fade. |
| [`src/params/presets.js`](../src/params/presets.js) * | Named partial overrides, one per reference photograph. |
| [`src/params/populationPriors.js`](../src/params/populationPriors.js) * | The random eye: features sampled from measured frequencies by ancestry, mapped onto parameters; the irises of a reel of random eyes, light and dark taking turns (`randomIrises()`, the intro's shuffle). |
| [`src/params/skinTones.js`](../src/params/skinTones.js) * | `SKIN_TONES`: the `skin.color` values of the skin buttons, light to deep; `SECRET_TONE`, the HUD's hidden one. |
| **Eye** | |
| [`src/eye/eyeProfile.js`](../src/eye/eyeProfile.js) * | Eye geometry in eye space (profile, chamber, lens, iris shell) and its uniform packing. |
| [`src/eye/cornealOptics.js`](../src/eye/cornealOptics.js) * | Snell, Fresnel, ray–surface intersections, two-surface corneal trace, entrance pupil. |
| [`src/eye/eyeballGeometry.js`](../src/eye/eyeballGeometry.js) | The eyeball mesh with its cap and sclera groups, coarse on purpose (the shaders refine the surface): rings and columns by the surface's bend, looser where the lids always cover it. |
| [`src/eye/eyeball.js`](../src/eye/eyeball.js) | The eyeball mesh, its two `ShaderMaterial`s and their shared uniforms (optics, iris, sclera, lid reflections). |
| [`src/eye/eyeRig.js`](../src/eye/eyeRig.js) | Pivot (the globe's center, gaze) and eye-space group; world↔eye matrices. |
| [`src/eye/sharinganPatterns.js`](../src/eye/sharinganPatterns.js) * | The Sharingan easter egg's patterns ([`docs/IRIS.md`](IRIS.md#sharingan)): the 18 Sharingan and the Rinnegan as compass constructions (`PATTERNS`), their packing for the shader, the CPU twin of their paint (`paintPattern()`, `patternShade()`), each shape's bounds, the button's pick (`pickPattern()`), the glides of its motion; the disc's and the maps' constants (`SHARINGAN_DEFINES`). |
| [`src/eye/sharingan.js`](../src/eye/sharingan.js) | `Sharingan`: the pattern shown, its motion on its own clock (`show()`, `hide()`, `step()`), the pupil it narrows to, the maps of the patterns on show baked on the GPU (`prepare()`), and the uniforms the eyeball's programs share. |
| **Iris** ([`docs/IRIS.md`](IRIS.md)) | |
| [`src/iris/irisSpace.js`](../src/iris/irisSpace.js) * | Rest space and its deformation with the pupil. |
| [`src/iris/irisFeatures.js`](../src/iris/irisFeatures.js) * | Thickness profile, collarette curve, furrows, freckles (seeded). |
| [`src/iris/irisAtlas.js`](../src/iris/irisAtlas.js) | GPU bake of the structure and pigment atlases. |
| [`src/iris/irisColor.js`](../src/iris/irisColor.js) * | Spectral Kubelka–Munk model of the iris layers and its lookup table. |
| [`src/iris/irisColorLut.js`](../src/iris/irisColorLut.js) | The lookup as a half-float `Data3DTexture`, rebuilt when the layer model changes, crossfaded during transitions; the last 32 tables kept by their model, and tables built ahead in workers (`prepare()`, `has()`). |
| [`src/iris/irisColorLut.worker.js`](../src/iris/irisColorLut.worker.js) | Builds the tables `prepare()` asks for off the main thread, a few milliseconds each. |
| **Adnexa and sclera** ([`docs/ADNEXA.md`](ADNEXA.md)) | |
| [`src/adnexa/fissure.js`](../src/adnexa/fissure.js) * | The palpebral fissure: the margins between the canthi, their closure. |
| [`src/adnexa/periocular.js`](../src/adnexa/periocular.js) * | The margins' support, the conjunctiva with the lacus, caruncle and plica, the face around the orbit (thin-plate spline). |
| [`src/adnexa/lidGeometry.js`](../src/adnexa/lidGeometry.js) * | The lid ring (columns, profile, shell turning into the face, laid out by its curvature) and the patch's edge, the conjunctiva, palpebral conjunctiva and meniscus meshes. |
| [`src/adnexa/backShell.js`](../src/adnexa/backShell.js) * | The back shell closing the skin patch: the flat band along its edge and the dome following the face behind, as thick as the lids and the globe in front of its cut need; the hidden conjunctiva brought inside it; the globe's cut plane. |
| [`src/adnexa/lidOcclusion.js`](../src/adnexa/lidOcclusion.js) * | Ambient occlusion baked into the lid and conjunctiva vertices (horizon-based, over a front height field; by depth into the sac). |
| [`src/adnexa/lashGenerator.js`](../src/adnexa/lashGenerator.js) * | Seeded lash rows, curves and clumps. |
| [`src/adnexa/fissureMap.js`](../src/adnexa/fissureMap.js) * | Signed distance to the fissure, baked for the shaders. |
| [`src/adnexa/blinkFrames.js`](../src/adnexa/blinkFrames.js) * | The blink's closing frames: the lid ring (with its occlusion), the meniscus and the lashes closed by steps, and the closed fissure map; the spline weights between them. |
| [`src/adnexa/blinkFrames.worker.js`](../src/adnexa/blinkFrames.worker.js) | Builds the blink's frames off the main thread (the only worker). |
| [`src/adnexa/lidBlink.js`](../src/adnexa/lidBlink.js) | The blink on the GPU: asks the worker for the frames, puts them on the lid, lash and meniscus meshes (and the lids' and lashes' shadow proxies) as morph targets, sets the weights and `uLidBlink`. |
| [`src/adnexa/shadowProxy.js`](../src/adnexa/shadowProxy.js) * | Lighter stand-ins of the lid and lash meshes for the shadow passes, each vertex a fixed blend of at most two of the mesh's, and those blends applied to any of its attributes (the blink's frames too). |
| [`src/adnexa/shadowCaster.js`](../src/adnexa/shadowCaster.js) | A shadow proxy as a mesh on the shadow layer only, with its mesh's positions, gaze follow and blink frames. |
| [`src/adnexa/lids.js`](../src/adnexa/lids.js), [`lashes.js`](../src/adnexa/lashes.js), [`tearFilm.js`](../src/adnexa/tearFilm.js) | The lid, back shell, lash and meniscus meshes with their materials. |
| [`src/adnexa/skinPattern.js`](../src/adnexa/skinPattern.js) | The skin's pigment patterns baked on the GPU over the lid mesh at rest. |
| [`src/adnexa/skinRelief.js`](../src/adnexa/skinRelief.js) | The skin's relief and freckles baked on the GPU over the same box, read outside `#debug`. |
| [`src/sclera/vesselGenerator.js`](../src/sclera/vesselGenerator.js) * | Seeded episcleral and conjunctival vessel network. |
| [`src/sclera/scleraMaps.js`](../src/sclera/scleraMaps.js) | The network rasterized into the polar vessel map, when its parameters or the globe change. |
| **Animation** ([`docs/ANIMATION.md`](ANIMATION.md)) | |
| [`src/animation/pupilDynamics.js`](../src/animation/pupilDynamics.js) * | Watson–Yellott steady state, Pamplona dynamics, hippus. |
| [`src/animation/gaze.js`](../src/animation/gaze.js) * | Saccades, microsaccades, drift, Listing's law. |
| [`src/animation/blink.js`](../src/animation/blink.js) * | Spontaneous and gaze-evoked blinks: when, how deep, the closure over time. |
| [`src/animation/animator.js`](../src/animation/animator.js) * | Pupil, gaze, lid follow and blink per step; the still pose. |
| **Lighting and camera** ([`docs/OPTICS.md`](OPTICS.md)) | |
| [`src/lighting/envRig.js`](../src/lighting/envRig.js) * | Builds and packs the analytic emitters; background terms; scene luminance. |
| [`src/lighting/colorTemperature.js`](../src/lighting/colorTemperature.js) * | Black-body and sRGB color conversions. |
| [`src/lighting/lightRig.js`](../src/lighting/lightRig.js) | Per-frame env uniforms in eye space and in world space. |
| [`src/lighting/keyShadow.js`](../src/lighting/keyShadow.js) | The key light's shadow map of the lids and lashes; the caster draw the light shafts reuse. |
| [`src/lighting/shadowCoverage.js`](../src/lighting/shadowCoverage.js) | A light's soft coverage: its shadow map reduced and blurred, with the globe's disc, for the dust, the shafts and the floor shadow. |
| [`src/lighting/shaftLight.js`](../src/lighting/shaftLight.js) | The light shafts' source, cookie (baked on the GPU), uniforms (surfaces, dust, air) and perspective shadow. |
| [`src/camera/cameraOptics.js`](../src/camera/cameraOptics.js) * | Thin-lens formulas, blur circle, lens-shift projection shear. |
| [`src/camera/lensSampling.js`](../src/camera/lensSampling.js) * | Halton and concentric-disk samples (pixel, lens, light). |
| [`src/camera/physicalCamera.js`](../src/camera/physicalCamera.js) | The macro `PerspectiveCamera`, placed and sheared per sample, turned by the parallax (`orbitOffset`) and the intro (`roll`) outside the params; its `pinhole` matrices before the sample's jitter place the dust. |
| [`src/camera/orbitMotion.js`](../src/camera/orbitMotion.js) * | The orbit's release speed and coasting, the mouse parallax's reach by zoom level and its lagged follow. |
| [`src/camera/cameraControls.js`](../src/camera/cameraControls.js) | Pointer orbit (with inertia) and distance, and the f-number from the wheel over the HUD's aperture knob, written into `params.camera`; a right-drag's horizontal motion, handed to `sideDrag` (`main.js`); the mouse parallax, a turn of the orbit outside the params. |
| **Atmosphere** ([`docs/RENDERING.md`](RENDERING.md#dust-and-haze)) | |
| [`src/atmosphere/dustField.js`](../src/atmosphere/dustField.js) * | Seeded dust motes (fibers, flakes, crossed fibers) in a unit cube, the lights the haze scatters, an emitter's irradiance, the Henyey–Greenstein phase. |
| [`src/atmosphere/lightShafts.js`](../src/atmosphere/lightShafts.js) * | Seeded light blades in their cross-section, their geometry from the source, the cookie's blades and its bake (the GPU's twin), a blade's integral along a ray ([`docs/RENDERING.md`](RENDERING.md#light-shafts)). |
| **Render and tools** ([`docs/RENDERING.md`](RENDERING.md)) | |
| [`src/render/postProcessing.js`](../src/render/postProcessing.js) | The composer: scene pass, accumulation, depth of field, dust, effects, antialiasing of fresh frames (FXAA) and grain, or the effects and the grain in one pass where FXAA has no weight; samples only accumulated (`render(false)`). |
| [`src/render/scenePass.js`](../src/render/scenePass.js) | The scene into the composer's buffer; with `quality.splitShading` (off by default) living frames split into a full-resolution sharp share and a half-resolution blurred one. |
| [`src/render/accumulationPass.js`](../src/render/accumulationPass.js) | Progressive mean of still frames in a float history; living frames pass through. |
| [`src/render/dofPass.js`](../src/render/dofPass.js) | Interactive depth of field (half-resolution prepare, tile bounds and gather), composited over the accumulated mean; the haze and the light shafts in the air. |
| [`src/render/backdrop.js`](../src/render/backdrop.js) | The backdrop triangle, in every view: the clear color, with the patch's soft shadow on a floor in the beauty view ([`docs/RENDERING.md`](RENDERING.md#backdrop-shadow)). |
| [`src/render/drawOrder.js`](../src/render/drawOrder.js) | The scene's draw order (`renderOrder` per mesh), written out rather than left to the renderer's sort. |
| [`src/render/dustPass.js`](../src/render/dustPass.js) | The dust motes as their images blurred by the lens, added over the depth of field's output before the effects. |
| [`src/render/pngMetadata.js`](../src/render/pngMetadata.js) * | `tEXt` chunks and CRC for exported PNGs. |
| [`src/render/precompile.js`](../src/render/precompile.js) | The start-up compile: each job a scene, a camera, a target and the material swaps of its variants, all through `compileAsync()`. |
| [`src/debug/devTools.js`](../src/debug/devTools.js) | The development tools, a chunk loaded only on request: the console API, the frame telemetry, the presets, the panel, the mesh tree, the sound meter and the `?stats` overlay ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#url-flags)). |
| [`src/debug/frameStats.js`](../src/debug/frameStats.js) | Frame telemetry (CPU and GPU time, frame intervals, draw calls), from the moment the development tools load. |
| [`src/debug/panel.js`](../src/debug/panel.js) | The panel of `#debug`: the schema's folders, the actions, the random ancestry, the transition and the sound audition. |
| [`src/debug/gui.js`](../src/debug/gui.js) | Tweakpane panel generated from the schema. |
| [`src/debug/meshTree.js`](../src/debug/meshTree.js) | The mesh tree of `?meshtree=1`: the scene graph at the left, with each object's visibility and each mesh's wireframe and vertex count ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#mesh-tree)). |
| [`src/debug/debugViews.js`](../src/debug/debugViews.js) * | Debug view numbering (`DEBUG_VIEW` define). |
| [`src/ui/hud.js`](../src/ui/hud.js) | The HUD: a dashed circle around the eye (two on a portrait box, the zoom on the wider one, kept above the footer by `reserveBottom()`), cut around each button, with flat square reticles, animated selection brackets, two counter-rotating segmented zoom rings and the square zoom marker sliding along it with resisted overshoot and snap on release, and on desktops the aperture knob's lens in profile across the circle outside it, along a dashed arc marking its track, the f-number beside the zoom value and the tones' arcs scaled with the aperture (both knobs are `trackKnob()`s); `main.js` gives it the actions. Its layers sit in groups of their own (an SVG `<g>` per circle, a `.hud-layer` wrapper per segmented ring), which `introLayers()` hands the intro with their radii, buttons and readouts. It also has the hidden tone (`secretTone`): a button one spacing past the deepest, never seen and without a cut in the circle, pressable once `unlockSecret(true)`; and on desktops (`onSharingan`) the Sharingan's button below Random eye, hidden and without a cut until `unlockSharingan(true)`, which can bring it in; `circle()` gives `main.js` its circle in the window, the checklist's room. |
| [`src/ui/intro.js`](../src/ui/intro.js) | The intro: `INTRO`, the timeline's times and eases, and `createIntro()`, one GSAP timeline of six parts (`reveal`, `camera`, `shuffle`, `hud`, `frame`, `texts`) and the eye's first blink after them built from the page as it is laid out, cleaned up when it ends (`?intro=dev` keeps it and loads GSDevTools), then `onEnd()` (the checklist comes in) ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#intro)). |
| [`src/ui/introLayout.js`](../src/ui/introLayout.js) * | The intro's geometry: the black mask's polygon ahead of its diagonal cut (`revealPolygon()`), the clips that draw the frame's sides clockwise and show its brackets (`frameLineClip()`, `frameBracketClip()`), a masked line's slide and clip (`maskedLine()`), the camera's geometric glide (`framingBetween()`), the steadily slowing reel of irises (`reelEase()`), the HUD's layers from the center outward (`outwardRanks()`) and buttons in clockwise order (`clockwise()`). |
| [`src/ui/consoleArt.js`](../src/ui/consoleArt.js) * | The T-800 in the console: its eye computed from circles in the console's cells (`EYE`, `terminatorEye()`) and its readout with the volume cannon's hints, as `console.log()` arguments, runs of one style each on black (`terminatorLog()`); the numbered, shuffled reports of the shots that hit Snapshot (`createShotLog()`, its last line `line` and that report as a file name, `name`, the photo's; `SHOTS`). |
| [`src/ui/checklist.js`](../src/ui/checklist.js) | The checklist: its title, the tasks done (dimmed), the one to do and a dot for each one left; a task done dims and the next one scrambles in (GSAP's ScrambleTextPlugin), and **Reset** scrambles them out from the last and starts again; `compact` (phones and tablets) shows the task to do alone, scrambling out when done; `fit()` sizes it to the room `main.js` measures, hiding it where there is too little ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)). |
| [`src/ui/checklistTasks.js`](../src/ui/checklistTasks.js) * | The checklist's `TASKS` (the controls first, then achievements that only hint) and `createProgress()`: only the task shown counts, a counted one needs as many different keys as it is given, its state saves and comes back by id, and `reset()` starts again. |
| [`src/ui/splitLines.js`](../src/ui/splitLines.js) | A text split into blocks of its laid-out lines for the intro, links and controls moved whole into them, and put back as it was. |
| [`src/ui/hudLayout.js`](../src/ui/hudLayout.js) * | The HUD's circle (`HUD.scale` times the one inscribed in its box, or smaller until its buttons fit), on a portrait box split from the zoom's wider circle (`HUD.split`, `zoomRadius()`), and every button's angle on them; the knob's track, its angle at a zoom level and back, and the endpoints a released drag snaps to and its bounded elastic overshoot; the unclamped camera progress and bounded zoom level of a camera distance (log scale) and back; the aperture knob's circle, length, lens and track (`apertureRadius()`, `apertureLength()`, `apertureLens()`, `apertureTrack()`) and the dashed arc of that track (`apertureTrackArc()`), and how far the knob, pulled past an end, drags that arc, the zoom slider, the tones' arcs and Random eye (with the Sharingan) along (`apertureFollowTurn()`); the Sharingan's place, `HUD.sharingan.spacing` past Random eye, kept in the fit when the HUD has it (`sharingan`); the zoom's track drawn over the zoom's circle with the circle's own dashes, also turned with it (`zoomTrackArc()`, `circleDashes()`), its level of an f-number (log scale) and back, and the tones' arcs' scale at that level (`apertureArcScale()`); the inner and outer segmented rings' fixed radius ratios, their turns at that level and their paths at the layout's size, with dashes in px (`orbitArt()`, `dashFit()`); the radius of every layer, for the intro (`hudLayerRadii()`). |
| **Audio** ([`docs/AUDIO.md`](AUDIO.md)) | |
| [`src/audio/audioEngine.js`](../src/audio/audioEngine.js) | `AudioEngine`: the context, created at the first gesture; the controls and ambience buses, the master (the master volume) and its limiter; fetching and decoding the recordings; one-shots with variation, voice limits, gaps and delays; the mute, and the pause of a hidden or unfocused page; the stats. |
| [`src/audio/cameraFoley.js`](../src/audio/cameraFoley.js) | `CameraFoley`: the HUD's cues as sounds (presses, hovers, Random eye and the Sharingan, Snapshot's beep and shutter, photo mode's mirror), and once a frame the sounds that follow the camera (the zoom's and the aperture's detents, the creak past a knob's end, the autofocus beep of a converged photo). |
| [`src/audio/foley.js`](../src/audio/foley.js) * | Detents crossed between two values, stops of an f-number, a level's overshoot and the creak's drive. |
| [`src/audio/soundBank.js`](../src/audio/soundBank.js) * | `SOUNDS`: each sound's takes or synth, the `sound.volumes` leaf of its level, its variation, voices and gap; `SOUND_FILES`. |
| [`src/audio/synth.js`](../src/audio/synth.js) * | The synthesized buffers: the hover's tick, the aperture's fine ticks and the autofocus beep. |
| [`src/audio/ambience.js`](../src/audio/ambience.js) | `Ambience`: the glass harp, quiet glasses singing in turn and now and then a louder one, each a few sine partials with a beating twin, a swell and a whisper of friction, in a convolution reverb; the slow fade in at the first gesture and the quicker one where it was after a mute; its speed (`setSpeed()`), which the volume slider pulled past its end raises. |
| [`src/audio/soundscape.js`](../src/audio/soundscape.js) * | The glass harp's tuning (a pentatonic per key), the note a new glass takes by its consonance with those singing, each glass's voice, the waits between glasses and the fade-in curve. |
| [`src/audio/impulse.js`](../src/audio/impulse.js) * | The reverb's synthetic impulse response. |
| [`src/meshLayout.js`](../src/meshLayout.js) * | Vertices spaced by the surface's bend (the chord's sagitta under a tolerance), density integrals and even placement under them, rings of different counts zipped by angle: for the lids, the back shell and the eyeball. |
| [`src/math.js`](../src/math.js) *, [`src/random.js`](../src/random.js) * | Scalar and vector helpers; seeds, PCG hash twin, weighted picks, Gaussian samples. |
| [`src/adaptivePixelRatio.js`](../src/adaptivePixelRatio.js) * | The adaptive resolution rules, with the phone profile ([Adaptive Resolution](#adaptive-resolution)). |

## Frame Loop

`EyeApp.start()` overlaps the compile with the CPU work of the first rebuild, and draws nothing before the first animation frame:

1. It hands every program of the post-processing and the bakes to `compileAsync()` (`precompile()`, [`src/render/precompile.js`](../src/render/precompile.js)): the scene pass, the accumulation, the depth of field's five materials, the dust, the effects and the antialiasing, the iris atlases, the skin's patterns, relief and freckles, the light shafts' cookie, the soft coverages' reduce and blur, and the Sharingan's maps. Each job draws into the target it will draw into, so the program cache keys match; where `KHR_parallel_shader_compile` exists the driver links them while the main thread goes on.
2. The initial rebuild; a living eye that blinks posts the blink's frames to the worker at once.
3. The scene's programs, now that its meshes carry their morph targets, with the lids' and lashes' shadow proxies drawn with the shadow map's material.
4. The initial bake, the skin's relief (outside `#debug`; `main.js` sets the mode from the hash before it, and again on every hash change through `setSkinBaked()`), and the camera and light rig of the first pose (its pupil weighs their light).
5. It waits for the programs (`getCompileMs()` records the whole start), and asks for the first frame.

`EyeApp.frame()` then runs on every animation frame:

1. **Transition** ([below](#transitions)): a running transition writes its next values, marks their kinds dirty, crossfades the color lookup and restarts the accumulation. Its time step is capped at 0.1 s, so a long frame does not skip it.
2. **Pending dirty kinds**
   - `rebuild`:
     - the eye geometry (`createEyeGeometry()`);
     - the entrance-pupil depth the camera aims at;
     - the eyeball mesh;
     - the lid mesh with the back shell (the lid ring about 0.35 s in Node on an M1), its skin patterns (baked on the GPU) and the fissure map (baked in JS into the first channel of a half-float texture, 0.1 s), only when the lids, `shell.clearance`, `shell.band` or the eye geometry changed;
     - the lashes and the tear film;
     - the blink's frames no longer fit: `LidBlink.invalidate()` keeps the lids open until a living eye asks for new ones (step 4).

     A rebuild always bakes too.
   - `bake`:
     - the iris rest space;
     - the structure atlas (GPU, under a millisecond), only when a structure leaf or the rest space (the iris's radius, the pupil and the collarette at rest) changed, and the pigment atlas, which reads the structure, when it or a color leaf changed;
     - the color lookup (spectral model in JS, a few milliseconds), only when the layer model changed, and not while it crossfades; a table kept or built ahead (`IrisColorLut.prepare()`) is only uploaded;
     - the scleral vessel map, only when its parameters or the globe changed.
   - `define`: the debug view define of the eyeball, lid, back shell and lash materials. The tone-mapping mode is set by the post-processing every frame; `postprocessing` recompiles it.
   - **Skin relief** (`bakeSkin()`): outside `#debug`, when no transition runs, the skin's relief and freckles bake again if the lid mesh, `lids.seed`, `skin.pores`, `skin.wrinkles` or `skin.freckles` changed (about 30 ms). These leaves stay of kind `uniform`: in `#debug` the skin reads them every frame.
3. **Controls**: `CameraControls.update()` steps a coasting orbit (which restarts the accumulation as a drag does) and the mouse parallax, which restarts it while it moves ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)).
4. **Pose** (`pose()`, [`docs/ANIMATION.md`](ANIMATION.md))
   - A living eye steps the animator and restarts the accumulation.
   - A living eye that blinks (`animation.blinkRate` above 0) asks for the blink's frames when they are stale: `LidBlink.prepare()` posts the params and the layout of the lids at rest to the worker, which builds them in about 0.6 s (in Node on an M1; a quarter of a second when only the lashes or the meniscus changed) while the frame loop runs on. The pose's blink sets the meshes' morph weights and `uLidBlink` (`LidBlink.set()`), 0 until the frames arrive ([`docs/ANIMATION.md`](ANIMATION.md#blink)).
   - In photo mode it keeps its instant, with the lids open.
   - A still eye (`animation.enabled` off) is posed by its parameters whenever the image restarts.
   - The pose also gives the line of sight the camera frames.
5. **Convergence**: once the accumulation holds `quality.photoSamples` samples, the frame returns. The canvas keeps the converged image. Out of photo mode the dust still drifts over it (`dustDrifts`): `renderDisplay()` shows the mean again with this instant's dust, at most 30 times a second, without the scene pass or a sample (the composite, the dust and the effects). The dust's clock (`dustTime`) runs with the frame time unless the eye is frozen.
6. **Adaptive resolution** ([below](#adaptive-resolution)): before a fresh frame is drawn, the interval since the last frame feeds the adaptive pixel ratio, when the frame before it was fresh too. Accumulating frames do not, because a resize restarts the accumulation, and neither does the first fresh frame after them, whose interval spans the pause. The resize comes before drawing: a canvas resized after it is cleared, and the browser would show a black frame.
7. **Render one sample** (`renderSample()`)
   - The first frame after a change is a fresh (interactive) frame. It is a pinhole frame with the cheaper shading tier and the interactive depth of field. When the next frame restarts the image anyway (a living eye, a running transition), it is shown without being kept in the accumulation ([`docs/RENDERING.md`](RENDERING.md#pipeline)); `capture()` then renders and keeps one first.
   - Later frames take `accumulationSample(n)`: a subpixel jitter, a point on the lens and a point on the key light.
   - **Accumulating** (`accumulate()`): an image that accumulates renders `batch` samples per animation frame. A fence marks the end of each frame's work; one more sample per frame after two frames whose work two frames back had finished, one fewer as soon as it had not, and the next try waits twice as long (`paceBatch()`: the interval between frames would not tell, the browser lets a busy GPU fall a few frames behind first). Every new image starts at one. The image is shown at its first frame, every `PREVIEW_INTERVAL` (150 ms) and at its last sample; the samples in between only render the scene and the blend (`PostProcessing.render(false)`), and the canvas keeps the last image shown.
   - The steps, in order:
     1. `PhysicalCamera` places the camera.
     2. The eye rig updates its matrices.
     3. `LightRig` rebuilds the emitters and packs them in eye space and in world space.
     4. `KeyShadow` renders the lid and lash shadow map from emitter 0, when it is a panel or a window; on fresh frames it reduces it into the key's soft coverage when the light, `backdrop.softness` or the lids changed (`refreshScene()`, after the mesh tree shows or hides an object, drops both coverages).
     5. `ShaftLight` sets the light shafts' source, blades (swaying and flickering on the dust's clock), cookie (baked again on the GPU when their layout changed or they moved, while they show) and light; on fresh frames it redraws their shadow and coverage when its inputs changed. Moving shafts restart the image every frame (`shaftsMove`), as a living eye does. `Backdrop` takes the clear color and the shadow plane.
     6. The Sharingan bakes the map of a pattern on show that no map holds yet (`prepare()`). The eyeball, lid and lash uniforms are refreshed from the params, the eyeball's pupil narrowed by the Sharingan's amount; the lashes' widening from the camera's distance between the screen's zoom distances (`lashWidening()`, [`docs/ADNEXA.md`](ADNEXA.md#lashes)).
     7. The post-processing updates the lens of the depth of field and its fade, then the haze, the shafts' origin and the dust (`updateAtmosphere()`: the pinhole camera, the rig and the dust's clock), then the composer renders.

## Adaptive Resolution

[`src/adaptivePixelRatio.js`](../src/adaptivePixelRatio.js) (pure, applied by `RenderSetup`) sets the pixel ratio between `quality.minPixelRatio` and the display's, capped at 2, from the intervals of consecutive fresh frames (`quality.adaptiveResolution`; `?dpr=` pins it):

- **Windows**: the intervals are gathered over windows of half a second, the slowest fifth of each left out (the hitches a lower resolution would not fix) and longer ones (250 ms: a compile, a hidden tab) skipped. A window is slow when its mean exceeds the budget, `maxFrameMs`.
- **Down**: four slow windows in a row (two seconds) lower the ratio by as many steps as the measured time asks for (the cost goes with the pixel count, the square of the ratio), at most `maxDropSteps`.
- **Up**: four windows within budget try a step higher. Two slow windows during a try undo it and double the wait before the next (up to 20 s); twenty windows (10 s) confirm it. `EyeApp.endTransition()` resets the wait: a new scene may hold a ratio that failed before.
- **Desktops** keep the budget at 36 ms (the iris targets 30 fps; a frame rate locked at 30 by vsync keeps its resolution), with steps of 0.2.
- **Phones and tablets** (`RenderSetup.mobile`: a coarse pointer, or `?mobile=1`) target 60 fps (`MOBILE_PIXEL_RATIO`: 20 ms, steps of 0.1, one step per drop). Under vsync a phone just slower than 16.7 ms a frame shows 30 fps, and a budget of 30 fps would hold it there for good, as a warming GPU does after a few minutes; at 60 fps it lowers the resolution a step at a time until 60 fps hold again, and tries the higher one later. `?stats` shows the ratio and its windows on the phone ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md#url-flags)).

## Parameter Routing

The panel, the camera controls and `window.__EYE__.setParams()` all edit the one params object.
- **Changes**: `EyeApp.onParamChange(path)` looks up the schema leaf, records its `kind` as dirty and restarts the accumulation. Values of kind `uniform` need nothing else, because every frame reads the params.
- **Listeners**: those added to `app.listeners` hear every change. The panel refreshes after camera moves, and at the start and end of transitions. The sound plays the mirror on `'frozen'` ([`docs/AUDIO.md`](AUDIO.md)). Tweakpane reports its own refreshes as changes; the panel ignores them, because they are not edits.
- **Bulk changes**: loading a preset, **Random eye** and the zoom buttons glide to their values ([Transitions](#transitions)); a zoom changes only `camera.distance` and `camera.sensorHeight` (the sensor the zoom sets there, [`docs/DEVELOPMENT.md`](DEVELOPMENT.md#controls)), over `zoom.duration`. `setParams()` ends a running transition, then replaces the values at once and marks everything for rebuild.

## Transitions

`EyeApp.transitionTo(target, duration)` carries the params to a full target params object, so the eye transforms in place. [`src/params/paramTransition.js`](../src/params/paramTransition.js) decides how each leaf gets there:

| Leaf | Change |
| --- | --- |
| Numbers and colors | Glide along a minimum-jerk curve; colors in linear sRGB. In-between values are not snapped to the slider step. |
| Toggles, choices, `discrete` numbers (seeds, counts), kinds `rebuild` and `define` | Switch at the start. Geometry cannot glide: a lid rebuild (the lid ring and the fissure map) takes about half a second. |
| A toggle that `fades` a sibling (a light's `enabled`) | Turns on at the start with its `intensity` gliding up from zero, or fades the intensity to zero and turns off at the end. |

- **Color lookup**: building it takes a few milliseconds of the main thread, too much for every frame of a glide. At the start, `IrisColorLut.beginBlend()` builds the target table once (or takes it kept); every frame then mixes the old and the new table with the transition's progress (`setBlend()`). The pigment atlas re-bakes every frame its leaves glide (under a millisecond), the structure atlas only while a structure leaf glides.
- **Pose**: when the transition changes where the pose comes from, the pose blends too ([`docs/ANIMATION.md`](ANIMATION.md#modes)).
- **Duration**: the panel's **transition (s)** (1 s by default; 0 switches at once); a zoom takes `zoom.duration`. Captures and `?preset=` at start-up do not glide.
- **Interruptions**:
  - Orbiting the camera cancels the camera's glides; the rest goes on. A transition stops a coasting orbit, which would cancel its camera glides.
  - A panel edit of a `uniform` leaf cancels that leaf's glide.
  - A panel edit of any other kind ends the transition on its target (the edited leaf keeps the edit), because the color lookup cannot crossfade under a rebuild.
  - A new preset or random eye starts from the current in-between values. A random eye keeps the target values of the groups it does not resample (`targetParams`).
  - A switch without a transition (`switchParams()`) writes its leaves into the running transition's target too and cancels their glides; the rest goes on.

## Parameters, Presets and the Random Eye

- **Schema**: [`src/params/paramSchema.js`](../src/params/paramSchema.js) defines the groups:
  - `eye`, `animation`;
  - `globe`, `cornea`, `chamber`, `limbus`;
  - `iris`, `irisStructure`, `irisColor`;
  - `lids`, `lashes`, `skin`, `shell` (the back shell), `sclera`;
  - `lighting`, `dust` (the motes and the haze), `shafts` (the light shafts), `backdrop` (the floor shadow), `camera`, `zoom` (the HUD's zoom distances and duration), `aperture` (the f-numbers at the ends of the HUD's aperture knob and its drag overshoot), `controls` (the mouse parallax, the wheel zoom's easing and the orbit's inertia), `sharingan` (the easter egg's colors, motion and odds, [`docs/IRIS.md`](IRIS.md#sharingan)), `post`, `quality`, `debug`.
- **Leaves**: each leaf is `{ default, min, max, step, unit, kind, label }`. A `#rrggbb` default is a color, `options` make a choice, and a boolean is a toggle.
- **Defaults**: [`src/params/defaults.json`](../src/params/defaults.json) holds the default values; the schema keeps what is tunable and how.
  - `paramSchema.js` writes `BASE_PARAM_SCHEMA` with a `default` per leaf, then `withDefaults()` replaces each default the file names (sanitized like any override) to make `PARAM_SCHEMA`. A leaf the file does not name, such as a new one, keeps the default written in the schema; a name the file has but the schema lacks is reported with a console warning.
  - Everything that starts from the defaults follows the file: the start-up params, the `default` preset, the presets laid over it, the groups the random eye resets, and the `?state=` strings, which store only the values that differ from it. A state string or a PNG saved before the file changed decodes against the new defaults.
  - **Export defaults JSON** in the panel downloads `defaults.json`: every value of the panel's target params (where a running transition is heading), rounded like the state, in schema order, without the `debug` group, so the app never starts in a debug view. Replacing `src/params/defaults.json` with it makes the current eye the default.
  - The tests use `BASE_PARAM_SCHEMA`, so retuning the file does not change them; `params.test.js` checks that the file names only existing leaves with valid values.
  - `discrete: true` marks a seed or a count, which a transition switches instead of gliding.
  - `fades: 'intensity'` marks a light's `enabled` toggle, which a transition fades through the sibling leaf.
- **Seeds**: they are separate per subsystem (`irisStructure.seed`, `lashes.seed`, `lids.seed` for the lid shape, folds and skin patterns, `sclera.vessels.seed`), so a new crypt pattern keeps the same lashes.
- **Presets** ([`src/params/presets.js`](../src/params/presets.js)): deep partial overrides of the defaults.
  - Choosing one in the panel glides to its overrides on the defaults ([Transitions](#transitions)).
  - They load only with the development tools or `?preset=` (a chunk of their own): the page needs none, its default being the defaults themselves.
  - Each reference preset names its photographs (`references`, shown by the capture contact sheet).
  - Reference presets keep the living eye off, so their pupil and gaze are the tuned ones, and the air clear (no dust, no haze, no light shafts), as in their photographs.
  - They also pin the frontal 100 mm framing they were tuned with (`frontal`). The default camera looks from 26° to the side and 7.8° below, with a 110 mm lens.
  - `refraction-checker` is a debug preset; `outdoor` swaps the studio for the sky.
- **Random eye** ([`src/params/populationPriors.js`](../src/params/populationPriors.js)): `randomEye(ancestry)`, with ancestry `european`, `east-asian` or `south-asian`.
  - It samples color class, crypt grade, furrow grade, pigment spots and Wölfflin nodules from Edwards et al. 2016.
  - A Gaussian copula carries the measured correlations between them.
  - Within its color class, a shade (`SHADES`: pale or deep blue, green, grey, hazel, light brown, amber, brown, chestnut, black) sets ranges for the whole layer model of the color and its `saturation` (`SHADE_COLORS`), not only the melanin; the shades and their shares are approximations ([`docs/RESEARCH.md`](RESEARCH.md#color)).
  - Larsson's peripupillary ring is added to 91% of green, hazel and light brown eyes.
  - A tenth of the eyes, of any ancestry (`MAKO_SHARE`), take the fantasy **mako** shade instead: the glowing green-blue of the mako eyes of Final Fantasy VII, a deep blue stroma tinted between green and cyan at full saturation with `irisColor.glow`, without a ring or pigment spots. It is drawn last, so the other eyes of a seed do not change.
  - The result maps onto the age, the pupil, the iris structure and color, and the sclera. The lashes and the skin stay as they are.
  - `main.js` resets those groups to their defaults before applying it, and glides to the result.
- **Skin tones** ([`src/params/skinTones.js`](../src/params/skinTones.js)): five values of `skin.color`, light to deep; the brown one is the color of `defaults.json`, and the light one sets the backdrop’s tone. The HUD also has the hidden `SECRET_TONE` (Hellboy's red), pressable once the checklist shows its task and the viewer has worn the five since (the checklist keeps them). A skin button (or `skinTone(name)`) glides the color the params are heading for to its tone, the other leaves keeping their targets. Presets do not name the skin, so one brings back the default color.
- **State**: `encodeState()` writes the non-default values as base64url JSON. **Copy state URL** puts it in `?state=`; **Save PNG** stores it in a `tEXt` chunk named `eye-state` ([`src/render/pngMetadata.js`](../src/render/pngMetadata.js)).

## Coordinate Spaces

- **World**: millimeters, with the globe center at the origin in primary gaze; +Y is up and a camera at azimuth 0 looks down −Z.
  - The lids, lashes and tear film live in world space; they do not turn with the gaze.
  - Lid-attached vertices rotate about the X axis through the globe center to follow the vertical gaze (`lid-follow.glsl`). Before that, in the same rest frame, the blink morphs them (`lid-morph.glsl`).
- **Eye space** ([`docs/OPTICS.md`](OPTICS.md#eye-space)) moves with the gaze.
  - `EyeRig.pivot` sits at the globe's center, the world origin, which the eye turns about ([`docs/OPTICS.md`](OPTICS.md#eye-space)); `EyeRig.eyeSpace` carries the eyeball.
  - The eyeball shaders work entirely in eye space. The light rig is packed into both spaces every frame.
- **Iris space** is eye space shifted to the decentered pupil center. Its features live in **rest space** ([`docs/IRIS.md`](IRIS.md)).
- **Polar maps**:
  - the iris atlases, with u = θ / 2π and v = rest ρ;
  - the vessel map, with u = φ / 2π and v over ψ ∈ `SCLERA_PSI` (angle from the optical axis);
  - the fissure map, over the front plane at the lids' rest position: where they rest and closed.
