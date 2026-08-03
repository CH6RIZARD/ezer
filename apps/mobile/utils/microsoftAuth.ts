// =============================================================================
// Microsoft sign-in via system browser (Auth Session) for iOS + Android
// =============================================================================

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

export type MicrosoftSignInResult =
  | { cancelled: true }
  | { cancelled: false; idToken: string };

export async function signInWithMicrosoft(): Promise<MicrosoftSignInResult> {
  const clientId = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_MICROSOFT_CLIENT_ID. Create a Microsoft Entra app registration and set it in .env.'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'ezer',
    path: 'auth/microsoft',
  });

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  await request.makeAuthUrlAsync(discovery);

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    return { cancelled: true };
  }

  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    discovery
  );

  if (!tokenResult.idToken) {
    throw new Error('Microsoft did not return an ID token.');
  }

  return { cancelled: false, idToken: tokenResult.idToken };
}
