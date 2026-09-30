// =============================================================================
// EZER — Spending Power / Pay in 4 (shared entry point)
//
// One screen, reached from three places that all mean the same thing —
// "how much can I spend with Pay in 4 right now":
//   · Home's Spending Power tile
//   · The Pay in 4 tab's own "Join early access" CTA
//   · Any future "Early access" prompt
//
// This used to open Card Studio — the physical-card DESIGNER — because the
// trust assessment lived behind PhysicalCardApproval.tsx, which is reached
// "ONLY after the design is saved" per that screen's own header comment.
// Designing a card and checking a spending limit are two different things a
// user wants to do for two different reasons; routing the second through the
// first is why this screen exists. POST /cards/access-list already accepts
// designId: null — the coupling was only ever a client-side routing choice,
// never a backend requirement.
//
// Underwriting itself is fully automated — see apps/api/src/routes/cards.ts
// (scoreTrust / limitForScore). There is no manual-review state: every
// assessment returns a real, usable limit immediately, generous at the
// floor and re-computed fresh (so it can grow) on every connect. The other
// half of that model — restricting hard on a missed Pay in 4 payment — is
// documented in cards.ts but not wired up yet, because there is no real
// installment-charging engine in this codebase to fail a payment against.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, Label, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import { formatCents } from '../../utils/calculations';
import {
  getCardAccessOutcome,
  fetchServerAccessOutcome,
  type CardAccessOutcome,
} from '../../utils/cardDesignStore';
import { usePlaid } from '../../utils/usePlaid';
import { api } from '../../utils/api';

const CHECK_STEPS: { key: string; label: string }[] = [
  { key: 'link', label: 'Verifying your bank connection' },
  { key: 'income', label: 'Reading deposit history' },
  { key: 'buffer', label: 'Checking account stability' },
  { key: 'limit', label: 'Calculating your spending power' },
];
const STEP_MS = 620;

/** Offline/no-Plaid-build fallback so the flow always resolves to something. */
const DEMO_LIMIT_CENTS = 100_000;

function formatLimit(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

type AccessResponse = { data?: { status?: string; limitCents?: number }; status?: string; limitCents?: number };

type Phase = 'loading' | 'intro' | 'assessing' | 'approved' | 'waitlist';

const FEATURE_PLAID = process.env.EXPO_PUBLIC_FEATURE_PLAID === '1';

export default function SpendingPowerScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { openPlaidLink } = usePlaid();

  const [phase, setPhase] = useState<Phase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [limitCents, setLimitCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  const wait = useCallback((ms: number) => new Promise<void>(r => timers.current.push(setTimeout(r, ms))), []);

  // Show whatever outcome already exists (local, then server) before
  // defaulting to the intro — a second visit should never re-explain the
  // product to someone who already has a real number.
  useEffect(() => {
    (async () => {
      const local = await getCardAccessOutcome();
      const outcome = local ?? (await fetchServerAccessOutcome());
      if (!alive.current) return;
      applyOutcome(outcome);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyOutcome(outcome: CardAccessOutcome | null) {
    if (!outcome) {
      setPhase('intro');
    } else if (outcome.status === 'waitlist') {
      setPhase('waitlist');
    } else {
      // 'approved' or the legacy 'review' value a pre-automation assessment
      // may have left behind — both get a real re-assessment on "Connect
      // your bank" below rather than staying stuck, but until then this is
      // the most recent real number on file.
      setLimitCents(outcome.limitCents ?? 0);
      setPhase('approved');
    }
  }

  const runAssessment = useCallback(async () => {
    setPhase('assessing');
    setStepIndex(0);
    for (let i = 0; i < CHECK_STEPS.length; i++) {
      await wait(STEP_MS);
      if (!alive.current) return;
      setStepIndex(i + 1);
    }

    let cents = DEMO_LIMIT_CENTS;
    try {
      const res = await api.post<AccessResponse>('/cards/access-list', { mode: 'plaid', designId: null });
      const payload = res?.data ?? res;
      cents = typeof payload?.limitCents === 'number' ? payload.limitCents : DEMO_LIMIT_CENTS;
    } catch {
      // Offline / not signed in: the demo band still resolves the screen.
    }
    if (!alive.current) return;

    setLimitCents(cents);
    setPhase('approved');
  }, [wait]);

  const handleConnectBank = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    if (!FEATURE_PLAID) {
      await runAssessment();
      if (alive.current) setBusy(false);
      return;
    }

    // Tagged 'pay_in_4' so Settings can list this link under Pay in 4 rather
    // than mixed in with banks connected for other reasons — see
    // FundingInstrument.purpose.
    openPlaidLink(
      () => {
        void runAssessment().finally(() => {
          if (alive.current) setBusy(false);
        });
      },
      () => {
        if (alive.current) setBusy(false);
      },
      'pay_in_4'
    );
  }, [busy, openPlaidLink, runAssessment]);

  const handleWaitlist = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/cards/access-list', { mode: 'waitlist', designId: null });
    } catch {
      // Best-effort — the screen still shows the confirmed state locally;
      // a retry next time this screen opens re-sends it.
    }
    if (!alive.current) return;
    setPhase('waitlist');
    setBusy(false);
  }, [busy]);

  const showAssessing = phase === 'assessing';

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
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>Spending Power</Text>
          </View>

          <Body style={{ marginBottom: 18 }}>
            Your spending power is the starting limit for Pay in 4 — one card that splits any
            purchase into four payments, no interest. Connect your bank for a real number right
            now.
          </Body>

          {/* --- Intro: nothing assessed yet ---------------------------------- */}
          {phase === 'intro' && (
            <>
              <PressScale onPress={handleConnectBank} scaleTo={0.98} disabled={busy}>
                <View style={[styles.option, { backgroundColor: colors.goldSoft, borderColor: colors.goldLine, opacity: busy ? 0.6 : 1 }]}>
                  <View style={styles.optionHead}>
                    <Ionicons name="link-outline" size={18} color={colors.gold} />
                    <Text style={[styles.optionTitle, { color: colors.ink }]}>Connect your bank</Text>
                    <View style={[styles.pill, { backgroundColor: colors.goldBg }]}>
                      <Text style={styles.pillText}>Instant</Text>
                    </View>
                  </View>
                  <Body style={{ marginTop: 8 }}>
                    A read-only connection. We assess your account and reveal your spending power
                    right now — this is the bank you'll use for Pay in 4, separate from any other
                    bank you've linked.
                  </Body>
                </View>
              </PressScale>

              <PressScale onPress={handleWaitlist} scaleTo={0.98} disabled={busy} style={{ marginTop: 12 }}>
                <View style={[styles.option, { backgroundColor: colors.card, borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}>
                  <View style={styles.optionHead}>
                    <Ionicons name="time-outline" size={18} color={colors.mut} />
                    <Text style={[styles.optionTitle, { color: colors.ink }]}>Join early access</Text>
                  </View>
                  <Body style={{ marginTop: 8 }}>
                    We'll notify you when Pay in 4 launches. No limit yet, and nothing to connect.
                  </Body>
                </View>
              </PressScale>
            </>
          )}

          {/* --- Assessing ------------------------------------------------------ */}
          {showAssessing && (
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
                    <Text style={[styles.stepText, { color: complete || current ? colors.ink : colors.mut3 }]}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </Surface>
          )}

          {/* --- Approved: the number, front and centre ------------------------- */}
          {phase === 'approved' && limitCents !== null && (
            <Surface style={[styles.reveal, { borderColor: colors.goldLine, backgroundColor: colors.goldSoft }]}>
              <Label color={colors.gold}>Your spending power</Label>
              <Text style={[typeScale.totalValue, { color: colors.gold, marginTop: 4 }]}>
                {formatLimit(limitCents)}
              </Text>
              <Body style={{ marginTop: 6 }}>
                This grows as your bank history does, and can tighten if a Pay in 4 payment is
                missed. Re-connect any time for an updated number.
              </Body>
              <PressScale onPress={handleConnectBank} scaleTo={0.97} disabled={busy} style={{ marginTop: 14 }}>
                <View style={[styles.ctaGhost, { borderColor: colors.goldLine }]}>
                  <Text style={[styles.ctaGhostText, { color: colors.gold }]}>
                    {busy ? 'Checking…' : 'Re-check spending power'}
                  </Text>
                </View>
              </PressScale>
            </Surface>
          )}

          {/* --- Waitlist -------------------------------------------------------- */}
          {phase === 'waitlist' && (
            <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.bannerText, { color: colors.ink }]}>You're on the early-access list ✓</Text>
              <Body style={{ marginTop: 6 }}>
                We'll notify you at launch. No spending limit yet — connect your bank any time to
                get a real one now.
              </Body>
              <PressScale onPress={handleConnectBank} scaleTo={0.97} disabled={busy} style={{ marginTop: 14 }}>
                <View style={[styles.cta, { backgroundColor: colors.goldBg, opacity: busy ? 0.6 : 1 }]}>
                  <Text style={styles.ctaText}>Connect your bank instead</Text>
                </View>
              </PressScale>
            </View>
          )}

          <Surface style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mut} />
            <View style={{ flex: 1 }}>
              <Label>Please note</Label>
              <Body style={{ marginTop: 3 }}>
                Pay in 4 is not yet available. Any spending power shown is an indication based on
                the information available now, is fully automated, and may change before launch.
              </Body>
            </View>
          </Surface>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  option: { borderRadius: radius.cardLg, borderWidth: 1, padding: 16 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontFamily: fontFamily.bold, fontSize: 15, flexShrink: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginLeft: 'auto' },
  pillText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#FFFFFF' },
  assessing: { padding: 18, gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  stepText: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  reveal: { padding: 18, borderWidth: 1, borderRadius: radius.cardLg },
  ctaGhost: { height: 44, borderRadius: radius.button, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ctaGhostText: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  banner: { padding: 18, borderRadius: radius.cardLg },
  bannerText: { fontFamily: fontFamily.bold, fontSize: 15 },
  cta: { height: 48, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 13.5, color: '#241A38' },
  note: { flexDirection: 'row', gap: 10, padding: 14, marginTop: 18 },
});
