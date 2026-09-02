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

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects when the request never reached a server. Reporting
    // that as "invalid password" — which is what callers used to do with any
    // thrown error — sends people to reset a password that was always correct.
    throw new Error(`Cannot reach the server at ${BASE_URL}. Check your connection.`);
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
    const err = new Error(json?.error || `API ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: any) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: any) => request<T>('PATCH', path, body),

  setToken: (token: string) => AsyncStorage.setItem(TOKEN_KEY, token),
  clearToken: () => AsyncStorage.removeItem(TOKEN_KEY),
  getToken: () => AsyncStorage.getItem(TOKEN_KEY),
};
