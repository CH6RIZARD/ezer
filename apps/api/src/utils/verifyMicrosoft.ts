import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type VerifiedMicrosoftIdentity = {
  providerUserId: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
};

// Microsoft's consumer (MSA) tenant. Personal-account emails are verified by
// Microsoft itself; work-tenant emails are whatever that tenant's admin typed.
const MSA_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

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

  // nOAuth: the /common JWKS signs tokens for EVERY Azure tenant, and anyone
  // can create a tenant. The issuer must be the token's own tenant, exactly —
  // a substring check accepts e.g. "https://evil.example/login.microsoftonline.com".
  const tid = typeof (payload as { tid?: unknown }).tid === 'string' ? (payload.tid as string) : '';
  if (!tid) {
    throw new Error('Microsoft ID token is missing tenant (tid) claim');
  }

  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (
    issuer !== `https://login.microsoftonline.com/${tid}/v2.0` &&
    issuer !== `https://sts.windows.net/${tid}/`
  ) {
    throw new Error('Invalid Microsoft token issuer');
  }

  const allowedTenants = (process.env.MICROSOFT_ALLOWED_TENANTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedTenants.length > 0 && !allowedTenants.includes(tid)) {
    throw new Error('Microsoft tenant is not allowed');
  }

  const email =
    (typeof payload.email === 'string' && payload.email) ||
    (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
    (typeof (payload as { upn?: string }).upn === 'string' && (payload as { upn?: string }).upn) ||
    '';

  if (!payload.sub || !email) {
    throw new Error('Microsoft ID token is missing required claims');
  }

  // Trust the email for account linking only when Microsoft attests domain
  // ownership (xms_edov) or the account is a consumer (MSA) account. Work
  // tenants can put any string in email/preferred_username/upn.
  const edov = (payload as { xms_edov?: unknown }).xms_edov;
  const emailVerified = edov === true || edov === 'true' || tid === MSA_TENANT_ID;

  return {
    providerUserId: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    emailVerified,
  };
}
