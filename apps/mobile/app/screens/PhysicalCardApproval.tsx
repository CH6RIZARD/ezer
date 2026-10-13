// =============================================================================
// EZER Redesign — Physical card approval (two-tier)
//
// Reached ONLY after the design is saved (see app/screens/PhysicalCard.tsx).
// The artwork is already on disk by the time this screen mounts, so nothing
// here can lose it — both branches below keep the saved design either way.
//
// Two tiers, deliberately unequal:
//   · CONNECT YOUR BANK  — runs a trust assessment, reveals a real spending
//     limit, and puts the user on the access list WITH PRIORITY.
//   · SKIP FOR NOW       — plain early-access list, notified at launch, no
//     limit yet. Never framed as a failure; it is a legitimate choice.
//
// Issuance is restated as subject to approval in EVERY terminal state — a
// revealed limit is an indication, not a card.
//
// PLAID: gated behind EXPO_PUBLIC_FEATURE_PLAID. With the flag off (the demo
// build) Plaid Link is skipped, but the assessment is still the server's.
//
// A failed assessment shows NO number. This screen used to fall back to an
// invented $1,000 "demo" approval on any request failure, and SAVED it, so
// Home and Card Studio then showed a limit the server never gave. It now ends
// the way SpendingPowerSheet.tsx does: an honest "couldn't check" banner,
// nothing saved, retry available. 'suspended' shows the sheet's "Paused";
// there is no manual-review state (CLAUDE.md), so any other no-limit answer
// is the same honest failure. Keep both.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { DoveLoader } from '../../components/CameraDove';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Body,
  Label,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
} from '../../components/redesign/Primitives';
import {
  getCardDesignId,
  loadCardDesign,
  mapServerStatus,
  saveCardAccessOutcome,
  saveSpendingPowerOutcome,
  type CardAccessOutcome,
} from '../../utils/cardDesignStore';
import { usePlaid } from '../../utils/usePlaid';
import { useData } from '../../contexts/DataContext';
import { api } from '../../utils/api';

// -----------------------------------------------------------------------------
// Feature flag + constants
// -----------------------------------------------------------------------------

/**
 * Real Plaid Link is opt-in. Expo inlines EXPO_PUBLIC_* at build time, so this
 * is a compile-time constant in the demo build and the native Plaid path is
 * never even reached there.
 */
const FEATURE_PLAID = process.env.EXPO_PUBLIC_FEATURE_PLAID === '1';

/** Assessment theatre. Fixed order, fixed timing — deterministic, like the result. */
const CHECK_STEPS: { key: string; label: string }[] = [
  { key: 'link', label: 'Verifying your bank connection' },
  { key: 'income', label: 'Reading deposit history' },
  { key: 'buffer', label: 'Checking account stability' },
  { key: 'limit', label: 'Calculating your starting limit' },
];
const STEP_MS = 620;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Cents → "$1,000". Whole dollars: a starting limit is never a cents figure. */
function formatLimit(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

type Phase = 'choice' | 'assessing' | 'approved' | 'suspended' | 'waitlist';
type Decision = { status: CardAccessOutcome['status']; limitCents: number };

type AccessResponse = {
  data?: { status?: string; limitCents?: number };
  status?: string;
  limitCents?: number;
};

export default function PhysicalCardApprovalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { openPlaidLink } = usePlaid();
  // Same "already has a bank" test as SpendingPowerSheet.tsx: someone whose
  // bank is already linked (for Pay in 4, subscriptions, anything) is assessed
  // against it directly — /cards/access-list picks the Pay in 4 account
  // server-side (resolvePayIn4Instrument) — instead of being sent through a
  // second Plaid Link they don't need.
  const { instruments, subscriptions } = useData();
  const hasBank = instruments.length > 0 || subscriptions.length > 0;

  const [phase, setPhase] = useState<Phase>('choice');
  const [stepIndex, setStepIndex] = useState(0);
  const [limitCents, setLimitCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** The last assessment failed: banner up on 'choice', nothing saved. */
  const [assessmentError, setAssessmentError] = useState(false);

  // Timers must not fire into an unmounted tree — the user can back out of the
  // assessment mid-run.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<void>(resolve => {
      timers.current.push(setTimeout(resolve, ms));
    });
  }, []);

  /**
   * Join the access list. Returns the server's decision, or null when the
   * request failed or the answer was unreadable. Never invents one. A
   * 'waitlist' POST from someone already assessed gets that earlier decision
   * back (routes/cards.ts), so the caller must read the status, not assume it.
   */
  const joinAccessList = useCallback(async (mode: 'plaid' | 'waitlist'): Promise<Decision | null> => {
    const designId = await getCardDesignId();
    try {
      const res = await api.post<AccessResponse>('/cards/access-list', {
        mode,
        // A `local_…` id means the design never reached the server; sending it
        // would 404, so it is dropped and the entry is created design-less.
        designId: designId && !designId.startsWith('local_') ? designId : null,
      });
      const payload = res?.data ?? res;
      const status = mapServerStatus(payload?.status);
      if (!status) return null;
      return { status, limitCents: typeof payload?.limitCents === 'number' ? payload.limitCents : 0 };
    } catch {
      return null;
    }
  }, []);

  /** Show and save a real decision. False = nothing usable; the caller shows the failure. */
  const settle = useCallback((result: Decision | null): boolean => {
    const joinedAt = new Date().toISOString();
    if (result?.status === 'approved' && result.limitCents > 0) {
      setLimitCents(result.limitCents);
      setPhase('approved');
      void saveCardAccessOutcome({ status: 'approved', limitCents: result.limitCents, joinedAt });
      // A real decision also goes to the Spending Power sheet's key, so the
      // sheet can't keep showing an older answer than this one.
      void saveSpendingPowerOutcome({ status: 'approved', limitCents: result.limitCents, joinedAt });
      return true;
    }
    if (result?.status === 'suspended' || result?.status === 'waitlist') {
      setLimitCents(null);
      setPhase(result.status);
      void saveCardAccessOutcome({ status: result.status, limitCents: null, joinedAt });
      if (result.status === 'suspended') void saveSpendingPowerOutcome({ status: 'suspended', limitCents: null, joinedAt });
      return true;
    }
    return false;
  }, []);

  const runAssessment = useCallback(async () => {
    setPhase('assessing');
    setStepIndex(0);
    setAssessmentError(false);

    for (let i = 0; i < CHECK_STEPS.length; i++) {
      await wait(STEP_MS);
      if (!alive.current) return;
      setStepIndex(i + 1);
    }

    const result = await joinAccessList('plaid');
    if (!alive.current) return;

    if (!settle(result)) {
      // Failed, or no limit and not suspended: never show or save a number.
      setLimitCents(null);
      setAssessmentError(true);
      setPhase('choice');
    }
  }, [joinAccessList, settle, wait]);

  const handleConnectBank = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    if (!FEATURE_PLAID || hasBank) {
      // Already linked, or the demo build: no Plaid Link, no credentials.
      // Everything downstream of the link step is identical to the real
      // path, so the screen is fully exercised.
      await runAssessment();
      if (alive.current) setBusy(false);
      return;
    }

    // REAL PATH: open native Plaid Link first; only assess once a bank is
    // actually linked. usePlaid already degrades gracefully in Expo Go.
    openPlaidLink(
      () => {
        void runAssessment().finally(() => {
          if (alive.current) setBusy(false);
        });
      },
      () => {
        // Abandoned or errored the Link flow — return them to the choice with
        // "Skip for now" still available rather than dead-ending.
        if (alive.current) {
          setPhase('choice');
          setBusy(false);
        }
      }
    );
  }, [busy, hasBank, openPlaidLink, runAssessment]);

  const handleSkip = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setAssessmentError(false);
    const result = await joinAccessList('waitlist');
    if (!alive.current) return;
    // Best-effort join: a failed request still lands on the list locally (as
    // SpendingPowerSheet does); a real earlier decision coming back wins.
    if (!settle(result)) settle({ status: 'waitlist', limitCents: 0 });
    setBusy(false);
  }, [busy, joinAccessList, settle]);

  const done = phase === 'approved' || phase === 'suspended' || phase === 'waitlist';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: layout.screenX,
          paddingBottom: layout.contentBottom,
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <ScreenBody>
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>
              Almost yours
            </Text>
          </View>

          {/* The reassurance that the artwork survived has to come first — it is
              the thing the user was just emotionally invested in. */}
          <Surface style={[styles.savedRow, { backgroundColor: colors.successBg, borderColor: 'transparent' }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Body color={colors.ink} style={{ flex: 1 }}>
              Your design is saved. Whichever you choose below, we keep it.
            </Body>
          </Surface>

          {/* --- Choice ----------------------------------------------------- */}
          {phase === 'choice' && (
            <>
              <SectionHeader style={{ marginTop: 22 }}>How do you want to qualify?</SectionHeader>
              <Body style={{ marginTop: 6, marginBottom: 14 }}>
                Two ways in. One tells you your number today.
              </Body>

              {/* Same banner and words as SpendingPowerSheet.tsx's. */}
              {assessmentError && (
                <View style={[styles.errorBanner, { backgroundColor: colors.card, borderColor: colors.red }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.red} />
                  <Text style={[styles.errorBannerText, { color: colors.red }]}>
                    Couldn't check your spending power just now. Try again.
                  </Text>
                </View>
              )}

              <PressScale onPress={handleConnectBank} scaleTo={0.98} disabled={busy}>
                <View
                  style={[
                    styles.option,
                    {
                      backgroundColor: colors.goldSoft,
                      borderColor: colors.goldLine,
                      opacity: busy ? 0.6 : 1,
                    },
                  ]}
                >
                  <View style={styles.optionHead}>
                    <Ionicons name="link-outline" size={18} color={colors.gold} />
                    <Text style={[styles.optionTitle, { color: colors.ink }]}>
                      {hasBank ? 'Use your connected bank' : 'Connect your bank'}
                    </Text>
                    <View style={[styles.pill, { backgroundColor: colors.goldBg }]}>
                      <Text style={styles.pillText}>Priority</Text>
                    </View>
                  </View>
                  <Body style={{ marginTop: 8 }}>
                    {hasBank
                      ? 'We assess the bank you already linked and reveal your starting spending limit right now, and you move to the front of the access list.'
                      : 'A read-only connection. We assess your account and reveal your starting spending limit right now, and you move to the front of the access list.'}
                  </Body>
                </View>
              </PressScale>

              <PressScale onPress={handleSkip} scaleTo={0.98} disabled={busy} style={{ marginTop: 12 }}>
                <View
                  style={[
                    styles.option,
                    { backgroundColor: colors.card, borderColor: colors.line, opacity: busy ? 0.6 : 1 },
                  ]}
                >
                  <View style={styles.optionHead}>
                    <Ionicons name="time-outline" size={18} color={colors.mut} />
                    <Text style={[styles.optionTitle, { color: colors.ink }]}>Skip for now</Text>
                  </View>
                  <Body style={{ marginTop: 8 }}>
                    Join the early-access list. We'll notify you at launch. No
                    limit yet, and nothing to connect.
                  </Body>
                </View>
              </PressScale>
            </>
          )}

          {/* --- Assessing --------------------------------------------------- */}
          {phase === 'assessing' && (
            <Surface style={styles.assessing}>
              <DoveLoader label="Assessing" />
              <Label>Assessing</Label>
              {CHECK_STEPS.map((s, i) => {
                const complete = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <View key={s.key} style={styles.stepRow}>
                    {complete ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    ) : current ? (
                      <Ionicons name="ellipse" size={18} color={colors.accInk} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={colors.mut3} />
                    )}
                    <Text
                      style={[
                        styles.stepText,
                        { color: complete || current ? colors.ink : colors.mut3 },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </Surface>
          )}

          {/* --- Approved: the reveal ---------------------------------------- */}
          {phase === 'approved' && limitCents !== null && (
            <Surface style={[styles.reveal, { borderColor: colors.goldLine, backgroundColor: colors.goldSoft }]}>
              <Label color={colors.gold}>Your starting limit</Label>
              <Text style={[typeScale.totalValue, { color: colors.gold, marginTop: 4 }]}>
                {formatLimit(limitCents)}
              </Text>
              <Body style={{ marginTop: 6 }}>
                You're on the access list with priority. We'll print the design
                you saved.
              </Body>
            </Surface>
          )}

          {/* --- Uncured missed Pay in 4 payment: same words as the sheet ---- */}
          {phase === 'suspended' && (
            <Surface style={styles.reveal}>
              <Label color={colors.red}>Paused</Label>
              <Body style={{ marginTop: 6 }}>
                A Pay in 4 payment didn’t go through, so new spending power is paused until
                it’s resolved. Nothing else on your account is affected.
              </Body>
            </Surface>
          )}

          {/* --- Waitlist ----------------------------------------------------- */}
          {phase === 'waitlist' && (
            <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.bannerText, { color: colors.ink }]}>
                You're on the early-access list ✓
              </Text>
              <Body style={{ marginTop: 6 }}>
                We'll notify you at launch. No spending limit yet — connect your
                bank any time to get one and move up the list.
              </Body>
            </View>
          )}

          {/* Terminal states get a way forward. */}
          {done && (
            <>
              {phase === 'waitlist' && (
                <PressScale onPress={handleConnectBank} scaleTo={0.97} disabled={busy} style={{ marginTop: 16 }}>
                  <View style={[styles.cta, { backgroundColor: colors.goldBg, opacity: busy ? 0.6 : 1 }]}>
                    <Text style={styles.ctaText}>
                      {hasBank ? 'Use your connected bank instead' : 'Connect your bank instead'}
                    </Text>
                  </View>
                </PressScale>
              )}
              {/* Replace, not push-back: the raw designer sits underneath this
                  screen on the stack, and popping back into it after the flow
                  is exactly the "reopens the edit screen" problem this avoids.
                  Landing on the review screen also means the back gesture from
                  here goes straight to wherever launched Card Studio.
                  This screen's own header comment says it is "reached ONLY
                  after the design is saved" — that contract broke the day
                  Home's Spending Power tile started pushing here directly
                  (home.tsx, the `linked` branch of the spendingPower tile) to
                  run the same trust assessment without ever visiting the
                  designer. PhysicalCardReview has no design to show in that
                  case and immediately redirects to the blank designer itself
                  — so someone who only tapped "Spending Power" landed on a
                  card-drawing canvas they never asked for. Check for a saved
                  design before deciding where Done goes, instead of assuming
                  the contract held. */}
              <PressScale
                onPress={async () => {
                  const design = await loadCardDesign();
                  router.replace(design ? '/screens/PhysicalCardReview' : '/(tabs)/home');
                }}
                scaleTo={0.97}
                style={{ marginTop: 12 }}
              >
                <View style={[styles.ctaGhost, { borderColor: colors.line2 }]}>
                  <Text style={[styles.ctaGhostText, { color: colors.ink }]}>Done</Text>
                </View>
              </PressScale>
            </>
          )}

          {/* --- Standing disclosure ------------------------------------------ */}
          <Surface style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mut} />
            <View style={{ flex: 1 }}>
              <Label>Please note</Label>
              <Body style={{ marginTop: 3 }}>
                Card issuance is subject to approval. Any limit shown is an
                indication based on the information available now and may change
                before your card is issued.
              </Body>
            </View>
          </Surface>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  option: {
    borderRadius: radius.cardLg,
    borderWidth: 1,
    padding: 16,
  },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    flexShrink: 1,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginLeft: 'auto',
  },
  pillText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  assessing: {
    marginTop: 22,
    padding: 16,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 22,
  },
  stepText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    padding: 12,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  errorBannerText: { fontFamily: fontFamily.semibold, fontSize: 12.5, flex: 1 },
  reveal: {
    marginTop: 22,
    padding: 18,
  },
  banner: {
    marginTop: 22,
    padding: 18,
    borderRadius: radius.cardLg,
  },
  bannerText: {
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
  },
  cta: {
    borderRadius: radius.buttonLg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  ctaGhost: {
    borderRadius: radius.buttonLg,
    borderWidth: 1.5,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGhostText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 18,
  },
});
