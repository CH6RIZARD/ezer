# Flight paths for a dove circling the "EZER" wordmark and landing (under 900 ms)

## Real dove and pigeon flight and landing: what the motion must respect

### Takeaway
Rock pigeons beat their wings at about 6–10 Hz, and the rate barely changes with climb or descent angle. A landing is a fast deceleration: in the last few hundred ms the body pitches nose-up by more than 50°, the stroke plane tips forward so the wings push air forward, the wingbeats get bigger until the very last one, and the tail drops and spreads as an air brake. A bird that lands at constant speed, level body and closed tail looks wrong.

### Cited Findings
- Across climb and descent angles from +60° to −60°, pigeon wingbeat frequency ranged from 6.1 to 9.6 Hz, and the angle had no significant effect on it. — [Berg & Biewener 2008, Biewener Lab](https://biewenerlab.oeb.harvard.edu/publications/kinematics-and-power-requirements-ascending-and-descending-flight-pigeon)
- Wingbeat frequency, downstroke amplitude and downstroke velocity rise during landing until the final wingbeat, where they drop. On takeoff they are highest at the start and fall with each beat. — [Berg & Biewener 2010, JEB 213:1651, via SICB/Harvard summaries](https://sicb.org/?p=26922); [Biewener Lab entry](https://biewenerlab.oeb.harvard.edu/publications/wing-and-body-kinematics-takeoff-and-landing-flight-pigeon-columba-livia)
- Body angle, tail angle and wing-plane angle are close to horizontal on takeoff and close to vertical on landing, which adds drag. The stroke plane tilts so the wings push air forward and slow the bird. — [Biewener Lab, Berg & Biewener 2010](https://biewenerlab.oeb.harvard.edu/publications/wing-and-body-kinematics-takeoff-and-landing-flight-pigeon-columba-livia)
- Body angle rises by more than 50° during landing, and birds sometimes pitch back past vertical. Stroke amplitude grows by up to 17° close to the perch. The stroke plane shifts by up to 30°, from facing rearward to facing forward. The centre of mass shows no consistent rise or fall in potential energy. — [Berg & Biewener, SICB abstract "Landing flight in the pigeon"](https://sicb.org/?p=29175)
- Landings with high final kinetic energy follow straighter paths and peak in deceleration during the last 300 ms. Low-energy landings curve downward and decelerate for longer. Pigeons approach a new perch more slowly along a downward curve, and a familiar perch faster and straighter. Final kinetic energy varied about 20-fold between flights, almost all from horizontal speed. — [Green & Cheng 1998, JEB 201:3309](https://researchportal.hw.ac.uk/en/publications/variation-in-kinematics-and-dynamics-of-the-landing-flights-of-pi/)
- Fisher (1946) observed the tail being pressed down just before touchdown and read it as a braking surface. — [Fisher 1946, Wilson Bulletin](https://sora.unm.edu/sites/default/files/journals/wilson/v071n03/p0267-p0273.pdf)
- A robotic tail built with real pigeon feathers shows that spreading the tail changes lift and drag and can pitch the bird passively, which suggests the fanned tail helps control pitch during landing. — [Gayout, Onn & Lentink, APS DFD 2023](https://meetings-archive.aps.org/dfd/2023/r01/4/) (conference abstract, not peer-reviewed)
- In turns, pigeons keep the downstroke force at a fixed angle to the body and re-orient the whole body (bank and pitch) to steer that force. Turning does not come from flapping one wing faster than the other. — [Ros et al. 2011 PNAS](https://sites.bu.edu/pierson/files/2021/05/ros2011pnas.pdf); [SICB abstract on low-speed pigeon turns](https://sicb.org/?p=25382)
- Birds get the inward (centripetal) force for a turn by banking into it, by flapping the two wings differently, or both. Cliff swallows' turns peak at about 2 body weights of centripetal force. — [JEB, cliff swallows](https://cob.silverchair.com/jeb/article/217/15/2717/12205/The-mechanics-and-behavior-of-cliff-swallows)
- Mourning dove level flight was recorded at about 3.2 flaps per second, n=7, in a 1948 field study (the source scan is garbled). A low-quality web source gives 5–10/s instead, so this figure conflicts with others. — [Condor 50(4):148](https://sora.unm.edu/sites/default/files/journals/condor/v050n04/p0148-p0151.pdf)
- Common animation mistakes: keying only two wing poses (up/down); perfectly symmetric wings; no overlap. The head should lead the flap cycle and the tail should react last. Make the upstroke tight and the downstroke broad. — [Animation Mentor, birds in flight](https://www.animationmentor.com/blog/tutorial-how-to-animate-birds-in-flight/); [NYFA, Craig Caton](https://www.nyfa.edu/film-school-blog/maya-60-minutes-craig-caton/)

### Inferences
- At 7–9 Hz, 900 ms holds 6–8 real wingbeats. On a phone-sized mark that reads as a flicker. Better: a few big beats while accelerating in, wings held in a glide through the long arcs, then 2–3 big, fast beats at the flare, with the very last beat smaller. That stylises the measured pattern without breaking it.
- Put the deceleration in the last ~300 ms, about the final 33% of the timeline. This matches the measured peak-deceleration window and is also the classic "slow in" at the end of the move.
- For a mark the bird has seen many times (a familiar perch), Green & Cheng's data supports a straighter, faster final approach. A "careful" downward-curving approach suggests a new perch. Either works; pick one deliberately.
- Flare cues to draw in the last ~150–250 ms: body pitched nose-up by 50–80°, wings swept forward (stroke tilted forward), tail pressed down and fanned, legs lowered. Without these, a dove that just stops looks pasted onto the mark.
- Banking: for a coordinated turn, tan(bank angle) = v² / (g·R), standard flight physics, not taken from the sources above. Tighter or faster turns therefore need more bank. In 2D, show bank by narrowing the far wing's span and briefly showing the underside. Bank should follow curvature, so G2 (curvature-continuous) paths give bank changes without pops.
- Things viewers read as "wrong": constant speed into the perch; turns with no bank; perfectly mirrored wings; sharp corners in the path; flapping at a steady tempo through glides and turns alike; arriving at the perch facing a different way from how the final mark sits.

### Gaps
- I could not open the full text of Berg & Biewener 2010 (403/404), so I have no exact landing wingbeat frequencies, approach speeds or flight durations. The figures above come from abstracts and lab summaries.
- I found no modern measurement of wingbeat frequency for white doves or mourning doves. The 3.2 Hz figure is old and garbled.
- I found no peer-reviewed number for tail-fan angle at landing.

## Path shapes that read as graceful in motion graphics

### Takeaway
Use one or two arcs, no zig-zags. Make the path curvature-continuous: blend into each turn the way roads and roller coasters use Euler spirals, not with a straight line that jumps onto a circle. Spend the timing on a strong ease-out into the perch. Within 900 ms, at most about 1.5 turns (one loop, or one S) stays readable.

### Cited Findings
- Almost every non-mechanical action, especially animals, moves along an arc. Straight-line interpolation looks stiff, and the software default has to be corrected by hand. — [UIC "12 Principles"](https://www.evl.uic.edu/datsoupi/251/docs/12AnimationPrinciples.pdf); [CG Wire, arc principle](https://blog.cg-wire.com/arc-animation-principle)
- Slow-in/slow-out controls timing along the path, and arcs control the path itself. Some actions slow in but do not slow out. A car slows as it approaches, not as it passes. — [Kirupa, animation principles](https://www.kirupa.com/developer/flash8/principles_animation_pt2_pg2.htm); [Motion The Agency](https://www.motiontheagency.com/blog/12-principles-of-animation)
- An Euler spiral (clothoid) changes curvature linearly. Roads, railways and roller coasters use it so acceleration builds smoothly instead of jumping, which happens on a straight line meeting a circle. Bézier curves are the usual practical substitute. — [Illinois Dynamics Reference](https://dynref.engr.illinois.edu/avt.html); [UW Curiosity Lab, roller coasters](https://sites.math.washington.edu/~aloveles/CuriosityLab/projects/roller-coasters.html); [Autodesk Civil 3D, transitions](https://help.autodesk.com/cloudhelp/2024/ENG/Civil3D-UserGuide/files/GUID-DD7C0EA1-8465-45BA-9A39-FC05106FD822.htm)
- In After Effects, Linear spatial interpolation collapses the Bézier handles into a sharp corner. Switch the default to Bezier to get smooth motion paths. — [Adobe Community](https://community.adobe.com/questions-529/soft-angle-vs-hard-angle-46662)
- Logo animation example: an owl that grows larger as it leaves a circular frame, reading as flying toward the camera, which shows depth through scale. — [Austin Saylor, Monomyth](https://www.austinsaylor.com/monomyth-logo-animation)
- Travel-brand spec: a plane's path cuts through the wordmark and the letters drag with follow-through. The designer kept the simpler of two motion styles. — [Omar Jabr, Contra](https://contra.com/p/mmoWcZeX-travel-brand-logo-animation-spec-concept)

### Inferences
- G1 (matching tangents, i.e. aligned handles) is the minimum. Aim for G2: at each joint, matching handle lengths in proportion to neighbouring segment lengths, or a Catmull-Rom/centripetal spline through the control points below. A G1-only joint between a tight arc and a straight shows up as a jolt in the bank angle.
- Turn budget for 900 ms: about 600 ms of travel plus about 300 ms of flare. One full loop of radius about 0.2 wordmark units, plus the arcs entering and leaving it, is close to the limit. The client's path (loop plus drop plus under-sweep plus rise) is already at the busy end. The alternatives below should be simpler.
- Path length: about 2.5–3.5 wordmark units over 600 ms of travel gives a speed that reads as flight, not a teleport, on a phone-width wordmark. More length means less readability.
- Depth: a bird passing behind letters (masked) while drawn smaller, then in front of letters drawn larger (about 0.85× to 1.15×), reads as 3D without a camera move. Do it at most once per path.
- Keep any loop in empty space (above the cap line or right of the R), never over the letters' counters, so the word stays legible during the reveal.
- Don't ease in on entry: the bird should cross the frame edge already at speed. Ease out hard into the perch, with the last ~33% of time covering the last ~10–15% of path length.

### Gaps
- I found no after-effects or motion-design source that names G2/curvature continuity explicitly. The clothoid analogy comes from transport engineering.
- I found no study that measures how many turns viewers can follow per second.

## Composition: leading the eye to the mark

### Takeaway
Enter from the left (or lower-left), travel generally left to right, and finish rising toward the top-right mark, so the reading direction and the flight direction agree and both end on the mark. Leave the last 15–20% of time empty of other motion so the eye settles with the bird.

### Cited Findings
- The eye moves comfortably from left to right because it mimics reading. Screen-left entry moving right is the "positive" convention, and right-to-left movement feels uncomfortable. — [Austin Kleon, quoting Van Sijll's *Cinematic Storytelling*](https://tumblr.austinkleon.com/tagged/direction); [UAL storyboard notes](https://wrenwei.myblog.arts.ac.uk/?p=393)
- Weissman (*Presenting to Win*): animation that follows the eye's natural left-to-right movement reads as positive. — [Ethos3](https://ethos3.com/designing-presentation-media-for-the-human-eye/)
- Left-to-right motion signals progress even in cultures that read right to left. This is a single craft source, and the study it mentions was not verified. — [Learning Guild](https://www.learningguild.com/articles/more-than-meets-the-eye-how-movement-in-video-shapes-learner-perception)
- deVOL's dove animation: drawn as dark blue on white, the bird read as a blackbird. They switched to white on blue. They traced a filmed real dove frame by frame (about 60 drawings), and the bird's flight nudges the tilted "O" into place. — [deVOL blog](https://www.devolkitchens.com/blog/?p=18068)

### Inferences
- The bird's heading on its final approach should match the facing of the static dove mark. If the mark faces right, approach from the left or from below-left and pitch up. If the mark faces left, approaching from the right is acceptable for the last ~20%, but enter from the left anyway.
- A rising finish (approaching the perch from below and swinging up) also bleeds speed in a believable way. This is a well-known behaviour in perching birds generally, but I did not find a pigeon-specific source for it (see Gaps). It also points the motion at the top-right mark.
- The white dove needs contrast: on EZER's dark tokens it reads well. On light mode it needs a hairline or soft shadow, or it disappears, the reverse of deVOL's blackbird problem.
- Negative space: keep loops out of the band between the cap line and baseline, except one deliberate crossing. Make the final arc's apex land in the empty space above or right of the R.

### Gaps
- I found no source that measures "swoop up to perch" in pigeons. Berg & Biewener report no consistent change in potential energy during landing, which neither confirms nor rules it out.

## Example logo reveals with birds

### Takeaway
The verified examples are few. deVOL's hand-drawn dove (traced from real footage) is the best one to study. The Twitter bird has no official flight-in reveal. Broadcast idents (Dove Four Point, Sinema Dizajn) show the cliché patterns: a diagonal glide-in and a zoom-to-camera.

### Cited Findings
- deVOL "The Bird Animation": the dove flies off the "O" and straightens it, hand-drawn from filmed reference. — [deVOL](https://www.devolkitchens.com/blog/?p=18068)
- Dove Four Point (1997–99, TV ident): a white dove with an olive branch zooms in, then a circle and text. — [Audiovisual Identity Database](https://www.avid.wiki/Dove_Four_Point)
- Sinema Dizajn (1992): an abstract white bird glides diagonally across the screen and settles, revealing the wordmark (cel animation). — [AVID](https://avid.wiki/Sinema_Dizajn_1992)
- Shoot at Sight Films (2018): a flock takes off from a tree and opens a title box. — [AVID](https://avid.wiki/Shoot_at_Sight_Films)
- Twitter bird (Martin Grasser): built from 15 circles and designed from bird-flight videos, with a soaring pose. No official flight-in logo animation was found. — [Fast Company](https://www.fastcompany.com/90310504/4-things-you-didnt-know-about-twitters-logo)
- Real-flight reference footage: a free (non-commercial, credit required) green-screen dove flight loop. — [UltraKey](https://ultrakey.gumroad.com/l/flyingdove)

### Inferences
- AVID pages usually embed the YouTube capture of each ident. Use them as the video links for frame-by-frame study.
- For real landing reference, slow-motion "pigeon landing" footage on YouTube is the practical source (not verified here).

### Gaps
- I found no verified YouTube URLs for dove, church, wedding, airline or luxury bird logo reveals, and I did not check specific airline intros. Searches returned stock sites and template marketplaces instead.

## Four flight-path proposals (the client's hand-drawn path is the baseline)

Units: x runs 0 at the left edge of the E to 1 at the right edge of the R. y runs 0 at the cap top to 1 at the baseline; negative is above the word. The landing point is (1.17, −0.59). Letter columns are assumed at roughly E 0–0.22, Z 0.26–0.48, E 0.52–0.74, R 0.78–1.0; adjust to the real kerning. Run each list through a centripetal Catmull-Rom spline (G1, close to G2) or hand-tune Béziers with aligned, length-proportional handles. Timing for all four: no ease on entry; travel phase about 0–600 ms (wings held in glide on the arcs, a few beats on the climbs); flare phase about 600–900 ms (strong ease-out, 2–3 big beats with the last one smaller, body nose-up 50–80°, tail fanned and pressed down, feet lowered). Bank follows curvature.

**A. "Underline swoop up" (one arc, rising perch).** Enters fast from off-screen lower-left, sweeps along under the baseline like an underline, curls up past the R and climbs into the mark.
(−0.30, 1.55) → (0.10, 1.42) → (0.50, 1.48) → (0.85, 1.25) → (1.08, 0.60) → (1.16, −0.20) → (1.17, −0.59)
Rationale: the simplest gesture that underlines the whole name, and the climb turns speed into a natural flare, nose-up and tail-fanned, at the perch.

**B. "High glide-in" (single descending arc, no turns).** Enters from upper-left, high and small (far away), glides down a long, flattening arc over the cap line, and finishes with a slight dip below the perch, rising into it.
(−0.30, −1.70) → (0.15, −1.30) → (0.55, −1.02) → (0.92, −0.72) → (1.08, −0.52) → (1.17, −0.59), with scale 0.85 → 1.0
Rationale: the quietest, most premium option, closest to Green & Cheng's straight "familiar perch" approach. It never crosses the letters, so the word stays fully legible.

**C. "Circle the mark, then settle" (one orbit in empty space).** Enters left at mid-height, passes in front of the letters (scale up), arcs up over the R, makes one clockwise loop around the perch (radius about 0.2) to the right of and above the R, and drops onto the mark.
(−0.30, 0.45) → (0.30, 0.25) → (0.80, −0.05) → (1.25, −0.25) → (1.40, −0.60) → (1.27, −0.90) → (1.05, −0.85) → (1.00, −0.62) → (1.08, −0.52) → (1.17, −0.59)
Rationale: the one loop sits in negative space and draws the eye to exactly where the mark will appear. Its final tangent runs left to right, so the bird lands facing right.

**D. "Weave through depth" (S-curve behind, then in front).** Dives from top-left (small, far), passes BEHIND the Z (masked by the letter), comes out below the second E in FRONT (larger), and rises up the right side into the mark.
(−0.15, −0.80) [scale 0.8] → (0.22, −0.25) → (0.40, 0.50) [behind Z, masked] → (0.62, 1.30) [in front, scale 1.15] → (0.95, 1.20) → (1.22, 0.55) → (1.24, −0.20) → (1.17, −0.59) [scale 1.0]
Rationale: a single S with one depth crossing gives a sense of 3D and of "flying through the name" while staying simpler than the client's loop.

Distinctness from the client's path: the client's path uses a loop over the first E, a drop to the left, an under-sweep and a rise through the second E. A has no loop and no letter crossings. B stays entirely above the word. C loops only around the mark. D's only crossing is a depth crossing.
