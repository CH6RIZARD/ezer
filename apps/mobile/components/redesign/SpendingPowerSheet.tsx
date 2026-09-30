// =============================================================================
// EZER Redesign — Spending Power sheet
//
// Replaces app/screens/SpendingPower.tsx as the entry point for checking or
// joining Pay in 4 early access. Both places that used to navigate away from
// Pay in 4 now open THIS sheet instead, over the Pay in 4 tab, per
// PATCH-NOTES-early-access-sheet.md:
//   · Home's Spending Power tile
//   · Pay in 4's own "Join the early-access list" / CTA button
//
// One sheet, four phases: 'ask' (not yet assessed) → 'assessing' (theatre) →
// 'reveal' (first real limit, shown exactly once) → 'status' (every later
// open). 'ask' itself renders two ways depending on whether the sheet JUST
// joined the waitlist on this open (the "joined" line from the patch spec) —
// that's `justJoined` below, not the same as `joined`, which is true any time
// an outcome already exists.
//
// Underwriting itself is unchanged — POST /cards/access-list
// (apps/api/src/services/trustScoring.ts). 'suspended' (an uncured missed Pay
// in 4 payment — see installmentEngine.ts) isn't in the original mock, which
// predates that engine; it's folded into the 'status' phase with its own
// Priority/CTA copy rather than inventing a fifth phase.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius, motion } from '../../theme/type';
import { Body, PressScale } from './Primitives';
import {
  getSpendingPowerOutcome,
  saveSpendingPowerOutcome,
  mirrorServerAccessOutcome,
  mapServerStatus,
  getSpendingPowerRevealSeen,
  markSpendingPowerRevealSeen,
  loadCardDesign,
  type CardAccessOutcome,
} from '../../utils/cardDesignStore';
import { usePlaid } from '../../utils/usePlaid';
import { api } from '../../utils/api';

const CHECK_STEPS = [
  'Verifying your bank connection',
  'Reading deposit history',
  'Checking account stability',
  'Calculating your spending power',
];
const STEP_MS = 620;
/** Offline/no-Plaid-build fallback so the flow always resolves to something. */
const DEMO_LIMIT_CENTS = 100_000;
const FEATURE_PLAID = process.env.EXPO_PUBLIC_FEATURE_PLAID === '1';

type Phase = 'ask' | 'assessing' | 'reveal' | 'status';
type AccessResponse = { data?: { status?: string; limitCents?: number }; status?: string; limitCents?: number };

function fmtDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export default function SpendingPowerSheet({
  visible,
  /** True only for the "Join the early-access list" entry point — joins the
   *  waitlist for real (POST, not local state) if not already joined. */
  viaJoin = false,
  onClose,
}: {
  visible: boolean;
  viaJoin?: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { openPlaidLink } = usePlaid();

  const [phase, setPhase] = useState<Phase>('ask');
  const [loaded, setLoaded] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [joined, setJoined] = useState(false);
  const [limitCents, setLimitCents] = useState<number | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    },
    []
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wait = useCallback((ms: number) => new Promise<void>(r => timers.current.push(setTimeout(r, ms))), []);

  const openFresh = useCallback(async () => {
    setLoaded(false);
    setBusy(false);
    setJustJoined(false);

    const [outcome, revealSeen, design] = await Promise.all([
      getSpendingPowerOutcome(),
      getSpendingPowerRevealSeen(),
      loadCardDesign(),
    ]);
    if (!alive.current) return;
    setDesignSaved(!!design);

    const wasAlreadyJoined = !!outcome;
    let current = outcome;

    if (viaJoin && !wasAlreadyJoined) {
      // A real join, not local-only state — see payin4.tsx's old fake
      // `setJoined(true)` this replaced.
      try {
        await api.post('/cards/access-list', { mode: 'waitlist', designId: null });
      } catch {
        // Best-effort: the sheet still shows joined locally; the next real
        // assessment (which also POSTs) reconciles it either way.
      }
      current = { status: 'waitlist', limitCents: null, joinedAt: new Date().toISOString() };
      await saveSpendingPowerOutcome(current);
      await mirrorServerAccessOutcome(current);
      setJustJoined(true);
    }

    setJoined(!!current);
    setLimitCents(current?.limitCents ?? null);
    setSuspended(current?.status === 'suspended');

    if (current?.status === 'approved' && current.limitCents) {
      setPhase(revealSeen ? 'status' : 'reveal');
    } else if (current?.status === 'suspended') {
      setPhase('status');
    } else if (wasAlreadyJoined) {
      setPhase('status');
    } else {
      setPhase('ask');
    }
    setLoaded(true);
  }, [viaJoin]);

  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) void openFresh();
    if (!visible) {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }
    wasVisible.current = visible;
  }, [visible, openFresh]);

  const runAssessment = useCallback(async () => {
    setPhase('assessing');
    setStepIndex(0);
    for (let i = 0; i < CHECK_STEPS.length; i++) {
      await wait(STEP_MS);
      if (!alive.current) return;
      setStepIndex(i + 1);
    }

    let cents = DEMO_LIMIT_CENTS;
    let status: CardAccessOutcome['status'] = 'approved';
    let ok = false;
    try {
      const res = await api.post<AccessResponse>('/cards/access-list', { mode: 'plaid', designId: null });
      const payload = res?.data ?? res;
      cents = typeof payload?.limitCents === 'number' ? payload.limitCents : DEMO_LIMIT_CENTS;
      status = mapServerStatus(payload?.status) ?? 'approved';
      const outcome: CardAccessOutcome = { status, limitCents: cents, joinedAt: new Date().toISOString() };
      await saveSpendingPowerOutcome(outcome);
      await mirrorServerAccessOutcome(outcome);
      ok = true;
    } catch {
      // Offline / not signed in: the demo band still resolves the screen,
      // but is deliberately NOT persisted — it is not a real assessment.
    }
    if (!alive.current) return;

    setJoined(true);
    setLimitCents(cents);
    setSuspended(ok && status === 'suspended');
    setBusy(false);

    if (ok && status === 'approved' && cents > 0) {
      const revealSeen = await getSpendingPowerRevealSeen();
      setPhase(revealSeen ? 'status' : 'reveal');
    } else {
      setPhase('status');
    }
  }, [wait]);

  const handleConnect = useCallback(() => {
    if (busy) return;
    setBusy(true);

    if (!FEATURE_PLAID) {
      void runAssessment().finally(() => {
        if (alive.current) setBusy(false);
      });
      return;
    }

    // Tagged 'pay_in_4' so Settings lists this link under Pay in 4 rather
    // than mixed in with banks connected for other reasons.
    openPlaidLink(
      () => void runAssessment(),
      () => {
        if (alive.current) setBusy(false);
      },
      'pay_in_4'
    );
  }, [busy, openPlaidLink, runAssessment]);

  const finishReveal = useCallback(async () => {
    await markSpendingPowerRevealSeen();
    onClose();
  }, [onClose]);

  if (!loaded && phase === 'ask' && !visible) return null;

  const hasLimit = limitCents !== null && limitCents > 0 && !suspended;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Pressable>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />

          {!loaded ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* --- Ask -------------------------------------------------- */}
              {phase === 'ask' && (
                <>
                  {justJoined ? (
                    <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    </View>
                  ) : (
                    <Text style={[styles.eyebrow, { color: colors.mut }]}>SPENDING POWER</Text>
                  )}
                  <Text style={[styles.headline, { color: colors.ink, marginTop: justJoined ? 20 : 10 }]}>
                    {justJoined ? 'You’re on the early‑access list.' : 'Your number is still a blank.'}
                  </Text>
                  <Body style={{ marginTop: 16, lineHeight: 22 }}>
                    {justJoined
                      ? 'Your spending power is still a blank. Connect a bank, read‑only, and we’ll fill it in before you close this sheet.'
                      : 'Connect a bank, read‑only, and we’ll fill it in before you close this sheet. It also puts you on the early‑access list, at the front.'}
                  </Body>

                  <View style={{ marginTop: 22, gap: 10 }}>
                    <View style={styles.factRow}>
                      <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
                      <Text style={[styles.factText, { color: colors.ink }]}>
                        Read‑only · we can’t move money
                      </Text>
                    </View>
                    <View style={styles.factRow}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={colors.gold} />
                      <Text style={[styles.factText, { color: colors.ink }]}>
                        Soft check · no effect on your credit score
                      </Text>
                    </View>
                  </View>

                  <PressScale onPress={handleConnect} scaleTo={motion.pressScale} disabled={busy} style={{ marginTop: 30 }}>
                    <View style={[styles.ctaPill, { backgroundColor: colors.ink, opacity: busy ? 0.6 : 1 }]}>
                      <Text style={styles.ctaPillText}>
                        {busy ? 'Opening…' : 'Find out my spending power'}
                      </Text>
                      <View style={[styles.ctaCircle, { backgroundColor: colors.gold }]}>
                        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                      </View>
                    </View>
                  </PressScale>
                  <Pressable onPress={onClose} disabled={busy} style={styles.laterBtn}>
                    <Text style={[styles.laterText, { color: colors.mut }]}>Later</Text>
                  </Pressable>
                </>
              )}

              {/* --- Assessing --------------------------------------------- */}
              {phase === 'assessing' && (
                <>
                  <Text style={[styles.headline, { color: colors.ink }]}>Working out your number</Text>
                  <View style={{ marginTop: 18 }}>
                    {CHECK_STEPS.map((label, i) => {
                      const complete = i < stepIndex;
                      const current = i === stepIndex;
                      return (
                        <View key={label} style={styles.stepRow}>
                          {complete ? (
                            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                          ) : current ? (
                            <ActivityIndicator size="small" color={colors.accInk} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={18} color={colors.mut3} />
                          )}
                          <Text style={[styles.stepText, { color: complete || current ? colors.ink : colors.mut3 }]}>
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* --- Reveal (once) ------------------------------------------ */}
              {phase === 'reveal' && limitCents !== null && (
                <>
                  <View style={[styles.priorityChip, { backgroundColor: colors.goldSoft }]}>
                    <Text style={[styles.priorityChipText, { color: colors.gold }]}>PRIORITY ACCESS</Text>
                  </View>
                  <Text style={[styles.eyebrow, { color: colors.mut, marginTop: 26 }]}>
                    YOUR STARTING SPENDING POWER
                  </Text>
                  <Text
                    style={[styles.bigNumber, { color: colors.gold }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.4}
                  >
                    {fmtDollars(limitCents)}
                  </Text>

                  <View style={[styles.quarterRow, { borderColor: colors.line }]}>
                    {[
                      { label: 'TODAY', tint: colors.gold },
                      { label: '+2 WK', tint: colors.mut2 },
                      { label: '+4 WK', tint: colors.mut2 },
                      { label: '+6 WK', tint: colors.mut2 },
                    ].map((col, i) => (
                      <View
                        key={col.label}
                        style={[styles.quarterCol, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }]}
                      >
                        <Text style={[styles.quarterAmount, { color: colors.ink }]}>
                          {fmtDollars(Math.round(limitCents / 4))}
                        </Text>
                        <Text style={[styles.quarterLabel, { color: col.tint }]}>{col.label}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.finePrint, { color: colors.mut3 }]}>
                    Indication only. Card issuance is subject to approval and the limit may change
                    before your card is issued.
                  </Text>

                  <PressScale onPress={finishReveal} scaleTo={motion.pressScale} style={{ marginTop: 26 }}>
                    <View style={[styles.ctaPillCentered, { backgroundColor: colors.ink }]}>
                      <Text style={styles.ctaPillText}>Done</Text>
                    </View>
                  </PressScale>
                </>
              )}

              {/* --- Status ---------------------------------------------- */}
              {phase === 'status' && (
                <>
                  <Text style={[styles.eyebrow, { color: colors.mut }]}>
                    {hasLimit ? 'PAY IN 4 · PRIORITY ACCESS' : 'PAY IN 4 · EARLY ACCESS'}
                  </Text>
                  <Text style={[styles.headline, { color: colors.ink, marginTop: 6 }]}>Your status</Text>

                  <View style={{ marginTop: 18 }}>
                    <StatusRow
                      label="Early-access list"
                      valueColor={colors.success}
                      icon="checkmark-circle"
                      value="Joined"
                      lineColor={colors.line}
                    />
                    <StatusRow
                      label="Card design"
                      value={designSaved ? 'Saved' : 'Not yet'}
                      lineColor={colors.line}
                      valueColor={colors.ink}
                    />
                    {suspended ? (
                      <StatusRow label="Priority" value="Paused" valueColor={colors.red} lineColor={colors.line} />
                    ) : (
                      <StatusRow
                        label="Priority"
                        value={hasLimit ? 'Front of the list' : 'Standard'}
                        valueColor={hasLimit ? colors.gold : colors.mut2}
                        lineColor={colors.line}
                      />
                    )}

                    {hasLimit ? (
                      <View style={[styles.rowBase, { borderColor: colors.line, paddingVertical: 12 }]}>
                        <Text style={[styles.rowLabel, { color: colors.mut }]}>Spending power</Text>
                        <Text style={[styles.rowSerifValue, { color: colors.gold }]}>
                          {fmtDollars(limitCents ?? 0)}
                        </Text>
                      </View>
                    ) : (
                      <Pressable onPress={handleConnect} disabled={busy}>
                        <StatusRow
                          label="Spending power"
                          value={suspended ? 'Check again ›' : 'Check now ›'}
                          valueColor={colors.gold}
                          lineColor={colors.line}
                        />
                      </Pressable>
                    )}

                    {hasLimit && (
                      <StatusRow
                        label="Per installment"
                        value={`up to ${fmtDollars(Math.round((limitCents ?? 0) / 4))}`}
                        valueColor={colors.ink}
                        lineColor={colors.line}
                      />
                    )}
                    <StatusRow
                      label="Launch"
                      value="We’ll notify you"
                      valueColor={colors.mut2}
                      lineColor={colors.line}
                      last
                    />
                  </View>

                  {!hasLimit && !suspended && (
                    <Body style={{ marginTop: 16, fontSize: 12.5, lineHeight: 18 }}>
                      Checking your spending power connects a bank read-only, sets a starting limit,
                      and moves you to Priority. Everything else stays as it is.
                    </Body>
                  )}
                  {suspended && (
                    <Body style={{ marginTop: 16, fontSize: 12.5, lineHeight: 18 }}>
                      A Pay in 4 payment didn’t go through, so new spending power is paused until
                      it’s resolved. Nothing else on your account is affected.
                    </Body>
                  )}
                  {hasLimit && (
                    <Text style={[styles.finePrint, { color: colors.mut3 }]}>
                      Card issuance is subject to approval. Any limit shown is an indication based on
                      the information available now and may change before your card is issued.
                    </Text>
                  )}

                  {!hasLimit ? (
                    <PressScale onPress={handleConnect} scaleTo={motion.pressScale} disabled={busy} style={{ marginTop: 22 }}>
                      <View style={[styles.ctaPill, { backgroundColor: colors.ink, opacity: busy ? 0.6 : 1 }]}>
                        <Text style={styles.ctaPillText}>
                          {busy ? 'Checking…' : suspended ? 'Check again' : 'Check spending power'}
                        </Text>
                        <View style={[styles.ctaCircle, { backgroundColor: colors.gold }]}>
                          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                        </View>
                      </View>
                    </PressScale>
                  ) : (
                    <PressScale onPress={onClose} scaleTo={motion.pressScale} style={{ marginTop: 22 }}>
                      <View style={[styles.ctaPillCentered, { backgroundColor: colors.ink }]}>
                        <Text style={styles.ctaPillText}>Done</Text>
                      </View>
                    </PressScale>
                  )}
                  {!hasLimit && (
                    <Pressable onPress={onClose} disabled={busy} style={styles.laterBtn}>
                      <Text style={[styles.laterText, { color: colors.mut }]}>Done</Text>
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatusRow({
  label,
  value,
  valueColor,
  icon,
  lineColor,
  last,
}: {
  label: string;
  value: string;
  valueColor: string;
  icon?: keyof typeof Ionicons.glyphMap;
  lineColor: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.rowBase,
        { borderColor: lineColor },
        last && { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: lineColor },
      ]}
    >
      <Text style={[styles.rowLabel, { color: '#8A7F6B' }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Ionicons name={icon} size={16} color={valueColor} />}
        <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '86%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 28 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  eyebrow: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  headline: { fontFamily: fontFamily.serif, fontSize: 36, lineHeight: 40, letterSpacing: -0.4 },
  checkCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factText: { fontFamily: fontFamily.regular, fontSize: 13 },
  ctaPill: {
    height: 56,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 8,
  },
  ctaPillCentered: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPillText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF' },
  ctaCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  laterBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  laterText: { fontFamily: fontFamily.semibold, fontSize: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  stepText: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  priorityChip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  priorityChipText: { fontFamily: fontFamily.semibold, fontSize: 10, letterSpacing: 0.5 },
  bigNumber: { fontFamily: fontFamily.serif, fontSize: 80, letterSpacing: -1.5, marginTop: 8 },
  quarterRow: { flexDirection: 'row', marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14 },
  quarterCol: { flex: 1, alignItems: 'center' },
  quarterAmount: { fontFamily: fontFamily.serif, fontSize: 20 },
  quarterLabel: { fontFamily: fontFamily.semibold, fontSize: 10, letterSpacing: 0.5, marginTop: 3 },
  finePrint: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 16 },
  rowBase: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 14 },
  rowValue: { fontFamily: fontFamily.bold, fontSize: 14 },
  rowSerifValue: { fontFamily: fontFamily.serif, fontSize: 30 },
});
