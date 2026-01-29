import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import { saveFile } from '../utils/storage';
import path from 'path';

export async function cancelRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // POST /subscriptions/:id/cancel
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/subscriptions/:id/cancel',
    async (request, reply) => {
      const userId = (request as any).userId;
      const { id } = request.params;
      const { reason } = request.body;

      // Verify subscription belongs to user
      const subscription = await prisma.subscription.findFirst({
        where: { id, userId },
        include: {
          merchant: true,
        },
      });

      if (!subscription) {
        return reply.status(404).send({ success: false, error: 'Subscription not found' });
      }

      // Determine method based on playbook existence
      const playbook = subscription.merchant.cancellationPlaybook as any;
      const method = playbook ? 'assisted' : 'manual';

      // Create cancel attempt
      const cancelAttempt = await prisma.cancelAttempt.create({
        data: {
          subscriptionId: subscription.id,
          merchantId: subscription.merchantId,
          method,
          status: 'in_progress',
          cancellationUrl: playbook?.url,
          notes: reason,
        },
      });

      return {
        success: true,
        data: {
          id: cancelAttempt.id,
          subscriptionId: cancelAttempt.subscriptionId,
          merchantId: cancelAttempt.merchantId,
          merchantName: subscription.merchant.canonicalName,
          method: cancelAttempt.method,
          status: cancelAttempt.status,
          cancellationUrl: cancelAttempt.cancellationUrl,
          playbook: playbook
            ? {
                steps: playbook.steps,
                expectedEndState: playbook.expectedEndState,
                retentionSteps: playbook.retentionSteps,
                requiresLogin: playbook.requiresLogin,
              }
            : undefined,
          startedAt: cancelAttempt.startedAt,
        },
      };
    }
  );

  // POST /cancel-attempts/:id/proof
  server.post<{
    Params: { id: string };
  }>('/cancel-attempts/:id/proof', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;

    // Verify cancel attempt belongs to user
    const cancelAttempt = await prisma.cancelAttempt.findFirst({
      where: {
        id,
        subscription: {
          userId,
        },
      },
    });

    if (!cancelAttempt) {
      return reply.status(404).send({ success: false, error: 'Cancel attempt not found' });
    }

    // Handle file upload
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ success: false, error: 'Missing file' });
    }

    const buffer = await data.toBuffer();
    const ext = path.extname(data.filename);
    const filename = await saveFile(buffer, ext);

    // Determine file type
    const fileType = ['.png', '.jpg', '.jpeg'].includes(ext.toLowerCase()) ? 'image' : 'email';

    // Create proof artifact
    const proofArtifact = await prisma.proofArtifact.create({
      data: {
        merchantId: cancelAttempt.merchantId,
        cancelAttemptId: cancelAttempt.id,
        fileType,
        fileUri: filename,
      },
    });

    // Update cancel attempt status
    await prisma.cancelAttempt.update({
      where: { id },
      data: {
        status: 'proof_uploaded',
        proofArtifactId: proofArtifact.id,
      },
    });

    return {
      success: true,
      data: {
        proofArtifactId: proofArtifact.id,
        fileType: proofArtifact.fileType,
        uploadedAt: proofArtifact.uploadedAt,
      },
    };
  });

  // POST /cancel-attempts/:id/confirm
  server.post<{
    Params: { id: string };
    Body: { confirmed: boolean; notes?: string };
  }>('/cancel-attempts/:id/confirm', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;
    const { confirmed, notes } = request.body;

    // Verify cancel attempt belongs to user
    const cancelAttempt = await prisma.cancelAttempt.findFirst({
      where: {
        id,
        subscription: {
          userId,
        },
      },
      include: {
        subscription: true,
      },
    });

    if (!cancelAttempt) {
      return reply.status(404).send({ success: false, error: 'Cancel attempt not found' });
    }

    if (!confirmed) {
      return reply.status(400).send({ success: false, error: 'Confirmation required' });
    }

    // Update cancel attempt status
    await prisma.cancelAttempt.update({
      where: { id },
      data: {
        status: 'confirmed',
        notes: notes || cancelAttempt.notes,
      },
    });

    // Update subscription status
    await prisma.subscription.update({
      where: { id: cancelAttempt.subscriptionId },
      data: {
        status: 'canceled',
      },
    });

    return {
      success: true,
      message: 'Cancellation confirmed',
    };
  });

  // GET /cancel-attempts/:id
  server.get<{ Params: { id: string } }>('/cancel-attempts/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;

    const cancelAttempt = await prisma.cancelAttempt.findFirst({
      where: {
        id,
        subscription: {
          userId,
        },
      },
      include: {
        merchant: true,
        proofArtifact: true,
      },
    });

    if (!cancelAttempt) {
      return reply.status(404).send({ success: false, error: 'Cancel attempt not found' });
    }

    const playbook = cancelAttempt.merchant.cancellationPlaybook as any;

    return {
      success: true,
      data: {
        id: cancelAttempt.id,
        subscriptionId: cancelAttempt.subscriptionId,
        merchantId: cancelAttempt.merchantId,
        merchantName: cancelAttempt.merchant.canonicalName,
        method: cancelAttempt.method,
        status: cancelAttempt.status,
        cancellationUrl: cancelAttempt.cancellationUrl,
        playbook: playbook
          ? {
              steps: playbook.steps,
              expectedEndState: playbook.expectedEndState,
              retentionSteps: playbook.retentionSteps,
              requiresLogin: playbook.requiresLogin,
            }
          : undefined,
        proofArtifact: cancelAttempt.proofArtifact
          ? {
              id: cancelAttempt.proofArtifact.id,
              fileType: cancelAttempt.proofArtifact.fileType,
              fileUri: cancelAttempt.proofArtifact.fileUri,
              uploadedAt: cancelAttempt.proofArtifact.uploadedAt,
            }
          : undefined,
        startedAt: cancelAttempt.startedAt,
      },
    };
  });
}
