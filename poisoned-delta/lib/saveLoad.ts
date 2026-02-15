/**
 * LOCKED: Save / restore player state and camera volume.
 * Used on every valid position update and on load.
 */

const STORAGE_KEY = 'poisoned_delta_save';

export interface SavedState {
  version: number;
  position: { x: number; y: number; z: number };
  cameraVolumeId: string | null;
  timestamp: number;
}

const CURRENT_VERSION = 1;

export function loadSavedState(): SavedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: Omit<SavedState, 'version' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedState = {
      version: CURRENT_VERSION,
      position: state.position,
      cameraVolumeId: state.cameraVolumeId,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearSavedState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
