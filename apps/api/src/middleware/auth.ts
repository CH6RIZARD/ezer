import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@ezer/db';
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

  // A token can outlive its user (account deletion); don't act for a ghost.
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
  if (!user) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // Attach user info to request
  (request as any).userId = payload.userId;
  (request as any).userEmail = payload.email;
}
