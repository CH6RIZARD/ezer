import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleIdentity = {
  providerUserId: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
};

function getGoogleAudiences(): string[] {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    ...(process.env.GOOGLE_CLIENT_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(audiences)];
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  const audiences = getGoogleAudiences();
  if (audiences.length === 0) {
    throw new Error(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and/or GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID / GOOGLE_WEB_CLIENT_ID.'
    );
  }

  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Google ID token is missing required claims');
  }

  if (payload.email_verified === false) {
    throw new Error('Google email is not verified');
  }

  return {
    providerUserId: payload.sub,
    email: payload.email,
    name: payload.name || null,
    emailVerified: Boolean(payload.email_verified ?? true),
  };
}
