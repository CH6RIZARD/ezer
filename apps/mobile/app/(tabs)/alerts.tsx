// =============================================================================
// EZER Redesign — Alerts (handoff §5)
//
// "Next 30 days · stay ahead of every charge".
// Trials expiring: red "Ends in Nd", "$X/mo after trial", gold Manage button.
// Upcoming renewals: purple Act button. Both open Subscription Detail.
// =============================================================================

import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { usePremium } from '../../utils/PremiumContext';
import { useData, type RiskItem } from '../../contexts/DataContext';
import { formatCents } from '../../utils/calculations';
import { isLoosePreviewMode } from '../../utils/expoRuntime';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Body,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
  Wordmark,
} from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status: premiumStatus } = usePremium();
  const { risks } = useData();

  useEffect(() => {
    if (premiumStatus === 'expired' && !isLoosePreviewMode()) router.replace('/screens/Paywall');
  }, [premiumStatus]);

  const trials = risks.filter(r => r.type === 'trial');
  const renewals = risks.filter(r => r.type === 'renewal');

  const open = (r: RiskItem) =>
    router.push({ pathname: '/screens/SubscriptionDetail', params: { id: r.subscriptionId } });

  const renderRow = (r: RiskItem, kind: 'trial' | 'renewal') => {
    const isTrial = kind === 'trial';
    return (
      <Surface key={r.id} style={styles.row}>
        {/* `logo` is what Plaid returns on an enriched merchant; without it the
            mark can only ever fall back to the bundled/initial path. */}
        <MerchantMark
          name={r.merchantName}
          merchantId={r.subscriptionId}
          logoUrl={r.logo}
          size={42}
        />

        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
            {r.merchantName}
          </Text>
          <Text
            style={[
              styles.meta,
              { color: isTrial ? colors.red : colors.mut },
            ]}
            numberOfLines={1}
          >
            {isTrial
              ? `Ends in ${r.daysUntilDue}d`
              : `Renews in ${r.daysUntilDue}d · ${new Date(r.dueDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}`}
          </Text>
          <Text style={[styles.sub, { color: colors.mut2 }]} numberOfLines={1}>
            {isTrial
              ? `${formatCents(r.amountCents)}/mo after trial`
              : formatCents(r.amountCents)}
          </Text>
        </View>

        <PressScale onPress={() => open(r)} scaleTo={0.94}>
          <View
            style={[
              styles.action,
              {
                backgroundColor: isTrial ? colors.goldBg : colors.accent,
              },
            ]}
          >
            <Text style={styles.actionText}>{isTrial ? 'Manage' : 'Act'}</Text>
          </View>
        </PressScale>
      </Surface>
    );
  };

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
            <View style={{ flex: 1 }} />
            <Wordmark />
          </View>

          <Text style={[typeScale.screenTitle, { color: colors.ink, marginTop: 4 }]}>Alerts</Text>
          <Body style={{ marginTop: 6 }}>Next 30 days · stay ahead of every charge</Body>

          {trials.length > 0 && (
            <>
              <SectionHeader style={styles.section}>Trials expiring</SectionHeader>
              <View style={{ gap: 8 }}>{trials.map(t => renderRow(t, 'trial'))}</View>
            </>
          )}

          {renewals.length > 0 && (
            <>
              <SectionHeader style={styles.section}>Upcoming renewals</SectionHeader>
              <View style={{ gap: 8 }}>{renewals.map(r => renderRow(r, 'renewal'))}</View>
            </>
          )}

          {risks.length === 0 && (
            <Surface style={{ padding: 22, marginTop: 20, alignItems: 'center' }}>
              <Body style={{ textAlign: 'center' }}>
                Nothing due in the next 30 days. You're ahead of it.
              </Body>
            </Surface>
          )}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
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
  meta: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
    marginTop: 3,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  action: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: radius.buttonSm,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: fontFamily.bold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
});
