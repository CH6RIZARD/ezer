// Port of apps/mobile/utils/cardArt/photo.ts
//
// Photo of the user's own card
//
// The one source that can match the exact plastic, affinity designs included. The image is kept
// on the device (see Core/CardArt/CardArtPrefs.swift) and never uploaded.
//
// Known limitation: the file itself is stored as captured, so a printed card number is in it.
// The wallet covers the number band when drawing (see BankCardFace) but does not redact the
// stored bytes.
//
// Only reachable from the unmounted CardArtPicker (nothing in the running app opens the picker),
// so on iOS the picker itself is not wired yet — see pickCardPhoto.

import Foundation

/**
 * Upper bound on the stored data URI, in characters. Keeps a single value well under Android's
 * ~2 MB AsyncStorage row-read limit. Without an image resizer available, this bounds the size
 * instead of downscaling.
 */
let MAX_PHOTO_CHARS = 1_400_000

/// TS: `{ ok: true; uri } | { ok: false; reason: 'cancelled' | 'denied' | 'too_large' | 'failed' }`.
enum PickPhotoResult: Hashable, Sendable {
    case ok(uri: String)
    /// reason: 'cancelled' | 'denied' | 'too_large' | 'failed'
    case failure(reason: String)
}

/** ID-1 card proportions (85.6 x 54 mm), used for the crop frame. RN name CARD_ASPECT (renamed:
 * utils/cardDocument.ts exports a CARD_ASPECT too, and the module namespace is shared). */
private let WALLET_CARD_ASPECT: (Int, Int) = (856, 540)

/// source: 'camera' | 'library'
func pickCardPhoto(_ source: String) async -> PickPhotoResult {
    // TODO(native): expo-image-picker has no port yet. The RN flow is: request camera (source
    // 'camera') or photo-library permission -> 'denied' if refused; launch the camera / library
    // with allowsEditing (crop to CARD_ASPECT 856:540), quality 0.4, base64 -> 'cancelled' when
    // dismissed or no asset, 'failed' without base64; uri = `data:image/jpeg;base64,${b64}`,
    // 'too_large' when uri.count > MAX_PHOTO_CHARS. On iOS this is PhotosPicker /
    // UIImagePickerController (+ NSCameraUsageDescription / NSPhotoLibraryUsageDescription in
    // Info.plist). No UI calls this yet (CardArtPicker is not mounted), so it reports 'failed'.
    _ = source
    _ = WALLET_CARD_ASPECT
    return .failure(reason: "failed")
}

/// reason: 'cancelled' | 'denied' | 'too_large' | anything else.
func photoErrorMessage(_ reason: String) -> String? {
    switch reason {
    case "cancelled":
        return nil
    case "denied":
        return "Allow camera or photo access in Settings to add a photo of your card."
    case "too_large":
        return "That photo is too large. Crop closer to the card, or try a smaller image."
    default:
        return "Could not use that photo. Please try again."
    }
}
