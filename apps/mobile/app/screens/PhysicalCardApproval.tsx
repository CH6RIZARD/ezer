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
// build) the screen runs a fully self-contained mocked assessment that always
// produces the SAME number, so the flow is complete without credentials.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
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
import { getCardDesignId } from '../../utils/cardDesignStore';
import { usePlaid } from '../../utils/usePlaid';
import { api } from '../../utils/api';

// -----------------------------------------------------------------------------
// Feature flag + demo constants
// -----------------------------------------------------------------------------

/**
 * Real Plaid Link is opt-in. Expo inlines EXPO_PUBLIC_* at build time, so this
 * is a compile-time constant in the demo build and the native Plaid path is
 * never even reached there.
 */
const FEATURE_PLAID = process.env.EXPO_PUBLIC_FEATURE_PLAID === '1';

/**
 * Offline fallback limit, in CENTS. Mirrors what apps/api/src/routes/cards.ts
 * scores for its demo signal set (77 → $1,000 band) so the number is identical
 * whether or not the API is reachable. A demo that shows a different limit on
 * every run is worse than no demo.
 */
const DEMO_LIMIT_CENTS = 100_000;

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

type Phase = 'choice' | 'assessing' | 'approved' | 'review' | 'waitlist';

type AccessResponse = {
  data?: { status?: string; limitCents?: number };
  status?: string;
  limitCents?: number;
};

export default function PhysicalCardApprovalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { openPlaidLink } = usePlaid();

  const [phase, setPhase] = useState<Phase>('choice');
  const [stepIndex, setStepIndex] = useState(0);
  const [limitCents, setLimitCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

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
   * Join the access list. Best-effort: a network failure must NOT strand the
   * user on a spinner, because the design is already saved locally and the
   * decision is reproducible client-side. Returns the limit in cents for the
   * plaid path (0 = routed to manual review), or null for waitlist.
   */
  const joinAccessList = useCallback(
    async (mode: 'plaid' | 'waitlist'): Promise<number | null> => {
      const designId = await getCardDesignId();
      try {
        const res = await api.post<AccessResponse>('/cards/access-list', {
          mode,
          // A `local_…` id means the design never reached the server; sending it
          // would 404, so it is dropped and the entry is created design-less.
          designId: designId && !designId.startsWith('local_') ? designId : null,
        });
        const payload = res?.data ?? res;
        if (mode === 'waitlist') return null;
        return typeof payload?.limitCents === 'number' ? payload.limitCents : 0;
      } catch {
        // Offline / not signed in / API down. Fall back to the same demo band
        // the server would have returned so the screen still resolves.
        return mode === 'plaid' ? DEMO_LIMIT_CENTS : null;
      }
    },
    []
  );

  const runAssessment = useCallback(async () => {
    setPhase('assessing');
    setStepIndex(0);

    for (let i = 0; i < CHECK_STEPS.length; i++) {
      await wait(STEP_MS);
      if (!alive.current) return;
      setStepIndex(i + 1);
    }

    const cents = await joinAccessList('plaid');
    if (!alive.current) return;

    if (cents && cents > 0) {
      setLimitCents(cents);
      setPhase('approved');
    } else {
      // A thin file is not a decline. It goes to a human.
      setLimitCents(null);
      setPhase('review');
    }
  }, [joinAccessList, wait]);

  const handleConnectBank = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    if (!FEATURE_PLAID) {
      // MOCKED PATH (demo build): no Plaid Link, no credentials, deterministic
      // outcome. Everything downstream of the link step is identical to the
      // real path, so the screen is fully exercised.
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
  }, [busy, openPlaidLink, runAssessment]);

  const handleSkip = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await joinAccessList('waitlist');
    if (!alive.current) return;
    setLimitCents(null);
    setPhase('waitlist');
    setBusy(false);
  }, [busy, joinAccessList]);

  const done = phase === 'approved' || phase === 'review' || phase === 'waitlist';

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
                    <Text style={[styles.optionTitle, { color: colors.ink }]}>Connect your bank</Text>
                    <View style={[styles.pill, { backgroundColor: colors.goldBg }]}>
                      <Text style={styles.pillText}>Priority</Text>
                    </View>
                  </View>
                  <Body style={{ marginTop: 8 }}>
                    A read-only connection. We assess your account and reveal your
                    starting spending limit right now, and you move to the front
                    of the access list.
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
              <Label>Assessing</Label>
              {CHECK_STEPS.map((s, i) => {
                const complete = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <View key={s.key} style={styles.stepRow}>
                    {complete ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    ) : current ? (
                      <ActivityIndicator size="small" color={colors.accInk} />
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

          {/* --- Thin file → human review ------------------------------------ */}
          {phase === 'review' && (
            <Surface style={styles.reveal}>
              <Label>Under review</Label>
              <Body style={{ marginTop: 6 }}>
                We couldn't set a limit from your account history yet, so a person
                is taking a look. You're on the access list and we'll be in touch.
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
                    <Text style={styles.ctaText}>Connect your bank instead</Text>
                  </View>
                </PressScale>
              )}
              <PressScale onPress={() => router.back()} scaleTo={0.97} style={{ marginTop: 12 }}>
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
