import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type VerifiedMicrosoftIdentity = {
  providerUserId: string;
  email: string;
  name?: string | null;
};

const microsoftJwks = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('Microsoft token missing kid'));
    return;
  }

  microsoftJwks.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, key?.getPublicKey());
  });
}

export async function verifyMicrosoftIdToken(idToken: string): Promise<VerifiedMicrosoftIdentity> {
  const audience = process.env.MICROSOFT_CLIENT_ID;
  if (!audience) {
    throw new Error('Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID.');
  }

  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ['RS256'],
        audience,
      },
      (err: Error | null, decoded: jwt.JwtPayload | string | undefined) => {
        if (err || !decoded || typeof decoded === 'string') {
          reject(err || new Error('Invalid Microsoft ID token'));
          return;
        }
        resolve(decoded);
      }
    );
  });

  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (!issuer.includes('login.microsoftonline.com') && !issuer.includes('sts.windows.net')) {
    throw new Error('Invalid Microsoft token issuer');
  }

  const email =
    (typeof payload.email === 'string' && payload.email) ||
    (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
    (typeof (payload as { upn?: string }).upn === 'string' && (payload as { upn?: string }).upn) ||
    '';

  if (!payload.sub || !email) {
    throw new Error('Microsoft ID token is missing required claims');
  }

  return {
    providerUserId: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}
