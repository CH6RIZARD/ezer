// =============================================================================
// EZER Mobile App - Theme Context
// Provides dark/light mode throughout the app
// =============================================================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTokens, darkTokens, type ThemeTokens } from '../theme/tokens';

// =============================================================================
// The redesign token map (theme/tokens.ts) is the source of truth. Each theme
// below spreads its tokens and then adds the LEGACY alias names the existing
// screens were written against (background/text/danger/…), remapped onto the
// new palette. That keeps every un-migrated screen compiling and on-palette
// instead of forcing a single all-or-nothing rewrite.
//
// New work should read the token names (bg, ink, mut, gold, line, …).
// =============================================================================

// ORDER MATTERS. Legacy aliases are spread FIRST so the redesign tokens
// override them on collision. With the tokens first, the legacy `accent: gold`
// clobbered the token `accent` (#4C1D95) and every accent surface — the active
// Calendar segment, the today pill, the tab-bar pill — rendered gold.
const lightColors = {
  // --- legacy aliases -------------------------------------------------------
  // `card`, `accent` and `success` are omitted deliberately — those names exist
  // in the token map and are supplied by the spread below.
  background: lightTokens.bg,
  text: lightTokens.ink,
  textSecondary: lightTokens.mut,
  border: lightTokens.line,
  primary: lightTokens.accent,
  danger: lightTokens.red,
  shadow: 'rgba(36,26,56,0.10)',
  tabBar: lightTokens.tabBg,
  // Widened rather than `as const`: the light and dark maps must share one type
  // so `isDark ? dark : light` stays assignable to ThemeColors.
  statusBar: 'dark' as 'dark' | 'light',

  // Tokens last: they win every name collision (accent, card, success).
  ...lightTokens,
};

const darkColors = {
  // --- legacy aliases -------------------------------------------------------
  background: darkTokens.bg,
  text: darkTokens.ink,
  textSecondary: darkTokens.mut,
  border: darkTokens.line,
  // Legacy `primary` is used for text and icons as well as fills, so it maps to
  // accInk — plain #4C1D95 is unreadable on the dark background.
  primary: darkTokens.accInk,
  danger: darkTokens.red,
  shadow: 'rgba(0,0,0,0.5)',
  tabBar: darkTokens.tabBg,
  statusBar: 'light' as 'dark' | 'light',

  // Tokens last: they win every name collision.
  ...darkTokens,
};

export type ThemeColors = typeof lightColors;
export type { ThemeTokens };

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
  // Before storage loads, use system theme so first paint matches device (avoids light flash on dark-mode iPhone)
  const resolvedColors = isLoaded ? colors : (systemColorScheme === 'dark' ? darkColors : lightColors);
  const resolvedDark = isLoaded ? isDark : (systemColorScheme === 'dark');

  // ---------------------------------------------------------------------------
  // WEB: keep the DOCUMENT's colours on the app's theme, not the OS's.
  //
  // public/index.html paints html/body/#root and sets <meta theme-color> from
  // `@media (prefers-color-scheme: dark)`. But the theme here is a stored user
  // preference that is free to disagree with the OS — light app on a dark-mode
  // phone is the common case. When it does disagree, everything the app itself
  // draws is light while the document underneath stays #151021, and that shows
  // as a purple band across the top: in standalone PWA mode the status-bar strip
  // is painted by the document, not by React, because index.html asks for
  // `black-translucent` so the app can draw under it.
  //
  // So the static CSS is only ever the pre-hydration guess. Once the stored
  // preference is known, the resolved theme is pushed onto the document and the
  // two can no longer diverge.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const bg = resolvedColors.bg;

    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    const rootEl = document.getElementById('root');
    if (rootEl) rootEl.style.backgroundColor = bg;

    // Also tell the UA which scheme to render ITS surfaces in — scrollbars,
    // form controls, the overscroll gutter. Without this they stay OS-themed.
    document.documentElement.style.colorScheme = resolvedDark ? 'dark' : 'light';

    // The two scheme-scoped theme-color tags from index.html would still win on
    // media match, so replace the whole set with one unscoped tag we control.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', bg);
    document.head.appendChild(meta);
  }, [resolvedDark, resolvedColors]);

  return (
    <ThemeContext.Provider value={{ isDark: resolvedDark, colors: resolvedColors, toggleTheme, setTheme }}>
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
