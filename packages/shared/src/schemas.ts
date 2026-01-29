import { z } from 'zod';

// ============================================================================
// Auth Schemas
// ============================================================================

export const authProviderSchema = z.enum(['google', 'apple', 'microsoft']);

export const oauthProviderSchema = z.enum(['gmail', 'outlook']);

export const devLoginSchema = z.object({
  provider: authProviderSchema,
});

export const connectImapSchema = z.object({
  host: z.string(),
  port: z.number(),
  email: z.string().email(),
  password: z.string(),
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

export const ingestSmsSchema = z.object({
  from: z.string(),
  body: z.string(),
  timestamp: z.string(),
});

export const pullGmailSchema = z.object({
  maxResults: z.number().optional().default(100),
  afterDate: z.string().optional(),
});

export const pullOutlookSchema = z.object({
  maxResults: z.number().optional().default(100),
  afterDate: z.string().optional(),
});
