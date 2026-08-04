import { AuthProvider, prisma } from '@ezer/db';
import { signJwt } from './jwt';

export type OAuthIdentity = {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  name?: string | null;
};

export type AuthSessionResponse = {
  token: string;
  userId: string;
  email: string;
  name: string | null;
  provider: AuthProvider | 'email';
};

export async function upsertOAuthUser(identity: OAuthIdentity): Promise<AuthSessionResponse> {
  const email = identity.email.toLowerCase().trim();
  if (!email) {
    throw new Error('Email is required from the identity provider');
  }

  const existingAccount = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
      },
    },
    include: { user: true },
  });

  let user = existingAccount?.user ?? null;

  if (!user) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: identity.name || null,
      },
    });
  } else if (identity.name && !user.name) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: identity.name },
    });
  }

  await prisma.authAccount.upsert({
    where: {
      provider_providerUserId: {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
      },
    },
    create: {
      userId: user.id,
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email,
    },
    update: {
      email,
      userId: user.id,
    },
  });

  const token = signJwt({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    provider: identity.provider,
  };
}
