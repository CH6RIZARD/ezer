// =============================================================================
// Native Google Sign-In (iOS + Android)
// Requires Google Auth Platform iOS + Android clients (and web client ID for idToken).
// =============================================================================

import { Platform } from 'react-native';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let configured = false;

export function configureGoogleSignIn(): void {
  if (configured) return;

  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  if (!webClientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Create a Web client in Google Auth Platform (used to obtain an ID token) and set it in .env.'
    );
  }

  if (Platform.OS === 'ios' && !iosClientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. Create an iOS client with bundle ID com.ezer.app.'
    );
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId: iosClientId || undefined,
    offlineAccess: false,
    scopes: ['openid', 'profile', 'email'],
  });

  configured = true;
}

export type GoogleSignInResult =
  | { cancelled: true }
  | { cancelled: false; idToken: string };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configureGoogleSignIn();

  // Android requires Play Services; no-op on iOS
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  try {
    // Ensure a clean account picker when switching users
    const current = await GoogleSignin.getCurrentUser();
    if (current) {
      await GoogleSignin.signOut();
    }
  } catch {
    // ignore — no existing session
  }

  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { cancelled: true };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      // Some Android setups return tokens via getTokens()
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.idToken) {
        throw new Error('Google did not return an ID token. Check webClientId configuration.');
      }
      return { cancelled: false, idToken: tokens.idToken };
    }

    return { cancelled: false, idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (
        error.code === statusCodes.SIGN_IN_CANCELLED ||
        error.code === statusCodes.IN_PROGRESS
      ) {
        return { cancelled: true };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is required to sign in with Google on this device.');
      }
    }
    throw error;
  }
}
