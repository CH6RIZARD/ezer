// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Home Summary
// ============================================================================

export interface HomeSummary {
  monthlyBurnRate: number; // in cents
  next30DayRisk: number; // in cents
  silentSubscriptionsCount: number;
  totalSubscriptions: number;
  activeTrials: number;
}

// ============================================================================
// Wallet Types
// ============================================================================

export interface FundingInstrumentSummary {
  id: string;
  type: 'card' | 'bank';
  displayName: string;
  brand: string;
  last4: string;
  networkArt?: string;
  issuerColorHint?: string;
  isDefault: boolean;
  drainedAmountCents: number;
  activeSubscriptionsCount: number;
  topMerchants: Array<{
    merchantId: string;
    merchantName: string;
    logo?: string;
    drainedAmountCents: number;
  }>;
}

export interface MerchantDrainDetail {
  merchantId: string;
  merchantName: string;
  logo?: string;
  monthlyEquivalentCents: number;
  chargesInRange: number;
  totalDrainedCents: number;
  confidenceBadge?: 'high' | 'medium' | 'low';
}

// ============================================================================
// Risk Window
// ============================================================================

export interface RiskItem {
  id: string;
  type: 'trial' | 'renewal';
  merchantName: string;
  logo?: string;
  amountCents: number;
  dueDate: Date;
  daysUntilDue: number;
  subscriptionId: string;
  trialId?: string;
}

// ============================================================================
// Trial Types
// ============================================================================

export interface TrialDetail {
  id: string;
  subscriptionId: string;
  merchantName: string;
  logo?: string;
  trialEndDate: Date;
  daysRemaining: number;
  detectedFrom: string;
  hasDecisionRule: boolean;
  decisionRule?: {
    type: string;
    usageThreshold?: number;
    balanceThreshold?: number;
  };
}

// ============================================================================
// Subscription Detail
// ============================================================================

export interface SubscriptionDetail {
  id: string;
  merchantId: string;
  merchantName: string;
  logo?: string;
  status: string;
  cadence: string;
  renewalDate?: Date;
  startedAt: Date;
  cancellationDifficulty: number;
  difficultyLabel: 'Easy' | 'Medium' | 'Hard' | 'Very Hard' | 'Extreme';
  charges: Array<{
    id: string;
    amountCents: number;
    chargeTimestamp: Date;
    fundingInstrument: {
      displayName: string;
      brand: string;
      last4: string;
    };
  }>;
  priceHistory: Array<{
    month: string;
    amountCents: number;
  }>;
  lifetimeCostCents: number;
  investmentOpportunityCostCents: number; // 7% annualized
}

// ============================================================================
// Cancel Attempt Types
// ============================================================================

export interface CancelAttemptDetail {
  id: string;
  subscriptionId: string;
  merchantId: string;
  merchantName: string;
  method: 'assisted' | 'manual';
  status: 'in_progress' | 'proof_uploaded' | 'confirmed' | 'failed';
  cancellationUrl?: string;
  playbook?: {
    steps: string;
    expectedEndState: string;
    retentionSteps: number;
    requiresLogin: boolean;
  };
  proofArtifact?: {
    id: string;
    fileType: string;
    fileUri: string;
    uploadedAt: Date;
  };
  startedAt: Date;
}

// ============================================================================
// Ledger Types
// ============================================================================

export interface LedgerSummary {
  month: string;
  reclaimedCents: number;
  allocatedCents: number;
  allocations: Array<{
    target: string;
    amountCents: number;
    merchantName?: string;
    note?: string;
  }>;
}

// ============================================================================
// Parsed Email/SMS Types
// ============================================================================

export interface ParsedReceipt {
  merchant: string;
  amountCents: number;
  currency: string;
  date: Date;
  isTrialNotice: boolean;
  trialEndDate?: Date;
  renewalDate?: Date;
  planDetails?: string;
  fundingHint?: {
    brand: string;
    last4: string;
  };
}

// ============================================================================
// JWT Payload
// ============================================================================

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// ============================================================================
// Mock Inbox Message
// ============================================================================

export interface MockInboxMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  labels?: string[];
}
