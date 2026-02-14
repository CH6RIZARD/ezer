// =============================================================================
// EZER Mobile App - Theme Context
// Provides dark/light mode throughout the app
// =============================================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Light theme colors
const lightColors = {
  background: '#F6F1E9',
  card: '#FFFFFF',
  text: '#1F2933',
  textSecondary: '#9CA3AF',
  border: '#E5E7EB',
  primary: '#5B21B6',
  accent: '#C4A15A',
  danger: '#EF4444',
  success: '#10B981',
  shadow: 'rgba(0, 0, 0, 0.2)',
  tabBar: '#FFFFFF',
  statusBar: 'dark' as const,
};

// Dark theme colors
const darkColors = {
  background: '#0F0F0F',
  card: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  border: '#2D2D2D',
  primary: '#7C3AED',
  accent: '#D4AF37',
  danger: '#EF4444',
  success: '#10B981',
  shadow: 'rgba(0, 0, 0, 0.5)',
  tabBar: '#1A1A1A',
  statusBar: 'light' as const,
};

export type ThemeColors = typeof lightColors;

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@ezer_theme_preference';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      } else {
        // Default to system preference
        setIsDark(systemColorScheme === 'dark');
      }
    } catch (error) {
      console.log('Error loading theme preference:', error);
      setIsDark(systemColorScheme === 'dark');
    } finally {
      setIsLoaded(true);
    }
  };

  const saveThemePreference = async (dark: boolean) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch (error) {
      console.log('Error saving theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newValue = !isDark;
    setIsDark(newValue);
    saveThemePreference(newValue);
  };

  const setTheme = (dark: boolean) => {
    setIsDark(dark);
    saveThemePreference(dark);
  };

  const colors = isDark ? darkColors : lightColors;

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Export colors for static usage (fallback)
export { lightColors, darkColors };
