// =============================================================================
// EZER Redesign — Settings (handoff §7)
//
// Appearance segmented Light/Dark (active #4C1D95) — must re-theme every
// screen, calendar, popover and the tab bar, which it does by driving
// ThemeContext.setTheme. Then Account, Linked banks, three gold notification
// toggles, and a red Sign out row.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { fontFamily, typeScale, radius, layout } from '../theme/type';
import {
  Body,
  Label,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
} from '../components/redesign/Primitives';
import { useConnectBank } from '../utils/useConnectBank';
import { useData } from '../contexts/DataContext';
import { getSpendingPowerOutcome } from '../utils/cardDesignStore';

const NOTIFS = [
  { key: 'renewals', title: 'Renewal alerts', sub: '3 days before' },
  { key: 'trials', title: 'Trial warnings', sub: 'Before a trial converts' },
  { key: 'digest', title: 'Weekly digest', sub: 'Sunday' },
] as const;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, setTheme } = useTheme();
  const auth = useAuth() as {
    user?: { email?: string; createdAt?: string };
    signOut?: () => void;
    logout?: () => void;
  };
  const connectBank = useConnectBank();
  const { instruments } = useData();

  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    renewals: true,
    trials: true,
    digest: false,
  });

  // Whether Pay in 4 has a real assessed limit right now. Used below to flag
  // a Subscriptions-group account as "Also used for Pay in 4" when nobody
  // ever linked a SEPARATE pay_in_4-tagged bank — i.e. they used "Use
  // connected bank" in SpendingPowerSheet.tsx rather than "Connect a new
  // bank". There is no per-instrument record of which account backed an
  // assessment (trustScoring.ts aggregates across every linked PlaidItem on
  // purpose), so this is inferred, not read back from the server — accurate
  // for the overwhelmingly common case of one linked bank, and silent rather
  // than wrong when there's more than one.
  const [payIn4Assessed, setPayIn4Assessed] = useState(false);
  useEffect(() => {
    void getSpendingPowerOutcome().then(outcome =>
      setPayIn4Assessed(outcome?.status === 'approved' && !!outcome.limitCents)
    );
  }, []);

  const signOut = () => {
    // The auth context has gone by both names across revisions; call whichever
    // exists rather than crashing on a rename.
    (auth.signOut ?? auth.logout)?.();
    router.replace('/');
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
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>
              Settings
            </Text>
          </View>

          {/* --- appearance --------------------------------------------------- */}
          <SectionHeader style={styles.section}>Appearance</SectionHeader>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {([['Light', false], ['Dark', true]] as const).map(([label, dark]) => {
              const active = isDark === dark;
              return (
                <Pressable
                  key={label}
                  onPress={() => setTheme(dark)}
                  style={[styles.segmentItem, active && { backgroundColor: colors.accent }]}
                >
                  <Ionicons
                    name={dark ? 'moon' : 'sunny'}
                    size={15}
                    color={active ? '#FFFFFF' : colors.mut}
                  />
                  <Text
                    style={[styles.segmentLabel, { color: active ? '#FFFFFF' : colors.mut }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* --- account ------------------------------------------------------ */}
          <SectionHeader style={styles.section}>Account</SectionHeader>
          <Surface style={styles.block}>
            <View style={styles.kv}>
              <Label>Email</Label>
              <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                {auth.user?.email ?? '—'}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.kv}>
              <Label>Member since</Label>
              {/* Real signup date. This was hardcoded to "January 2023" for
                  every user, on an account page — the one screen where a wrong
                  fact is most obviously a lie. */}
              <Text style={[styles.kvValue, { color: colors.ink }]}>
                {auth.user?.createdAt
                  ? new Date(auth.user.createdAt).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}
              </Text>
            </View>
          </Surface>

          {/* Data export and account deletion live on their own screen
              (settings/account.tsx) — it already calls GET /account/export
              and DELETE /account correctly, and DELETE /account already
              revokes every Plaid item before erasing anything. It simply had
              no way in: nothing in the app navigated to it, so the rights
              the published privacy policy promises "from inside the app"
              were unreachable, and Apple requires in-app account deletion
              for any app that offers account creation (Guideline 5.1.1(v)). */}
          <PressScale onPress={() => router.push('/settings/account')} style={{ marginTop: 10 }}>
            <Surface style={styles.connectRow}>
              <View style={[styles.connectIcon, { backgroundColor: colors.accSoft }]}>
                <Ionicons name="person-outline" size={19} color={colors.accInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kvValue, { color: colors.ink }]}>Manage account</Text>
                <Body style={{ marginTop: 2 }}>Download your data, or delete your account</Body>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
            </Surface>
          </PressScale>

          {/* --- linked banks -------------------------------------------------- */}
          {/*
            Real Plaid instruments, not a hardcoded list.
            This rendered demoFundingInstruments, so it showed Chase Sapphire,
            Amex Gold and an "Unknown Card •****" — none of which the user had
            linked, and the last of which is not a card at all. The cards listed
            here must be the cards the charges are actually billed to.

            Grouped by `purpose` (FundingInstrument.purpose) into
            Subscriptions vs Pay in 4 rather than one flat list. A bank
            connected from the Spending Power sheet
            (components/redesign/SpendingPowerSheet.tsx) via "Connect a new
            bank" is tagged 'pay_in_4' and is there for ONE reason — running
            the Pay in 4 trust assessment — and showing it mixed in with
            banks that back subscription tracking made it look like every
            linked account did the same thing. Untagged instruments (the
            common case: linked from Wallet/onboarding, no specific purpose)
            fall under "Subscriptions". "Use connected bank" reuses one of
            those for the Pay in 4 assessment too WITHOUT retagging it (it
            still, correctly, backs subscriptions) — `payIn4Assessed` flags
            that row with "Also used for Pay in 4" instead, since there is no
            per-instrument record of which account an assessment used.
          */}
          <SectionHeader style={styles.section}>Linked banks</SectionHeader>
          {instruments.length === 0 ? (
            <Surface style={{ padding: 16 }}>
              <Body>
                No accounts linked yet. Connect one below and your cards will appear here.
              </Body>
            </Surface>
          ) : (
            <>
              {(() => {
                const payIn4Tagged = instruments.filter(i => i.purpose === 'pay_in_4');
                const subscriptionRows = instruments.filter(i => i.purpose !== 'pay_in_4');
                // Only infer the badge when there's no dedicated pay_in_4
                // link — a real separate link is the unambiguous signal and
                // should not ALSO get the inferred one.
                const showInferredBadge = payIn4Assessed && payIn4Tagged.length === 0;

                return (
                  [
                    { key: 'subscriptions', title: 'Subscriptions', rows: subscriptionRows, badge: showInferredBadge },
                    { key: 'pay_in_4', title: 'Pay in 4', rows: payIn4Tagged, badge: false },
                  ] as const
                ).map(group =>
                  group.rows.length === 0 ? null : (
                    <View key={group.key} style={{ marginTop: 10 }}>
                      <Label style={{ marginBottom: 6 }}>{group.title}</Label>
                      <Surface style={styles.block}>
                        {group.rows.map((inst, i) => (
                          <View key={inst.id}>
                            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
                            <View style={styles.bankRow}>
                              <Ionicons name="card-outline" size={19} color={colors.mut} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                                  {inst.displayName || 'Account'}
                                </Text>
                                <Body style={{ marginTop: 2 }}>
                                  {/* Only render the parts Plaid actually returned
                                      — a missing brand/mask produced "Unknown
                                      •****". */}
                                  {[inst.brand, inst.last4 ? `•${inst.last4}` : null]
                                    .filter(Boolean)
                                    .join(' ') || 'Linked account'}
                                </Body>
                                {group.badge && (
                                  <Body style={{ marginTop: 2, color: colors.gold }}>Also used for Pay in 4</Body>
                                )}
                              </View>
                              {inst.isDefault && (
                                <View style={[styles.defaultChip, { backgroundColor: colors.accSoft }]}>
                                  <Text style={[typeScale.labelSm, { color: colors.accInk }]}>DEFAULT</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </Surface>
                    </View>
                  )
                );
              })()}
            </>
          )}

          {/* --- add a bank ----------------------------------------------------- */}
          {/*
            Same hook as the dashboard call-out, so linking behaves identically
            wherever it starts: Link -> exchange -> sync -> refresh. Settings is
            where people look to add a SECOND account, which the dashboard tile
            is not a natural home for once the first one is connected.
          */}
          <SectionHeader style={styles.section}>Banks</SectionHeader>
          <PressScale onPress={() => void connectBank.connect()} disabled={connectBank.busy}>
            <Surface style={[styles.connectRow, connectBank.busy && { opacity: 0.7 }]}>
              <View style={[styles.connectIcon, { backgroundColor: colors.accSoft }]}>
                <Ionicons
                  name={connectBank.busy ? 'sync-outline' : 'add-outline'}
                  size={19}
                  color={colors.accInk}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kvValue, { color: colors.ink }]}>
                  {connectBank.busy ? connectBank.label : 'Connect a bank account'}
                </Text>
                <Body style={{ marginTop: 2 }}>
                  {connectBank.busy
                    ? 'Keep the app open while this finishes'
                    : 'Securely via Plaid — we never see your login'}
                </Body>
              </View>
              {!connectBank.busy && (
                <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
              )}
            </Surface>
          </PressScale>

          {connectBank.error && (
            <Body style={{ marginTop: 8, color: colors.red }}>{connectBank.error}</Body>
          )}

          {/* --- notifications -------------------------------------------------- */}
          <SectionHeader style={styles.section}>Notifications</SectionHeader>
          <Surface style={styles.block}>
            {NOTIFS.map((n, i) => (
              <View key={n.key}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
                <View style={styles.notifRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kvValue, { color: colors.ink }]}>{n.title}</Text>
                    <Body style={{ marginTop: 2 }}>{n.sub}</Body>
                  </View>
                  <Switch
                    value={notifs[n.key]}
                    onValueChange={v => setNotifs(s => ({ ...s, [n.key]: v }))}
                    trackColor={{ false: colors.line2, true: colors.goldBg }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            ))}
          </Surface>

          {/* --- sign out ------------------------------------------------------- */}
          <PressScale onPress={signOut} style={{ marginTop: 22 }}>
            <Surface style={styles.signOut}>
              <Ionicons name="log-out-outline" size={18} color={colors.red} />
              <Text style={[styles.signOutText, { color: colors.red }]}>Sign out</Text>
            </Surface>
          </PressScale>
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
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.buttonSm,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.chip,
  },
  segmentLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  block: {
    paddingHorizontal: 14,
  },
  kv: {
    paddingVertical: 13,
    gap: 4,
  },
  kvValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
  },
  divider: {
    height: 1,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  defaultChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  connectIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
  },
  signOutText: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
});
