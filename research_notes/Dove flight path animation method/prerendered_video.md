# Pre-rendered video approach for the dove loading animation (Expo SDK 54 / RN 0.81, iOS + Android + web)

Scope: a white dove with flapping wings flies an exact drawn path around the "EZER" wordmark and lands at the logo position. Three themes (light #F7F3EA, dark #151021, black #000000). Researched 2026-10-11. Several web sources are old (2013 ffmpeg commit, 2016 WebKit policy, Adobe/ftrack forum threads from earlier years); each is flagged where it is cited. ffmpeg is not installed on this machine, so no encode was run and every file size below is an estimate.

## Is a per-theme baked-background MP4 reliable and seamless on iOS, Android and web? What are the pitfalls?

### Takeaway
It is workable, but "seamless" is not guaranteed. Two things are well documented: H.264 output colours shift relative to CSS/RGB hex values, and they render differently across players and browsers. So an MP4 with a baked flat background should fill the WHOLE screen (contentFit "cover", no visible edge) instead of sitting as a rectangle on a themed View, and the handoffs into and out of the video should be crossfades. Transparent video is not a cross-platform option without a shader (see the transparent video section), so baked per-theme MP4s, three files, are the practical pre-rendered route.

### Cited Findings
**expo-video (SDK 54) playback API**
- `useVideoPlayer(source, setup)`: the setup callback runs after the player is created. The docs example sets `player.loop = true` and calls `player.play()`. `loop` and `muted` are booleans that default to `false`, so loop is already off and muted must be set to true explicitly. — [Expo docs, expo-video v54](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- Bundle local assets with `require()`, passed straight to `useVideoPlayer`. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- `VideoView` has an `onFirstFrameRender` prop that fires after the first frame renders. The docs say it can be used to hide cover images, and that it may also fire again when the video track changes. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- `statusChange` reports `idle` / `loading` / `readyToPlay` / `error`. `sourceLoad` fires once metadata has loaded, but the docs say this "doesn't mean that there is enough data buffered to start the playback". — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- Preloading: create the player with a `null` source, then call `replace()` (`replaceAsync()` loads off the UI thread; `replace()` "is going to be deprecated"). A player not attached to a `VideoView` still fills its buffers, so attaching it later plays without buffering. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- Android `surfaceType` defaults to `'surfaceView'`. Use `'textureView'` where SurfaceView "is not supported or causes issues (for example, overlapping video views)". Do not change it at runtime. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- `nativeControls` defaults to `true` and must be set to false. `contentFit` is `contain` (default), `cover` or `fill`. `playsInline` is web-only. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)
- The v54 expo-video page does not mention a poster prop. The documented pattern is your own cover image hidden in `onFirstFrameRender`. — [Expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/video/)

**First-frame flash**
- On ExoPlayer, the black or flickering surface seen before the first frame is the player's shutter view. The suggested fix is to hide a placeholder only on the rendered-first-frame callback. This is a community chat source, not official docs. — [Kotlin Slack archive](https://slack-chats.kotlinlang.org/t/470504/hi-there-has-anybody-worked-on-exoplayer-i-am-finding-black-)
- No expo-video-specific GitHub issue about a black first-frame flash turned up in search. See Gaps.
- Evan Bacon's Expo splash-video example does three things:
  - sets `backgroundColor`, `splash.backgroundColor` and `ios.splash.backgroundColor` to the video's background colour;
  - keeps the native splash screen up until the video is fully loaded into memory, then plays it and hides the splash;
  - fades everything out when the video ends.
  It says this also works on Android. — [EvanBacon/expo-splash-video-example](https://github.com/EvanBacon/expo-splash-video-example)

**Autoplay (web)**
- WebKit on iOS lets muted `<video>` elements autoplay without a user gesture, and `playsinline` keeps them from going fullscreen. This is a 2016 post, still the baseline policy. — [WebKit blog, "New video Policies for iOS"](https://webkit.org/blog/6784/)
- iOS Low Power Mode blocks autoplay even for muted video. WebKit does this deliberately and shows a play button instead; one report saw a `NotAllowedError` rejection from `play()`. — [Vimeo help](https://help.vimeo.com/hc/en-us/articles/29677068222737-Troubleshooting-Autoplay-restrictions); [WebKit bug 219889](https://bugs.webkit.org/show_bug.cgi?id=219889)

**Colour matching (the main pitfall)**
- Forum users report that RGB colours "will never match perfectly between images/css and H.264 videos, and different devices may render those colours differently". The workaround offered is to make the video itself the background. Community source, older. — [Adobe community](https://community.adobe.com/t5/after-effects-discussions/exporting-h-264-colours-don-t-match-rgb-hex/td-p/11204260)
- One Adobe thread reports an MP4 colour mismatch that appears in every browser on Mac but not on PC. — [Adobe community](https://community.adobe.com/t5/after-effects-discussions/mp4-colour-mismatch-only-on-mac-in-browser/td-p/9164997)
- An ffmpeg trac ticket says 1080p input is automatically treated as BT.709 limited range. The fix is to tag colour metadata explicitly with `-colorspace bt709 -color_primaries bt709 -color_trc bt709`. — [ffmpeg-trac #4978](https://lists.ffmpeg.org/archives/list/ffmpeg-trac@ffmpeg.org/thread/2QYENI26J6CJUFRA6D5BJ4T4WNIL2XJQ/)
- Browsers often show limited-range (16–235) video so that blacks look grey or flat. Forum source. — [ftrack forum](https://forum.ftrack.com/topic/432-color-in-web-browser-vs-quicktimevlc/)
- Players and browsers render the same H.264 differently, including depending on whether GPU acceleration is on. — [Shotcut forum](https://forum.shotcut.org/t/bt-709-colorspace-discrepancies/585)
- An ASWF test says Safari on macOS renders MP4s differently from Firefox. `-color_trc 1` (bt709) "doesn't seem to do anything", and `-color_trc 13` (sRGB, iec61966-2-1) came closest. — [ASWF wiki "FFMPEG defaults" PDF](https://wiki.aswf.io/download/attachments/16031068/FFMPEG%20defaults.pdf?api=v2)
- A Mozilla bug: an MP4 made from an sRGB source had washed-out colours because it carried no primaries/transfer tags. Re-tagging with `setparams=color_primaries=bt709:color_trc=iec61966-2-1` fixed it. The reporter also says Firefox ignored the tags in some cases. — [Mozilla bug 1783458](https://bugzilla.mozilla.org/show_bug.cgi?id=1783458)

### Inferences
- **Full-bleed, no rectangle.** Render each clip at the full screen's aspect ratio and show it with `contentFit="cover"` on a View that fills the screen. A small colour error then becomes a uniform tint of the whole screen, not a visible box. The only visible seams are the transitions into and out of the video.
- **Cover the seams with crossfades.** Opacity-fade the VideoView in over the theme-coloured View (or hold a matching still), starting only on `onFirstFrameRender`. At the end, fade the app content in over the last frame. A tiny colour step during a 150–250 ms fade is far less visible than a hard edge.
- **Encode settings to reduce colour drift.** These are the commonly used settings, not verified here on all three platforms:
  - 8-bit `yuv420p`, BT.709 matrix and primaries, limited (tv) range, with all tags written explicitly;
  - consider `color_trc` = sRGB (iec61966-2-1) or bt709 and A/B test on device; sources disagree on which matches CSS better;
  - avoid full-range (`pc`) H.264, because player support for the range flag is inconsistent.
- **Black (#000000) is the easiest theme.** It maps to Y=16 in limited range, which every decoder shows as black. **#F7F3EA (light) is the hardest:** a near-white cream sits close to the top of the limited range, and any range or gamma mismatch shows up as a visible grey or yellow tint.
- **Device calibration.** Read back the decoded first frame's centre pixel on each platform (web: canvas `getImageData`; native: screenshot) and nudge the encoded background colour until it matches. This is the calibration knob that a "set hex and hope" encode lacks.
- **Preload.** Preload the player with `replaceAsync` during the native splash, the same way Bacon's example holds the splash until the video is in memory, then hide the splash on `onFirstFrameRender`. This removes the readyToPlay-to-first-frame latency from what the user sees.
- **Plan a fallback for the web.** On iOS Safari in Low Power Mode the video will not autoplay. Show a static frame (the dove landed on the logo) and skip ahead, rather than leaving a play button on a loading screen.
- **Treat the clip as decoration.** The loading screen must not wait on the video if loading finishes first, and reduced-motion users should get the static end frame. The app already has `useReduceMotion()`.

### Gaps
- No measured data on expo-video's startup latency (time from mount to first frame) on iOS, Android or web. Nothing official or benchmarked turned up.
- No expo-video GitHub issue found that specifically documents a black first-frame flash. The ExoPlayer shutter behaviour is inferred to apply.
- Not verified which `color_trc` tag makes #F7F3EA / #151021 match RN View colours on iOS AVPlayer, Android Media3 and Chrome/Safari together. This needs an on-device test.

## How large would a ~3.5 s 1080x1920 (or 720x1280) clip be?

### Takeaway
No source gave sizes for this exact content. Arithmetic on typical bitrates for a mostly flat background with one small moving subject puts it at roughly 0.4–1.5 MB per H.264 clip at 1080x1920, and roughly 0.2–0.6 MB at 720x1280. Three theme variants come to about 1–4.5 MB total. HEVC would cut that further, but HEVC playback on web outside Safari cannot be relied on.

### Cited Findings
- Chrome, Firefox and Edge "can't be relied on to decode `hvc1`". Safari needs the `hvc1` tag, because `hev1` will not play. A bare `type="video/mp4"` source of HEVC can give a black box in Chrome with no console error. (Sep 2026.) — [hontran.dev, transparent video HEVC alpha](https://www.hontran.dev/blog/transparent-video-web-hevc-alpha-ffmpeg)
- A ProRes 4444 intermediate is "several hundred MB for a few seconds of 4K". This applies only to the authoring intermediate, never to what ships. — [hontran.dev](https://www.hontran.dev/blog/transparent-video-web-hevc-alpha-ffmpeg)

### Inferences
- **Size formula:** size ≈ bitrate × duration ÷ 8.
  - 1080x1920: at 1–3 Mbps × 3.5 s, that is 0.44–1.3 MB.
  - 720x1280: at 0.5–1.2 Mbps, that is 0.22–0.53 MB.
  - These are estimates; encode with CRF and measure.
- **Why low bitrates are plausible here:** most of the frame is a static flat colour, so it is nearly free after the keyframe.
- **Banding:** flat or gradient backgrounds band at low bitrate. A flat single colour bands less than a gradient. Avoid adding vignettes.
- **Codec:** use H.264 High profile for all three platforms, which gives one file per theme. HEVC saves roughly 25–50% (common rule of thumb, not sourced here), but it would need an H.264 fallback for web Chrome/Firefox anyway. That doubles the assets for little gain at this size.
- **Resolution:** 720x1280 upscaled with `cover` is likely enough for a soft white dove on a flat background. 1080x1920 is safer on 1440p phones if the wordmark is part of the video. If the wordmark stays as live text or SVG over the video, 720p is enough for the dove alone.

### Gaps
- Measured file sizes: none, because ffmpeg is not installed locally. Render one test clip to confirm.

## Transparent video: is there a cross-platform alpha option?

### Takeaway
No single transparent video format plays on iOS, Android native and every browser:
- HEVC with alpha covers Apple platforms (Safari, AVPlayer);
- VP9/VP8 WebM with alpha covers Chrome, Firefox and Edge;
- Android's ExoPlayer/Media3, which expo-video uses on Android, renders alpha as black.

The cross-platform alternative is a stacked colour and alpha-matte video composited in a shader (react-native-skia or a custom GL view), or an Android-only library. Given that, baked per-theme backgrounds are simpler.

### Cited Findings
- Apple announced HEVC-with-alpha at WWDC 2019 for iOS 13 / macOS Catalina. Safari, on both iOS and macOS, does not support transparency in WebM. — [CSS-Tricks](https://css-tricks.com/?p=328311)
- Safari supports HEVC alpha but Chrome does not; Chrome supports VP9 alpha but Safari does not. Vendor source (Rotato sells a converter). — [Rotato, transparent videos on the web in 2025](https://rotato.app/blog/transparent-videos-for-the-web)
- How Apple HEVC alpha works, and how to make it (Sep 2026):
  - the alpha is a separate auxiliary layer, and ffmpeg silently drops it when decoding HEVC-with-alpha;
  - to make it, use `hevc_videotoolbox -alpha_quality 0.9 -tag:v hvc1 -allow_sw 1`, which runs on macOS only;
  - VP9 WebM alpha needs `libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0`.
  — [hontran.dev](https://www.hontran.dev/blog/transparent-video-web-hevc-alpha-ffmpeg)
- Android: "ExoPlayer does not support alpha channel videos"; a transparent `.webm` "will be rendered as black". The library's workaround packs RGB and a greyscale alpha mask as two vertically stacked halves of one video, and it is Android-only. — [expo-transparent-video README](https://unpkg.com/expo-transparent-video@0.3.3/README.md)
- No androidx/media (Media3) release note or issue was found announcing alpha video support. — search of androidx/media results ([androidx/media 1.4.0 release](https://newreleases.io/project/github/androidx/media/release/1.4.0))
- Remotion can render transparent WebM, using PNG frames, `vp8`/`vp9` and `yuva420p`. It can also render ProRes 4444 (`yuva444p10le`). WebM alpha on Lambda "can flicker at chunk boundaries", so render locally in one pass. The docs do not mention HEVC alpha. — [Remotion docs, transparent videos](https://www.remotion.dev/docs/transparent-videos)

### Inferences
- **Verdict:** there is no native transparent video path on Android, which rules out alpha video as a one-file or two-file solution for this app.
- **Stacked alpha-matte option:** one H.264 file, double height (colour on top, matte below), composited in a shader. That needs a Skia/GL video surface. react-native-skia has video support, but its maturity on web and Android for this use was not researched here.
- **Cost of alpha vs baked:** going the alpha route trades three baked files for one file plus a new native rendering dependency. Under this repo's rules that means a lockfile change and a dev build. Baked per-theme MP4s avoid both.
- **Web-only alternative:** on the web build alone, `<video>` with an `hvc1` MP4 source first and a VP9 WebM source second would give real transparency. That does not help iOS/Android native.

### Gaps
- Whether react-native-skia's video API can play a stacked-matte clip smoothly on iOS, Android and web in Expo SDK 54 was not researched.
- No confirmation either way that Media3 in 2026 has added alpha output. Absence of evidence only.

## Remotion vs ffmpeg (vs After Effects/Blender) for exact-path compositing of a flap-cycle sprite

### Takeaway
Remotion is faster to build correctly for this task:
- the path is SVG path data, so `@remotion/paths` `getPointAtLength`/`getLength` give exact positions, and tangent angles come from sampling neighbouring points;
- the same path module can be shared with the app (it has no dependencies);
- three themes are a prop;
- the flap cycle is just `frame % N` picking a sprite frame.

ffmpeg overlay can move a sprite with per-frame `x`/`y` expressions in `t`, but those are closed-form maths, not SVG path lookup. An exact Bezier path means precomputing per-frame positions and feeding them in, and rotation (auto-orient) needs a separate rotate step. After Effects or Blender give auto-orient natively and the best-looking 3D dove, but they are manual GUI tools, less reproducible, and keeping the path exactly identical to the app's path is extra work.

### Cited Findings
- `@remotion/paths` `getPointAtLength(path, length)` returns x/y at a distance along an SVG path; multiply `getLength()` by progress. From v5.0.0 it returns `null` past the end, where 4.0 returned the endpoint. `evolvePath()` gives `strokeDasharray`/`strokeDashoffset` for a draw-on effect. The package "has no dependencies" and "can be used without Remotion". — [Remotion docs: getPointAtLength](https://www.remotion.dev/docs/paths/get-point-at-length); [evolvePath](https://remotion.dev/docs/paths/evolve-path); [@remotion/paths](https://remotion.dev/docs/paths/)
- ffmpeg overlay: the `x`/`y` expressions can use `main_w`/`W`, `main_h`/`H`, `overlay_w`/`w`, `overlay_h`/`h`, `n` (frame index), `pos` and `t` (timestamp in seconds). The `eval` option is `init` or `frame`, and `n`/`pos`/`t` are only available per frame (NAN with `init`). An invalid expression places the overlay off-screen. Per-frame evaluation was added in 2013. — [FFmpeg-cvslog: lavfi/overlay dynamic expression evaluation](https://ffmpeg.org/pipermail/ffmpeg-cvslog/2013-April/063067.html)
- Remotion transparent render settings, for an alpha master if wanted: `--image-format=png --pixel-format=yuva420p --codec=vp8`, or ProRes 4444. — [Remotion docs](https://www.remotion.dev/docs/transparent-videos)

### Inferences
**Remotion workflow** (estimate: about half a day to a day for a working first render):
1. Import the exact SVG `d` string used for the wordmark layout.
2. Per frame, compute `p = easing(frame / total)` and `pt = getPointAtLength(d, p * L)`.
3. Compute the heading angle as `atan2` between the points at `p*L` and `p*L + ε`. This is auto-orient, usually smoothed or clamped near the landing.
4. Place an `<Img>` of flap frame `sprites[Math.floor(frame / k) % N]`, slowing the flap or switching to a glide/landing frame near the end.
5. Render with `npx remotion render ... --props='{"bg":"#F7F3EA"}'` three times, once per theme.

Everything is code, so it is diffable and reproducible.

**ffmpeg workflow:**
- You would still need a script (Node/Python) to sample the Bezier path per frame. Positions can be fed through `sendcmd` or baked into a huge piecewise expression, which needs careful checking. An alternative is to pre-render rotated sprite PNGs per frame and concatenate them.
- In practice that script does what Remotion already does, with worse previewing. ffmpeg's real role is the final encode step: tagging BT.709, setting range and CRF.

**After Effects/Blender:**
- Choose them only if a truly realistic 3D-rendered dove, with wing perspective, is needed beyond what a 2D flap-cycle sprite gives.
- Blender "Follow Path" with the curve imported from SVG gives exact path and orientation, and renders can be scripted per theme. It is a larger learning curve and less portable for an agent-driven repo.

**Realism caveat:**
- With a 2D sprite, realism depends on the quality of the flap-cycle frames. Path compositing is the easy part, whichever tool is used.

### Gaps
- `sendcmd` support for overlay `x`/`y` was not confirmed from primary docs. The full ffmpeg filters page could not be read through the fetch tool.
- No source found that compares build time for Remotion and ffmpeg on path animation. The effort estimates above are judgement.
- Remotion's colour-space options for H.264 output (for example, whether it tags BT.709 by default) were not covered on the page fetched. Check `--color-space` in the Remotion CLI docs before relying on it.
- Remotion licensing for company use was not checked. It has a company licence tier and is free only for individuals and small teams; verify the current terms.
