# Research

The anatomical, optical and computer-graphics references behind the procedural eye, with the numbers the code uses as fallback defaults (the `default` of each leaf in `paramSchema.js`) and parameter ranges; `src/params/defaults.json`, the defaults the app runs with, may be tuned away from them. Values marked *(calc)* are derived from the cited inputs; *(unverified)* could not be confirmed against the primary source.

## Geometry and optics

All lengths in millimeters; refractive indices at about 555–589 nm.

| Model | Anterior cornea R / Q | Posterior cornea R / Q | Central thickness | Aqueous depth | Lens front R/Q · back R/Q | Lens thickness | n cornea / aqueous / lens / vitreous |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Navarro 1985 = Escudero-Sanz & Navarro 1999 | 7.72 / −0.26 | 6.50 / 0 | 0.55 | 3.05 | 10.2 / −3.1316 · −6.0 / −1 | 4.0 | 1.376 / 1.3374 / 1.42 / 1.336 |
| Liou & Brennan 1997 | 7.77 / −0.18 | 6.40 / −0.60 | 0.50 | 3.16 | 12.40 / −0.94 · −8.10 / +0.96 | 1.59 + 2.43 (GRIN) | 1.376 / 1.336 / GRIN / 1.336 |
| Atchison 2006 (emmetrope) | 7.77 / −0.15 | 6.40 / −0.275 | 0.55 | 3.15 | 11.48 / −5 · −5.90 / −2 | 1.44 + 2.16 (GRIN) | 1.376 / 1.3374 / GRIN / 1.336 |
| Le Grand (textbook) | 7.80 | 6.50 | 0.55 | 3.05 | 10.2 · −6.0 | 4.0 | 1.3771 / 1.3374 / 1.42 / 1.336 |

- Dispersion (Escudero-Sanz, at 458 / 543 / 589 / 633 nm): cornea 1.3828 / 1.3777 / 1.3760 / 1.3747; aqueous 1.3445 / 1.3391 / 1.3374 / 1.3360; lens 1.4292 / 1.4222 / 1.4200 / 1.4183.
- Conic sag: z(r) = r² / (R·[1 + √(1 − (1+Q)·r²/R²)]).
- Measured corneoscleral sag (swept-source OCT, 56 eyes): 1.756 ± 0.072 at a 10 mm chord, 2.658 at 12.3 mm, 3.676 at 15 mm. The Navarro conic overshoots past the limbus (2.84 at 12.3, 4.70 at 15 *(calc)*), so the sclera must take over: a sphere of radius 12 gives about 3.6 at 15 mm *(calc)*.
- Central corneal thickness 534 µm pooled (544 by ultrasound); 0.7–1.0 mm near the limbus.
- Horizontal visible iris diameter (white-to-white) 11.71 ± 0.42 mm (10.7–12.6); vertical about 10.6 *(unverified)*. The limbus is not a circle (best fit: 2nd-order Fourier curve).
- Limbus width (AS-OCT): 1.25–2.20 mm in Caucasian eyes, 0.81–1.40 in Chinese eyes, widest superiorly.
- Limbal tangent angles 35.3° nasal, 38.8° temporal, 32.8° superior, 25.9° inferior; corneoscleral junction angle 172–180° (slightly concave nasally, a shallow sulcus).
- Sclera: radius 11.7–13.7 off axis; thickness 0.50 ± 0.11 at the limbus, 0.42 at the equator, 0.94 at the posterior pole.
- The entrance pupil (the pupil seen through the cornea) is about 0.55 mm in front of the real one and about 14% larger; Gullstrand: 3.047 mm deep, ×1.133. This project's default eye gives 3.039 mm and ×1.131 (`test/cornealOptics.test.js`).
- Bérard et al. 2014 measured corneal refractive indices of 1.362–1.381 in nine eyes and modeled the cornea as one refracting surface; the dilator muscle causes significant out-of-plane iris deformation.

## The iris

### Structure and thickness

- Thickness by ultrasound biomicroscopy (83 eyes): root 0.42, mid radius 0.52, pupil margin 0.72 mm.
- AS-OCT (1153 eyes): 0.451 mm at 750 µm from the scleral spur, 0.479 at 2000 µm, maximum 0.602 (at the collarette); iris curvature (bow of the pigment epithelium from its chord) 0.259 mm (0.366 with narrow angles).
- Iris diameter 11.77 ± 0.40 mm; pupil 1.5–8 mm, decentered nasally by up to about 0.3 mm (the center moved temporally by 0.133 mm on average when dilating from 4.1 to 6.3 mm).
- Layers (ILIT light-transport model): anterior border layer (ABL) 56.75 µm, stroma 285.5 µm with collagen fibrils of 30 nm radius and 1–7% blood; dilator 8.50 ± 1.61 µm; sphincter ring 0.75–1 mm wide; posterior pigment epithelium (pure eumelanin) forming the dark pupillary ruff at the margin.
- Collarette at about 0.27–0.3 of the pupil-to-limbus distance (about 1.5 mm from the pupil margin), zig-zag, the thickest region, where the fetal pupillary membrane attached.
- Crypts of Fuchs are hypoplasia of the ABL and superficial stroma: larger next to the collarette, smaller toward the periphery; the iris is thinnest at crypts. Concentric contraction furrows lie in the ciliary zone, radial furrows near the pupil.
- Dilation: cross-section area −0.19 mm² per +1 mm of pupil; the iris loses about half its volume from 3 to 7 mm of pupil (44.3 → 37.9 mm³ after tropicamide); crypts mean more volume loss (−1.43 mm³ per crypt grade).
- Rohen 1951 / Wyatt 2000: collagen arcs run from root to margin in clockwise and counter-clockwise families, each spanning about 90° of polar angle.

### Feature frequencies (priors for the random eye)

Edwards et al. 2016 (photo grading; European n = 619 / East Asian n = 467 / South Asian n = 364):

| Feature: grades | European | East Asian | South Asian |
| --- | --- | --- | --- |
| Crypts: none / small only around the collarette / ≥1 large in <3 quadrants / ≥3 large in ≥3 quadrants | 9 / 38 / 31 / 22 % | 20 / 50 / 20 / 10 % | 15 / 42 / 25 / 18 % |
| Contraction furrows: none / <180° / >180° | 7 / 11 / 82 % | 15 / 38 / 47 % | 4 / 15 / 81 % |
| Pigment spots: 0 / 1–2 / >2 | 42 / 38 / 19.5 % | 78 / 21 / 1.5 % | 83 / 15 / 2 % |
| Wölfflin nodules: none / <180° / >180° | 63 / 12 / 25 % | 100 / 0 / 0 % | 99 / 0.5 / 0.8 % |

- European color classes: light blue/green/grey 12%, blue/green/grey 45%, hazel/light brown 23%, dark brown 19%, brownish-black 1%.
- Correlations among Europeans (Goodman–Kruskal γ): crypts–furrows −0.47, crypts–spots −0.24, furrows–spots +0.22, darker color–furrows +0.46, color–Wölfflin −0.41.
- Larsson et al. 2011: crypt and furrow scales A–E; a peripupillary pigmented ring (central heterochromia) in 91% of green or hazel eyes; nevi 0 / ≥1 / ≥3 / ≥5; heritability 71–93%.
- Iris freckles: at least one in 76.1% of 632 people, mostly inferior-temporal, more with age and sun. Wölfflin nodules in about 10% of light irides.

### Color

- The number of melanocytes is about the same in every iris; color comes from how much melanin sits in the ABL and superficial stroma. Blue is Tyndall/Rayleigh scattering by the stroma over the absorbing pigment epithelium (450 nm scatters about 4.4× more than 650 nm *(calc)*). Green irides are pheomelanin-rich; dark irides have more eumelanin and a higher eumelanin/pheomelanin ratio.
- ILIT melanin by class (dark / moderate / light): eumelanin 2.53e-2 / 6.33e-3 / 1.0e-4 mg; pheomelanin 6.90e-3 / 1.75e-3 / 3.0e-5 mg; share of melanin in the ABL 90 / 50 / 10%; blood in the stroma 7 / 4 / 1%. Refractive indices: fibroblasts 1.42, ground substance 1.35.
- Absorption (Donner & Jensen 2006, λ in nm): eumelanin σ = 6.6×10¹⁰·λ^−3.33 mm⁻¹; pheomelanin σ = 2.9×10¹⁴·λ^−4.75 mm⁻¹; baseline tissue 0.0244 + 8.53·e^(−(λ−154)/66.2) mm⁻¹. Per layer: µa = C·[β·σ_eu + (1−β)·σ_pheo].
- Kubelka–Munk, one layer of thickness d over a background of reflectance R_g: a = 1 + K/S, b = √(a²−1), R = (1 − R_g(a − b·coth bSd)) / (a − R_g + b·coth bSd), T = b / (a·sinh bSd + b·cosh bSd). Two layers: R = R1 + T1²·R23 / (1 − R1·R23).
- In this model *(calc)*:
  - A thin Rayleigh stroma caps the ratio of blue to red reflectance at about (650/450)⁴ ≈ 4.4.
  - Little ABL melanin greys a blue: an `ablMelanin` of 0.05 takes about 40% of its chroma, and 0.1 turns it teal-grey.
  - Pheomelanin over a Rayleigh stroma stays yellow-olive (OKLCH hue ≈ 90°). Dense pheomelanin over a stroma of large scatterers keeps the reds and reaches amber-orange (≈ 70°).
- Shades of the random eye *(approximation)*: each Edwards class is split into shades with approximate shares, not measured:
  - light classes: blue 55%, green 30%, grey 15%;
  - hazel/light brown: hazel 45%, light brown 30%, amber 25%;
  - dark brown: brown 65%, chestnut 35%.
- The tone mapping and the corneal reflections wash out the rendered chroma. The shades therefore raise `irisColor.saturation` *(artistic)*, up to 2.6 for a deep blue; real photographs such as `eye-05.jpg` are this vivid.
- The **mako** shade (a tenth of the random eyes) is fantasy, not data: the glowing eyes of Final Fantasy VII, with `irisColor.tint` and `irisColor.glow` *(artistic)*.

## Pupil and gaze dynamics

- Static pupil (L in cd/m², log = log10, a = field area in deg²):
  - Moon & Spencer: D = 4.9 − 3·tanh(0.4·log L − 0.00114).
  - Stanley & Davies: D = 7.75 − 5.75·X/(X+2), X = (L·a/846)^0.41.
  - Watson & Yellott 2012: F = L·a·M (M 0.1 for one eye, 1 for both); D = D_SD(F) + (age − 28.58)·(0.02132 − 0.009562·D_SD).
- Pamplona et al. 2009: dM/dD·dD/dt + 2.3026·atanh((D − 4.9)/3) = 5.2 − 0.45·ln(Φ(t − τ)/Φ̄), Φ̄ = 4.8118e-10 lm; latency τ ≈ 0.23 s; re-dilation about 3× slower than constriction; hippus 0.04–2 Hz (mode 0.3–0.5 Hz), about 0.2 mm.
- Normative dynamics: maximum constriction velocity 4.16 ± 0.98 mm/s, dilation 1.13 ± 0.25 mm/s; time to maximum constriction about 1 s.
- Iris deformation: features move along nearly straight radial lines; the ratio |F − B| / |O − B| (feature, pupil border, limbus on one ray) stays about constant (a linear rubber sheet to first order); the pupillary zone follows the pupil and the ciliary zone stretches (Newsome & Loewenfeld). Plane-stress annulus alternative: u(r) = Δ·r_p·(R²/r − r)/(R² − r_p²).
- Saccades: duration ≈ 2.2·A + 21 ms, peak velocity ≈ 500·(1 − e^(−A/14)) °/s; microsaccades about 1.5 Hz, ≤ 1°. Bérard et al. 2019: the visual axis differs from the optical axis; the rotation center and torsion are per person.
- Drift: a slow, irregular motion between microsaccades, below about 0.5 °/s (Rolfs 2009).
- Fixations in scene viewing last about 0.3 s on average (Rayner 1998). The looks of the living eye hold far longer (`animation.lookInterval`, 2.5 s), and its saccades are slowed (`animation.saccadeSlowdown`): a calm, readable pace for a macro close-up *(artistic)*.
- Beyond light, the pupil dilates with mental effort and arousal (task-evoked responses, up to about 0.5 mm; Beatty 1982) and constricts for near targets (the near triad, with accommodation and convergence). The per-look pupil change (`animation.pupilResponse`) is a seeded stand-in for both, not a measured model *(approximation)*. So is the Gaussian weighting (σ 30°) of each light by its angle from the line of sight.

## Ocular surface

- Tear film about 3 µm, n = 1.337; Fresnel reflectance air/tear 2.1%, air/cornea 2.5% *(calc)*.
- Purkinje images (Le Grand eye, paraxial *(calc)*): P1 virtual, 3.9 mm behind the apex (near the iris plane), the brightest; P2–P4 about 100× dimmer; P4 inverted. Catchlight height ≈ 3.9 mm × the source's angular size in radians.
- Apparent depth for focusing: refracted d = t_c + 1 / (n/s − (n−1)/R_c) (3.05 mm for s = 3.6); reflected d = t_c + 1 / (2/R_c + 1/s_obj). Blur circle on the sensor: c = (f²/N)·|d − s_o| / (d·(s_o − f)).
- Tear meniscus: lower radius 0.365 ± 0.153 mm, height ≥ 0.3 mm; the upper one is smaller.
- Limbal ring: mostly optical (55% less prominent with the eye under water), fading with age. Palisades of Vogt: radial ridges mostly superior and inferior, 1.4–2 mm long. Arcus senilis: a band about 1 mm wide, separated from the limbus by a clear zone of about 0.3 mm.
- Sclera: darker, redder and yellower with age; bluish in children (thin). Conjunctival vessels are superficial, bright red and tortuous, and move with the tissue; episcleral vessels are deeper, straighter, radial toward the limbus and violet-tinged. Small vessel diameters 8.7–24.3 µm (mean 15.5–18.8); fractal dimension 1.63–1.71.
- Corneal caustic: temporal light 104–121° from the line of sight forms a bright patch on the nasal limbus; sclerotic scatter is the halo around the cornea from total internal reflection.
- The pupil looks black because the fundus returns light toward its source; a red reflex appears only with light nearly coaxial with the camera.

## Eyelids and lashes

- MRD1 (upper lid margin to pupil center) 4–5 mm in young adults, 3.5 ± 0.8 at a mean age of 57; MRD2 about 5 (5.2 ± 1.0); fissure height 9–10 clinically (8–11). The upper lid covers about 1–2 mm of the cornea, the lower lid sits at the inferior limbus. The defaults: MRD1 4, MRD2 5.3.
- Fissure width 28.8 (women) to 30.2 mm (men) between the canthi by 3D photogrammetry, 25.6 ± 2.0 with a ruler. Intercanthal distance 31.8–33.3 mm, outer canthal distance 88–93 mm, interpupillary distance 62–65 mm. Canthal tilt 1–2.4° in Caucasians (5–6° in Chinese).
- Canthi from the pupil center: the medial one 15.0–15.9 mm nasal and about 3.4 mm below, the lateral one 13.8–14.3 mm temporal and about 2.5 mm below. Medial canthal angle 39–41°, lateral 36–38° (32–36° in Chinese), measured to the middle of the margins. The defaults: width 29 mm, medial share 0.505 (14.6 mm to the medial canthus: the endocanthion lies deep in the corner, and at 15.4 mm the eye looked shifted temporally in the fissure, *tuned*), medial canthus 3.2 mm below the pupil center, tilt 2°.
- Medial canthus: a rounded U where the lash-free lacrimal parts of the margins, medial of the puncta (6.0 and 6.5 mm from the canthus), curve around the lacrimal lake. The caruncle is about 5 mm high and 3 wide; the plica semilunaris is a narrow crescent about 2 mm wide lateral of it. The lateral canthus lies 7.8 mm medial of the lateral orbital rim (cadavers). No study measures how far the upper lid laps over the lower one there; the model uses 0.2 mm *(estimated)*.
- Lid margin: the intermarginal strip measures 1.36 ± 0.25 mm on the upper lid and 1.00 ± 0.23 on the lower one; the whole margin with the lash row is about 2 mm. The posterior edge is sharp and lies on the globe (the lid wiper); the anterior edge is rounded (radius 0.5–1 mm, *estimated*). Grey line; 30–40 meibomian orifices above (20–30 below) behind it; mucocutaneous junction 0.2–0.3 mm.
- Lid thickness: the tarsus is 10.6 ± 1.1 mm high on the upper lid (7.8 laterally, 6.2 medially) and about 4 mm on the lower one, 0.9 mm thick. The upper lid is 2.3–2.9 mm thick over the tarsus and 3–5 mm above it; the lower lid is about 3–4 mm (the model's lower lid is a wedge whose front leaves the margin at its tilt and flows into the cheek, its thickness off the globe following from that, *tuned*). Lid skin is 320 µm at the lash line and 700–830 µm over the tarsus (the thinnest of the face).
- Upper lid crease 6.2–6.9 mm above the margin in Caucasian men and 7.3–7.5 in women (with the lid closed; 4–6 or absent in many Chinese lids). With the eye open the skin above folds down over it, leaving a pretarsal show of 1.6–3.4 mm. Lower lid: a crease about 5–6 mm below the margin; the lid–cheek junction 5–12 mm below it in youth (15–18 later), with the tear trough running down and out from the medial canthus. The model's lid meets the cheek 6.5 mm below the margin (`lids.lowerHeight`, *tuned*).
- Depths behind the corneal apex, from 3D photogrammetry distances: the medial canthus 1–5 mm, the lateral one 8–11 mm, about 7 mm further back *(derived)*. The lateral orbital rim is 15.4–16.5 mm behind it in white adults (12–21; [Hertel exophthalmometry](https://en.wikipedia.org/wiki/Exophthalmometer)). The soft tissue over the supraorbital rim stands about 10 mm in front of it, over the infraorbital rim 2–3 mm behind it, and the cheek's prominence about 2 mm in front in youth (a "positive vector"). The nasion is 9–14 mm in front of the corneal plane, about 6 mm above the pupils, and the dorsum 12–16 mm in front at the canthi *(estimated)*; the nasal root is about 19 mm wide; the midline lies 31–32 mm nasal of the pupil.
- Brow: its lower border 9.5–11 mm above the upper lid margin at the pupil (about 14–15.5 mm above the pupil center), higher laterally; it peaks between the lateral limbus and the lateral canthus in women and is flatter in men.
- The model's face is a hint at these volumes: the brow 5 mm in front of the apex, the nasal dorsum 9, the cheek level with it *(tuned on the renders, softer than the measured averages)*.
- Blink: the upper lid travels 9.1 ± 2.2 mm in a spontaneous blink (12.3 ± 1.9 voluntary), with a small nasal shift; the lower lid hardly moves, so the margins meet near its resting place. The lid wiper stays on the globe throughout.
  - Timing: a spontaneous blink closes in 0.10 ± 0.02 s and opens in 0.21 ± 0.04 s (Casse 2007); the down phase is roughly twice as fast as the up phase. Full closure lasts 10–50 ms. Voluntary blinks filmed at 600 fps (Kwon 2013): closing 76 ± 2 ms, closed 58 ± 4 ms, opening about 440 ms with a slow late phase (273 ± 23 ms); the speed of each phase rises and falls like a parabola (peak 243 mm/s closing, 157 opening). The down phase lasts 50–130 ms across studies. The model: 0.10 s, 30 ms, 0.21 s for nine tenths of the opening and 0.5 s in all, all shortened by a quarter by default (`animation.blinkSlowdown` 0.75: the physiological pace read slow on screen, *tuned*).
  - Rate: median 15.5 blinks/min watching a picture at 2 m, 14.5% of them incomplete (Argilés 2015); 13–14/min in Borges 2010, whose interblink intervals are log-normal (also with anesthesia, at half the rate). The model: 15/min, log-normal σ 0.7, 15% incomplete at 0.5–0.9 of the way *(depth estimated)*.
  - Gaze-evoked blinks: the orbicularis fires with 97% of gaze shifts over 33° (Evinger 1994). The model's chance ramps from 0 at 12° to 0.9 at 36° *(estimated)*.
  - During voluntary and reflex blinks the eyes turn down and in by about 1–5° (Collewijn 1985, *secondary source*); not modeled.
- Skin surface: primary furrows tens of micrometers deep cross into rhomboid plateaus a few tenths of a millimeter across, with shallower secondary furrows inside them; the dominant direction follows the relaxed skin tension lines ([Langer's lines](https://en.wikipedia.org/wiki/Langer%27s_lines)), concentric with the eye on the lids and radial at the lateral canthus, where they deepen into crow's feet *(unverified)*.
- The thin lid skin shows the venous plexus beneath it as a violet tint; periorbital skin is often darker (pigment and blood under the eye and in the canthi); meibomian orifices may be capped with meibum.
- Lashes: upper 90–160 in irregular rows, lower 75–80; upper length about 7.4 mm (rarely over 10–12), lower 5–5.5; central density 6–8 per mm; diameter 61–72 µm, elliptical, tapered tip; root angle from vertical 61–72° upper, 90–100° lower; upper lashes curled in 40–76%, lower always.

## Airborne dust

- Indoor airborne particles span from under a micrometer to about 100 µm across; the ones a light shows one by one near a macro subject are lint fibers (10–20 µm thick, tenths of a millimeter long, often bent or tangled) and skin and mineral flakes of tens of micrometers *(unverified)*. `dust.size` is the fibers' median length, 350 µm; flakes are a fifth of it, fibers 6% of it thick.
- They settle at a few millimeters per second at 10–30 µm (Stokes' law) and ride the room's air; in the still air of a studio the drift is slower: `dust.drift` 0.3 mm/s, a few pixels per second in the frame.
- Particles much larger than the wavelength scatter mostly forward (Mie): a Henyey–Greenstein phase with g ≈ 0.6–0.8 describes them; a mote lights up when it stands between the camera and a light.
- At f/17 the diffraction-limited Airy disk is 2.44·λ·N ≈ 23 µm on the sensor, about one pixel at 1440 px over 24 mm: the smallest disc of a mote in focus.
- Real air at a room's scale barely hazes (visibility is kilometers); `dust.haze` is a stylized extinction of a few hundredths per meter that separates the planes.

## Computer graphics

- No published real-time eye raymarches a true iris volume: Unity HDRP, Unreal (MetaHuman), CryEngine and Jimenez (Activision, 2012) refract once at the cornea and read a plane, a height field or a parallax layer. True iris depth exists only offline: Weta's Alita (fibrovascular strands simulated in Houdini, about 8.5M polygons per iris) and Lefohn et al. 2003 (stacked semi-transparent painted layers, ray traced).
- What matters most across sources: per-person cornea shape and refractive index, real iris relief with out-of-plane dilation, a soft limbus, lid occlusion and ambient occlusion, a tear line, refracted lighting and caustics on the iris.
- Techniques used here: polar domain repetition with neighbor-cell evaluation (iq), enhanced sphere tracing with over-relaxation (Keinert et al. 2014), distance impostors for near-field reflections (Szirmay-Kalos et al. 2005), pre-integrated skin (Penner 2011), separable SSS (Jimenez et al. 2015), Karis 2016 hair shading.

## References

Iris and color: [Edwards 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4736923/) · [Larsson 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3155193/) · [Larsson & Pedersen 2004](http://www.molvis.org/molvis/v10/a98/) · [Sidhartha 2014](https://pubmed.ncbi.nlm.nih.gov/24405741/) · [Wang 2011 (AS-OCT)](https://pubmed.ncbi.nlm.nih.gov/20530187/) · [Quigley 2009](https://pubmed.ncbi.nlm.nih.gov/19295366/) · [Imesch 1997](https://pubmed.ncbi.nlm.nih.gov/9154287/) · [Sturm & Larsson 2009](https://pubmed.ncbi.nlm.nih.gov/19619260/) · [Prota 1998](https://pubmed.ncbi.nlm.nih.gov/9778410/) · [Lam & Baranoski 2006 (ILIT)](https://diglib.eg.org/items/9e1190de-6e18-4aa8-8fce-7c55b67795f1) · [Kravchenko 2016 (ILIT parameters)](https://uwspace.uwaterloo.ca/handle/10012/11085) · [Donner & Jensen 2006](https://cseweb.ucsd.edu/~henrik/papers/skin_bssrdf/skin_bssrdf.pdf) · [Jacques, melanin absorption](https://omlc.org/spectra/melanin/mua.html) · [Brushfield spots and Wölfflin nodules](https://pmc.ncbi.nlm.nih.gov/articles/PMC6303377/)

Pupil, deformation, gaze: [Pamplona 2009](https://doi.org/10.1145/1559755.1559763) ([thesis](https://lume.ufrgs.br/bitstream/handle/10183/15309/000677246.pdf)) · [Watson & Yellott 2012](https://doi.org/10.1167/12.10.12) ([R implementation](https://raw.githubusercontent.com/cran/CVD/master/R/CVD.R)) · [Wyatt 2000](https://pubmed.ncbi.nlm.nih.gov/10878278/) · [Yang, Thompson & Burns 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC2989408/) · [Tomeo-Reyes 2015](https://doi.org/10.1109/ICB.2015.7139041) · [Bérard 2019 (eye rigging)](https://studios.disneyresearch.com/wp-content/uploads/2019/04/Practical-Person-Specific-Eye-Rigging.pdf) · [Rolfs 2009 (microsaccades and drift)](https://doi.org/10.1016/j.visres.2009.08.010) · [Rayner 1998 (fixations)](https://doi.org/10.1037/0033-2909.124.3.372) · [Beatty 1982 (task-evoked pupil)](https://doi.org/10.1037/0033-2909.91.2.276)

Optics: [Escudero-Sanz & Navarro 1999](https://doi.org/10.1364/JOSAA.16.001881) · [Navarro 1985](https://doi.org/10.1364/JOSAA.2.001273) · [Liou & Brennan 1997](https://doi.org/10.1364/JOSAA.14.001684) · [Atchison 2006](https://doi.org/10.1016/j.visres.2006.01.004) · [Eye in Numbers](https://eyewiki.org/Eye_in_Numbers) · [Consejo, limbus shape](https://arxiv.org/abs/1906.09149) · [Twelker 2005 (corneal caustic)](https://doi.org/10.1097/01.OPX.0000153169.75212.1B) · [Shyu & Wyatt 2009 (limbal ring)](https://doi.org/10.1097/OPX.0b013e3181b4f010) · [Goldberg & Bron 1982 (palisades of Vogt)](https://pmc.ncbi.nlm.nih.gov/articles/PMC1312261) · [Yokoi 1999 (tear meniscus)](https://doi.org/10.1136/bjo.83.1.92)

Eyelids and lashes: [Rana 2023](https://doi.org/10.1007/s10792-023-02669-3) · [Knop 2011](https://doi.org/10.1111/j.1469-7580.2011.01355.x) · [Zhu 2022](https://doi.org/10.1007/s40123-021-00421-7) · [Coban 2018](https://doi.org/10.1007/s00276-018-2064-7) · [Demirci & Nelson 2007](https://doi.org/10.1097/IOP.0b013e31802f2074) · [Price 2009](https://doi.org/10.1097/PRS.0b013e3181addc98) · [Gao 2025](https://doi.org/10.21037/qims-24-1113) · [Liu 2023](https://doi.org/10.1007/s00417-022-05746-y) · [Levy 2009](https://doi.org/10.1038/eye.2008.316) · [Shin 2019](https://doi.org/10.1002/ca.23360) · [Migliori & Gladstone 1984](https://doi.org/10.1016/0002-9394(84)90127-2) · [Yaremchuk 2001](https://doi.org/10.1097/00006534-200105000-00047) · [Byrd & Hobar 1993](https://doi.org/10.1097/00006534-199304000-00011) · [Casse 2007](https://doi.org/10.1007/s00417-007-0611-8) · [Matros 2009](https://doi.org/10.1097/PRS.0b013e3181b455e8) · Farkas 1994 (Anthropometry of the Head and Face) · Doane 1980 · [Kwon 2013 (blink kinematics)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4043155/) · [Argilés 2015 (blink rate, incomplete blinks)](https://doi.org/10.1167/iovs.15-16967) · [Borges 2010 (interblink intervals)](https://doi.org/10.1590/S0004-27492010000400005) · [Evinger 1994 (gaze-evoked blinks)](https://researchconnect.stonybrook.edu/en/publications/not-looking-while-leaping-the-linkage-of-blinking-and-saccadic-ga/) · Collewijn, van der Steen & Steinman 1985 (eye movements with blinks, J Neurophysiol 54:11–27) · [Kikuchi 2015](https://www.oatext.com/A-study-of-normal-eyelashes-in-Japanese-individuals.php) · [Thibaut 2010](https://doi.org/10.1111/j.1365-2133.2009.09487.x) · [Aumond & Bitton 2018](https://doi.org/10.1016/j.optom.2018.05.003)

Computer graphics: [Lefohn 2003](https://www.sci.utah.edu/~lefohn/work/eye) · [François 2007](https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/inria-00166304) · [Bérard 2014](https://la.disneyresearch.com/wp-content/uploads/High-Quality-Capture-of-Eyes-Pub-Paper.pdf) · [Bérard 2016](https://la.disneyresearch.com/wp-content/uploads/Lightweight-Eye-Capture-Using-a-Parametric-Model-Paper.pdf) · [Wood 2015](https://arxiv.org/abs/1505.05916) · [Zuo & Schmid 2006 (fiber-based synthetic iris)](https://citer.clarkson.edu/biometric-dataset-collections/synthetic-iris-model-based/) · [Jimenez 2012](https://www.iryoku.com/publications/) · [Unity HDRP Eye](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@14.0/manual/master-stack-eye.html) · [Weta / Alita](https://www.fxguide.com/featured/weta-digitals-remarkable-face-pipeline-alita-battle-angel/) · [iq, SDF repetition](https://iquilezles.org/articles/sdfrepetition/) · [GPU Gems 2 ch. 20 (tricubic filtering)](https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering) · [Policarpo & Oliveira 2006](http://www.inf.ufrgs.br/~oliveira/pubs_files/Policarpo_Oliveira_RTM_multilayer_I3D2006.pdf) · [Separable SSS](https://graphics.unizar.es/papers/Separable-Subsurface-Scattering.pdf) · [Penner 2011](https://www.slideshare.net/slideshow/penner-preintegrated-skin-rendering-siggraph-2011-advances-in-realtime-rendering-course/13966747) · [Karis 2016 (hair)](https://blog.selfshadow.com/publications/s2016-shading-course/karis/s2016_pbs_epic_hair.pdf)

Air: [Henyey & Greenstein 1941](https://doi.org/10.1086/144246) · Hinds 1999, Aerosol Technology (Stokes settling) · [Airy disk](https://en.wikipedia.org/wiki/Airy_disk)

Macro photography: [Suren Manvelyan, "Your Beautiful Eyes"](https://www.surenmanvelyan.com/eyes/your-beautiful-eyes/) · [Wikimedia: close-up photographs of human eyes](https://commons.wikimedia.org/wiki/Category:Close-up_photographs_of_human_eyes) · [Wikimedia: human iris](https://commons.wikimedia.org/wiki/Category:Human_iris) · [EyeRounds: Brushfield spots](https://eyerounds.org/atlas/pages/Brushfields-spots-in-a-normal-adult.html) · [EyeRounds: iris nevi](https://eyerounds.org/atlas/pages/tigroid-iris-with-a-number-of-dark-brown-nevi.html) · [EyeRounds: deep vs superficial vessels](https://eyerounds.org/atlas/pages/Scleritis13.htm)
