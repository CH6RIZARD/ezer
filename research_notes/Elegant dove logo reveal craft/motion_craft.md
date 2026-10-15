# Motion craft for a sub-1-second dove-and-wordmark logo reveal

Scope: a realistic white dove flies around the wordmark "EZER" while it fades from 0.3 to 1 opacity (ease-in-out, 900 ms total), then lands on a small dove mark at the top right of the R. App loading screen, three themes (cream #F7F3EA, deep purple #151021, black).

Research note: page fetches failed often in this session (ECONNRESET, blocked domains), so several findings come from search-result summaries rather than full pages. Each claim says which. Anything marked "Inference" is my reasoning, not a sourced fact.

## Timing and easing for a 900 ms reveal: travel, anticipation and settle, curves, the "white streak", motion blur, how luxury brands pace intros

### Takeaway
At 900 ms the motion has to be mostly deceleration. Bring the dove in already moving, put roughly the last 40% of the time into braking and settling, use an emphasized-decelerate-style curve for the flight, and keep the path short and curved. Luxury and premium motion reads as slower and calmer, with no bounce. The "white streak" comes from moving too far per frame, so the fix is less travel or a slower peak speed. A smear or blur, if used at all, belongs only on the single fastest frame or two.

### Cited Findings
- Material Design says speed comes from duration AND easing together: standard easing with a short duration reads as direct and functional, while emphasized easing with a longer duration reads as stylized ([material.io customization](https://material.io/design/motion/customization.html), via search summary; the page is marked beta).
- Material 3 "emphasized decelerate" is `cubic-bezier(0.05, 0.7, 0.1, 1.0)` and is the token for elements entering the screen (about 400 ms). "Emphasized" (500 ms) is for elements that start and end on screen ([Flutter API: Easing.emphasizedDecelerate](https://api.flutter.dev/flutter/material/Easing/emphasizedDecelerate-constant.html); durations from [kpay-group Flutter motion docs](https://design.kpay-group.com/docs/motion/type/flutter-type/flutter-intro), a third-party implementation).
- Older Material guidance: mobile transitions run about 300 ms, and over 400 ms "may feel too slow" for UI transitions ([Material v1 Duration & easing](https://m1.material.io/motion/duration-easing.html)). This applies to functional UI. A branded one-time reveal is a deliberate exception and should still be short.
- A brand-motion principles guide puts luxury logo/ident timing at about 500–800 ms with "minimal motion, subtle easing, no bounce". Tech branding is 200–400 ms, and playful brands use overshoot ([dylantarre animation-principles: brand-marketing](https://skills.cat/skills/dylantarre/animation-principles/brand-marketing)). This is a community guide, not measured brand data.
- A marketing-research summary cites Jung & Dubois (2023): luxury products are judged more appealing in slow motion, which the authors attribute to associating slow, careful movement with importance ([Nick Kolenda, Luxury slow motion](https://nickkolenda.com/tactics/luxury-slow-motion), search summary only; the page could not be fetched to confirm the citation).
- Slow in / slow out: more frames sit at the start and end of an action and fewer in the fastest middle. It emphasizes the extreme (resting) pose ([UW CSE457 animation principles](https://courses.cs.washington.edu/courses/cse457/02sp/lectures/animation-principles.pdf)).
- Arcs: avoid straight-line paths, because natural movement is curved. Faster actions use wider, flatter arcs ([UW CSE457](https://courses.cs.washington.edu/courses/cse457/02sp/lectures/animation-principles.pdf); [12 principles summary, UAL blog](https://qingsongch.myblog.arts.ac.uk/?p=18)).
- Smear frames stretch or multiply an object between key poses, mimic motion blur, and keep fast movement readable ([RebusFarm smear frames](https://static.rebusfarm.net/blog/smear-frames-in-animation-how-animators-create-fast-and-dynamic-motion), a blog source).
- Motion blur in After Effects is set by shutter angle: default 180° with -90° phase, about 1/48 s at 24 fps. Higher frame rates give shorter blur trails. Generous blur reduces stutter but hurts the readability of things like text, and the source recommends previewing rather than following a formula ([ProVideo Coalition: motion blur](https://www.provideocoalition.com/motion_blur/); [Wipster: debunking the 180° rule](https://www.wipster.io/blog/debunking-the-180-degree-shutter-rule)), both via search summary.
- Joey Korenman (School of Motion) prefers the value graph for shaping eases. Speed-graph handles set how long an object takes to build speed and how sharply it decelerates ([School of Motion: Intro to the Graph Editor](https://www.schoolofmotion.com/tutorials/intro-to-the-graph-editor-in-after-effects/)).
- Ben Marriott says he dropped easing plugins to master the graph editor, and builds around "snappy, smooth eases" ([transcript, voicetube](https://jp.voicetube.com/videos/123011)).
- No published motion specs from Rolex, Cartier, Hermès, Amex Centurion, Revolut Metal or Stripe were found. Stripe job listings mention an internal motion system with "principles, timing tokens and animation guidelines", but it is not public ([Stripe careers: Motion Designer, Stripe Identity](https://stripe.com/jobs/listing/motion-designer-stripe-identity/7769564)).

### Inferences
- **Budget at 60 fps (54 frames).** Suggested split:
  - 0–80 ms: dove already in flight, entering from just off the wordmark's left or lower-left edge. Don't start from rest, because there's no time for take-off.
  - 80–450 ms: one gentle arc over or behind "EZE", 2–3 wingbeats.
  - 450–700 ms: braking flare and descent onto the R.
  - 700–900 ms: touchdown, wing fold, settle.

  The wordmark fade (0.3 → 1, ease-in-out) should reach about 0.9 around 650 ms, so the type is "there" when the bird lands, and the landing is the last beat.
- **Curves.**
  - Use one curve per job. The flight path progress is decelerate-only (emphasized decelerate or `0.23,1,0.32,1`, the easeOut EZER already uses in `theme/type.ts`). No ease-in at the start, because the bird enters at speed.
  - The fade can stay ease-in-out as specified, but keep it a separate track from the flight.
  - No overshoot or bounce on position. "Settle" should come from the wings and body (secondary motion), not from the bird's position overshooting the perch.
- **Travel.** Keep total path length to about 1–1.5 wordmark widths. A full circle around "EZER" in under 500 ms forces peak speeds where a white shape covers its own body length or more per frame at 60 fps. That is what reads as a "white streak" or a flash, especially on #151021 and black, where contrast is highest. If the bird moves more than about half its body length per frame, shorten the path or slow the peak.
- **Blur.** Prefer short, directional blur (or a single smear frame) only at peak speed. Keep the bird crisp from flare onward, because the landing pose must read sharply. On a phone, fake blur with 1–2 low-opacity trailing copies or a pre-rendered blurred sprite frame rather than a real-time blur filter.
- **Luxury pacing.**
  - Most of the time goes to the bird decelerating and holding still.
  - The type must not move, only fade. Luxury marks rarely scale or bounce.
  - End on stillness: the last 150–200 ms should be almost static, with a tiny wing settle.

### Gaps
- No primary-source timing data (frame counts, durations) for Rolex, Cartier, Hermès, Apple, Amex Centurion, Revolut Metal or Stripe intros. These would have to be measured frame by frame from their published videos.
- No source gives a quantitative "pixels per frame before streaking" threshold. The half-body-length-per-frame rule above is a heuristic of mine.
- The Jung & Dubois (2023) citation could not be verified at the primary source.

## How pros stage a bird landing on a logo: flare, wing settle, held pose, and how the bird interacts with the type (passing behind or in front, occlusion, shadow, light sweep)

### Takeaway
Real birds brake before the perch, not on it. The approach is a short dive or glide, then a rapid pitch-up with wings spread wide as an air-brake (the "flare"). The bird stalls within reach of the perch, the feet reach forward, the wings beat once or twice in a backstroke, then fold. In animation the head leads and the tail follows last. For depth, have the dove pass behind one letter, then come in front to land, with a soft contact shadow and at most one faint sheen on the letters.

### Cited Findings
- Birds must brake BEFORE reaching the perch, because they have no runway. Slowing in flight risks a stall. In about 1,500 motion-captured flights, Harris's hawks dived while flapping, then spread their wings and swooped UP to the perch, stalling within grabbing distance. They were not minimizing time or energy but limiting how far from the perch they stalled ([Oxford thesis](https://ora.ox.ac.uk/objects/uuid:a439bd30-3916-4fe9-ba06-c65fd1547048); [The Engineer: Harris hawks show perching aircraft how to land](https://theengineer.co.uk/content/news/harris-hawks-show-perching-aircraft-how-to-land); [Oxford Biology](https://www.biology.ox.ac.uk/node/2610046)), via search summary.
- Raptors brake aerodynamically with a "rapid pitch-up manoeuvre executed at the end of a gliding approach", producing high drag ([Oxford ORA thesis](https://ora.ox.ac.uk/objects/uuid:a439bd30-3916-4fe9-ba06-c65fd1547048)). An eagle study found the bird raised its wings to a steep angle and gained altitude during landing ([BirdGuides: The hawk has landed](https://www.birdguides.com/articles/the-hawk-has-landed-how-birds-touch-down-safely)).
- Some birds pitch their wings to a high angle of attack just before touchdown. Others fold their wings in a sweeping motion to decelerate precisely ([UCF thesis](https://stars.library.ucf.edu/etd2020/1497)).
- Feathers flare open on the downstroke to catch air and contract on the upstroke to cut drag ([Lynda: 2D Animation: Animate Flying Creatures](https://origin-www.lynda.com/3D-Animation-tutorials/Small-birds/501129/602246-4.html)).
- In bird animation the head often leads, the tail reacts last, and wingtip and trailing-edge arcs should be checked ([Animation Mentor: How to animate birds in flight](https://www.animationmentor.com/blog/tutorial-how-to-animate-birds-in-flight/)), via search summary.
- A landing critique: the landing needed more weight and follow-through, and the character must settle its balance afterwards ([community forum via search](https://simplymaya.com/forum/showthread.php?p=41491)).
- Stephen Cunnane's short "Flight Manifest" breaks down bird flight from take-off to landing in silhouette, and was made as a reference for animators ([Aeon](https://aeon.co/videos/flight-manifest-from-take-off-to-landing-a-birds-eye-introduction-to-flying)). This is the best single reference clip found for the landing.
- Occlusion technique: use shapes to cover parts of the text, then animate the figure moving through the layers ([Vyond](https://www.vyond.com/?p=5574), via search summary; the page itself returned only an image).
- deVOL Kitchens' dove animation had a dove perched on the logo that, as it flew away, nudged a letter into place. This is a precedent for a bird physically interacting with a wordmark ([deVOL: The Bird Animation](https://www.devolkitchens.com/blog/?p=18068)).
- Free vector bird tutorial with downloadable bird file and expressions, commercial use allowed: Jack Hermes, YouTube `youtu.be/Dv-9frRHq3Y` ([Gumroad](https://jackhermes.gumroad.com/l/bviix)).

### Inferences
- **Landing beats within about 450 ms (450–900 ms).**
  1. Glide or slight dive toward a point just below and left of the R's mark (about 100 ms).
  2. Pitch-up: the body rotates nose-up 30–50°, wings spread to full span, and the bird rises slightly onto the perch (about 120 ms). This IS the anticipation. Don't add a separate wind-up.
  3. One or two short backstrokes, wings forward and down, with the feet reaching forward (about 100 ms).
  4. Contact: the body dips 2–4% under its own weight, the head stays level and arrives first (about 60 ms).
  5. Wings fold in two overlapping stages (primaries last), the tail flicks once and settles (about 120 ms).

  Then hold. The hold must match the static dove mark exactly, so the hand-off to the static logo has no pop.
- **Hand-off to the dove mark.** The live bird should land and then cross-fade or morph INTO the small dove mark over about 80–120 ms, or land exactly on its silhouette. Otherwise you get two doves. This is the single most important continuity detail.
- **Depth through occlusion.**
  - Fly the dove BEHIND the first "E" or "Z" (mask the bird with that letter's shape) on its arc, then in FRONT of "E-R" for the landing. One occlusion is enough: it proves the type has a plane and the bird has a path through space.
  - More than one pass-behind in 900 ms reads as busy.
- **Shadow.** A very soft, low-opacity contact shadow under the bird as it nears the R (about 6–10% black on cream, near 0 on dark themes) sells the landing. Skip cast shadows on the other letters during flight, because they flicker at that speed.
- **Light sweep.** If you use one, a single faint highlight should travel across the letters following the bird's position, offset slightly behind it, peaking at about 15–25% over the base, and appear only once. On cream, a sweep on dark type should be a subtle lighten. On dark themes it can be a warm (gold-ish) lift. Never sweep and fade the same letters at full strength together, or the fade looks like a flash.

### Gaps
- No YouTube tutorial was found that specifically shows a bird landing on a logo with timestamps. Searches for "dove logo animation", "bird logo reveal" and similar returned templates (Motion Array, Envato, Gumroad) rather than craft breakdowns. Timestamped tips from Ben Marriott, Jake in Motion, School of Motion or Motion Design School on this topic could not be confirmed, so none are claimed.
- The bird-landing biomechanics are from raptor studies (hawks, eagles). No dove/pigeon-specific landing study was retrieved, though pigeons are a common subject in the literature.

## Restraint: what to remove, and colour/lighting for a white bird on cream versus dark

### Takeaway
Remove everything that isn't the bird, the fade and the landing: no particles, glow trails, sparkles, lens flares, camera moves, bounce, or letter-by-letter type animation. A white bird on cream (#F7F3EA) has almost no luminance contrast, so it needs a cool or neutral grey shadow side and a soft contact shadow. On #151021 and black it has too much contrast, so use slightly off-white feathers, a subtle rim light rather than a glow, and no bloom.

### Cited Findings
- Apple's HIG launch-screen guidance: the launch screen is "not an onboarding experience or a splash screen" and "not an opportunity for artistic expression". It should be nearly identical to the app's first screen, and elements that change when launch completes cause an unpleasant flash ([Apple HIG: Launching](https://developer.apple.com/design/human-interface-guidelines/launching); quoted via search summary of [developer-rno mirror](https://developer-rno.apple.com/design/human-interface-guidelines/patterns/launching)). This governs the static OS launch screen. An in-app animated loading screen comes after it, so the static launch screen should show the FINAL frame (wordmark plus perched dove at 0.3 opacity or the end state) to avoid a flash.
- Luxury ident guidance: minimal motion, subtle easing, no bounce, and colours and typography kept consistent during the animation ([brand-marketing principles](https://skills.cat/skills/dylantarre/animation-principles/brand-marketing)).
- A vendor case study (Moët & Chandon) credits lower cognitive load to "single-point movements", meaning one thing moves at a time ([Advids](https://advids.co/our-portfolio/branding-animation)). This is vendor marketing, not independent analysis.
- Generous motion blur reduces readability ([ProVideo Coalition](https://www.provideocoalition.com/motion_blur/)).
- Template marketplaces' "elegant/luxury logo" reveals mostly rely on gold particles, shine and smoke ([Motion Array: Elegant Particle Logo](https://motionarray.com/after-effects-templates/elegant-particle-logo-34471/); [Envato: gold and silver logo reveal](https://elements.envato.com/gold-and-silver-logo-reveal-ASCUE36)). These are the tropes that mark a reveal as stock, which is a reason to avoid them.

### Inferences
- **Remove list:**
  - particles or feathers drifting
  - glow trail behind the bird
  - sparkle on touchdown
  - camera push-in or zoom
  - scaling or overshoot on the wordmark
  - per-letter stagger (with the fade already at 0.3 → 1, staggering adds noise)
  - sound-synced flourishes
  - a second loop
  - multiple light sweeps

  Keep one hero (the dove), one support (the fade) and one optional accent (a single sheen or contact shadow, not both at full strength).
- **Cream #F7F3EA.**
  - A pure #FFFFFF bird reads only by its shading. Give the shadow side a cool grey (around #CFCBC4 to #B9B4AC). Keep the highlights pure white so the bird is visibly whiter than the paper.
  - Add a soft, low-opacity ambient-occlusion contact shadow when it perches.
  - No rim light: it disappears against cream.
- **Deep purple #151021.**
  - Use a slightly warm off-white (#F3EFE8-ish) so it doesn't vibrate.
  - Add a faint cool or lavender rim on the back edge to tie it to the background.
  - Skip shadows, since they're invisible. Rely on occlusion for depth.
- **Black.**
  - Same as purple, but cap the brightest feather value below pure white or add a very slight tone curve. Pure white on true black at speed is where the "white streak" or after-image is worst, especially on OLED.
  - Lower the peak speed or add a short blur at the fastest frames.
- **Reduce Motion.** With the OS setting on, skip the flight. Fade the wordmark and show the perched dove statically. This matches how the EZER codebase already handles reduced motion (`useReduceMotion()` in `components/redesign/Primitives.tsx`).
- **Asset approach for a "realistic" dove.** In a React Native app, a pre-rendered sprite sequence or a Lottie/Rive file with baked feather shading will look far more realistic, and cost less at runtime, than procedurally animating vector wings. Render one variant per theme, or one with alpha plus a theme-tinted rim pass. Bake the blur into the 2–4 fastest frames.

### Gaps
- No authoritative source on colour or lighting for white subjects on off-white versus near-black backgrounds in motion design specifically. The palette numbers above are my suggestions, not sourced values.
- Apple HIG motion page body could not be retrieved, so no direct quotes on decorative motion or Reduce Motion are included beyond the launch-screen guidance.
