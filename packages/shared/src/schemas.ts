import { z } from 'zod';

// ============================================================================
// Auth Schemas
// ============================================================================

export const authProviderSchema = z.enum(['google', 'apple', 'microsoft']);

export const oauthProviderSchema = z.enum(['gmail', 'outlook']);

export const devLoginSchema = z.object({
  provider: authProviderSchema,
});

// ============================================================================
// Wallet Schemas
// ============================================================================

export const dateRangeSchema = z.enum(['last30', 'thisMonth', 'last90', 'custom']);

export const walletSummaryQuerySchema = z.object({
  range: dateRangeSchema.optional().default('last30'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const updateFundingInstrumentSchema = z.object({
  displayName: z.string().optional(),
  issuerColorHint: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const reassignChargeSchema = z.object({
  chargeIds: z.array(z.string()),
  newFundingInstrumentId: z.string(),
});

// ============================================================================
// Trial Schemas
// ============================================================================

export const decisionRuleTypeSchema = z.enum([
  'autoCancel',
  'convertIfUsage',
  'convertIfBalance',
  'downgrade',
]);

export const trialDecisionSchema = z.object({
  ruleType: decisionRuleTypeSchema,
  usageThreshold: z.number().optional(),
  balanceThreshold: z.number().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Cancel Schemas
// ============================================================================

export const cancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
});

export const uploadProofSchema = z.object({
  fileType: z.enum(['image', 'email']),
  extractedText: z.string().optional(),
});

export const confirmCancelSchema = z.object({
  confirmed: z.boolean(),
  notes: z.string().optional(),
});

// ============================================================================
// Allocation Schemas
// ============================================================================

export const allocationTargetSchema = z.enum([
  'savings',
  'debt',
  'investing',
  'subscription',
]);

export const createAllocationSchema = z.object({
  subscriptionId: z.string().optional(),
  amountCents: z.number().positive(),
  target: allocationTargetSchema,
  note: z.string().optional(),
});

// ============================================================================
// Ingest Schemas
// ============================================================================

export const ingestCsvSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string(),
      merchant: z.string(),
      amount: z.number(),
      description: z.string().optional(),
    })
  ),
});

export const pullGmailSchema = z.object({
  maxResults: z.number().optional().default(100),
  afterDate: z.string().optional(),
});

export const pullOutlookSchema = z.object({
  maxResults: z.number().optional().default(100),
  afterDate: z.string().optional(),
});

// On-device inbox scan results. The phone reads the mailbox itself and sends
// ONLY these derived fields — never a subject, body, sender address or token.
// Keep this list in sync with SCOPES.md (Google's verification reviewers read it).
export const detectedSubscriptionSchema = z.object({
  merchant: z.string().trim().min(1).max(80),
  amountCents: z.number().int().min(0).max(10_000_00).nullable(),
  currency: z.string().length(3).nullable(),
  cadence: z.enum(['monthly', 'yearly', 'weekly', 'unknown']),
  nextChargeDate: z.string().datetime().nullable(),
  trialEndsAt: z.string().datetime().nullable(),
  cancelUrl: z
    .string()
    .url()
    .max(500)
    .refine(u => u.startsWith('https://'), 'cancelUrl must be https')
    .nullable(),
  source: z.enum(['gmail', 'outlook']),
  confidence: z.number().min(0).max(1),
});

export const detectedSubscriptionsSchema = z.object({
  items: z.array(detectedSubscriptionSchema).max(200),
});

// ---------------------------------------------------------------------------
// Provider sign-in payloads (merged from the standalone ezer repo's OAuth work)
// ---------------------------------------------------------------------------

export const googleCompleteSchema = z.object({
  idToken: z.string().min(1),
});

export const appleCompleteSchema = z.object({
  identityToken: z.string().min(1),
  fullName: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    })
    .optional(),
  email: z.string().email().optional(),
});

export const microsoftCompleteSchema = z.object({
  idToken: z.string().min(1),
});

export const emailSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

export const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
