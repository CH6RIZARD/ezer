import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type VerifiedAppleIdentity = {
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
};

const appleJwks = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('Apple token missing kid'));
    return;
  }

  appleJwks.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, key?.getPublicKey());
  });
}

function getAppleAudiences(): string[] {
  const audiences = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    'com.ezer.app',
  ].filter((value): value is string => Boolean(value));

  return [...new Set(audiences)];
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedAppleIdentity> {
  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw new Error('Apple Sign-In is not configured. Set APPLE_CLIENT_ID or APPLE_BUNDLE_ID.');
  }

  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      identityToken,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: audiences.length === 1 ? audiences[0] : (audiences as [string, ...string[]]),
      },
      (err: Error | null, decoded: jwt.JwtPayload | string | undefined) => {
        if (err || !decoded || typeof decoded === 'string') {
          reject(err || new Error('Invalid Apple identity token'));
          return;
        }
        resolve(decoded);
      }
    );
  });

  if (!payload.sub) {
    throw new Error('Apple identity token is missing subject');
  }

  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true' ||
    typeof payload.email === 'string';

  return {
    providerUserId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified,
  };
}
