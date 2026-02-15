# EZER Mobile App — Full Consistency & Systems Audit Report

**Auditor:** Senior product QA + systems-level reviewer  
**Scope:** Logical consistency, UX coherence, data integrity, routing, state  
**Method:** Route map → click-path simulation → screen-by-screen metrics → metric coherence → data integrity → routing/params  
**Codebase path:** `apps/mobile/` (Expo Router)

---

## 1) ROUTE MAP & ENTRY POINTS

### Routes (from `app/_layout.tsx` and `app/(tabs)/_layout.tsx`)

| Route | How user reaches it | Orphan? |
|-------|---------------------|--------|
| **index** | Cold start | No (entry) |
| **auth/login** | Index "Log in with email", Settings logout, Delete account | No |
| **auth/signup** | Index "Sign up with email", Login screen link | No |
| **onboarding** | auth/signup success; index redirect when `isAuthenticated && !hasCompletedOnboarding` | No |
| **(tabs)/home** | Tab; index redirect when authenticated+onboarding; login success; onboarding complete | No |
| **(tabs)/wallet** | Tab; Reallocate success; CashAdvanceFlow "View Transaction" | No |
| **(tabs)/alerts** | Tab | No |
| **(tabs)/saved** | Tab | No |
| **settings** | Home header (settings icon) | No |
| **settings/account** | Settings "Account Details" | No |
| **settings/notifications** | Settings "Notifications" | No |
| **settings/connected-accounts** | Settings, Saved "Connected Account" | No |
| **settings/help** | Settings "Help Center" | No |
| **screens/CardDetail** | Wallet "Review Card Drain" (params: `cardId`) | No |
| **screens/SubscriptionDetail** | Home list/calendar, Alerts, MonthlyBurn, RiskDetail, CardDetail (params: `merchantId`) | No |
| **screens/CancelFlow** | SubscriptionDetail "Cancel Subscription" (params: `merchantId`) | No |
| **screens/ConfirmCancel** | CancelFlow "Upload Proof" (params: `merchantId`, `proofUri`) | No |
| **screens/Reallocate** | ConfirmCancel "Confirm Cancellation" (params: `merchantId`, `amountCents`, `billingInterval`) | No |
| **screens/TrialDecision** | Home list, Alerts, RiskDetail (params: `trialId`) | No |
| **screens/CashAdvanceFlow** | Home Cash Advance card, Saved "Get Advance", Savings screen (params: optional `amount`) | No |
| **screens/MonthlyBurn** | Home "Monthly Burn" card | No |
| **screens/RiskDetail** | Home "30-Day Risk" card | No |
| **screens/SilentSubscriptions** | Home "Silent Subscriptions" card | No |
| **savings** | **No in-app navigation** (not in tabs, no CTA) | **Yes** |

### Click-path simulation

- **New user (no session):** index → OAuth or "Sign up with email" → signup → onboarding → replace('/(tabs)/home'). **Correct.**
- **Returning user (session + onboarding):** index → useEffect redirect to '/(tabs)/home' (loading shown until redirect). **Correct.**
- **Returning user (session, no onboarding):** index → useEffect redirect to '/onboarding' → complete → replace('/(tabs)/home'). **Correct.**

**Note:** Auth gating in `app/index.tsx` (L21–30) is already implemented: redirect when `isAuthenticated`/`hasCompletedOnboarding`; loading guard avoids OAuth flash. Index also has "Log in with email" and "Sign up with email" (L133–137).

---

## 2) CONSISTENCY MATRIX (metric → where shown → match?)

| Metric | Where shown | Source | Should match? | Status |
|--------|-------------|--------|----------------|--------|
| Monthly Burn | Home card | `getComputedHomeSummary().monthlyBurnCents` | Yes | OK (derived) |
| Monthly Burn | MonthlyBurn screen | Sum of latest charge per `demoSubscriptions` | Yes | OK (same formula) |
| 30-Day Risk | Home card | `getComputedHomeSummary().next30DayRiskCents` | Yes | OK |
| 30-Day Risk | RiskDetail screen | Renewals (0–30d) + trials (0–30d) sum | Yes | OK (same formula) |
| Silent count | Home card | `getComputedHomeSummary().silentSubscriptionCount` = `demoSubscriptions.length` | Yes | OK |
| Silent list length | SilentSubscriptions screen | `demoSubscriptions.map(...)` | Yes | OK |
| Silent "cancelled" | SilentSubscriptions UI | Local `cancelStates` | Should update count? | **NO** — count stays 3 after cancel (P1-2) |
| Wallet drain / date range | Wallet | `DateRangeContext` + `calculateDrain(demoCharges, cardId, dateRange)` | Yes | OK |
| Wallet drain / date range | CardDetail | `useDateRange()` + same filter | Yes | OK (shared context) |
| Cash Advance status/limit | Home | Local `advanceState` (default `'approved'`), dev 5-tap cycle | Yes | **NO** — not shared (P1-1) |
| Cash Advance status/limit | Saved | Local `advanceState` (eligible, eligibleLimit 1500) | Yes | **NO** — not shared (P1-1) |
| Cash Advance status | CashAdvanceFlow | Local step state; on success does not update Home/Saved | Should update | **NO** (P1-1) |

---

## 3) A) P0 / P1 / P2 / P3 ISSUES

### P0 — App-breaking or critical logic

| ID | Issue | Why it's broken | File(s) | Exact code / behavior | Proposed fix | Fix type |
|----|--------|------------------|---------|------------------------|--------------|----------|
| P0-1 | **Orphan route `savings` + wrong imports** | `app/savings.tsx` is in the root Stack but no tab or CTA navigates to `/savings`. File uses `@/theme/colors`, `@/theme/spacing`, `@/components/*` — these aliases may not resolve in `apps/mobile` (workspace root vs app). | `app/savings.tsx` (L12–17), `app/_layout.tsx` | `import { colors } from '@/theme/colors';`; no `router.push('/savings')` anywhere | (1) Add entry point (e.g. from Saved tab or settings) or remove Stack screen. (2) Replace `@/` imports with relative paths or ensure `apps/mobile` has correct alias (e.g. `../../theme/colors` or shared package). | Routing + patch |

### P1 — Logic broken or inconsistent

| ID | Issue | Why it's broken | File(s) | Exact code / behavior | Proposed fix | Fix type |
|----|--------|------------------|---------|------------------------|--------------|----------|
| P1-1 | **Cash Advance state not shared** | Home: local `advanceState` ('check_eligibility' \| 'pending' \| 'approved' \| 'active'), default `'approved'`. Saved: separate local `advanceState` (eligible, eligibleLimit 1500, selectedAmount, etc.). CashAdvanceFlow does not update either. After completing flow, Home still shows same card; Saved unchanged. | `(tabs)/home.tsx` L25–26, 48–91; `(tabs)/saved.tsx` L99–110; `screens/CashAdvanceFlow.tsx` | Local `useState` only; no context | Introduce `CashAdvanceContext`: status, optional amount/dueDate when active, eligibleLimit. Home and Saved read from context; CashAdvanceFlow updates context on success. | Shared state (context) |
| P1-2 | **Silent Subscriptions cancel is local only** | Cancel on SilentSubscriptions only updates local `cancelStates`. Home count is `getComputedHomeSummary().silentSubscriptionCount` = `demoSubscriptions.length`; it never decreases. | `screens/SilentSubscriptions.tsx` L19–20, 42–52; `utils/demoData.ts` `getComputedHomeSummary` | `setCancelStates(prev => ({ ...prev, [subId]: 'cancelled' }))`; summary uses `demoSubscriptions.length` | Shared "cancelled ids" (context/store); dashboard count = `demoSubscriptions.length - cancelledIds.size`; list filters cancelled. Or document demo read-only. | Shared state or product decision |
| P1-3 | **Reallocate always sends user to Wallet** | After confirming reallocate, `router.replace('/(tabs)/wallet')`. User may have come from SubscriptionDetail → CancelFlow → ConfirmCancel; sending to Wallet is arbitrary. | `screens/Reallocate.tsx` L68 | `router.replace('/(tabs)/wallet')` in Alert OK | Use `router.replace('/(tabs)/home')` or `router.back()` / replace to origin tab. | Simple patch |
| P1-4 | **"Last Year" date range semantics ambiguous** | `getResolvedDateRange('lastYear')` sets `start = now - 1 year`, `end = now`, label "Last Year". So it's last 365 days, not calendar year (e.g. Jan 1–Dec 31). If any copy says "calendar year", it's inconsistent. | `utils/calculations.ts` L42–46 | `start.setFullYear(start.getFullYear() - 1)`; end is `new Date(now)` | Pick one: (A) Keep "last 365 days" and label "Last 12 months" everywhere, or (B) Use calendar year and set start/end to Jan 1 / Dec 31. Enforce same in Wallet, CardDetail, and any copy. | Simple patch + copy |

### P2 — UX broken or confusing

| ID | Issue | Why it's broken | File(s) | Exact code / behavior | Proposed fix | Fix type |
|----|--------|------------------|---------|------------------------|--------------|----------|
| P2-1 | **Dev-only UI can leak** | Index shows "DEV MODE: OAuth bypassed" only when `__DEV__` (L144–148) — already guarded. Home has **hidden** "tap header 5 times" to cycle Cash Advance state; no `__DEV__` guard. | `(tabs)/home.tsx` L184, 35–45 | `onPress={__DEV__ ? handleDevTap : undefined}` on header Pressable | Guard is present; ensure build strips or that gesture is clearly dev-only. Optional: only attach handleDevTap when `__DEV__`. | Verify / simple patch |
| P2-2 | **Settings profile card not tappable** | User card has chevron but no onPress; implies drill-down. | `settings.tsx` L102–119 | View with chevron, no onPress | Add `onPress={() => router.push('/settings/account')}` or remove chevron. | Simple patch |
| P2-3 | **SubscriptionDetail "Enable Smart Saving" has no action** | Pressable (L321–331) has no onPress; selection only sets local state. | `screens/SubscriptionDetail.tsx` L321–331 | Pressable with no onPress | Add onPress: e.g. persist preference, show confirmation, or navigate. | Simple patch |
| P2-4 | **Orphan route: /savings** | Stack has `savings`; no in-app link. Only reachable via deep link. | `_layout.tsx`, no push to `/savings` | — | Add entry point (e.g. Saved or settings) or remove route. | Routing |

### P3 — Polish / consistency

| ID | Issue | Why it's broken | File(s) | Exact code / behavior | Proposed fix | Fix type |
|----|--------|------------------|---------|------------------------|--------------|----------|
| P3-1 | **Merchant type has no brandColor/merchantColor** | Wallet uses `(demoMerchants[id] as { brandColor?: string })?.brandColor`; CardDetail uses `(group.merchant as { merchantColor?: string }).merchantColor`. Type has neither; inconsistent names. | `types/index.ts` (Merchant), `(tabs)/wallet.tsx` L252, `screens/CardDetail.tsx` L174 | Casts to optional color | Add optional `brandColor?: string` (or standardize on `merchantColor`) to Merchant; set in demoMerchants. Use same key everywhere. | Simple patch |
| P3-2 | **MonthlyBurn weekly breakdown hardcoded** | "Spend by Week" uses fixed `weeklyData` (6500, 4200, 8900, 5285); not derived from charges. | `screens/MonthlyBurn.tsx` L46–52 | `const weeklyData = [ ... ]` | Derive from demoCharges by week or label "Example" / remove. | Simple patch |
| P3-3 | **Saved tab Cash Advance max $2000 vs flow $1500** | Saved: PRESET_AMOUNTS includes 2000, MAX_AMOUNT 2000. CashAdvanceFlow and Home say $1,500. User can select 2000 on Saved then hit flow cap. | `(tabs)/saved.tsx` L29–30; flow L61–62, 119 | Inconsistent caps | Use single constant (1500) and same presets in Home/Saved/Flow. | Simple patch |
| P3-4 | **groupChargesByMonth sort by "month" string** | `groupChargesByMonth` uses `monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })` (e.g. "January 2025") then sorts by `new Date(b.month).getTime()`. Parsing "January 2025" can be locale-dependent. | `utils/calculations.ts` L191–211 | Sort by `new Date(a.month)` | Store and sort by `monthKey` (e.g. `YYYY-MM`) or parse reliably; use same key for display label. | Simple patch |

---

## 4) B) SINGLE SOURCE OF TRUTH PLAN

**Base demo datasets (keep as-is):**  
`demoFundingInstruments`, `demoCharges`, `demoMerchants`, `demoSubscriptions`, `demoTrials`, `demoLedgerEntry`, `demoAllocations`.

**Derived summary — one helper used everywhere:**

- **Current:** `getComputedHomeSummary()` in `utils/demoData.ts` derives:
  - `monthlyBurnCents`: sum of latest charge per active subscription (same as MonthlyBurn screen).
  - `next30DayRiskCents`: renewals (0–30 days) + trials (0–30 days) (same as RiskDetail).
  - `silentSubscriptionCount`: `demoSubscriptions.length`.
- **Recommendation:** Keep this as the single place for dashboard summary (or move to `utils/summary.ts`). Home and any other consumer import only this. Do not add a second formula for "monthly burn" or "30-day risk."
- **MonthlyBurn / RiskDetail / SilentSubscriptions:** Already use same base data and formulas; no change if Home uses `getComputedHomeSummary()`.
- **When cancel is shared (P1-2):** Derive "active silent count" as `demoSubscriptions.length - cancelledIds.size` from shared state.

**Data integrity:** demoMerchants has 9 entries; demoSubscriptions has 3 (netflix, spotify, adobe). No count mismatch. All summary values must be computed from base arrays only.

---

## 5) C) STATE PLAN

| State | Current | Should be | Action |
|-------|---------|-----------|--------|
| **Date range** | DateRangeContext (shared) | Same | Already correct. |
| **Cash Advance** | Local in Home and Saved; flow does not update them | Shared | Add CashAdvanceContext: status (check_eligibility \| pending \| approved \| active), optional amount/dueDate when active, eligibleLimit. Home and Saved read; CashAdvanceFlow updates on success. |
| **Silent cancel** | Local `cancelStates` in SilentSubscriptions | Shared or derived | Cancelled ids in context/store; dashboard count and list derived from same source. |
| **Auth / onboarding** | AuthContext (user, hasCompletedOnboarding) | Same | Already used in index for redirect. |

---

## 6) D) ROUTING PLAN

1. **Cold start auth gating** — Already in place in `app/index.tsx` (useEffect redirect when authenticated; loading guard; email login/signup links).
2. **Dev toggles** — Index dev label is `__DEV__`-guarded; Home dev tap is conditional on `__DEV__`. Ensure no prod-only gesture that changes Cash Advance state.
3. **Onboarding** — Reachable via signup and via index redirect when authenticated but not onboarded.
4. **Orphan routes** — **savings:** Add in-app link (e.g. from Saved or settings) or remove from Stack. Fix `savings.tsx` imports (`@/` → relative or correct alias).
5. **Router targets** — All push/replace targets exist. Params: CardDetail `cardId`; SubscriptionDetail `merchantId`; TrialDecision `trialId`; ConfirmCancel `merchantId`, `proofUri`; Reallocate `merchantId`, `amountCents`, `billingInterval`; CashAdvanceFlow optional `amount`.

---

## 7) E) FIX ORDER (fast patches first, then refactors)

1. **P3-3** — Saved: set MAX_AMOUNT and presets to 1500 to match flow. **Patch.**
2. **P3-1** — Add optional `brandColor` (or `merchantColor`) to Merchant; set in demoData; use same key in Wallet and CardDetail. **Patch.**
3. **P2-2** — Settings profile card: add onPress to `/settings/account` or remove chevron. **Patch.**
4. **P1-3** — Reallocate: change replace target to `/(tabs)/home)` or back. **Patch.**
5. **P2-3** — SubscriptionDetail: add onPress for "Enable Smart Saving". **Patch.**
6. **P1-4** — lastYear: decide "last 12 months" vs "calendar year"; align label and logic everywhere. **Patch.**
7. **P3-4** — groupChargesByMonth: sort by stable key (e.g. YYYY-MM), not locale string. **Patch.**
8. **P0-1** — savings: fix imports in `savings.tsx`; add entry point or remove route. **Patch + product decision.**
9. **P2-4** — Same as P0-1 for orphan savings route.
10. **P2-1** — Confirm Home dev tap is `__DEV__`-only.
11. **P1-1** — Cash Advance: add CashAdvanceContext; wire Home, Saved, CashAdvanceFlow. **Refactor.**
12. **P1-2** — Silent cancel: shared cancelled state or document demo read-only. **Refactor or product decision.**
13. **P3-2** — MonthlyBurn weekly: derive from data or label/remove. **Patch or remove.**

---

## 8) NAVIGATION MAP (concise)

```
[COLD START] app/index.tsx
  → If isLoading: loading UI
  → If isAuthenticated && hasCompletedOnboarding: replace('/(tabs)/home')
  → If isAuthenticated && !hasCompletedOnboarding: replace('/onboarding')
  → Else: OAuth UI + "Log in with email" → auth/login, "Sign up with email" → auth/signup

auth/login   → success: replace('/(tabs)/home') or replace('/onboarding')
auth/signup  → success: replace('/onboarding')
onboarding   → complete: replace('/(tabs)/home')

(tabs) home / wallet / alerts / saved
  home   → settings, MonthlyBurn, RiskDetail, SilentSubscriptions, CashAdvanceFlow, TrialDecision, SubscriptionDetail
  wallet → CardDetail (cardId)
  alerts → TrialDecision (trialId), SubscriptionDetail (merchantId)
  saved  → CashAdvanceFlow, settings/connected-accounts

settings → account, notifications, connected-accounts, help, logout → replace('/auth/login')

screens: CardDetail, SubscriptionDetail, CancelFlow, ConfirmCancel, Reallocate, TrialDecision,
         CashAdvanceFlow, MonthlyBurn, RiskDetail, SilentSubscriptions

savings → ORPHAN (no in-app link)
```

---

*End of audit report. Apply fixes in order Section 7; re-run consistency matrix after state and routing changes.*
