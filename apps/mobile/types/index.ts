// =============================================================================
// EZER Mobile App - TypeScript Interfaces
// =============================================================================

export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Bank' | 'Unknown';
export type BillingInterval = 'monthly' | 'yearly' | 'weekly' | 'unknown';
export type InferenceSource = 'transaction' | 'email' | 'sms';
export type SubscriptionStatus = 'active' | 'trial' | 'canceled' | 'paused';
export type CancellationDifficulty = 'Easy' | 'Medium' | 'Hard';
export type DecisionRuleType = 'autoCancel' | 'convertIfUsage' | 'convertIfBalance' | 'downgrade';
export type CancelAttemptMethod = 'assisted' | 'manual';
export type CancelAttemptStatus = 'in_progress' | 'proof_uploaded' | 'confirmed' | 'failed';
export type ProofFileType = 'image' | 'email';
export type AllocationTarget = 'savings' | 'debt' | 'investing' | 'subscription';

export interface FundingInstrument {
  id: string;
  type: 'card' | 'bank';
  displayName: string;
  brand: CardBrand;
  last4: string;
  networkArt?: string;
  issuerColorHint?: string;
  isDefault: boolean;
}

export interface SubscriptionCharge {
  id: string;
  merchantId: string;
  merchantName: string;
  amountCents: number;
  currency: string;
  billingInterval: BillingInterval;
  chargeTimestamp: Date;
  fundingInstrumentId: string;
  inferenceSource: InferenceSource;
  confidenceScore: number;
  evidenceRef?: string;
}

export interface Merchant {
  id: string;
  canonicalName: string;
  fingerprintKeys: string[];
  logo?: string;
  cancellationDifficulty: CancellationDifficulty;
  difficultyLastUpdatedAt: Date;
  cancellationUrl?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  merchantId: string;
  status: SubscriptionStatus;
  cadence: string;
  renewalDate: Date;
  startedAt: Date;
}

export interface Trial {
  id: string;
  subscriptionId: string;
  trialEndDate: Date;
  detectedFrom: InferenceSource;
  decisionRuleId?: string;
  merchantId: string;
  merchantName: string;
  amountCentsAfterTrial: number;
}

export interface DecisionRule {
  id: string;
  trialId: string;
  type: DecisionRuleType;
  usageThreshold?: number;
  balanceThreshold?: number;
  runAtDate: Date;
}

export interface CancelAttempt {
  id: string;
  subscriptionId: string;
  merchantId: string;
  startedAt: Date;
  method: CancelAttemptMethod;
  status: CancelAttemptStatus;
  proofArtifactId?: string;
  cancellationUrl?: string;
  notes?: string;
}

export interface ProofArtifact {
  id: string;
  fileType: ProofFileType;
  fileUri: string;
  uploadedAt: Date;
  merchantId: string;
  cancelAttemptId: string;
  extractedText?: string;
  verified: boolean;
}

export interface AllocationPlan {
  id: string;
  userId: string;
  subscriptionId?: string;
  month: string;
  amountCents: number;
  target: AllocationTarget;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  month: string;
  reclaimedCents: number;
  allocatedCents: number;
}

export interface HomeSummary {
  monthlyBurnCents: number;
  next30DayRiskCents: number;
  silentSubscriptionCount: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface MerchantChargeGroup {
  merchantId: string;
  merchantName: string;
  merchant: Merchant;
  charges: SubscriptionCharge[];
  totalCents: number;
  chargeCount: number;
  billingInterval: BillingInterval;
  latestCharge: SubscriptionCharge;
}
