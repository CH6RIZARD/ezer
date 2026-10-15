# AI video path control, flap-cycle sourcing, and alternatives for a dove that flies an exact path (as of Oct 2026)

Scope note: research done 2026-10-11 with about 15 web searches and fetches. Primary sources: Kling's quickstart page, the ATI and Wan-Move arXiv papers, the Tora CVPR paper, and Runway's help center. Much of the rest comes from vendor or aggregator blogs and is flagged as such. Older items are dated inline. ATI is from May 2025, Wan-Move from Dec 2025 (NeurIPS 2025), Tora from Jul 2024 (CVPR 2025), and Kling 1.5 Motion Brush from late 2024.

## Can any AI tool reliably hit an exact path and an exact end point?

### Takeaway
No. Every trajectory-control system found (commercial: Kling Motion Brush; open: ATI, Wan-Move, Tora) treats the drawn path as a soft condition. Published accuracy is a few pixels of average error at 480p, with documented failure modes for fast motion, and nothing guarantees where the subject lands on a given frame. Outputs are also capped at about 5 s and 480p for the open models. The best approach is a hybrid: use AI or stock footage only for an in-place flap cycle, then let code (app animation along a Bezier/SVG path) own position, rotation, scale and the exact landing point.

### Cited Findings
**Kling Motion Brush (commercial)**
- Up to 6 elements can be given motion at once. You select the area automatically or with a manual brush, draw a path, and write the prompt as "element + motion". The page says the element "follows the drawn path closely", that path direction and length both affect the result, and that if the path starts inside the selected area its endpoint is where the element is expected to be at the end of the video. The word is "expected", not guaranteed. — [Kling quickstart: Motion Brush](https://kling.ai/quickstart/how-to-animate-image-parts)
- The Static Brush locks areas and prevents camera movement. Kling recommends adding one when a trajectory causes unwanted camera motion. It warns that physically implausible motion is "interpreted" by the model; for example, moving a building sideways becomes a camera move. No maximum path length or accuracy figure is given, and the page doesn't name which model versions support it. — [Kling quickstart](https://kling.ai/quickstart/how-to-animate-image-parts)
- Paths are drawn by hand in the UI. No source documented entering pixel coordinates in the consumer UI. A third-party API vendor documents Motion Brush through the Kling API (the existence of the endpoint is not verified against official API docs). — [PiAPI blog](https://piapi.ai/en/blogs/the-motion-brush-feature-through-kling-api)
- A vendor blog (Atlas Cloud, which resells Kling) separates Motion Brush (directional vectors on painted regions) from Motion Control (transferring body motion from a reference video). It says the optional text prompt does not override the motion reference but does affect style. Kling 2.6 and 3.0 are named, with "Kling 3.0 launched May 2026" (unverified). — [Atlas Cloud guide](https://www.atlascloud.ai/blog/guides/kling-ai-motion-control)
- No independent benchmark of Kling's path-following accuracy was found. The only quantitative comparison is a human preference study in the Wan-Move paper (below). — [Atlas Cloud search result](https://www.atlascloud.ai/blog/guides/kling-ai-motion-control)

**Wan-Move (Alibaba Tongyi; NeurIPS 2025, arXiv Dec 2025), open weights on Wan-I2V-14B**
- Trajectories ARE pixel coordinates: each point track is a sequence of 2D pixel positions, one per frame (p ∈ R^((1+T)×2)). Output is 832×480, 81 frames, 5 s. — [Wan-Move arXiv 2512.08765](https://arxiv.org/html/2512.08765v1)
- End-point error (EPE, the L2 gap between requested and generated tracks; units are not stated explicitly, presumably pixels at 480p) on MoveBench: Wan-Move 2.6, MagicMotion 3.2, Tora 3.3, LeviTor 3.4, ImageConductor 15.6. On DAVIS: Wan-Move 2.5. EPE falls to 1.1 with 1,024 dense tracks. — [Wan-Move arXiv](https://arxiv.org/html/2512.08765v1)
- In a 2AFC human study against Kling 1.5 Pro Motion Brush, Wan-Move won 47.8% on motion accuracy, i.e. rough parity with Kling 1.5 Pro (a late-2024 model). — [Wan-Move arXiv](https://arxiv.org/html/2512.08765v1)
- Stated failure modes: loss of control during prolonged occlusion or out-of-frame motion, crowded scenes, physically implausible trajectories, and bad CoTracker points. Code, models and the MoveBench benchmark are released at github.com/ali-vilab/Wan-Move. — [Wan-Move arXiv](https://arxiv.org/html/2512.08765v1); [NeurIPS 2025 poster](https://neurips.cc/virtual/2025/poster/116293)

**ATI, Any Trajectory Instruction (ByteDance, arXiv May 2025), on Wan2.1-14B and Seaweed-7B**
- Input is a start image plus point trajectories drawn in an interactive editor. Each point has an (x_t, y_t) position and a visibility flag per frame. It handles object motion, local motion and camera motion together. Output is 5 s at 480p and takes about 8 GPU-minutes. Weights are on Hugging Face (bytedance-research/ATI), in ComfyUI through Kijai's WanVideoWrapper. — [ATI arXiv 2505.22944](https://arxiv.org/html/2505.22944); [ComfyUI wiki](https://comfyui-wiki.com/en/models/wan/ati)
- Accuracy: on Wan2.1-14B, only 55.9% of tracked points land within 5% of the image diagonal (about 48 px at 832×480), and 34.7% within 1% (about 10 px). Seaweed-7B scores 59.0% and 36.0%. The test set is 100 pairs. No numeric baseline comparison is given. — [ATI arXiv](https://arxiv.org/html/2505.22944)
- Stated failures: very fast motion (for example, half the image width in 2 frames) can't be followed. Trajectories can cause distortions such as an extra head. Planar shifts can be turned into camera motion instead. Physics is not fully respected. — [ATI arXiv](https://arxiv.org/html/2505.22944)

**Tora (Alibaba/Fudan; arXiv Jul 2024, CVPR 2025)**
- A DiT built on OpenSora with a Trajectory Extractor and a Motion-guidance Fuser. It supports multiple trajectories and conditioning on a first frame or on first and last frames. Code is at github.com/alibaba/Tora. Its MoveBench EPE is 3.3, per the Wan-Move comparison above. Older than the Wan-based models. — [Tora arXiv](https://arxiv.org/html/2407.21705v4); [CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/html/Zhang_Tora_Trajectory-oriented_Diffusion_Transformer_for_Video_Generation_CVPR_2025_paper.html)

**Runway / Luma / Veo / Sora / Higgsfield**
- Runway: no official documentation was found for a current object-trajectory or Motion Brush feature on Gen-4, Gen-4.5 or Aleph. Third parties describe Aleph as video-to-video editing (add, remove or replace objects, relight, new camera angles) and say Gen-4 has a camera-control panel (pan, dolly, arc). Gen-4.5 is reportedly the flagship, released Dec 11 2025, with image-to-video added Jan 21 2026. These are secondary sources. — [vantaige.io](https://vantaige.io/fr/ai-tool/runway); [CometAPI Aleph tag](https://www.cometapi.com/pl/tag/gen-4-aleph/)
- Luma Ray2 supports a start keyframe, an end keyframe, or both, plus a "loop" option. Duration (5/9 s vs 5/10 s) differs between sources. The keyframes pin the first and last frame, not the path in between. — [apiframe Ray2](https://apiframe.ai/models/luma-ray-2); [Pillitteri guide](https://pasqualepillitteri.it/en/news/3352/luma-ray-2-complete-guide-pricing-review-2026); [AWS Bedrock Luma params](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-luma.html)
- Veo 3.1 / Flow: the search found no trajectory or object-path control, only general claims of "control over characters and objects". — [glbgpt guide](https://www.glbgpt.com/ar/hub/how-to-use-veo-3-1-in-flow/)

### Inferences
- An average error of about 2.5 px over the whole clip at 480p (Wan-Move) sounds tight. But it is an average across points and frames, at 480p. Upscaled to a 1080-wide phone screen it is roughly 5–6 px, with larger errors on individual frames and in fast segments. A dove circling a wordmark is fast, curvy motion with self-occlusion as the wings fold and the bird turns. That is exactly the stated failure zone (ATI's fast-motion limit, Wan-Move's occlusion limit).
- The models generate a full frame, so the wordmark would have to be in the generated frame too. Its letterforms could warp, and the result is a baked video, not something composited over live UI. The app also needs a transparent overlay that lands on a precise UI coordinate at every screen size and density. A baked 480p video cannot do that responsively.
- Only open models (Wan-Move, ATI, Tora) take numeric per-frame pixel coordinates. Kling takes a hand-drawn curve. So "exact path" is achievable at the input but not guaranteed at the output by any tool.
- Recommended hybrid: (1) get a 0.5–1 s in-place flap cycle, matted, as a sprite sheet, an animated WebP or APNG, or a short alpha video. (2) Move it along the user's drawn path in code: an SVG/Bezier path with arc-length parameterisation, heading from the path tangent, easing into the landing. (3) For the landing, cut to a separate short "flare and land" clip, or ease the flap rate down and swap to a perched frame at the exact end coordinate. Code owns position, so the end point is exact. AI only supplies the appearance of the wings.
- Optional realism boost: bank angle from path curvature (rotate the sprite slightly) and flap rate from speed (faster flaps on climbs, glide frames on descents). Both are cheap in code.

### Gaps
- No official, current (2026) Kling, Runway or Higgsfield documentation was found giving numeric path-following accuracy, or pixel-coordinate entry in the consumer UI.
- Whether Runway Gen-4.5 has an object Motion Brush today could not be confirmed from Runway's own docs.
- No source evaluates any of these tools specifically on birds, which have thin, fast-occluding wings.
- Higgsfield's motion presets and motion control were not documented in any source found. Higgsfield appears to be an aggregator of other models (Kling, etc.), but this was not verified.

## What is the best way to produce a clean, loopable, matted flap cycle?

### Takeaway
Generate (or buy) a clip with a static camera and the dove flapping in place against a flat, contrasting background: mid-grey or saturated green/blue, not white. Use start = end frame conditioning (Luma keyframes or loop, or Kling/Wan first+last frame) to get a loop. Pick one clean wingbeat cycle by hand and trim to it. Matte with a soft-alpha video matting model (MatAnyone/MatAnyone 2 is the strongest open candidate; RVM is older and weaker on ambiguous backgrounds), or chroma key. Export as PNG sequence, WebM VP9 alpha, or ProRes 4444. A white dove on a white background is the worst case for halos and should be avoided at the source.

### Cited Findings
- Luma Ray2 offers start and end keyframes and a dedicated loop option, aimed at ambient and hero-section clips. No source documents the exact recipe of using the same image for start and end. — [apiframe Ray2](https://apiframe.ai/models/luma-ray-2); [Pillitteri guide](https://pasqualepillitteri.it/en/news/3352/luma-ray-2-complete-guide-pricing-review-2026)
- Tora supports conditioning on combined initial and final frames, so open models can also pin start = end. — [Tora arXiv](https://arxiv.org/html/2407.21705v4)
- Kling's Static Brush locks the background and stops camera drift, which is useful for keeping the background still in an in-place flap clip. — [Kling quickstart](https://kling.ai/quickstart/how-to-animate-image-parts)
- MatAnyone (arXiv Jan 2025): the authors say RVM (auxiliary-free) "struggles with complex or ambiguous backgrounds", while MatAnyone isolates the target with consistent memory propagation. This is the authors' own claim. — [MatAnyone arXiv 2501.14677](https://arxiv.org/html/2501.14677v1)
- MatAnyone 2 (arXiv Dec 2025) says the original MatAnyone's weak boundary constraints can give segmentation-like hard edges, and that diffusion-based mattes blur fine detail. v2 claims better fine detail. — [MatAnyone 2 arXiv 2512.11782](https://arxiv.org/pdf/2512.11782)
- SAM2Matting (arXiv 2026) claims to beat RVM and MatAnyone on fine detail and semi-transparency. This is self-reported. — [SAM2Matting arXiv 2606.27339](https://arxiv.org/pdf/2606.27339)
- In ComfyUI pipelines, BiRefNet is used to make the initial mask that MatAnyone propagates, with a guided filter refining edges. BiRefNet alone is an image segmenter run per frame, which risks flicker. — [RunComfy MatAnyone node](https://www.runcomfy.com/comfyui-nodes/TrentNodes/mat-anyone-matte)
- A hard segmentation mask produces a halo when composited onto a new background. A soft alpha matte avoids it. — [RunComfy MatAnyone node](https://www.runcomfy.com/comfyui-nodes/TrentNodes/mat-anyone-matte)
- Alpha-capable delivery formats: WebM, MOV (QuickTime Animation, ProRes 4444) and MKV, or PNG sequences. — [videobgremover blog](https://videobgremover.com/blog/transparent-video-background)
- Higgsfield: no documentation was found on whether its background removal outputs a real alpha channel for video. — (search returned nothing Higgsfield-specific)

### Inferences
- Background choice matters most. On a white background a white dove's feather edges share luminance with the background. Any matting model then produces either a dark fringe (edges eroded) or a light halo (background bleeds in), and the halo disappears against the app's dark UI only by luck. Prompt for "plain mid-grey studio background" or "solid chroma green, evenly lit". Green also enables a classic chroma key plus despill, which is deterministic and flicker-free. Green spill on white feathers needs despill. Grey or blue spills more neutrally onto white.
- The app's onboarding is dark (`darkTokens`, per CLAUDE.md). A light fringe on a white bird over a dark background is very visible. Choke the matte by 1 px and use premultiplied alpha in the export.
- AI loops: "start = end frame" gets the clip loopable, but the wingbeat phase at the seam can still stutter. It is more reliable to generate 3–5 s of steady flapping and then cut exactly one or two full wingbeats (match the frame where the wings are at the top of the upstroke at both ends, using frame differencing). A real pigeon or dove wingbeat is roughly 5–10 Hz, so one cycle is only a handful of frames at 24–30 fps. If needed, a short crossfade over 2–3 frames hides the seam.
- AI models often add slow drift (camera creep, the bird rising or falling). Stabilise or re-centre each frame on the bird's centroid after matting, so code-driven motion isn't fighting baked-in motion.
- Deliverable for React Native/Expo: a sprite sheet or PNG frame set (deterministic, frame-rate controllable, cheap), or an animated WebP via expo-image. Video with alpha has patchy support across Android and iOS players.

### Gaps
- No head-to-head benchmark of BiRefNet vs RVM vs MatAnyone on birds or white-on-light subjects.
- Runway's and Higgsfield's background-removal alpha export formats were not confirmed from official docs.
- No source verified whether Kling's or Luma's "loop" or first=last frame yields a seamless wingbeat phase.

## Alternatives (stock footage, 3D rigged dove) and licensing for commercial app use

### Takeaway
Stock and 3D options are cheaper and more controllable than AI for this. A $5 commercially licensed, looped green-screen white dove clip exists (UltraKey). Rigged, animated white dove models with fly/glide loops sell for about $119 (Superhive) up to $599 (TurboSquid). A 3D model in Blender on a curve gives exact path control, correct banking, and rendered alpha with no halo, at the cost of a few hours to a day of setup and some realism risk. For AI output, use a paid plan: Kling's free tier is reported as non-commercial, while Runway says outputs are yours without non-commercial restrictions.

### Cited Findings
**Stock footage**
- UltraKey "Flying Dove" (Gumroad): a 6-second loop of a white dove flying in place on a clean green screen, 1920×1080 MP4, loopable. The free version is non-commercial with credit. Commercial or monetised use needs the paid license (listed at $5). — [UltraKey Flying Dove](https://ultrakey.gumroad.com/l/flyingdove)
- Adobe Stock has multiple green-screen dove clips, including flocks. Loopability and licence terms vary per clip. — [Adobe Stock search](https://stock.adobe.com/tw/search/video?k=doves)

**3D rigged doves**
- Fab "Realistic Animated White Dove": animations include startFlying, flying, gliding, and turning left or right while flying. It has no rig controllers, so animation must be edited on joints. Licence not shown in the snippet. — [Fab listing](https://www.fab.com/listings/561131e4-f9d4-4992-981d-76037eb79f92)
- Superhive "Realistic Animated White Dove": rigged, animated, "Royalty Free", $119, including fly and glide. — [Superhive](https://superhivemarket.com/products/realistic-animated-white-dove-3d-model)
- Superhive "Dove – Blender Rigged Animated": a Blender rig with fly-loop and fly-up scene files. — [Superhive](https://superhivemarket.com/products/dove---blender)
- RenderHub Eurasian Collared Dove: Extended Use License (commercial allowed), but only a simplified rig. — [RenderHub](https://www.renderhub.com/amshwolf212/eurasian-collared-dove)
- TurboSquid Dark Rock Pigeon (animated, fully rigged): $599, Standard or Upgrade license. — [TurboSquid](https://www.turbosquid.com/3d-models/3d-model-dark-rock-pigeon-dove-1298944)
- Blender's Follow Path constraint is the standard tool for moving an object along a curve. — [Blender manual: Follow Path](https://docs.blender.org/manual/en/latest/animation/constraints/relationship/follow_path.html) (the page body could not be fetched; the option names in Inferences come from general knowledge)

**AI tool licensing**
- Runway (official help centre): content you create is "yours to use without any non-commercial restrictions from us", and you keep ownership. The free tier adds a watermark. Third parties report broad training rights over inputs and outputs (not verified against primary terms). — [Runway help](https://help.runwayml.com/hc/en-us/articles/21668707517587); [terms.law summary](https://terms.law/ai-output-rights/runway/)
- Kling: secondary sources agree the free tier is watermarked and non-commercial, and Standard is the lowest plan allowing commercial use. Users reportedly keep ownership but grant Kling a broad licence that may include training. No official ToS text was retrieved. — [Atlas Cloud pricing](https://www.atlascloud.ai/blog/guides/kling-ai-pricing); [CometAPI](https://www.cometapi.com/are-kling-videos-private/)
- One summary notes that purely AI-generated content may not be copyrightable under US guidance, so a competitor could reuse an unmodified AI dove clip. — [costbench](https://costbench.com/software/ai-video-generators/runway)

### Inferences
- The fastest high-quality route is likely to buy the UltraKey commercial dove loop ($5), chroma-key it, export frames, and drive it along the path in code. Check that the bird is flying in place, not panning, and that the angle (side or 3/4) suits the path's heading.
- Pros of the 3D route: frame-exact path and landing (Follow Path with Follow Curve for banking, Animate Path or keyframed offset for timing), any camera angle, a true alpha render (Film > Transparent) with no matting halo, and an easy perch or landing animation if the rig includes one. Cons: feather realism depends on the asset, and the Fab model has no controllers. It also needs Blender skills, plus render time if done at several resolutions. It is still a pre-rendered sprite, so for responsive layouts it's simpler to render a 3D flap cycle in place and do the path in code anyway.
- Licence hygiene: keep the receipt and licence text for every stock clip or model. Avoid free CC-BY models unless attribution can be shown in-app (an About screen). Avoid "editorial use only" stock. Assume Fab's standard licence allows use in a shipped app, but confirm on the listing page.

### Gaps
- Sketchfab-specific downloadable dove models and their CC licences were not found by the search.
- Fab's licence text for the white dove listing wasn't visible in fetched content.
- Kling's and Higgsfield's official commercial terms were not retrieved directly.
- No source compares the realism of 3D-rendered vs AI-generated dove flaps.
