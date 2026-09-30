// =============================================================================
// Card art preferences — persisted on this device only
//
// The user's choices (a picked design, a photo of their card) live in
// AsyncStorage and are never sent to the API. Photos are sensitive — the card's
// printed number may be visible in the file — so:
//   · they are kept under one key per card, so one large photo cannot bloat or
//     break the small design map (Android reads rows through a ~2 MB window);
//   · clearAllCardArtPrefs() wipes everything, and AuthContext.logout() calls
//     it, which also covers account deletion (that flow ends in logout()).
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardArtPrefs } from './types';

const DESIGN_KEY = 'ezer.cardArt.designs.v1';
const PHOTO_KEY_PREFIX = 'ezer.cardArt.photo.v1.';

const photoKey = (cardId: string) => `${PHOTO_KEY_PREFIX}${cardId}`;

async function readDesigns(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(DESIGN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Loads saved choices for the given cards. Never throws — a failure is "no prefs". */
export async function loadCardArtPrefs(cardIds: string[]): Promise<Record<string, CardArtPrefs>> {
  const [designs, photos] = await Promise.all([
    readDesigns(),
    AsyncStorage.multiGet(cardIds.map(photoKey)).catch(() => [] as readonly [string, string | null][]),
  ]);
  const out: Record<string, CardArtPrefs> = {};
  cardIds.forEach((id, i) => {
    const photoUri = photos[i]?.[1] ?? undefined;
    const designId = designs[id];
    if (photoUri || designId) out[id] = { photoUri, designId };
  });
  return out;
}

export async function saveDesign(cardId: string, designId: string | null): Promise<void> {
  const designs = await readDesigns();
  if (designId) designs[cardId] = designId;
  else delete designs[cardId];
  await AsyncStorage.setItem(DESIGN_KEY, JSON.stringify(designs));
}

export async function savePhoto(cardId: string, photoUri: string | null): Promise<void> {
  if (photoUri) await AsyncStorage.setItem(photoKey(cardId), photoUri);
  else await AsyncStorage.removeItem(photoKey(cardId));
}

/** Removes every stored card design and photo. Call on sign-out / deletion. */
export async function clearAllCardArtPrefs(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(k => k === DESIGN_KEY || k.startsWith(PHOTO_KEY_PREFIX));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  } catch {
    // Best effort: a failure here must never block signing out.
  }
}
