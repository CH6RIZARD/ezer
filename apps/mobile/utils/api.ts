// =============================================================================
// EZER Mobile — API client (JWT-aware)
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
export const TOKEN_STORAGE_KEY = '@ezer_token';

export type AuthProviderName = 'google' | 'apple' | 'microsoft' | 'email';

export type AuthSessionData = {
  token: string;
  userId: string;
  email: string;
  name: string | null;
  provider: AuthProviderName;
};

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error?: string };

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (!token) {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    token?: string | null;
    auth?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = options.token ?? (options.auth === false ? null : await getStoredToken());
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload: ApiSuccess<T> | ApiFailure | T | null = null;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiFailure | T;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? String(payload.error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as ApiSuccess<T> | ApiFailure;
    if (!envelope.success) {
      throw new Error(envelope.error || 'Request failed');
    }
    return envelope.data;
  }

  return payload as T;
}

export async function completeGoogleAuth(idToken: string): Promise<AuthSessionData> {
  return apiRequest<AuthSessionData>('/auth/oauth/google/complete', {
    method: 'POST',
    body: { idToken },
    auth: false,
  });
}

export async function completeAppleAuth(input: {
  identityToken: string;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  email?: string | null;
}): Promise<AuthSessionData> {
  return apiRequest<AuthSessionData>('/auth/oauth/apple/complete', {
    method: 'POST',
    body: {
      identityToken: input.identityToken,
      fullName: input.fullName
        ? {
            givenName: input.fullName.givenName || undefined,
            familyName: input.fullName.familyName || undefined,
          }
        : undefined,
      email: input.email || undefined,
    },
    auth: false,
  });
}

export async function completeMicrosoftAuth(idToken: string): Promise<AuthSessionData> {
  return apiRequest<AuthSessionData>('/auth/oauth/microsoft/complete', {
    method: 'POST',
    body: { idToken },
    auth: false,
  });
}

export async function loginWithEmail(email: string, password: string): Promise<AuthSessionData> {
  return apiRequest<AuthSessionData>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

export async function signupWithEmail(
  email: string,
  password: string,
  name: string
): Promise<AuthSessionData> {
  return apiRequest<AuthSessionData>('/auth/signup', {
    method: 'POST',
    body: { email, password, name },
    auth: false,
  });
}

export async function fetchSession(token?: string | null): Promise<{
  userId: string;
  email: string;
  name: string | null;
  authProviders: string[];
  hasPassword: boolean;
}> {
  return apiRequest('/auth/session', {
    method: 'POST',
    token: token ?? undefined,
  });
}
