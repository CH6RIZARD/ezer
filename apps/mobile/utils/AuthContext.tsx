// =============================================================================
// EZER Mobile App - Auth Context
// Real provider + email auth against the API. No demo / bypass login.
// =============================================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthSessionData,
  completeAppleAuth,
  completeGoogleAuth,
  completeMicrosoftAuth,
  fetchSession,
  getStoredToken,
  loginWithEmail,
  setStoredToken,
  signupWithEmail,
} from './api';
import { signInWithApple } from './appleAuth';
import { signInWithGoogle } from './googleAuth';
import { signInWithMicrosoft } from './microsoftAuth';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

export type AuthActionResult = {
  success: boolean;
  hasCompletedOnboarding: boolean;
  cancelled?: boolean;
  error?: string;
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  signup: (email: string, password: string, name: string) => Promise<AuthActionResult>;
  loginWithProvider: (provider: 'google' | 'apple' | 'microsoft') => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = '@ezer_user';
const ONBOARDING_KEY = '@ezer_onboarding_complete';

function userFromSession(session: AuthSessionData, previous?: User | null): User {
  return {
    id: session.userId,
    email: session.email,
    name: session.name || previous?.name || session.email.split('@')[0],
    phone: previous?.phone,
    avatarUrl: previous?.avatarUrl,
    createdAt: previous?.createdAt || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const persistSession = async (session: AuthSessionData, previous?: User | null) => {
    const nextUser = userFromSession(session, previous);
    await Promise.all([
      setStoredToken(session.token),
      AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser)),
    ]);
    setToken(session.token);
    setUser(nextUser);
    return nextUser;
  };

  const loadUserData = async () => {
    try {
      const [savedUser, onboardingComplete, savedToken] = await Promise.all([
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        getStoredToken(),
      ]);

      setHasCompletedOnboarding(onboardingComplete === 'true');

      if (!savedToken) {
        // Drop any leftover local-only demo user without a real session
        if (savedUser) {
          await AsyncStorage.removeItem(USER_STORAGE_KEY);
        }
        setUser(null);
        setToken(null);
        return;
      }

      try {
        const session = await fetchSession(savedToken);
        const nextUser: User = {
          id: session.userId,
          email: session.email,
          name: session.name || (savedUser ? (JSON.parse(savedUser) as User).name : session.email.split('@')[0]),
          createdAt: savedUser
            ? (JSON.parse(savedUser) as User).createdAt
            : new Date().toISOString(),
        };
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
        setUser(nextUser);
        setToken(savedToken);
      } catch {
        await Promise.all([setStoredToken(null), AsyncStorage.removeItem(USER_STORAGE_KEY)]);
        setUser(null);
        setToken(null);
      }
    } catch (error) {
      console.log('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      const session = await loginWithEmail(email.trim(), password);
      await persistSession(session, user);
      const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
      return {
        success: true,
        hasCompletedOnboarding: onboardingComplete === 'true',
      };
    } catch (error) {
      return {
        success: false,
        hasCompletedOnboarding: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string
  ): Promise<AuthActionResult> => {
    try {
      const session = await signupWithEmail(email.trim(), password, name.trim());
      await persistSession(session, user);
      return {
        success: true,
        hasCompletedOnboarding: false,
      };
    } catch (error) {
      return {
        success: false,
        hasCompletedOnboarding: false,
        error: error instanceof Error ? error.message : 'Signup failed',
      };
    }
  };

  const loginWithProvider = async (
    provider: 'google' | 'apple' | 'microsoft'
  ): Promise<AuthActionResult> => {
    try {
      let session: AuthSessionData;

      if (provider === 'google') {
        const google = await signInWithGoogle();
        if (google.cancelled) {
          return { success: false, hasCompletedOnboarding: false, cancelled: true };
        }
        session = await completeGoogleAuth(google.idToken);
      } else if (provider === 'apple') {
        const apple = await signInWithApple();
        if (apple.cancelled) {
          return { success: false, hasCompletedOnboarding: false, cancelled: true };
        }
        session = await completeAppleAuth({
          identityToken: apple.identityToken,
          fullName: apple.fullName,
          email: apple.email,
        });
      } else {
        const microsoft = await signInWithMicrosoft();
        if (microsoft.cancelled) {
          return { success: false, hasCompletedOnboarding: false, cancelled: true };
        }
        session = await completeMicrosoftAuth(microsoft.idToken);
      }

      await persistSession(session, user);
      const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
      return {
        success: true,
        hasCompletedOnboarding: onboardingComplete === 'true',
      };
    } catch (error) {
      console.log('OAuth login error:', error);
      return {
        success: false,
        hasCompletedOnboarding: false,
        error: error instanceof Error ? error.message : 'Sign-in failed',
      };
    }
  };

  const logout = async () => {
    try {
      try {
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        await GoogleSignin.signOut();
      } catch {
        // Google SDK may be unavailable in some environments
      }

      await Promise.all([setStoredToken(null), AsyncStorage.removeItem(USER_STORAGE_KEY)]);
      setToken(null);
      setUser(null);
      // Keep ONBOARDING_KEY so returning users skip onboarding
    } catch (error) {
      console.log('Logout error:', error);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

    try {
      const updatedUser = { ...user, ...updates };
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.log('Update user error:', error);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.log('Error saving onboarding state:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        hasCompletedOnboarding,
        login,
        signup,
        loginWithProvider,
        logout,
        updateUser,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
