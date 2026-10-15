# Research

The anatomical, optical and computer-graphics references behind the procedural eye, with the numbers the code uses as defaults and parameter ranges. Values marked *(calc)* are derived from the cited inputs; *(unverified)* could not be confirmed against the primary source.

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

- MRD1 (upper lid margin to pupil center) 3.5 ± 0.8 mm, MRD2 5.2 ± 1.0; fissure 8.7–9.3 × 25.6–26.5 mm; the upper lid covers about 1–2 mm of iris, the lower lid sits at the inferior limbus; canthal tilt 5–10° (Asian eyes toward the upper end).
- Lid margin about 2 mm deep: grey line; 30–40 meibomian orifices above (20–30 below) behind it; mucocutaneous junction 0.2–0.3 mm. Lid skin 320 µm at the lash line, 700–830 µm over the tarsus (the thinnest of the face).
- Upper lid crease about 8–11 mm above the margin centrally in European lids (lower or absent in many East Asian lids), closer to it toward the canthi; in many lids the preseptal skin and fat fold down over it (hooding), more laterally and with age *(unverified)*. The model keeps the crease in view, as the sculpting reference `Four-view anatomical eye sculpt reference.png` does.
- Lower lid: the pretarsal orbicularis roll under the lash line, the lower-lid sulcus a few millimeters below it, three fat pads (medial, central, lateral) and the lid–cheek junction, with the tear trough running down and out from the medial canthus *(unverified distances)*.
- Shape of the fissure: the line between the canthi lies below the pupil center, so the upper margin arches high over it and the lower one stays shallow; the defaults (medial canthus 3 mm below the pupil center, tilt 7°) are tuned on the reference photographs `eye-shape-palpebra.jpg` and `palpebra-01`–`03` *(tuned)*.
- In profile the brow ridge stands in front of the corneal apex and the cheekbone about level with it (a "positive vector" in youth); the lid–cheek junction is a soft groove a few millimeters behind. The lids are convex bands over the globe: the upper one up to its crease, which slips under the brow ridge, the lower one down to the cheek. The volumes of `faceDepth()` follow these relations, blocked out on the sculpting reference and softened to `references/desired-output.png` *(unverified distances)*.
- The lateral orbital rim lies about 16 mm (12–20) behind the corneal apex ([Hertel exophthalmometry](https://en.wikipedia.org/wiki/Exophthalmometer)), and the lateral canthus deep near the globe's equator: the face recedes toward the temple (`lids.templeDepth`).
- Skin surface: primary furrows tens of micrometers deep cross into rhomboid plateaus a few tenths of a millimeter across, with shallower secondary furrows inside them; the dominant direction follows the relaxed skin tension lines ([Langer's lines](https://en.wikipedia.org/wiki/Langer%27s_lines)), concentric with the eye on the lids and radial at the lateral canthus, where they deepen into crow's feet *(unverified)*.
- The thin lid skin shows the venous plexus beneath it as a violet tint; periorbital skin is often darker (pigment and blood under the eye and in the canthi); meibomian orifices may be capped with meibum.
- Lashes: upper 90–160 in irregular rows, lower 75–80; upper length about 7.4 mm (rarely over 10–12), lower 5–5.5; central density 6–8 per mm; diameter 61–72 µm, elliptical, tapered tip; root angle from vertical 61–72° upper, 90–100° lower; upper lashes curled in 40–76%, lower always.

## Computer graphics

- No published real-time eye raymarches a true iris volume: Unity HDRP, Unreal (MetaHuman), CryEngine and Jimenez (Activision, 2012) refract once at the cornea and read a plane, a height field or a parallax layer. True iris depth exists only offline: Weta's Alita (fibrovascular strands simulated in Houdini, about 8.5M polygons per iris) and Lefohn et al. 2003 (stacked semi-transparent painted layers, ray traced).
- What matters most across sources: per-person cornea shape and refractive index, real iris relief with out-of-plane dilation, a soft limbus, lid occlusion and ambient occlusion, a tear line, refracted lighting and caustics on the iris.
- Techniques used here: polar domain repetition with neighbor-cell evaluation (iq), enhanced sphere tracing with over-relaxation (Keinert et al. 2014), distance impostors for near-field reflections (Szirmay-Kalos et al. 2005), pre-integrated skin (Penner 2011), separable SSS (Jimenez et al. 2015), Karis 2016 hair shading.

## References

Iris and color: [Edwards 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4736923/) · [Larsson 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3155193/) · [Larsson & Pedersen 2004](http://www.molvis.org/molvis/v10/a98/) · [Sidhartha 2014](https://pubmed.ncbi.nlm.nih.gov/24405741/) · [Wang 2011 (AS-OCT)](https://pubmed.ncbi.nlm.nih.gov/20530187/) · [Quigley 2009](https://pubmed.ncbi.nlm.nih.gov/19295366/) · [Imesch 1997](https://pubmed.ncbi.nlm.nih.gov/9154287/) · [Sturm & Larsson 2009](https://pubmed.ncbi.nlm.nih.gov/19619260/) · [Prota 1998](https://pubmed.ncbi.nlm.nih.gov/9778410/) · [Lam & Baranoski 2006 (ILIT)](https://diglib.eg.org/items/9e1190de-6e18-4aa8-8fce-7c55b67795f1) · [Kravchenko 2016 (ILIT parameters)](https://uwspace.uwaterloo.ca/handle/10012/11085) · [Donner & Jensen 2006](https://cseweb.ucsd.edu/~henrik/papers/skin_bssrdf/skin_bssrdf.pdf) · [Jacques, melanin absorption](https://omlc.org/spectra/melanin/mua.html) · [Brushfield spots and Wölfflin nodules](https://pmc.ncbi.nlm.nih.gov/articles/PMC6303377/)

Pupil, deformation, gaze: [Pamplona 2009](https://doi.org/10.1145/1559755.1559763) ([thesis](https://lume.ufrgs.br/bitstream/handle/10183/15309/000677246.pdf)) · [Watson & Yellott 2012](https://doi.org/10.1167/12.10.12) ([R implementation](https://raw.githubusercontent.com/cran/CVD/master/R/CVD.R)) · [Wyatt 2000](https://pubmed.ncbi.nlm.nih.gov/10878278/) · [Yang, Thompson & Burns 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC2989408/) · [Tomeo-Reyes 2015](https://doi.org/10.1109/ICB.2015.7139041) · [Bérard 2019 (eye rigging)](https://studios.disneyresearch.com/wp-content/uploads/2019/04/Practical-Person-Specific-Eye-Rigging.pdf) · [Rolfs 2009 (microsaccades and drift)](https://doi.org/10.1016/j.visres.2009.08.010) · [Rayner 1998 (fixations)](https://doi.org/10.1037/0033-2909.124.3.372) · [Beatty 1982 (task-evoked pupil)](https://doi.org/10.1037/0033-2909.91.2.276)

Optics: [Escudero-Sanz & Navarro 1999](https://doi.org/10.1364/JOSAA.16.001881) · [Navarro 1985](https://doi.org/10.1364/JOSAA.2.001273) · [Liou & Brennan 1997](https://doi.org/10.1364/JOSAA.14.001684) · [Atchison 2006](https://doi.org/10.1016/j.visres.2006.01.004) · [Eye in Numbers](https://eyewiki.org/Eye_in_Numbers) · [Consejo, limbus shape](https://arxiv.org/abs/1906.09149) · [Twelker 2005 (corneal caustic)](https://doi.org/10.1097/01.OPX.0000153169.75212.1B) · [Shyu & Wyatt 2009 (limbal ring)](https://doi.org/10.1097/OPX.0b013e3181b4f010) · [Goldberg & Bron 1982 (palisades of Vogt)](https://pmc.ncbi.nlm.nih.gov/articles/PMC1312261) · [Yokoi 1999 (tear meniscus)](https://doi.org/10.1136/bjo.83.1.92)

Eyelids and lashes: [Rana 2023](https://doi.org/10.1007/s10792-023-02669-3) · [Knop 2011](https://doi.org/10.1111/j.1469-7580.2011.01355.x) · [Kikuchi 2015](https://www.oatext.com/A-study-of-normal-eyelashes-in-Japanese-individuals.php) · [Thibaut 2010](https://doi.org/10.1111/j.1365-2133.2009.09487.x) · [Aumond & Bitton 2018](https://doi.org/10.1016/j.optom.2018.05.003)

Computer graphics: [Lefohn 2003](https://www.sci.utah.edu/~lefohn/work/eye) · [François 2007](https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/inria-00166304) · [Bérard 2014](https://la.disneyresearch.com/wp-content/uploads/High-Quality-Capture-of-Eyes-Pub-Paper.pdf) · [Bérard 2016](https://la.disneyresearch.com/wp-content/uploads/Lightweight-Eye-Capture-Using-a-Parametric-Model-Paper.pdf) · [Wood 2015](https://arxiv.org/abs/1505.05916) · [Zuo & Schmid 2006 (fiber-based synthetic iris)](https://citer.clarkson.edu/biometric-dataset-collections/synthetic-iris-model-based/) · [Jimenez 2012](https://www.iryoku.com/publications/) · [Unity HDRP Eye](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@14.0/manual/master-stack-eye.html) · [Weta / Alita](https://www.fxguide.com/featured/weta-digitals-remarkable-face-pipeline-alita-battle-angel/) · [iq, SDF repetition](https://iquilezles.org/articles/sdfrepetition/) · [GPU Gems 2 ch. 20 (tricubic filtering)](https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering) · [Policarpo & Oliveira 2006](http://www.inf.ufrgs.br/~oliveira/pubs_files/Policarpo_Oliveira_RTM_multilayer_I3D2006.pdf) · [Separable SSS](https://graphics.unizar.es/papers/Separable-Subsurface-Scattering.pdf) · [Penner 2011](https://www.slideshare.net/slideshow/penner-preintegrated-skin-rendering-siggraph-2011-advances-in-realtime-rendering-course/13966747) · [Karis 2016 (hair)](https://blog.selfshadow.com/publications/s2016-shading-course/karis/s2016_pbs_epic_hair.pdf)

Macro photography: [Suren Manvelyan, "Your Beautiful Eyes"](https://www.surenmanvelyan.com/eyes/your-beautiful-eyes/) · [Wikimedia: close-up photographs of human eyes](https://commons.wikimedia.org/wiki/Category:Close-up_photographs_of_human_eyes) · [Wikimedia: human iris](https://commons.wikimedia.org/wiki/Category:Human_iris) · [EyeRounds: Brushfield spots](https://eyerounds.org/atlas/pages/Brushfields-spots-in-a-normal-adult.html) · [EyeRounds: iris nevi](https://eyerounds.org/atlas/pages/tigroid-iris-with-a-number-of-dark-brown-nevi.html) · [EyeRounds: deep vs superficial vessels](https://eyerounds.org/atlas/pages/Scleritis13.htm)
