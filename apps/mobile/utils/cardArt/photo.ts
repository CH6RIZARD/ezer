// =============================================================================
// Photo of the user's own card
//
// The one source that can match the exact plastic, affinity designs included.
// The image is kept on the device (see prefs.ts) and never uploaded.
//
// Known limitation: the file itself is stored as captured, so a printed card
// number is in it. The wallet covers the number band when drawing (see
// BankCardFace) but does not redact the stored bytes. Burning the redaction in
// needs expo-image-manipulator or a view-shot dependency — deliberately not
// added here because either would rewrite pnpm-lock.yaml (lockfileVersion 6.0);
// see the note in CLAUDE.md about lockfile/pnpm churn.
// =============================================================================

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { beginInAppFlow, endInAppFlow } from '../passcode';

/**
 * Upper bound on the stored data URI, in characters. Keeps a single value well
 * under Android's ~2 MB AsyncStorage row-read limit. Without an image resizer
 * available, this bounds the size instead of downscaling.
 */
export const MAX_PHOTO_CHARS = 1_400_000;

export type PickPhotoResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'cancelled' | 'denied' | 'too_large' | 'failed' };

/** ID-1 card proportions (85.6 x 54 mm), used for the crop frame. */
const CARD_ASPECT: [number, number] = [856, 540];

export async function pickCardPhoto(source: 'camera' | 'library'): Promise<PickPhotoResult> {
  try {
    // The camera is not available on web; fall back to the file picker.
    const useCamera = source === 'camera' && Platform.OS !== 'web';

    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true, // lets the user crop to the card
      aspect: CARD_ASPECT,
      quality: 0.4,
      base64: true,
    };
    // The picker is its own activity on Android; see utils/passcode.ts.
    beginInAppFlow();
    let result: ImagePicker.ImagePickerResult;
    try {
      result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    } finally {
      endInAppFlow();
    }

    if (result.canceled || !result.assets?.[0]) return { ok: false, reason: 'cancelled' };
    const b64 = result.assets[0].base64;
    if (!b64) return { ok: false, reason: 'failed' };

    const uri = `data:image/jpeg;base64,${b64}`;
    if (uri.length > MAX_PHOTO_CHARS) return { ok: false, reason: 'too_large' };
    return { ok: true, uri };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function photoErrorMessage(reason: Exclude<PickPhotoResult, { ok: true }>['reason']): string | null {
  switch (reason) {
    case 'cancelled':
      return null;
    case 'denied':
      return 'Allow camera or photo access in Settings to add a photo of your card.';
    case 'too_large':
      return 'That photo is too large. Crop closer to the card, or try a smaller image.';
    default:
      return 'Could not use that photo. Please try again.';
  }
}
