// =============================================================================
// EZER Redesign — Pay in 4 tab
//
// Handoff §3. Title "Pay in *four*" (four in Instrument Serif Italic, accent),
// EARLY ACCESS + COMING SOON pulse chip, the locked 3D virtual card, a
// "Spend with clarity" card, "How it splits" 4 date tiles with PAY 1 gold,
// gradient join CTA -> success state, shield reassurance, legal fine print.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { gradients } from '../../theme/tokens';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Label,
  Body,
  SectionHeader,
  Surface,
  PressScale,
  PulseRing,
  ScreenBody,
  Wordmark,
} from '../../components/redesign/Primitives';
import VirtualCard from '../../components/redesign/VirtualCard';
import ProgressRing from '../../components/redesign/ProgressRing';
import { formatCents } from '../../utils/calculations';

/** Illustrative basket used to show what one installment actually costs. */
const EXAMPLE_TOTAL_CENTS = 12000;
const INSTALLMENTS = 4;

/**
 * The four installments: the first is due at checkout, then one every two
 * weeks — the standard BNPL schedule.
 */
function useInstallments() {
  return useMemo(() => {
    const each = Math.round(EXAMPLE_TOTAL_CENTS / INSTALLMENTS);

    return Array.from({ length: INSTALLMENTS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i * 14);

      return {
        n: i + 1,
        amountCents: each,
        /**
         * CUMULATIVE, not per-payment: how much of the purchase is paid off
         * once this installment clears — 1/4, 2/4, 3/4, 4/4.
         *
         * Filling every ring to the same 25% drew four identical arcs, which
         * told the user nothing: the whole point of four separate rings is that
         * they differ. Progress across the plan is the only reading where the
         * shape carries information.
         */
        share: (i + 1) / INSTALLMENTS,
        due:
          i === 0
            ? 'Due today'
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
  }, []);
}

export default function PayInFourScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [joined, setJoined] = useState(false);
  // While the card is being turned the page must not scroll — otherwise a
  // vertical drag fights the rotation and the screen slides away underneath it.
  const [cardDragging, setCardDragging] = useState(false);
  const installments = useInstallments();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: layout.screenX,
          paddingBottom: layout.contentBottom,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!cardDragging}
        bounces={false}
        overScrollMode="never"
      >
        <ScreenBody>
          {/* --- header ------------------------------------------------------ */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <Wordmark />
          </View>

          <Text style={[typeScale.screenTitle, { color: colors.ink, marginTop: 6 }]}>
            Pay in{' '}
            <Text style={{ fontFamily: fontFamily.serif, color: colors.accInk, fontSize: 28 }}>
              four
            </Text>
          </Text>
          <Body style={{ marginTop: 6 }}>One card. Four easy payments. Zero drama.</Body>

          <View style={styles.chipRow}>
            <View style={[styles.flatChip, { backgroundColor: colors.accSoft }]}>
              <Text style={[typeScale.labelSm, { color: colors.accInk }]}>EARLY ACCESS</Text>
            </View>
            <View style={[styles.flatChip, { backgroundColor: colors.goldSoft }]}>
              <PulseRing radius={radius.pill} />
              <Text style={[typeScale.labelSm, { color: colors.gold }]}>COMING SOON</Text>
            </View>
          </View>

          {/* --- the card ---------------------------------------------------- */}
          <VirtualCard style={{ marginTop: 10 }} onDragChange={setCardDragging} />

          {/* --- spend with clarity ------------------------------------------ */}
          <Surface style={styles.block}>
            <SectionHeader>Spend with clarity</SectionHeader>
            <Body style={{ marginTop: 6, lineHeight: 19 }}>
              Split any purchase into four. See every installment before you commit —
              no interest, no surprises, no drama.
            </Body>
          </Surface>

          {/* --- installment schedule ---------------------------------------- */}
          {/*
            Rings, not boxes, and each one fills FURTHER than the last: 1/4,
            2/4, 3/4, 4/4 paid off. Read left to right the row is a progress
            sequence that closes on the final payment, so the shapes say the
            same thing the fractions do.
          */}
          <SectionHeader style={{ marginTop: 22, marginBottom: 4 }}>
            Your installment plan
          </SectionHeader>
          <Body style={{ marginBottom: 14 }}>
            A {formatCents(EXAMPLE_TOTAL_CENTS)} purchase becomes four equal installments of{' '}
            {formatCents(installments[0].amountCents)} — the first at checkout, the rest every two
            weeks. No interest.
          </Body>

          <View style={styles.installmentRow}>
            {installments.map(inst => {
              const first = inst.n === 1;
              const tint = first ? colors.gold : colors.accInk;

              return (
                <View key={inst.n} style={styles.installment}>
                  <ProgressRing
                    progress={inst.share}
                    size={58}
                    stroke={5}
                    color={tint}
                    trackColor={colors.line}
                  >
                    <Text style={[styles.ringFraction, { color: tint }]}>
                      {inst.n}
                      <Text style={{ color: colors.mut2 }}>/{INSTALLMENTS}</Text>
                    </Text>
                  </ProgressRing>

                  <Text
                    style={[styles.installmentAmount, { color: colors.ink }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCents(inst.amountCents)}
                  </Text>

                  <Text
                    style={[
                      typeScale.labelSm,
                      { color: first ? colors.gold : colors.mut2, textAlign: 'center' },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {inst.due}
                  </Text>
                </View>
              );
            })}
          </View>

          <Body style={{ marginTop: 12 }}>
            Each ring shows how much of the purchase is paid off after that installment — a quarter
            at a time, until it closes at the fourth.
          </Body>

          {/* --- join CTA ---------------------------------------------------- */}
          {joined ? (
            <View style={[styles.success, { backgroundColor: colors.successBg }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.successText, { color: colors.success }]}>
                You're on the early-access list ✓
              </Text>
            </View>
          ) : (
            <PressScale onPress={() => setJoined(true)} style={{ marginTop: 20 }}>
              <LinearGradient
                colors={gradients.ctaPrimary as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>Join the early-access list</Text>
              </LinearGradient>
            </PressScale>
          )}

          <View style={styles.shieldRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.mut} />
            <Body style={{ marginLeft: 7, flex: 1 }}>
              Your card details are never shared with merchants.
            </Body>
          </View>

          <Text style={[styles.legal, { color: colors.mut3 }]}>
            Pay in 4 is not yet available. Joining the early-access list does not guarantee
            approval. Splitting a purchase is subject to eligibility and a soft check that
            does not affect your credit score. Amounts shown are illustrative.
          </Text>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  flatChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  block: {
    padding: 16,
    marginTop: 18,
  },
  installmentRow: {
    flexDirection: 'row',
    // No borders or fills: the rings are the objects, so a box around each one
    // would add a second competing shape.
    gap: 8,
  },
  installment: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 7,
  },
  ringFraction: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  installmentAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  cta: {
    height: 52,
    borderRadius: radius.buttonLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  success: {
    marginTop: 20,
    borderRadius: radius.buttonLg,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  successText: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
  shieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  legal: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 16,
  },
});
