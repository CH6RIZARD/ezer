import jwt from 'jsonwebtoken';
import { JwtPayload } from '@ezer/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'ezer-dev-jwt-secret-not-for-production';
const JWT_EXPIRES_IN = '7d';

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
