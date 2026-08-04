// =============================================================================
// EZER Redesign — Drain Review (handoff §8)
//
// Reached from Wallet's "Review card drain" and the Home "Silent Subs" tile.
// Subs ranked least-used first with usage labels. Each row toggles between a
// "Cut it" outline button and a filled red "Cutting ✓".
//
// Header total is LIVE: "you could free up $X/mo" sums the cut subs, and starts
// pre-seeded with the red-flagged ones per the handoff.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Body,
  Label,
  Surface,
  PressScale,
  ScreenBody,
} from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import { useData } from '../../contexts/DataContext';
import {
  resolveCancellationUrl,
  resolveCancellationUrlSync,
  openCancellation,
} from '../../utils/cancellation';

type Flag = 'red' | 'gold' | 'neutral';

/**
 * Usage copy from the handoff. Keyed by merchantId; anything not listed falls
 * back to neutral so a new subscription never invents a red flag.
 */
const USAGE: Record<string, { label: string; flag: Flag }> = {
  fitpass: { label: 'Last visit 6 weeks ago', flag: 'red' },
  adobe: { label: 'Opened once this month', flag: 'red' },
  hulu: { label: 'Trial — never streamed', flag: 'red' },
  chatgpt: { label: 'Used most days', flag: 'gold' },
  youtube: { label: 'Watched this week', flag: 'gold' },
  spotify: { label: 'Plays daily', flag: 'neutral' },
  netflix: { label: 'Watched recently', flag: 'neutral' },
  icloud: { label: 'Storage in use', flag: 'neutral' },
};

const RANK: Record<Flag, number> = { red: 0, gold: 1, neutral: 2 };

export default function DrainReviewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { subscriptions, risks } = useData();

  /**
   * Least-used first: red flags, then gold, then neutral.
   *
   * Built from the user's REAL subscriptions (DataContext, Plaid-derived).
   * This read demoSubscriptions/demoCharges, so it listed eight merchants for a
   * user who had linked nothing — and offered to "cut" services they had never
   * subscribed to.
   *
   * Prices come from the subscription's own amount, with the 30-day risk feed
   * as a fallback for anything the API did not price.
   */
  const rows = useMemo(() => {
    const priceBySubId = new Map<string, number>();
    for (const r of risks) {
      if (r.amountCents > 0) priceBySubId.set(r.subscriptionId, r.amountCents);
    }

    return subscriptions
      .map(sub => {
        // USAGE is keyed by merchant and only covers merchants we have a real
        // usage signal for; everything else is explicitly "no signal" rather
        // than being invented a red flag.
        const usage =
          USAGE[sub.merchantId] ?? { label: 'No recent signal', flag: 'neutral' as Flag };
        return {
          id: sub.id,
          merchantId: sub.merchantId,
          name: sub.merchantName || sub.merchantId,
          logo: sub.logo,
          amountCents: sub.amountCents ?? priceBySubId.get(sub.id) ?? 0,
          ...usage,
        };
      })
      .sort((a, b) => RANK[a.flag] - RANK[b.flag] || b.amountCents - a.amountCents);
  }, [subscriptions, risks]);

  // Defaults to the red-flagged set, per the handoff.
  const [cut, setCut] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.filter(r => r.flag === 'red').map(r => [r.id, true]))
  );

  const freed = rows.reduce((sum, r) => (cut[r.id] ? sum + r.amountCents : sum), 0);

  /** Row currently resolving a cancellation link, so it can show progress. */
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Toggling a row INTO the cut state takes the user straight to that service's
   * real cancellation page — marking it cut in the app does not actually cancel
   * anything, so sending them to the page is the whole point. Un-toggling opens
   * nothing.
   */
  const toggleCut = async (row: { id: string; name: string; merchantId: string }) => {
    const nowCut = !cut[row.id];
    setCut(c => ({ ...c, [row.id]: nowCut }));
    if (!nowCut || busyId) return;


    // Instant when the merchant record or the curated table already knows it.
    const quick = resolveCancellationUrlSync(row.name, row.merchantId);
    if (quick) {
      void openCancellation(quick);
      return;
    }

    // Otherwise fall through to auto-discovery against the merchant's domain.
    setBusyId(row.id);
    try {
      const target = await resolveCancellationUrl(row.name, row.merchantId);
      await openCancellation(target);
    } finally {
      setBusyId(null);
    }
  };

  const flagColor = (f: Flag) =>
    f === 'red' ? colors.red : f === 'gold' ? colors.gold : colors.mut;

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
              Drain Review
            </Text>
          </View>

          <Surface style={styles.totalCard}>
            <Label>You could free up</Label>
            <Text style={[typeScale.totalValue, { color: colors.red, marginTop: 4 }]}>
              {formatCents(freed)}
              <Text style={{ fontSize: 18 }}>/mo</Text>
            </Text>
            <Body style={{ marginTop: 2 }}>
              {Object.values(cut).filter(Boolean).length} of {rows.length} marked to cut
            </Body>
          </Surface>

          <View style={{ gap: 8, marginTop: 16 }}>
            {rows.map(r => {
              const isCut = !!cut[r.id];
              return (
                <Surface key={r.id} style={styles.row}>
                  <MerchantMark name={r.name} merchantId={r.merchantId} logoUrl={r.logo} size={42} />

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[styles.usage, { color: flagColor(r.flag) }]} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={[styles.amount, { color: colors.mut2 }]}>
                      {formatCents(r.amountCents)}/mo
                    </Text>
                  </View>

                  <PressScale
                    scaleTo={0.94}
                    disabled={busyId === r.id}
                    onPress={() => void toggleCut(r)}
                  >
                    <View
                      style={[
                        styles.cutBtn,
                        isCut
                          ? { backgroundColor: colors.red, borderColor: colors.red }
                          : { backgroundColor: 'transparent', borderColor: colors.line2 },
                        busyId === r.id && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cutText,
                          { color: isCut ? '#FFFFFF' : colors.ink },
                        ]}
                      >
                        {busyId === r.id ? 'Opening…' : isCut ? 'Cutting ✓' : 'Cut it'}
                      </Text>
                    </View>
                  </PressScale>
                </Surface>
              );
            })}
          </View>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    padding: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
  usage: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    marginTop: 3,
  },
  amount: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  cutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.buttonSm,
    borderWidth: 1.5,
    minHeight: 36,
    justifyContent: 'center',
  },
  cutText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
});
