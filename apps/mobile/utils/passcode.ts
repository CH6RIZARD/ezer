// =============================================================================
// EZER — app passcode storage
//
// The record (salt, hash, length, failed-guess count, lockout) lives in the
// keychain/keystore via expo-secure-store; web has no SecureStore and falls
// back to AsyncStorage — the same split api.ts makes for the session token.
// Every wrong guess is written back, so killing the app does not reset the
// count. The rules themselves (hash, lockout) are in passcodeCore.ts, which
// has tests.
//
// The passcode belongs to the session: LockGate clears it whenever auth
// settles on "signed out" — after logout(), account deletion, or a session the
// server rejected at launch. Not inside logout() itself: that dropped the lock
// while the app was still signed in.
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { FREE_ATTEMPTS, hashPasscode, isValidPasscode, lockedUntilAfter } from './passcodeCore';

export { PASSCODE_MIN, PASSCODE_MAX } from './passcodeCore';

// SecureStore keys may only contain [A-Za-z0-9._-].
const KEY = 'ezer_passcode';

interface PasscodeRecord {
  salt: string;
  hash: string;
  len: number;
  failures: number;
  lockedUntil: number;
}

// Guarded require, same idiom as api.ts: a binary without the native module
// degrades to AsyncStorage instead of crashing at import time.
let SecureStore: {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
  deleteItemAsync: (k: string) => Promise<void>;
} | null = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch {}
}

async function read(): Promise<PasscodeRecord | null> {
  const raw = SecureStore ? await SecureStore.getItemAsync(KEY) : await AsyncStorage.getItem(KEY);
  // Only a MISSING record means "no passcode". A corrupt one throws, so the
  // gate fails closed instead of offering to set a new code over it.
  if (!raw) return null;
  const r = JSON.parse(raw);
  if (typeof r?.hash !== 'string' || typeof r?.salt !== 'string') throw new Error('Unreadable passcode record');
  return r;
}

const write = (r: PasscodeRecord) =>
  SecureStore ? SecureStore.setItemAsync(KEY, JSON.stringify(r)) : AsyncStorage.setItem(KEY, JSON.stringify(r));

export type PasscodeInfo = { len: number; lockedUntil: number };

// Onboarding sets the passcode while LockGate is mounted above it; this is
// how the gate hears about it without a context for one value. The new state
// is handed over synchronously: re-reading storage would leave a window where
// onboarding has finished but the gate still thinks there is no passcode, and
// it would flash its own "set a passcode" prompt.
const listeners = new Set<(info: PasscodeInfo | null) => void>();
export function onPasscodeChange(fn: (info: PasscodeInfo | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const notify = (info: PasscodeInfo | null) => listeners.forEach(fn => fn(info));

/** The passcode's length and any lockout, or null when none is set. */
export async function getPasscodeInfo(): Promise<PasscodeInfo | null> {
  const r = await read();
  return r ? { len: r.len, lockedUntil: r.lockedUntil } : null;
}

export async function setPasscode(code: string): Promise<void> {
  if (!isValidPasscode(code)) throw new Error('A passcode is 4 to 6 digits.');
  const salt = Array.from(Crypto.getRandomBytes(16), b => b.toString(16).padStart(2, '0')).join('');
  await write({ salt, hash: hashPasscode(salt, code), len: code.length, failures: 0, lockedUntil: 0 });
  notify({ len: code.length, lockedUntil: 0 });
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; lockedUntil: number; attemptsLeft: number };

export async function verifyPasscode(code: string): Promise<VerifyResult> {
  const r = await read();
  const now = Date.now();
  // Fail closed: no record here means it was cleared mid-entry.
  if (!r) return { ok: false, lockedUntil: 0, attemptsLeft: 0 };
  if (r.lockedUntil > now) return { ok: false, lockedUntil: r.lockedUntil, attemptsLeft: 0 };

  if (hashPasscode(r.salt, code) === r.hash) {
    if (r.failures || r.lockedUntil) await write({ ...r, failures: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const failures = r.failures + 1;
  // ponytail: the lockout trusts the device clock, so moving it forward ends
  // one early; a monotonic/server-side counter if that ever matters.
  const lockedUntil = lockedUntilAfter(failures, now);
  await write({ ...r, failures, lockedUntil });
  return { ok: false, lockedUntil, attemptsLeft: Math.max(0, FREE_ATTEMPTS - failures) };
}

export async function clearPasscode(): Promise<void> {
  try {
    if (SecureStore) await SecureStore.deleteItemAsync(KEY);
    else await AsyncStorage.removeItem(KEY);
  } finally {
    notify(null);
  }
}

// On Android, Plaid Link and the photo picker are separate activities: the
// app goes to the background while the user is still inside our own flow.
// LockGate gives those a longer grace than a real exit, so linking a bank
// does not end at the keypad. Counted, since flows can overlap.
let inAppFlows = 0;
// Android only: on iOS these flows stay in-process, so leaving during one is
// a real exit and gets the normal grace.
export const beginInAppFlow = () => {
  if (Platform.OS === 'android') inAppFlows++;
};
export const endInAppFlow = () => {
  inAppFlows = Math.max(0, inAppFlows - 1);
};
export const inAppFlowActive = () => inAppFlows > 0;
