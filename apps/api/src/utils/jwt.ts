import jwt from 'jsonwebtoken';
import { JwtPayload } from '@ezer/shared';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Refusing to sign tokens with a known default key — see DEPLOY-API.md §1.');
}

// ponytail: 7-day tokens with no revocation; add a tokenVersion claim checked in middleware/auth.ts when logout/revocation matters.
const JWT_EXPIRES_IN = '7d';

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
  } catch (error) {
    return null;
  }
}

export function extractTokenFromHeader(authorization?: string): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.substring(7);
}
