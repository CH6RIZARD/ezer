import { AuthProvider, prisma } from '@ezer/db';
import { signJwt } from './jwt';
import { CONSENT_VERSION } from './consent';

export type OAuthIdentity = {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  name?: string | null;
  /**
   * True only when the PROVIDER attests ownership of this email (Google
   * email_verified, Apple token email, Microsoft xms_edov / MSA tenant).
   * An unverified email may create a brand-new account but must NEVER be
   * used to link into an existing one — that is the nOAuth account takeover.
   */
  emailVerified: boolean;
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
    const userWithEmail = await prisma.user.findUnique({ where: { email } });
    if (userWithEmail) {
      if (!identity.emailVerified) {
        // The provider did not verify ownership of this email, so it cannot
        // be a key into someone else's account.
        throw new Error('This email is already registered; sign in with your original method');
      }
      user = userWithEmail;
    }
  }

  if (!user) {
    // Social sign-in created accounts with no consent record whatsoever — the
    // terms checkbox lives on the email signup screen only, so anyone arriving
    // through Google, Apple or Microsoft agreed to nothing. Completing the
    // provider flow is the acceptance; record it like any other.
    user = await prisma.user.create({
      data: {
        email,
        name: identity.name || null,
        consentedAt: new Date(),
        consentVersion: CONSENT_VERSION,
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
