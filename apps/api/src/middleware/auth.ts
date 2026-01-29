import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, extractTokenFromHeader } from '../utils/jwt';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const token = extractTokenFromHeader(request.headers.authorization);

  if (!token) {
    return reply.status(401).send({ error: 'Missing authorization token' });
  }

  const payload = verifyJwt(token);

  if (!payload) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // Attach user info to request
  (request as any).userId = payload.userId;
  (request as any).userEmail = payload.email;
}
