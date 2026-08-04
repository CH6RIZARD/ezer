import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

/**
 * Outcome of a provider sign-in.
 *
 * A boolean cannot carry this: "false" was doing duty for both "authentication
 * failed" and "authenticated, but onboarding is incomplete", and the sign-in
 * screen could not tell them apart.
 */
/** Outcome of an email sign-in or sign-up, carrying the server's reason. */
export type AuthResult =
  | { ok: true; hasCompletedOnboarding: boolean }
  | { ok: false; error: string };

export type ProviderLoginResult =
  | { ok: true; hasCompletedOnboarding: boolean }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'unavailable' | 'failed'; error?: string };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string, name: string) => Promise<AuthResult>;
  loginWithProvider: (provider: 'google' | 'apple' | 'microsoft') => Promise<ProviderLoginResult>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = '@ezer_user';
const ONBOARDING_KEY = '@ezer_onboarding_complete';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedUser, onboarding, token] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
          api.getToken(),
        ]);
        setHasCompletedOnboarding(onboarding === 'true');

        if (!savedUser) return;

        // A stored user is a CLAIM, not a session.
        //
        // This used to restore whatever was in AsyncStorage and call it
        // authenticated. So a token minted long ago by the dev-login bypass
        // kept someone signed in as demo@ezer.app indefinitely — even after
        // that account had been deleted from the database, because nothing
        // ever asked the server.
        //
        // Ask now. Only an explicit rejection clears the session; a network
        // failure leaves it alone, so being offline does not log you out.
        if (!token) {
          await AsyncStorage.removeItem(USER_KEY);
          return;
        }

        try {
          await api.post('/auth/session');
          setUser(JSON.parse(savedUser));
        } catch (err: any) {
          const status: number | undefined = err?.status;
          if (status === 401 || status === 403 || status === 404) {
            console.log('[Auth] stored session rejected by server; signing out');
            await Promise.all([AsyncStorage.removeItem(USER_KEY), api.clearToken()]);
          } else {
            // Unreachable or 5xx — keep the session and let the app retry.
            setUser(JSON.parse(savedUser));
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persistUser = async (u: User) => {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const res: any = await api.post('/auth/login', { email, password });
      await api.setToken(res.data.token);
      const u: User = {
        id: res.data.userId,
        email: res.data.email,
        name: res.data.name || email.split('@')[0],
        createdAt: new Date().toISOString(),
      };
      await persistUser(u);
      const onboarding = await AsyncStorage.getItem(ONBOARDING_KEY);
      return { ok: true, hasCompletedOnboarding: onboarding === 'true' };
    } catch (err: any) {
      // The server's own words. Saying "invalid email or password" for an
      // unreachable API sends people to reset a password that was correct.
      console.log('[Auth] login error:', err.message);
      return { ok: false, error: err?.message || 'Could not sign in.' };
    }
  };

  const signup = async (email: string, password: string, name: string): Promise<AuthResult> => {
    try {
      const res: any = await api.post('/auth/signup', { email, password, name });
      await api.setToken(res.data.token);
      const u: User = {
        id: res.data.userId,
        email: res.data.email,
        name: res.data.name || name,
        createdAt: new Date().toISOString(),
      };
      await persistUser(u);
      return { ok: true, hasCompletedOnboarding: false };
    } catch (err: any) {
      // Was a bare `false`, so "Email already registered", "name is required"
      // and "cannot reach the server" all surfaced as the same useless
      // "An error occurred". That is how an account that was never created
      // looks identical to one that was.
      console.log('[Auth] signup error:', err.message);
      return { ok: false, error: err?.message || 'Could not create your account.' };
    }
  };

  /**
   * Real provider sign-in.
   *
   * The device runs the provider's own flow, and the resulting ID token goes to
   * `/auth/oauth/<provider>/complete`, where the SERVER verifies it against the
   * provider's public keys before minting a session. The app never decides who
   * you are — it only carries the token.
   *
   * The provider SDKs are imported LAZILY, inside the branch that needs them.
   * They are native modules: a static import crashes Expo Go and the web build
   * at startup, before any screen renders. Loading on demand means an
   * unsupported environment degrades to a clear message instead of a white
   * screen.
   */
  const loginWithProvider = async (
    provider: 'google' | 'apple' | 'microsoft'
  ): Promise<ProviderLoginResult> => {
    try {
      let path: string;
      let payload: Record<string, unknown>;

      if (provider === 'google') {
        const { signInWithGoogle } = await import('./googleAuth');
        const res = await signInWithGoogle();
        if (res.cancelled) return { ok: false, reason: 'cancelled' };
        path = '/auth/oauth/google/complete';
        payload = { idToken: res.idToken };
      } else if (provider === 'apple') {
        const { signInWithApple } = await import('./appleAuth');
        const res = await signInWithApple();
        if (res.cancelled) return { ok: false, reason: 'cancelled' };
        path = '/auth/oauth/apple/complete';
        payload = {
          identityToken: res.identityToken,
          email: res.email ?? undefined,
          fullName: res.fullName
            ? { givenName: res.fullName.givenName ?? undefined, familyName: res.fullName.familyName ?? undefined }
            : undefined,
        };
      } else {
        const { signInWithMicrosoft } = await import('./microsoftAuth');
        const res = await signInWithMicrosoft();
        if (res.cancelled) return { ok: false, reason: 'cancelled' };
        path = '/auth/oauth/microsoft/complete';
        payload = { idToken: res.idToken };
      }

      const out: any = await api.post(path, payload);
      await api.setToken(out.data.token);
      await persistUser({
        id: out.data.userId,
        email: out.data.email,
        name: out.data.name || out.data.email.split('@')[0],
        createdAt: new Date().toISOString(),
      });

      const onboarding = await AsyncStorage.getItem(ONBOARDING_KEY);
      return { ok: true, hasCompletedOnboarding: onboarding === 'true' };
    } catch (err: any) {
      const message: string = err?.message || '';
      console.log('[Auth] provider login error:', message);

      // A missing native module or missing client ID is "not available here",
      // which is a different thing to "your credentials were rejected" — and
      // the user can act on only one of them.
      const unavailable =
        /Missing EXPO_PUBLIC_|not available|only available on iOS|native module|RNGoogleSignin|Cannot find module/i.test(
          message
        );

      return {
        ok: false,
        reason: unavailable ? 'unavailable' : 'failed',
        error: message || undefined,
      };
    }
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(USER_KEY),
      api.clearToken(),
    ]);
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    await persistUser(updated);
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setHasCompletedOnboarding(true);
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated: !!user, hasCompletedOnboarding,
      login, signup, loginWithProvider, logout, updateUser, completeOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
