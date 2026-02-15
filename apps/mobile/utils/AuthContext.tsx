// =============================================================================
// EZER Mobile App - Auth Context
// Manages user authentication state
// =============================================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; hasCompletedOnboarding: boolean }>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
  loginWithProvider: (provider: 'google' | 'apple' | 'microsoft') => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = '@ezer_user';
const ONBOARDING_KEY = '@ezer_onboarding_complete';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const [savedUser, onboardingComplete] = await Promise.all([
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
      ]);

      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      setHasCompletedOnboarding(onboardingComplete === 'true');
    } catch (error) {
      console.log('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; hasCompletedOnboarding: boolean }> => {
    try {
      // Demo login - in production, call your API
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!email.includes('@') || password.length < 6) {
        return { success: false, hasCompletedOnboarding: false };
      }

      const newUser: User = {
        id: 'user_' + Date.now(),
        email,
        name: email.split('@')[0],
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
      const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
      return { success: true, hasCompletedOnboarding: onboardingComplete === 'true' };
    } catch (error) {
      console.log('Login error:', error);
      return { success: false, hasCompletedOnboarding: false };
    }
  };

  const loginWithProvider = async (provider: 'google' | 'apple' | 'microsoft'): Promise<boolean> => {
    try {
      // Demo OAuth - in production, use provider SDK then exchange token with your API
      await new Promise(resolve => setTimeout(resolve, 500));

      const newUser: User = {
        id: 'user_' + Date.now(),
        email: `oauth_${provider}_${Date.now()}@demo.ezer.app`,
        name: provider.charAt(0).toUpperCase() + provider.slice(1) + ' User',
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
      const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
      return onboardingComplete === 'true';
    } catch (error) {
      console.log('OAuth login error:', error);
      return false;
    }
  };

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    try {
      // Demo signup - in production, call your API
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!email.includes('@') || password.length < 6 || !name) {
        return false;
      }

      const newUser: User = {
        id: 'user_' + Date.now(),
        email,
        name,
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
      return true;
    } catch (error) {
      console.log('Signup error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
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
        isLoading,
        isAuthenticated: !!user,
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
