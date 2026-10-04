import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The deployed API, as a last resort for any SHIPPED bundle.
 *
 * EXPO_PUBLIC_* values are inlined at BUILD time, and the only place this one
 * is set is the `env` block of each eas.json profile — which EAS Build reads
 * and nothing else does. So a bundle produced any other way (`expo export -p
 * web`, a CI or host build step, a local export) carries no API URL at all and
 * fell through to the loopback addresses below.
 *
 * On a deployed site that is fatal twice over: 127.0.0.1 is the visitor's own
 * machine, where nothing is listening, and a page served over HTTPS is not
 * allowed to call http:// anyway — the browser blocks it as mixed content
 * before the request is made. Every sign-in attempt then failed with "Cannot
 * reach the server at http://127.0.0.1:3001", which reads like the password
 * was wrong.
 *
 * Not a secret: it is the same public hostname already committed in eas.json.
 */
const PRODUCTION_API_URL = 'https://ezer-api-production-fca5.up.railway.app';

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  // Expo Go / dev client: Metro's host is the machine running the API (same LAN).
  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    if (host) return `http://${host}:3001`;
  }

  // Past this point the loopback guesses below only make sense while
  // developing. A release bundle reaching them is a misconfiguration, and
  // guessing the deployed API is strictly better than guessing a local one.
  if (!__DEV__) {
    return PRODUCTION_API_URL;
  }

  // Android emulator → host loopback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }

  return 'http://127.0.0.1:3001';
}

const BASE_URL = resolveApiBaseUrl();
export const TOKEN_KEY = '@ezer_jwt';
// SecureStore keys may only contain [A-Za-z0-9._-], so the native key drops the '@'.
const SECURE_TOKEN_KEY = 'ezer_jwt';
/** No response at all within this window reads the same as "network down". */
const REQUEST_TIMEOUT_MS = 15_000;

// A 7-day session JWT belongs in the keychain/keystore, not AsyncStorage's
// plain file. SecureStore has no web implementation, so web keeps AsyncStorage
// (the browser has no better primitive for an SPA anyway). Guarded require,
// same idiom as PremiumContext.native.tsx, so a bundle built before the module
// is installed degrades instead of crashing at import time.
// ponytail: silently falls back to AsyncStorage when the native module is
// missing (old dev client); drop the fallback once every binary ships
// expo-secure-store.
let SecureStore: { getItemAsync: (k: string) => Promise<string | null>; setItemAsync: (k: string, v: string) => Promise<void>; deleteItemAsync: (k: string) => Promise<void> } | null = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch {}
}

/** One-shot migration guard: only the first read checks the legacy key. */
let migrated = false;

async function getToken(): Promise<string | null> {
  if (!SecureStore) return AsyncStorage.getItem(TOKEN_KEY);
  let token = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
  if (!token && !migrated) {
    // Sessions minted before SecureStore existed live under the old
    // AsyncStorage key — move them across once and delete the plain copy.
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
      token = legacy;
    }
  }
  migrated = true;
  return token;
}

async function setToken(token: string): Promise<void> {
  if (!SecureStore) return AsyncStorage.setItem(TOKEN_KEY, token);
  await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
}

async function clearToken(): Promise<void> {
  if (!SecureStore) return AsyncStorage.removeItem(TOKEN_KEY);
  // Both, so a half-migrated device can't resurrect a logged-out session.
  await Promise.all([SecureStore.deleteItemAsync(SECURE_TOKEN_KEY), AsyncStorage.removeItem(TOKEN_KEY)]);
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  // Fastify's body parser rejects a request outright — 400, before the route
  // handler runs — when Content-Type: application/json arrives with no body.
  // Every bodyless POST (create-link-token, sync, ...) hit exactly this: the
  // header was sent unconditionally regardless of whether `body` existed, so
  // the Plaid Link button's "Bad Request" was this parser refusing the
  // request, not anything Plaid ever saw.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  // Same timeout idiom as utils/cancellation.ts probe(): without it a dead
  // link hangs every caller forever instead of surfacing the error below.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // fetch only rejects when the request never reached a server (an abort on
    // timeout lands here too, which is the same situation from the caller's
    // seat). Reporting that as "invalid password" — which is what callers used
    // to do with any thrown error — sends people to reset a password that was
    // always correct.
    throw new Error(`Cannot reach the server at ${BASE_URL}. Check your connection.`);
  } finally {
    clearTimeout(timer);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server returned a non-JSON response (${res.status}).`);
  }

  if (!res.ok) {
    // Carry the status so callers can tell "your session is dead" (401/404)
    // from "the server is unhappy" or "the network is down". Signing someone
    // out because their train went through a tunnel is its own bug.
    //
    // Our own routes put the specific problem in `error` (e.g. "Plaid not
    // configured on this server"). Fastify's own framework-level rejections —
    // a body-parser or validation failure before any route handler runs — put
    // only the generic HTTP reason phrase there ("Bad Request") and the actual
    // detail in `message`. Prefer whichever one isn't just that generic phrase.
    const detail =
      json?.error && json.error !== json?.message && !/^(Bad Request|Not Found|Internal Server Error)$/.test(json.error)
        ? json.error
        : json?.message || json?.error;
    const err = new Error(detail || `API ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: any) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: any) => request<T>('PATCH', path, body),
  // Account deletion is the only DELETE the app makes, and it had no client
  // method — which is part of why the endpoint shipped with nothing calling it
  // while the privacy policy promised users could delete from inside the app.
  del: <T>(path: string) => request<T>('DELETE', path),

  setToken,
  clearToken,
  getToken,
};
