# Runtime (in-app) animation options for a photographic dove flying a designer-drawn path (Expo SDK 54 / RN 0.81 / Reanimated 4.1 / react-native-svg 15)

Context checked in the repo (2026-10-11): `apps/mobile/package.json` has `react-native-reanimated ~4.1.1` and `react-native-svg 15.12.1`; it does NOT have expo-image, lottie-react-native, Rive, Skia or svg-path-properties. There is no committed `android/` folder (CNG / prebuild via `app.config.js`), so any gradle property must be set through a config plugin or `expo-build-properties`.

## Which option gives pixel-exact adherence to a drawn path with auto-rotation along the tangent, and how?

### Takeaway
All candidate runtimes can follow the path exactly if the path data is the designer's own SVG `d` string. The cheapest exact route with zero new native deps is: sample the path at load time (or at build time into a JSON array) by arc length, then drive `translateX/translateY/rotate` from one Reanimated shared value on the UI thread. Lottie (layer auto-orient) and Rive (Follow Path constraint with Orient) also do it natively, but each adds a native dependency and moves path-following into a designer tool.

### Cited Findings
- Reanimated `useAnimatedProps` is listed as supported on Android, iOS and Web, and its docs point to an "Animating SVG" guide for react-native-svg components. The `dependencies` argument is "Only relevant when using Reanimated without the Babel plugin on the Web." — [Reanimated useAnimatedProps](https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedProps/)
- Expo SDK 54's bundled versions: `react-native-reanimated ~4.1.1`, `react-native-worklets 0.5.1`, `react-native-svg 15.12.1`, `lottie-react-native ~7.3.1`, `@shopify/react-native-skia 2.2.12`, `expo-image ~3.0.11`. Rive is not in the Expo-bundled list. — [expo/expo sdk-54 bundledNativeModules.json](https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json)
- Lottie (Android): `LayerParser` reads the After Effects layer key `"ao"` (auto-orient) and calls `transform.setAutoOrient(autoOrient)`, so a layer moving along a bezier position path rotates to the tangent at runtime. — [lottie-android LayerParser.java (master)](https://raw.githubusercontent.com/airbnb/lottie-android/master/lottie/src/main/java/com/airbnb/lottie/parser/LayerParser.java). Position is parsed through `AnimatablePathValueParser.parseSplitPath`, i.e. as a spatial path, not just linear points — [AnimatableTransformParser.java](https://raw.githubusercontent.com/airbnb/lottie-android/master/lottie/src/main/java/com/airbnb/lottie/parser/AnimatableTransformParser.java)
- Rive's Follow Path constraint: "As the percent increases, the constrained object moves along the path" (Distance can go above 100%). With Orient on the object rotates to match the path, and "you can't make manual rotation changes to the object in this state." — [Rive Follow Path constraint docs](https://rive.app/docs/editor/constraints/follow-path-constraint)
- Skia `Atlas` draws many sprites from one image, each with its own `RSXform` (scos, ssin, tx, ty). `Skia.RSXformFromRadians(scale, radians, tx, ty, pivotX, pivotY)` combines position, rotation and pivot in one transform, and transforms can be animated with worklets cheaply. (Found via a Mintlify mirror of the Skia docs, since the official page URL 404'd for me.) — [Skia Atlas (mirror)](https://www.mintlify.com/shopify/react-native-skia/shapes/atlas)

### Inferences
- "Pixel-exact" means the dove's anchor point sits on the designer's `d` path at every frame. Exactness comes from: (1) using the exact `d` string, exported in the same coordinate space/viewBox as the wordmark layout, (2) scaling it with the same transform as the wordmark (one `scale = screenWidth / viewBoxWidth` factor used by both), and (3) sampling densely (e.g. 300–600 samples for ~3.5 s; at 120 Hz that is ~420 frames, so ~500 samples plus linear interpolation between them is visually exact).
- Arc-length resampling only matters for SPEED. Parametric `t` on cubic béziers bunches up near control points, so equal `t` steps give uneven speed. Resample to equal arc-length steps, then apply the timing curve (ease-out landing) to the progress value rather than to the geometry.
- Tangent rotation: `angle = atan2(dy, dx)` between neighbouring samples. Precompute it with the samples, and unwrap it (add ±2π when the jump exceeds π) so interpolation never spins the bird 360° at the ±180° seam. Smooth it with a short moving average so a tight curve in the path does not snap the sprite.
- Sampling without new deps: on web, `SVGPathElement.getTotalLength()/getPointAtLength()` exist natively. On native, react-native-svg's `Path` ref exposes `getTotalLength`/`getPointAtLength` in v15 (UNVERIFIED in this pass; I did not fetch react-native-svg docs). The robust, platform-independent choice is to precompute the samples once with a Node script (browser DOM or `svg-path-properties`) and ship a small JSON array, e.g. 500 × [x, y, angle] ≈ 10–15 KB. That avoids runtime measurement, mount-time cost and native/web differences. Note that `svg-path-properties` (pure JS, `getTotalLength`/`getPointAtLength`/`getTangentAtLength`) would be a JS-only dependency. Its npm page returned 403, so version and size are unverified.
- In the worklet: `i = progress * (N-1)`, then lerp between samples `floor(i)` and `ceil(i)`, and return `{transform:[{translateX},{translateY},{rotate: angle+'rad'},{scale}]}`. This runs entirely on the UI thread, with no JS work per frame.
- Lottie and Rive put the exact path inside the designer's tool (AE / Rive editor). That is only "exact" if the designer reproduces the same path there, which turns the drawn SVG path into a second source of truth.

### Gaps
- I did not confirm when lottie-android first supported `ao`, or whether lottie-ios and dotlottie-web (web) honour auto-orient identically. I only checked lottie-android master.
- I did not confirm whether Rive's Follow Path Distance can be data-bound or driven from RN code in `@rive-app/react-native`; the docs page I read does not say.
- I did not fetch react-native-svg v15 `getPointAtLength` availability or behaviour on native.

## Does core RN Image support animated WebP on Android/iOS in RN 0.81 / Expo 54 without extra config?

### Takeaway
On Android, no. Animated WebP is OFF by default in Expo's template (`expo.webp.animated=false`, ~3.4 MB APK cost to enable), and it needs a config plugin that flips the gradle property. On iOS, the RN docs say nothing explicit. Native ImageIO decodes WebP from iOS 14, but animated WebP with alpha has had rendering bugs, so I found no authoritative confirmation that RN's iOS `Image` plays it. Animated GIF is enabled on Android by default in Expo, but GIF has 1-bit alpha, so a photographic dove gets jagged, haloed edges. That makes animated images a poor fit here, and expo-image (which the project doesn't install) would be the normal route.

### Cited Findings
- RN Image docs: "When building your own native code, GIF and WebP are not supported by default on Android. You will need to add some optional modules in `android/app/build.gradle`", listing `com.facebook.fresco:animated-webp` + `webpsupport` "For WebP support, including animated WebP". On iOS, "the `webp` format is supported on iOS **only** when bundled with the JavaScript code." — [React Native Image docs](https://reactnative.dev/docs/image)
- Expo SDK 54 bare template `android/gradle.properties`: `expo.gif.enabled=true` ("~200 B increase"), `expo.webp.enabled=true` ("~85 KB increase"), `expo.webp.animated=false` with the comments "Enable animated webp support (~3.4 MB increase)" and "Disabled by default because iOS doesn't support animated webp". — [expo sdk-54 template gradle.properties](https://raw.githubusercontent.com/expo/expo/sdk-54/templates/expo-template-bare-minimum/android/gradle.properties)
- A search for an `expo-build-properties` key for animated WebP found none. The community workaround is a custom config plugin using `withGradleProperties` to set `expo.webp.animated=true`. The forum thread (forums.expo.dev/t/58960, about 2021, older) now redirects to Discord, so I could not re-read it. — [search result summary, Expo forum thread](https://forums.expo.dev/t/animated-webp-expected-to-work-with-eas-builds/58960) (unverified, old)
- iOS: native WebP decoding arrived in iOS 14 / macOS Big Sur. A WebKit bug reported that animated WebP with transparency renders with flicker and frame artifacts on iOS 14. — [WebKit Bugzilla 217897](https://bugs.webkit.org/show_bug.cgi?id=217897)

### Inferences
- The Expo template's own comment ("iOS doesn't support animated webp") is the strongest signal that RN core Image on iOS will NOT animate WebP reliably. Treat it as unsupported without expo-image (SDWebImage-based).
- Even if animated images played, an animated image's frame clock runs independently of the Reanimated path clock, with no way to sync wing phase to path progress, pause it, or reset it on mount. For a 3.5 s scripted shot, a sprite sheet driven by the same shared value is strictly better.
- Web export: browsers play animated WebP/APNG natively, so web alone would work. The problem is native only.

### Gaps
- I did not inspect RN 0.81's `RCTImageLoader`/`RCTAnimatedImage` source to confirm iOS behaviour definitively.
- I did not confirm whether RN 0.81 core Image on iOS plays APNG (ImageIO decodes APNG, but RN behaviour is unverified).

## Sprite-sheet memory limits, and recommended frame count/size

### Takeaway
Keep any single bitmap at or under 4096 px on its longest side, and ideally ≤ 2048 for headroom on low-end Android. A flap cycle of 8–16 frames at roughly 2× the on-screen sprite size (e.g. 256×256 px cells for a ~120 dp bird) fits in a 4×4 grid of 1024×1024 px, about 4 MB decoded RGBA, which is safe everywhere.

### Cited Findings
- Android's hardware renderer reads `GL_MAX_TEXTURE_SIZE` once and rejects bitmaps larger than it ("Bitmap too large to be uploaded into a texture"). The limit is per GPU/driver: a 4196×3363 image failed on a Nexus 7 / Galaxy S4 (max 4096) but worked on a Pixel with Android 9. — [AOSP hwui TextureCache.cpp](https://android.googlesource.com/platform/frameworks/base/+/e927ec0/libs/hwui/TextureCache.cpp); [Titanium TIMOB-27471](https://jira-archive.titaniumsdk.com/TIMOB-27471)
- Android also fails on decoded bitmaps above roughly 100 MB uncompressed. — [Titanium TIMOB-27471](https://jira-archive.titaniumsdk.com/TIMOB-27471)
- Unity caps `PackTextures` max atlas size to 4096 on Android/iOS. This is an industry convention, cited as corroboration only. — [Unity issue tracker](https://issuetracker.unity3d.com/issues/android-ios-texture2d-dot-packtextures-caps-maximumatlassize-to-4096)

### Inferences
- Decoded memory = W × H × 4 bytes. 2048² ≈ 16 MB, 4096² ≈ 64 MB. A 4096² sheet on a splash screen competes with app startup, so prefer 1024–2048.
- Frame count: a real dove flaps about 5–8 Hz but reads well on screen at a stylised 3–5 flaps/s. 12 frames per flap cycle looped at ~24–30 fps is plenty, plus 4–8 dedicated landing frames (wings braking, folding) played once at the end. Total ~16–24 cells.
- Use PNG for the sheet (WebP static is enabled by default on Android and Expo, and fine too) for full 8-bit alpha. Shadows and soft feather edges are what make a "photographic" bird look real.
- Mechanics: an `overflow:'hidden'` View the size of one cell, containing an Image the size of the whole sheet, offset by `translateX/translateY = -col*cellW, -row*cellH` from a worklet (`frame = floor(progress * flaps * framesPerFlap) % framesPerFlap`). This stays on the UI thread and keeps one texture resident. Swapping `<Image source>` per frame instead triggers a React render per frame plus a decode or cache lookup on the JS thread, and risks flicker on Android. Avoid it.
- Theme handling (#F7F3EA light / #151021 dark / black): photographic cutouts with alpha that were matted on white show a light fringe on dark themes. Export frames with premultiplied, clean alpha (no matte), or ship a separate sheet per theme if the shadow or glow differs.

### Gaps
- No authoritative published guidance on a "recommended" sprite frame count for RN. The frame numbers above are reasoned, not sourced.
- I did not measure actual mount and decode time of a 2048² PNG on the project's test phone (S22). That needs measuring on device.

## Known pitfalls: Lottie image-sequence file sizes, Rive needing a dev build / config plugin, Reanimated 4 + web

### Takeaway
Lottie with a photographic image sequence is the worst size option: base64 frames bloat the JSON, and real reports run to tens of MB. Lottie also adds a native dep (~7.3.1 on SDK 54, since the current major needs RN ≥ 0.84). Rive's new runtime is Nitro-based (another native dep, dev build only, no RN-web path stated), and its legacy package is in maintenance. Reanimated 4 works on web, but animations run in plain JS there, which is fine for a single transform.

### Cited Findings
- Lottie image sequences: LottieFiles recommends embedding base64 only for small images. One user's 1000×900 PNG sequence (~500 KB/frame) produced an ~86 MB JSON, another's JPEG sequence ~30 MB even after compression. — [LottieFiles image handling best practices](https://help.lottiefiles.com/image-handling-best-practices-); [Webflow forum](https://discourse.webflow.com/t/lottie-animation-from-a-rendered-sequence-keeping-file-sizes-small/179687) (anecdotal)
- dotLottie can cut a Lottie JSON by "up to 80%", but the example given had no raster images, so it does not apply to photo frames. — [Hackernoon](https://sia.hackernoon.com/shrink-your-lottie-animations-by-80percent-with-the-lottie-format) (vendor-adjacent)
- lottie-react-native README (current): requires RN 0.84+ and the New Architecture. For older RN it recommends 7.3.x. Web needs `@lottiefiles/dotlottie-react` added, and `.lottie` files need `lottie` added to Metro `assetExts`. — [lottie-react-native GitHub](https://github.com/lottie-react-native/lottie-react-native). Expo SDK 54 pins `lottie-react-native ~7.3.1`. — [bundledNativeModules.json](https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json)
- Rive: `rive-react-native` is labelled legacy. "The new Rive React Native runtime is now available", with only fixes for "major concerns" on the legacy package and "Full migration to the new package" long-term. For Expo, "use config plugins", and the examples use `expo run:android/ios` (native builds). The README lists only iOS 14+/Android. — [rive-react-native GitHub](https://github.com/rive-app/rive-react-native)
- New `@rive-app/react-native`: "Built with Nitro", requires `react-native-nitro-modules`, RN ≥ 0.78, Expo SDK ≥ 53, iOS 15.1, Android SDK 24. Data binding works through `useViewModelInstance`/`useRiveNumber`/`dataBind`. Web support is not mentioned for this runtime. — [Rive React Native docs](https://rive.app/docs/runtimes/react-native/react-native)
- Rive can deform raster images with meshes ("Rive uses that contour to create a triangulated surface over the image") bound to bones. Image assets are "often the biggest source of bloat" in .riv files, and WebP is recommended for smallest size. — [Rive meshes docs](https://rive.app/docs/editor/manipulating-shapes/meshes); [Rive best practices](https://rive.app/docs/getting-started/best-practices.md)
- Reanimated on web: "all of the functionalities are implemented purely in JavaScript, hence the efficiency of the animations might be lower". They "strongly recommend not opting out of the Worklets Babel plugin". Without it, hooks need explicit dependency arrays. — [Reanimated web support](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/)
- Skia is in Expo SDK 54's bundled list (2.2.12) but would be a new native dependency here. Its Atlas is the most efficient sprite renderer, with one draw call and per-sprite RSXform animated from worklets. — [bundledNativeModules.json](https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json); [Skia Atlas (mirror)](https://www.mintlify.com/shopify/react-native-skia/shapes/atlas)

### Inferences — comparison matrix (for one developer, this repo)
| Option | Path fidelity | Photo realism | Size | Mount/UI thread | Web | Alpha | New native dep / effort |
|---|---|---|---|---|---|---|---|
| Reanimated + precomputed samples + sprite sheet in overflow-hidden View | Exact (same `d`) | As good as the frames | One sheet, ~0.3–1.5 MB PNG/WebP + ~10 KB JSON | One Image texture, transforms on UI thread | Yes (JS-driven, light) | Full 8-bit | None. ~150 lines. Lowest effort |
| react-native-svg `<Image>` + animated props | Exact | Same frames | Same | Animated props on an SVG node cost more than a View transform (SVG re-renders the node), and clipping a sprite cell inside SVG needs a clipPath or nested svg | Yes | Full | None, but more fiddly than a View for sprite clipping |
| Lottie (raster sequence) | Exact if AE path = drawn path. Auto-orient supported on Android (`ao`) | Good | Large (MBs) for photo frames | Native renderer, decoding many bitmaps at mount | Needs extra web player package | Full | lottie-react-native 7.3.x + dev build + AE/bodymovin workflow |
| Lottie (vector bird) | Exact | Not photographic | Small | Fine | Same | n/a | Same dep; fails the "photographic" requirement |
| Rive (mesh-deformed raster + Follow Path/Orient) | Exact if the path is rebuilt in Rive | Very good (one photo, deformed wings), smooth at any fps | Small (one image) | Native renderer | New Nitro runtime: web not stated | Full | Nitro + rive native deps, dev build, learn the Rive editor |
| Animated WebP/APNG via core Image | Exact for position. Wing clock unsynced | Good | Medium | Decoder-driven | Yes in browsers | Full (WebP/APNG) | Android needs a config plugin (+3.4 MB). iOS unreliable. Not recommended |
| Skia Atlas | Exact | Same frames | Same as sprite sheet | Best (GPU, one draw) | Skia web needs CanvasKit WASM load (extra MBs, unverified figure) | Full | New native dep (+ Skia binary size) |

- Recommendation implied by the evidence: option 1 (Reanimated + sprite sheet) satisfies every constraint with no new native dependency. Skia Atlas is the "if it ever stutters" upgrade, and Rive is the "if we want deformation realism instead of frames" upgrade.
- Repo-specific: CLAUDE.md says native-driven values must not get JS listeners, and that idle loops should stop when off-screen. A loading screen should start its `withTiming` on mount and run the landing callback through `runOnJS` (Reanimated 4: `scheduleOnRN` from worklets) once, with no listeners. `useReduceMotion()` exists in `components/redesign/Primitives.tsx`, so with reduced motion on, skip the flight and fade the dove in at the logo position.

### Gaps
- Exact install-size deltas for lottie-react-native, Rive (Nitro) and Skia on Android/iOS were not found in this pass.
- Skia web (CanvasKit) bundle size and load time were not verified.
- Whether the new Rive Nitro runtime runs on RN-web (Expo web export) is not stated in its docs. Assume no until proven.
