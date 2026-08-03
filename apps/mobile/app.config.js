/**
 * Expo config — reads Google OAuth client IDs from env for native builds.
 *
 * Required for Google Sign-In:
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID   (iOS builds)
 *
 * Android uses package com.ezer.app + SHA-1 of the signing key in Google Auth Platform.
 */

function googleIosUrlScheme() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  if (!iosClientId.endsWith('.apps.googleusercontent.com')) {
    return undefined;
  }
  const prefix = iosClientId.replace('.apps.googleusercontent.com', '');
  return `com.googleusercontent.apps.${prefix}`;
}

const iosUrlScheme = googleIosUrlScheme();

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'EZER',
  slug: 'ezer',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#F7F7F5',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.ezer.app',
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F7F7F5',
    },
    package: 'com.ezer.app',
    permissions: ['android.permission.RECORD_AUDIO'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  scheme: 'ezer',
  plugins: [
    'expo-router',
    'expo-image-picker',
    'expo-apple-authentication',
    'expo-web-browser',
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 35,
          usesCleartextTraffic: true,
        },
      },
    ],
    'react-native-purchases',
    ...(iosUrlScheme
      ? [
          [
            '@react-native-google-signin/google-signin',
            {
              iosUrlScheme,
            },
          ],
        ]
      : ['@react-native-google-signin/google-signin']),
  ],
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: '37fb7548-df7c-4bff-a745-98b927cc1d84',
    },
  },
  owner: 'ch6ze',
};
