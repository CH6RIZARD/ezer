# Blender pipeline: rigged white dove flying a designed path and landing, rendered for compositing over a 2D wordmark

Scope: Blender 4.x/5.x (the current manual is "Blender 5.2 LTS"), Python-scriptable, headless `blender -b`, Windows CPU laptop, free tools only.
Legend: anything under "Cited Findings" has a source. Anything under "Inferences" is my synthesis or practitioner knowledge that I could NOT verify with a source in this pass. Treat those as "test before relying on". All code snippets are my construction (unexecuted), built against the API facts cited in section 6.

---

## 1. Moving a rigged bird along a path (Follow Path vs Clamp To vs baked keys; banking; speed/easing; exact landing)

### Takeaway
Use a **Follow Path constraint on the armature object (or its root bone), with Follow Curve on**, and drive it with a keyframed **Evaluation Time** (or Fixed Position + Offset Factor 0→1) so you can shape speed with F-curve easing. Put the curve's last point exactly on the landing target. Bank by tilting curve points (Ctrl+T); the follower picks up tilt only with Follow Curve on. Once it looks right, bake with Visual Keying so the result no longer depends on the constraint.

### Cited Findings
- Follow Path options (manual 4.5): **Follow Curve**: "If this option is not activated, the owner's rotation is not modified by the curve." **Curve Radius**: "Scales the object based on the curve's radius." **Fixed Position**: "Locks the object to a specific position along the curve, regardless of animation." **Offset**: "Offsets the object's position along the curve in frames (relative to the animation settings)." **Forward Axis**: "The axis of the object that has to be aligned with the forward direction of the path." **Up Axis**: "The axis of the object that has to be aligned (as much as possible) with the world Z axis." **Animate Path**: "Automatically creates an F-Curve to control the object's motion along the path." Tip: works well combined with Locked Track (e.g. to control roll). — [Blender Manual 4.5, Follow Path](https://docs.blender.org/manual/nb/4.5/animation/constraints/relationship/follow_path.html)
- Timing comes from the **curve's** Path Animation settings: **Frames** (`path_duration`) is the number of frames needed to traverse the path and sets the maximum of **Evaluation Time** (`eval_time`). By default Evaluation Time is linked to the global frame, but you can keyframe it for more control. — [Manual 2.80 Path Animation](https://docs.blender.org/manual/en/2.80/modeling/curves/properties/path_animation.html); [Manual 4.4 Follow Path](https://docs.blender.org/manual/sr/4.4/animation/constraints/relationship/follow_path.html)
- A scripted pattern seen in a production rigging tool: set `curve.data.path_duration`, set `curve.data.eval_time = 0`, then `curve.data.keyframe_insert('eval_time', frame=...)`. — [auto_walk commit, Autour de Minuit](https://git.autourdeminuit.com/autour_de_minuit/auto_walk/commit/29623d4c3bc30214187af92e2ea1cd62e933284e)
- Pitfall: Animate Path can misbehave if path duration or the related value is zero. Make sure `path_duration` is non-zero before keying. — [Blender bug T55933](https://developer.blender.org/T55933)
- **Clamp To vs Follow Path:** Follow Path is time-based; Clamp To positions the object from a location property. One user preferred Clamp To for control but noted it **does not orient the object along the curve**. (So Clamp To needs an extra Damped Track / Locked Track toward a lead target for heading.) — [Manual 4.4 Follow Path](https://docs.blender.org/manual/sr/4.4/animation/constraints/relationship/follow_path.html); [BlenderArtists: bake constrained object](https://blenderartists.org/t/how-do-you-bake-out-animation-on-a-constrained-object/1521738)
- **Banking:** select a curve control point, Ctrl+T to tilt it, with Follow Curve enabled in the constraint. — [BlenderArtists thread](https://blenderartists.org/t/making-a-camera-follow-a-path-why-so-difficult/1272829). Tilt rotates a control point and changes how followers are oriented. — [Blender FAQ (old)](https://museum.state.il.us/ismdepts/library/linuxguides/blender/blender_faq_61.html). **Conflicting report:** one user says a Follow Path object did *not* pick up curve tilt. — [BlenderArtists: Follow Path copy tilt?](https://blenderartists.org/t/can-an-object-mesh-with-a-follow-path-constraint-copy-the-tilt-of-a-curve/1147159). Alternative suggestion: keyframe the rotation instead (mind the origin). — [CG Cookie](https://blog.cgcookie.com/?p=17383)
- For a bird specifically: attach the bird's **root bone or master parent** to the path, and bake the path constraint into keyframes. — [BlenderArtists: bird flight path](https://blenderartists.org/t/how-can-i-use-a-curve-to-create-an-animated-birds-flight-path-in-the-ge/667646)
- **Baking:** with **Visual Keying** the bake "bakes in the actual transformation values based on the position after the constraint is applied". Without it, the constraint is ignored. After baking you can delete the path and the object still moves because it is keyframed. — [BlenderArtists: bake constrained object](https://blenderartists.org/t/how-do-you-bake-out-animation-on-a-constrained-object/1521738); [BlenderArtists: convert path anim to keys](https://blenderartists.org/t/convert-path-animation-to-keyframed/1159277)
- Known bug: "NLA Bake action broken for bone following path" (#61985). If you put Follow Path on a *bone*, verify the bake. Putting it on the armature *object* avoids this. — [Blender issue #61985](https://projects.blender.org/blender/blender/issues/61985)

### Inferences
- **Recommended setup.** Leave the armature object unconstrained in rotation except via Follow Path. Constrain the **armature object**, not a bone, to a Bezier/NURBS path. Set Forward Axis to the rig's nose direction (many bird rigs face −Y; check yours) and Up = Z. Turn **Follow Curve** on.
- **Speed and easing.** Either option works:
  (a) Keep `use_fixed_location = False` and keyframe the curve's `eval_time` from 0 (frame A) to `path_duration` (frame B). The F-curve's Bezier handles give ease-in/out. Or
  (b) Set `use_fixed_location = True` and keyframe the constraint's `offset_factor` 0.0 → 1.0. This is normalized and independent of `path_duration`, which I find easier for scripting.
  For a landing, use a strong ease-out into the last key (e.g. F-curve interpolation 'BEZIER' with `easing='EASE_OUT'`, or 'EXPO'/'CIRC' EASE_OUT). The bird then decelerates into the perch.
- **Exact landing.** The last control point of the curve IS the landing point (feet/root location). Make the final segment's tangent nearly horizontal, coming in slightly from above, so the "Follow Curve" orientation flattens out at touchdown. At the end key, the bird sits exactly on the last point (offset_factor = 1.0). Then hold: either keep the constraint at 1.0, or bake and add a short settling/fold action in place. Because the rig root is at the end point, place the root at the feet (or offset the curve by the root-to-feet distance).
- **Banking from curvature (scripted).** For each path point, compute signed curvature in the screen plane (cross product of the incoming and outgoing tangents) and set `point.tilt = k * curvature`, clamped to roughly ±40°. Smooth tilts over neighbours. Tilt on the last 2 points = 0 so the bird lands level. Check in the viewport that Follow Curve actually picks up the tilt in your version (sources conflict). If it doesn't, put the bank on a child "bank" bone or a second empty, driven by the same values, rather than on the constrained object.
- **Clamp To + Damped Track** fits when you want location from an arbitrary keyed scalar on a 3D curve and heading from a lead empty sliding a few frames ahead. That is more parts than Follow Path and gives no benefit here.
- **"Keyframed position from a curve"** (sample the curve in Python every frame and insert loc/rot keys) gives full control and no constraint at render time. It is the most deterministic for a batch/headless pipeline. Baking with Visual Keying gets the same result with less code.
- Note that a curve's Evaluation-Time parameterisation is not guaranteed to be constant speed in arc length for uneven control-point spacing. Check by scrubbing, and space points evenly, or rely on the eased F-curve.

### Gaps
- I could not fetch the current (5.x) Follow Path manual body or the `FollowPathConstraint` API page: the pages returned navigation only. Default values of `forward_axis`/`up_axis`, and whether `offset_factor` is arc-length-uniform, are unverified.
- Whether Follow Curve honours curve tilt in Blender 5.x is unresolved: sources conflict, and the "doesn't" report is older. Test it.

---

## 2. Flap cycle: looping wingbeat, rate vs speed, glide vs flap, landing flare, folding to perch

### Takeaway
Animate one flap on the wing bones (shoulder → forearm → hand/primaries), with each bone's keys offset 1–2 frames later than its parent to get overlap. Make it loop with an F-curve **Cycles** modifier, or as an NLA strip with **Repeat**. Change wingbeat rate with the strip's **Scale**. Build separate actions for flap, glide, landing flare and perch fold, and blend them on NLA strips with blend-in/out. In Blender 5.x, script F-curves through action **channelbags**, because `action.fcurves` was removed.

### Cited Findings
- Bird-flight principles (Maya, but engine-agnostic): wing tips should be loose and show follow-through as they push against the air. The body and head move with each flap, and the tail reacts last. — [Animation Mentor: How to animate birds in flight](https://www.animationmentor.com/blog/tutorial-how-to-animate-birds-in-flight/)
- Minimal rig approach: three bones (body + two wings), an Armature modifier, and Graph Editor keyframes for the flap cycle. — [Foro3D: A quick way to animate birds in Blender (2026)](https://foro3d.com/en/2026/february/a-quick-way-to-animate-birds-in-blender.html)
- 2D wing-flap timing after *The Animator's Survival Kit*: only ~8 wing frames need to be drawn, then looped. — [BlenderNation: How to animate 2D bird wing flap](https://www.blendernation.com/2021/06/12/how-to-animate-2d-bird-wing-flap/)
- Large-scale reference: DreamWorks' "Flap Flap Away – Animation Cycle Multiplexing" talk (cycle reuse for flocks). — [DreamWorks Research PDF](https://research.dreamworks.com/wp-content/uploads/2019/10/talk_multiplexing_stage2.pdf)
- F-curve modifier type `'CYCLES'` = "cyclic extend/repeat keyframe sequence", added via `fcurve.modifiers.new(type='CYCLES')`. — [bpy FCurveModifiers (2.80)](https://www.docs.blender.org/api/2.80/bpy.types.FCurveModifiers.html)
- NLA strip `repeat` = number of times to repeat the action range (0.1–1000). `scale` = scaling factor for the action (0.0001–1000). Strip `modifiers` is read-only, so put modifiers on the action's F-curves. — [bpy NlaStrip](https://docs.blender.org/api/2.75/bpy.types.NlaStrip.html) (old API page; these properties persist in current versions)
- **Blender 5.0 breaking change:** "The legacy `Action` API has been removed": `action.fcurves`, `action.groups` and `action.id_root` are gone. Use `channelbag.fcurves`/`channelbag.groups`. `action.id_root` is replaced by `action_slot.target_id_type`. — [Blender 5.0 Python API release notes](https://developer.blender.org/docs/release_notes/5.0/python_api/)
- Channelbag access: `ActionKeyframeStrip.channelbag(slot, ensure=...)`. `ActionChannelbag.fcurves` supports `new()`, `new_from_fcurve()` and `clear()`. — [bpy 5.0 ActionKeyframeStrip](https://docs.blender.org/api/5.0/bpy.types.ActionKeyframeStrip.html); [bpy 5.0 ActionChannelbag](https://docs.blender.org/api/5.0/bpy.types.ActionChannelbag.html); [bpy 5.0 ActionChannelbagFCurves](https://docs.blender.org/api/5.0/bpy.types.ActionChannelbagFCurves.html). The manual warns that layers/strips are exposed in Python, so scripts must account for them. — [Manual 5.0 Actions](https://docs.blender.org/manual/en/5.0/animation/actions.html)

### Inferences
- **Flap cycle construction (dove, pose-mode keys on wing bones):**
  - Frame 0 = top of upstroke: wings raised, hand/primaries trailing (bent back).
  - Downstroke to about 40–50% of the cycle: shoulder rotates down. The forearm follows 1 frame later and the hand 2 frames later (offset keys, or shift those bones' keys in the Dope Sheet). Primaries spread at mid-downstroke.
  - Upstroke: the wing partially folds at the wrist (hand rotates in) to reduce drag, then re-extends at the top.
  - The body bobs opposite to the wings: up on the downstroke, a few cm. The head counter-stabilises. The tail lags by 2–3 frames.
  - Make the last key equal the first and add a Cycles modifier to each F-curve. In 4.x/5.x you can also set the Action's "Cyclic Animation"/manual frame range so the NLA loops cleanly.
- **Rate vs speed.** At 24/30 fps, a small bird's flap cycle is short: a cycle of roughly 6–10 frames reads as a dove-sized bird at 24 fps (eyeball it; see Gaps). Put the flap action on an NLA strip and set `strip.scale` (1.0 = authored rate, 0.7 = faster). For a continuous rate change, keyframe the strip's **Strip Time** (`use_animated_time` + `strip_time`), so flap rate tracks path speed: faster on take-off, slower into the flare.
- **Glide vs flap.** Make a "glide" pose action: wings extended, slight dihedral, primaries spread, tiny tail adjustments. Put it on a second NLA track above flap with `blend_in`/`blend_out` (or animate `influence`) so glide sections cross-fade in. A logo reveal typically wants flap → glide → flare → land.
- **Landing flare** (~0.5–1 s before touchdown):
  - Body pitches up 30–60°.
  - Wings swing forward and up with big, slower "braking" beats, cupped and with primaries spread.
  - The tail fans and pitches down.
  - Legs drop forward from the tucked flight pose, feet reaching ahead of the body.
  - At contact: a small squash/settle on the legs, then the wings fold (shoulder down/back, forearm and hand folding along the body over ~8–12 frames, primaries crossing over the tail). The head bobs once.
  
  Author these as separate actions ("flare", "land_fold", "perch_idle") and sequence them on NLA tracks. Key the hand-off frames to the path-progress keys from section 1, so touchdown happens exactly when `offset_factor` hits 1.0.
- **Pitch from path vs flare.** Follow Curve will pitch the bird along the descending tangent. For the flare you want the body to pitch *up* while still moving forward and down. Add that rotation on a child root/body bone in the flare action, layered on the path orientation, rather than fighting the constraint.
- **5.x scripting:** use `bpy_extras.anim_utils.action_get_channelbag_for_slot(action, slot)` (added with slotted actions in 4.4, as far as I know; verify) or `action.layers[0].strips[0].channelbag(slot, ensure=True)` to reach the F-curves. Any old snippet using `obj.animation_data.action.fcurves` breaks on 5.x.

### Gaps
- No sourced wingbeat frequency for rock doves/pigeons was gathered in this pass. Look it up before tuning frame counts, or time it from reference video.
- I found no single, high-quality Blender-specific tutorial on a full 3D bird flight cycle with flare and landing. Searches returned 2D/Grease Pencil, Maya, rigging-only, or particle-flock videos (see section 7).

---

## 3. Rendering for compositing: orthographic layout camera, transparency, alpha, motion blur, engine choice, color management, render time

### Takeaway
Use an **orthographic camera** looking straight at a plane where the wordmark layout lives, with **Film > Transparent** on. Write a **PNG RGBA sequence**, which Blender writes as straight alpha for 8-bit, or **EXR**, which is premultiplied and safest. Turn on **object motion blur** (Cycles shutter ~0.5). Use **Cycles on CPU** if you need a real **shadow catcher** for the contact/drop shadow, because EEVEE has none. Use the **Standard** view transform if the white dove and white type must hit true white; AgX intentionally rolls whites off to grey.

### Cited Findings
- **Film > Transparent:** "Render the background transparent, for compositing the image over another background after rendering." **Transparent Glass:** "Render transmissive surfaces as transparent, for compositing glass over another background." **Roughness Threshold:** "For transparent glass, keep surfaces with roughness above the threshold opaque." **Pixel Filter:** Blackman-Harris is the default ("better balance between smoothness and detail preservation"). For Width, "Lower values give more crisp renders, higher values are softer and reduce aliasing." Film **Exposure** works on the data, not on the view transform. — [Manual 5.2 Cycles Film](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/film.html)
- **Cycles motion blur:** Position = when the shutter opens relative to the frame (Start/Center/End on Frame). **Shutter** = duration in frames (1.0 blurs across a full frame). Shutter Curve and Rolling Shutter options. **Limitation: camera motion blur doesn't work with orthographic cameras.** Light movement isn't blurred. — [Manual 5.2 Cycles Motion Blur](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/motion_blur.html)
- **EEVEE motion blur:** Position/Shutter as in Cycles. **Bleeding Bias** keeps the background from blurring over the foreground. **Max Blur** limits blur radius in pixels as an optimisation. **Steps** = accumulation steps (more = more accurate, slower). — [Manual 5.2 EEVEE Motion Blur](https://docs.blender.org/manual/en/latest/render/eevee/render_settings/motion_blur.html)
- **Shadow Catcher (Cycles object setting):** "Enables the object to only receive shadow rays." It still interacts with CG objects via indirect light. Results differ depending on whether the **Shadow Catcher pass** is enabled in the view layer: with the pass on, "all indirect light interactions are captured". Without it, a simpler method is used. — [Manual 5.2 Cycles Object Settings](https://docs.blender.org/manual/en/latest/render/cycles/object_settings/object_data.html)
- **EEVEE (Next, 4.2+) has no real shadow catcher.** Workarounds use Shader to RGB plus a Color Ramp into a Mix Shader with transparency, and only work if the ground is otherwise fully lit. They can't capture coloured shadows or bounce. Commenters say to use Cycles for shadow catching. — [BlenderArtists: Shadow catcher in EEVEE-Next 4.2](https://blenderartists.org/t/shadow-catcher-in-eevee-next-blender-4-2/1548135); [BlenderArtists: shadow catcher issue 4.2](https://blenderartists.org/t/issue-with-shadow-catcher-in-blender-4-2/1547004)
- **Alpha in PNG:** the PNG spec stores unassociated (straight) alpha. Blender's internal render buffers are premultiplied, and Blender converts on save. There was a bug where **16-bit PNG** saved premultiplied (#99186) and one where re-saving 16-bit RGBA PNG corrupts alpha (#99701). 8-bit PNG was not affected in #99701. — [Blender issue #99186](https://projects.blender.org/blender/blender/issues/99186); [Blender T99701](https://developer.blender.org/T99701); [Blender 2.66 image transparency notes](https://wiki.blender.jp/Dev:Ref/Release_Notes/2.66/Image_Transparency); [bf-committers 2011](https://lists.blender.org/pipermail/bf-committers/2011-July/032673.html)
- **AgX vs Standard:** AgX is a sigmoid that maps unbounded scene values into [0,1], so a surface lit to "white" can display below full white. Standard clips: it blows out bright areas and skews hues toward neon in the highlights. In AgX, bright colours go toward white like a real camera. — [EaryChow/AgX (GitHub)](https://github.com/EaryChow/AgX); [Blender 4.0 color management notes](https://wiki.blender.org/release_notes/4.0/color_management/); [BlenderArtists: Filmic and emissive colors](https://blenderartists.org/t/why-does-only-filmic-color-management-seem-to-handle-intense-emissive-colors-well/1573545)
- Blender 5.0 (released 18 Nov 2025) reworked color management with wide-gamut/HDR support, ACES 1.3/2.0 views and AgX HDR. Subsurface scattering is reportedly more accurate. EEVEE material compilation is reportedly up to ~4x faster (secondary commentary). — [Blender 5.0 EEVEE release notes](https://developer.blender.org/docs/release_notes/5.0/eevee/); [osarch: Blender 5.0 released](https://osarch.org/2025/11/18/blender-5-0-released/); [Ubunlog summary](https://en.ubunlog.com/blender-5-0-novedades-renderizado-hdr/) (secondary)
- **EEVEE needs OpenGL/GPU even with `-b`.** Cycles on CPU needs none. EEVEE in background mode needs a GPU context, which is a problem on headless Linux servers. — [devtalk: EEVEE background rendering](https://devtalk.blender.org/t/blender-2-8-unable-to-open-a-display-by-the-rendering-on-the-background-eevee/1436/19); [Blender issue #54633](https://projects.blender.org/blender/blender/issues/54633)
- Material Output **Thickness** (EEVEE only) approximates inner geometry for SSS/translucency/refraction. If unconnected, it defaults to a value based on the object's smallest dimension. 0 disables it. — [Manual 5.2 Material Output](https://docs.blender.org/manual/en/latest/render/shader_nodes/output/material.html)

### Inferences
- **Ortho camera ↔ 2D layout mapping.** Point the camera down −Y (front view) or −Z at a "layout plane". With `cam.data.type='ORTHO'`, `ortho_scale` = world-units span of the **larger** render dimension. For a W×H px canvas with W ≥ H:
  - `px = W/2 + (x − cam.x) * W/ortho_scale`
  - `py = H/2 − (z − cam.z) * W/ortho_scale` (image y down).
  - Choose `ortho_scale = W/100` and every world unit = 100 px. That makes path coordinates in Figma/SVG pixels trivially convertible: `world = (px − W/2)/100`. Keep `pixel_aspect` 1 and no `shift_x/y`, or include shift in the formula.
  - Depth (distance from camera) does not change size in ortho, so the bird can move in depth for occlusion without scaling. The perspective cue of "coming toward the viewer" is lost. If you want that, use a long-lens perspective camera and accept a non-linear mapping.
- **Motion blur in ortho:** the cited limitation is *camera* motion blur. Object/deformation blur of a moving bird should still work with a static ortho camera. Enable `render.use_motion_blur = True` and shutter 0.5 (180°). Fast wing tips will smear nicely. Verify deformation blur on the armature (object property "Deformation" under Motion Blur, Cycles).
- **Engine choice for white feathers:**
  - **Cycles (CPU)** gives correct soft shadows, the shadow catcher, accurate SSS/sheen, and nice AO on a white body. It needs denoising (OpenImageDenoise runs on CPU).
  - **EEVEE** is much faster *if the laptop's integrated GPU works*. But: no true shadow catcher, screen-space effects, and it needs a GPU context on Windows (a normal logged-in desktop session is fine).
  - Practical split: render the **bird in Cycles** with a shadow-catcher ground plane, since that gives the contact/drop shadow on transparent alpha, and do the type in 2D.
- **White feather material (Principled BSDF):**
  - Base color about (0.85–0.9) grey-white, not 1.0, so shading reads.
  - Roughness ~0.5–0.6.
  - Small **Sheen** (weight ~0.2–0.5, light tint) for the soft "fuzz" rim on feathers.
  - A little **Subsurface** (weight ~0.05–0.15, small radius, warm scale) for thin-wing translucency when back-lit.
  - Optional a faint blue-grey in occluded areas via AO.
- **Lighting:** a large soft key light (area light, big size) from upper-left, a cool fill, and a strong **rim/back light** to separate a white bird from a white or light background. Exposure low enough that the key-lit side lands at ~0.9–0.95 display, not clipped.
- **View transform:** if the wordmark/background is a flat brand colour composited in 2D, use **Standard**, then grade the white to the brand's white. AgX makes "white" read slightly grey unless you raise exposure. If you keep AgX, match exposure so the brightest feather ≈ 0.95. Whatever you choose, use the same transform for every variant.
- **Alpha deliverable:**
  - 8-bit PNG RGBA (straight) is what browsers, After Effects (interpret as Straight), ffmpeg/WebM-alpha and Lottie/web overlays expect.
  - Avoid 16-bit PNG given the historical premultiply bugs.
  - EXR (premultiplied, half float, DWAA/ZIP) for an After Effects/Resolve/Natron comp.
  - Watch for dark/bright fringes on blurred feather edges if a straight PNG is interpreted as premultiplied, or vice versa.
- **Shadow catcher in the alpha:** with Film Transparent and a plane set as Shadow Catcher, Cycles writes the shadow into the alpha of the combined pass, so a straight overlay gets a soft drop shadow. For more control, enable the **Shadow Catcher pass** and multiply it over the background in the comp.
- **Samples / resolution (starting points):**
  - Cycles CPU: 1920×1080, adaptive sampling noise threshold 0.02–0.05, max samples 128–256, OIDN denoise, 4–6 light bounces (white SSS likes some).
  - Render at the exact pixel size of the deliverable × 1 (or × 2 for a retina web overlay).
  - Persistent Data on (`render.use_persistent_data = True`) to skip BVH rebuilds between frames.
- **Render-time estimate (rough, unverified):**
  - A small single-object Cycles scene (one bird with a few-thousand-poly rig, a plane, 3 lights) at 1080p, 128 adaptive samples plus OIDN, on a modern 8–16-thread laptop CPU: probably **~15–60 s per frame**.
  - A 4-second shot at 24 fps (~96 frames) would take ~0.5–1.5 h.
  - The same in EEVEE on an iGPU: a few seconds per frame.
  - Benchmark 3 frames with `-s/-e` before committing to a full batch.

### Gaps
- I could not fetch the 5.x Color Management manual page (timeout/404), so the exact current list of view transforms (Standard / AgX / Filmic / Khronos PBR Neutral / ACES) and their defaults in 5.x is unconfirmed.
- No sourced CPU render benchmarks for this scene type. The time estimates above are guesses to validate.
- Whether bug #99186 (16-bit PNG premultiplied) is fixed in 5.x is unknown.
- The Windows EEVEE `-b` behaviour on integrated GPUs was not confirmed by any Windows-specific source.

---

## 4. Text in Blender vs typesetting in 2D; occlusion of bird by letters (holdout)

### Takeaway
Typeset the wordmark in 2D (vector, exact kerning, brand-accurate color, crisp at any size). In Blender, import the same letters only as an **occluder**: either a Text object with the same font, or the SVG converted to curves. Give it a **Holdout** material, so the bird disappears behind letters where it passes "behind" them while the letters themselves render as alpha 0. Then the composite stacks: 2D wordmark → bird render (with holes) on top.

### Cited Findings
- **Holdout node** creates "a 'hole' in the image with zero alpha transparency, which is useful for compositing". No inputs. — [Manual 5.2 Holdout](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/holdout.html)
- Logo/text reveal technique references: Boolean objects as reveal masks ([ArtStation/Skillshare course](https://www.artstation.com/marketplace/p/ebAPx/create-simple-text-animation-in-blender), paid); a Render Layers method and a Shrinkwrap method ([Tuts+ part 1](https://cgi.tutsplus.com/how-to-create-text-reveal-motion-graphic-in-blender-part-1--cms-26939t), [part 2](https://cgi.tutsplus.com/how-to-create-text-reveal-motion-graphic-in-blender-part-2--cms-28487t)); a Geometry Nodes text reveal with spline factors and a Repeat Zone ([BlenderNation / TiFi Design](https://www.blendernation.com/2024/07/31/how-to-make-this-text-reveal-animation-in-blender-geometry-nodes/)); a particles + emission logo reveal rendered to ACES EXR for Resolve ([Mixing Light](https://mixinglight.com/color-grading-tutorials/blender-for-editors-part-1-logo-reveal/)); a procedural geometry-nodes + shader logo animation ([BlenderArtists](https://blenderartists.org/t/coolest-logo-animation-with-geometry-nodes-and-shader-nodes-in-blender-tutorial/1410164)).

### Inferences
- **Why 2D for type:** Blender text renders through the view transform, lights and AA. Brand colours shift (especially with AgX), hinting and kerning are worse than in a design tool, and every copy change needs a re-render. Compositing type in 2D (CSS/SVG, After Effects, Figma export) keeps the wordmark exact and lets the bird render be reused.
- **Occluder setup:**
  - Add a Text object: `bpy.data.curves.new(type='FONT')`, `curve.font = bpy.data.fonts.load(path_to_ttf_or_otf)`, `body = "EZER"`.
  - Or import the logo SVG (File > Import > SVG) and extrude slightly.
  - Align it on the ortho layout plane using the px↔world mapping from section 3, so it lines up pixel-exact with the 2D wordmark.
  - Give it a material with only a Holdout node into Material Output Surface.
  - Place the occluder **closer to camera** than the bird where the bird should pass behind letters. In ortho, depth doesn't change size, so you can move the bird in Y freely.
  - The occluder must not cast shadows onto the shadow catcher unless you want letter shadows. Turn off its shadow visibility in Object > Visibility > Ray Visibility (Cycles) if not.
- **Alternative without a holdout:** render the occluder on its own view layer or as a cryptomatte/object-index mask and cut in comp. Holdout is simpler and gives final alpha directly.
- **Landing on a letter:** model a thin invisible "perch" (the top edge of a letter, from the SVG) as the path end point. Optionally give the perch plane a Shadow Catcher so the dove casts a contact shadow on the letter.
- If you do render type in Blender, use an Emission shader at strength 1 with the **Standard** view transform. That is the closest to "flat brand colour".

### Gaps
- I found no specific YouTube tutorial demonstrating "bird passes behind holdout letters". The technique is standard, but no dedicated walkthrough was located.

---

## 5. Python (bpy) snippets: load, find armature, curve from points, Follow Path, frame range/fps, render settings, batch variants

### Takeaway
Everything is scriptable and runs headless with `blender -b scene.blend --python build.py -- <args>`. Mind the 5.x renames:
- EEVEE id `'BLENDER_EEVEE'`
- `ImageFormatSettings.media_type` must be set before `file_format`
- `scene.compositing_node_group` instead of `scene.node_tree`
- F-curves via channelbags.

### Cited Findings
- 5.0: "EEVEE's render engine identifier was changed from `BLENDER_EEVEE_NEXT` to `BLENDER_EEVEE`." — [5.0 Python API notes](https://developer.blender.org/docs/release_notes/5.0/python_api/)
- 5.0: "`ImageFormatSettings` now has a `media_type` member that needs to be set". Set `media_type` before `file_format`. File Output nodes take `directory` and `file_name` inputs, and `file_slots`/`layer_slots`/`base_path` were removed. — [5.0 Python API notes](https://developer.blender.org/docs/release_notes/5.0/python_api/)
- 5.0: "`scene.node_tree` was removed, use `scene.compositing_node_group` instead". `scene.use_nodes` is deprecated, always True. `scene.eevee.gtao_distance` moved to `view_layer.eevee.ambient_occlusion_distance`. `use_gtao`/`gtao_quality` were removed. Many render pass names changed. — [5.0 Python API notes](https://developer.blender.org/docs/release_notes/5.0/python_api/)
- 5.0: `action.fcurves`/`groups`/`id_root` were removed. Use channelbags. — same source.
- CLI:
  - `-b` = background.
  - `-a` = render the frame range.
  - `-s`/`-e` = start/end frames (relative +/- allowed).
  - `-o` = output path, where `#` = zero-padded frame number and a leading `//` is relative to the .blend.
  - `-F PNG` = format.
  - `-x 1` = add extension.
  - Example: `blender -b animation.blend -o //render_ -F PNG -x 1 -a`.
  - **Argument order matters:** options are processed left to right, so `-a` must come after settings/scripts.
  
  — [Manual 3.0 Command Line Arguments](https://docs.blender.org/manual/en/3.0/advanced/command_line/arguments.html); [blender man page](https://mankier.com/1/blender)

### Inferences (unexecuted code; written against the API facts above; test on your install)

```python
# build_dove.py  — run: blender -b dove_rig.blend --python build_dove.py -- --variant A --out //out/A_
import bpy, sys, math, argparse
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--variant", default="A")
ap.add_argument("--out", default="//render/dove_")
ap.add_argument("--engine", default="CYCLES")      # or BLENDER_EEVEE (5.x id)
ap.add_argument("--samples", type=int, default=128)
args = ap.parse_args(argv)

scene = bpy.context.scene

# --- find the armature (first ARMATURE object, or by name) ---
arm = next(o for o in scene.objects if o.type == 'ARMATURE')

# --- layout mapping: 100 px per world unit, canvas W x H, ortho cam looking down -Y ---
W, H, PPU = 1920, 1080, 100.0
def px_to_world(px, py, depth=0.0):          # 2D layout px (y down) -> world (x, y=depth, z)
    return Vector(((px - W/2) / PPU, depth, (H/2 - py) / PPU))

# --- curve from designed points (px from the design file); last point = landing perch ---
design_px = [(-200, 300), (400, 120), (900, 260), (1300, 420), (1460, 470)]
pts = [px_to_world(x, y, depth=-1.0) for x, y in design_px]   # -1: in front of letters? choose per shot

cd = bpy.data.curves.new("DovePath", type='CURVE')
cd.dimensions = '3D'
sp = cd.splines.new('NURBS')                  # NURBS: smooth through-ish; use BEZIER for exact pass-through
sp.points.add(len(pts) - 1)
for p, v in zip(sp.points, pts):
    p.co = (v.x, v.y, v.z, 1.0)
sp.use_endpoint_u = True                      # make NURBS start/end exactly on first/last point
sp.order_u = 4
path = bpy.data.objects.new("DovePath", cd)
scene.collection.objects.link(path)

# banking: tilt from signed 2D curvature (screen plane x/z), level at the end
for i in range(1, len(pts) - 1):
    a, b, c = pts[i-1], pts[i], pts[i+1]
    t1, t2 = (b - a).normalized(), (c - b).normalized()
    turn = t1.x * t2.z - t1.z * t2.x          # signed turn in the x/z plane
    sp.points[i].tilt = max(-0.7, min(0.7, -1.2 * turn))   # radians, sign: test it
sp.points[-1].tilt = 0.0

# --- Follow Path on the armature OBJECT ---
arm.location = (0, 0, 0)                      # constraint offsets from the object's own transform
con = arm.constraints.new('FOLLOW_PATH')
con.target = path
con.use_curve_follow = True
con.forward_axis = 'FORWARD_Y'                # match your rig's nose axis (often -Y: 'TRACK_NEGATIVE_Y')
con.up_axis = 'UP_Z'
con.use_fixed_location = True                 # drive by offset_factor 0..1

FPS, START, LAND, END = 24, 1, 84, 120
scene.render.fps = FPS
scene.frame_start, scene.frame_end = START, END

con.offset_factor = 0.0
con.keyframe_insert("offset_factor", frame=START)
con.offset_factor = 1.0
con.keyframe_insert("offset_factor", frame=LAND)   # touchdown exactly on last point

# ease-out into the landing: reach the F-curve through the 5.x channelbag API
from bpy_extras import anim_utils               # helper present since slotted actions (4.4+) — verify
ad = arm.animation_data
cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
for fc in cb.fcurves:
    if 'offset_factor' in fc.data_path:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'
        fc.keyframe_points[-1].handle_left_type = 'FREE'   # flatten into the perch; tune by eye

# flap cycle: existing action "Flap" made cyclic, as an NLA strip; rate via scale
flap = bpy.data.actions.get("Flap")
if flap:
    trk = ad.nla_tracks.new(); trk.name = "flap"
    st = trk.strips.new("flap", START, flap)
    st.repeat = 12
    st.scale = 1.0        # <1 faster flaps; or animate strip_time for continuous rate change
    st.blend_out = 6      # fade into the flare/land strip on a track above

# --- camera: orthographic, mapped to the layout ---
cam = scene.camera
cam.data.type = 'ORTHO'
cam.data.ortho_scale = W / PPU
cam.location = (0, -10, 0); cam.rotation_euler = (math.radians(90), 0, 0)

# --- render settings ---
r = scene.render
r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
r.film_transparent = True
r.use_motion_blur = True
r.motion_blur_shutter = 0.5
r.use_persistent_data = True
r.engine = args.engine
if args.engine == 'CYCLES':
    c = scene.cycles
    c.device = 'CPU'
    c.samples = args.samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.03
    c.use_denoising = True                     # OIDN on CPU
scene.view_settings.view_transform = 'Standard'   # or 'AgX'; keep identical across variants
img = r.image_settings
img.media_type = 'IMAGE'                       # 5.x: must precede file_format
img.file_format = 'PNG'
img.color_mode = 'RGBA'
img.color_depth = '8'                          # avoid 16-bit PNG alpha bugs
r.filepath = args.out                          # '#' padding appended automatically

bpy.ops.render.render(animation=True)          # or omit and pass -a on the CLI after --python
```

- **Shadow catcher plane** (Cycles): `plane.is_shadow_catcher = True` (the object property in 3.0+). Optionally enable `view_layer.cycles.use_pass_shadow_catcher = True` for a separate pass.
- **Holdout letters:**
  ```python
  m = bpy.data.materials.new("Holdout")
  m.use_nodes = True
  nt = m.node_tree
  nt.nodes.clear()
  h = nt.nodes.new('ShaderNodeHoldout')
  o = nt.nodes.new('ShaderNodeOutputMaterial')
  nt.links.new(h.outputs[0], o.inputs['Surface'])
  ```
  Then assign `m` to the text/SVG object.
- **Batch variants from PowerShell:**
  ```
  foreach ($v in 'A','B','C') { & "blender.exe" -b E:\dove\dove_rig.blend --python E:\dove\build_dove.py -- --variant $v --out "//out/$v/dove_" }
  ```
  (winget installs to `C:\Program Files\Blender Foundation\Blender 5.x\blender.exe`; use the full path if it is not on PATH.) For a quick test, render `-s 40 -e 42` instead of the full range.
- Bake the path to keys if you want the .blend to be constraint-free:
  ```python
  bpy.ops.nla.bake(frame_start=START, frame_end=END, only_selected=False, visual_keying=True, clear_constraints=True, bake_types={'OBJECT'})
  ```
  This needs the armature selected and active, which in `-b` means setting `bpy.context.view_layer.objects.active = arm` and `arm.select_set(True)`.

### Gaps
- The snippet is unexecuted. Names to check against your 5.x install's API:
  - `forward_axis` enum identifiers
  - the `anim_utils.action_get_channelbag_for_slot` helper
  - `is_shadow_catcher`
  - `use_pass_shadow_catcher`
  - the `view_transform` string ('Standard'/'AgX')
- I did not check whether `bpy.ops.render.render(animation=True)` inside `--python` respects `-o` passed earlier on the CLI. Setting `r.filepath` in the script avoids the question.

---

## 6. YouTube tutorials worth following (what each teaches)

### Takeaway
No single video covers the whole job. Combine:
- a bird **rigging** video (Rigify bird metarig or Auto-Rig Pro)
- a **flight-cycle** principles source (Animation Mentor article, Maya bird animation)
- a **logo/text reveal** video for the comp side.

### Cited Findings
- **"How To Rig A Bird In Blender"**: rigging a bird with the Rigify add-on. — [YouTube](https://www.youtube.com/watch?v=_qUXzSkyOb4)
- **"Rig A Pigeon with Rigify"**: pigeon (a close dove relative) using Rigify's bird metarig. — [YouTube](https://www.youtube.com/watch?v=5p6Rrp135AI)
- **"Auto-Rig Pro: Bird & Wing Rigging tutorial, Part 1"**: bird/wing rig with the paid Auto-Rig Pro add-on (not free; noted for completeness). — [YouTube](https://www.youtube.com/watch?v=qzDZMUeTtt8)
- **"Rigging a Wing Using Geometry Nodes in Blender 3.4" (Duncan Rudd, 2 parts)**: stylized bird wing, feathers distributed over the wing, layered feather groups, cover feathers. — [YouTube](https://www.youtube.com/watch?v=jPHEXWGDLrw) via [80.lv digest](https://80.lv/articles/80-level-digest-great-youtube-tutorials-on-creating-animating-wings)
- **"How to Make Angel Wings in Blender 2.9" (THIS DUDE DRAWS)**: feathered wings modelled and prepped for animation. — [YouTube](https://www.youtube.com/watch?v=aFEUhiaYJyA)
- **"Bird Animation in Maya" (Stranger)**: FK animation of head, legs and wings. No narration, but the timing is transferable. — [YouTube](https://www.youtube.com/watch?v=mvSec7bou18)
- **"Easy Butterfly in Blender 3.0" (PIXXO 3D)**: simple wing-flap keyframing and cycling. — [YouTube](https://www.youtube.com/watch?v=e4jqiZO_BqU)
- **"Animate Flying Birds and Insects in Blender with Spyderfy"**: an add-on approach to flying-creature animation. — [YouTube](https://www.youtube.com/watch?v=wjX2KhlNRjA)
- **"How to Create a 2D Flying Bird" (Grease Pencil)**: wing/tail flap timing and smoothing. Useful for timing, even in 3D. — [YouTube](https://www.youtube.com/watch?v=sB2dH7WciiQ)
- Non-video principles: [Animation Mentor bird-flight tutorial](https://www.animationmentor.com/blog/tutorial-how-to-animate-birds-in-flight/) (follow-through on tips, body/head move with flap, tail last).
- Logo/text reveal: [Tuts+ text reveal parts 1–2](https://cgi.tutsplus.com/how-to-create-text-reveal-motion-graphic-in-blender-part-1--cms-26939t) (render layers / shrinkwrap); [TiFi geometry-nodes text reveal](https://www.blendernation.com/2024/07/31/how-to-make-this-text-reveal-animation-in-blender-geometry-nodes/); [Mixing Light logo reveal → ACES EXR](https://mixinglight.com/color-grading-tutorials/blender-for-editors-part-1-logo-reveal/).

### Inferences
- Fastest route to a good dove: get a **pre-rigged bird** (e.g. a CC0/CC-BY pigeon or dove from Sketchfab/BlenderKit free tier, checking the licence), or rig with **Rigify's bird metarig** (free, built in). Then do flap/flare by hand following the Animation Mentor principles. Wing feathers via the Geometry Nodes series only if the model lacks good feathers.
- Search terms that should surface more 3D-specific videos: "Blender bird flight cycle", "Blender Rigify bird metarig animation", "Blender follow path constraint tutorial", "Blender holdout text reveal".

### Gaps
- I did not watch the videos. The descriptions come from titles and the 80.lv/search summaries, and the Blender version in each varies (2.9–4.x).
- I did not identify a strong free, current (4.x/5.x) Blender video specifically on **Follow Path** or a **bird landing** sequence.
