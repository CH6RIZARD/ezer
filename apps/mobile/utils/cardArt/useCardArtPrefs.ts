// React hook over prefs.ts: loads saved card looks for the cards on screen and
// exposes setters that update state and storage together.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCardArtPrefs, saveDesign, savePhoto } from './prefs';
import { pickCardPhoto, photoErrorMessage } from './photo';
import type { CardArtPrefs } from './types';

export function useCardArtPrefs(cardIds: string[]) {
  const [prefs, setPrefs] = useState<Record<string, CardArtPrefs>>({});

  // A stable key so a new array with the same ids does not re-run the load.
  const idKey = useMemo(() => cardIds.join('|'), [cardIds]);

  useEffect(() => {
    let cancelled = false;
    const ids = idKey ? idKey.split('|') : [];
    loadCardArtPrefs(ids).then(loaded => {
      // Merge rather than replace, so a choice made while this was loading
      // is not clobbered by the older stored value.
      if (!cancelled) setPrefs(prev => ({ ...loaded, ...prev }));
    });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const patch = useCallback((cardId: string, change: Partial<CardArtPrefs>) => {
    setPrefs(prev => ({ ...prev, [cardId]: { ...prev[cardId], ...change } }));
  }, []);

  /** Pick a catalog design, or null to go back to automatic. */
  const setDesign = useCallback(
    async (cardId: string, designId: string | null) => {
      patch(cardId, { designId: designId ?? undefined });
      await saveDesign(cardId, designId).catch(() => {});
    },
    [patch],
  );

  /** Opens the camera/library. Resolves to an error message, or null on success/cancel. */
  const addPhoto = useCallback(
    async (cardId: string, source: 'camera' | 'library'): Promise<string | null> => {
      const result = await pickCardPhoto(source);
      if (!result.ok) return photoErrorMessage(result.reason);
      try {
        await savePhoto(cardId, result.uri);
      } catch {
        return 'Could not save that photo on this device.';
      }
      patch(cardId, { photoUri: result.uri });
      return null;
    },
    [patch],
  );

  const removePhoto = useCallback(
    async (cardId: string) => {
      patch(cardId, { photoUri: undefined });
      await savePhoto(cardId, null).catch(() => {});
    },
    [patch],
  );

  return { prefs, setDesign, addPhoto, removePhoto };
}
