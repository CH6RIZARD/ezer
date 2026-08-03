// =============================================================================
// Native Apple Sign-In (iOS). Not available on Android.
// =============================================================================

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

export type AppleSignInResult =
  | { cancelled: true }
  | {
      cancelled: false;
      identityToken: string;
      email?: string | null;
      fullName?: AppleAuthentication.AppleAuthenticationFullName | null;
    };

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS devices.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return an identity token.');
    }

    return {
      cancelled: false,
      identityToken: credential.identityToken,
      email: credential.email,
      fullName: credential.fullName,
    };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return { cancelled: true };
    }
    throw error;
  }
}
