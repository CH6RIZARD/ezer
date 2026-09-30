// =============================================================================
// EZER Redesign — Settings (handoff §7)
//
// Appearance segmented Light/Dark (active #4C1D95) — must re-theme every
// screen, calendar, popover and the tab bar, which it does by driving
// ThemeContext.setTheme. Then Account, Linked banks, three gold notification
// toggles, and a red Sign out row.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
import { fetchLinkedBanks, payIn4AccountFor, initialFor, tintFor, type LinkedBanksData } from '../utils/linkedBanks';
import { formatCents } from '../utils/calculations';
import { getSpendingPowerOutcome } from '../utils/cardDesignStore';
import PayIn4AccountPicker from '../components/redesign/PayIn4AccountPicker';

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

  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    renewals: true,
    trials: true,
    digest: false,
  });

  // Real per-account data (GET /plaid/linked-banks) — which bank groups
  // funds Pay in 4, per PlaidItem.readForSubscriptions, etc. Refetched every
  // time this screen regains focus (not just on mount) so returning from
  // BankDetail or the account picker shows whatever just changed there.
  const [linkedBanks, setLinkedBanks] = useState<LinkedBanksData | null>(null);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [payIn4LimitCents, setPayIn4LimitCents] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadLinkedBanks = useCallback(async () => {
    const [data, outcome] = await Promise.all([fetchLinkedBanks(), getSpendingPowerOutcome()]);
    setLinkedBanks(data);
    setPayIn4LimitCents(outcome?.status === 'approved' ? outcome.limitCents ?? null : null);
    setLoadingBanks(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLinkedBanks();
    }, [loadLinkedBanks])
  );

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
            Turn 3 model (PATCH-NOTES-early-access-sheet.md, "Patch 3"):
            Pay in 4 has exactly ONE funding account (User.payIn4InstrumentId,
            set via the picker sheet below or auto-picked by
            trustScoring.ts's resolvePayIn4Instrument the first time an
            assessment runs). Every OTHER linked bank is read for
            subscriptions unless the user turned that off for it specifically
            (PlaidItem.readForSubscriptions, flipped on BankDetail.tsx). This
            replaced the earlier `FundingInstrument.purpose` grouping, which
            only ever produced an inferred "also used for Pay in 4" guess —
            GET /plaid/linked-banks now says exactly which account it is.
          */}
          <SectionHeader style={styles.section}>Pay in 4 pays from</SectionHeader>
          {loadingBanks ? (
            <ActivityIndicator style={{ marginTop: 10 }} color={colors.gold} />
          ) : (
            (() => {
              const p4Item = linkedBanks?.items.find(i => payIn4AccountFor(i));
              const p4Account = p4Item ? payIn4AccountFor(p4Item) : null;

              return p4Account && p4Item ? (
                <Pressable onPress={() => setPickerOpen(true)}>
                  <LinearGradient
                    colors={colors.goldTile as unknown as readonly [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.p4Card, { borderColor: colors.goldLine }]}
                  >
                    <View style={styles.p4Head}>
                      <View style={[styles.bankTile, { backgroundColor: tintFor(p4Item.institutionName) ?? colors.accInk }]}>
                        <Text style={styles.bankTileText}>{initialFor(p4Item.institutionName)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                          {p4Item.institutionName} · {p4Account.displayName}
                        </Text>
                        <Text style={[styles.mono, { color: colors.mut }]}>{`•••• ${p4Account.last4}`}</Text>
                      </View>
                      <Text style={[styles.changeLink, { color: colors.gold }]}>Change</Text>
                    </View>
                    {payIn4LimitCents !== null && (
                      <View style={[styles.p4Footer, { borderTopColor: colors.goldLine }]}>
                        <Body style={{ fontSize: 12.5 }}>Spending power from this account</Body>
                        <Text style={[styles.p4Amount, { color: colors.gold }]}>{formatCents(payIn4LimitCents)}</Text>
                      </View>
                    )}
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable onPress={() => setPickerOpen(true)}>
                  <View style={[styles.p4Empty, { borderColor: colors.goldLine }]}>
                    <Ionicons name="card-outline" size={20} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.kvValue, { color: colors.ink }]}>No account chosen</Text>
                      <Body style={{ marginTop: 2 }}>Pick a checking account · sets your spending power</Body>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
                  </View>
                </Pressable>
              );
            })()
          )}
          <Body style={{ marginTop: 8, fontSize: 11.5, lineHeight: 16 }}>
            Installments are pulled from this account. Changing it re-checks your spending power.
          </Body>

          <View style={styles.connectedHeaderRow}>
            <SectionHeader>Connected banks</SectionHeader>
            {linkedBanks && linkedBanks.items.length > 0 && (
              <Body>{linkedBanks.items.length} connected</Body>
            )}
          </View>
          {!loadingBanks && (!linkedBanks || linkedBanks.items.length === 0) ? (
            <Surface style={{ padding: 16 }}>
              <Body>No accounts linked yet. Connect one below and your cards will appear here.</Body>
            </Surface>
          ) : (
            linkedBanks && (
              <Surface style={styles.block}>
                {linkedBanks.items.map((item, i) => {
                  const p4 = payIn4AccountFor(item);
                  const accountsLine = item.accounts.map(a => `${a.displayName} •${a.last4}`).join(' · ');
                  return (
                    <View key={item.itemId}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
                      <PressScale
                        onPress={() => router.push({ pathname: '/screens/BankDetail', params: { itemId: item.itemId } })}
                        scaleTo={0.99}
                      >
                        <View style={styles.bankRow}>
                          <View style={[styles.bankTile, { backgroundColor: tintFor(item.institutionName) ?? colors.accInk }]}>
                            <Text style={styles.bankTileText}>{initialFor(item.institutionName)}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                                {item.institutionName || 'Bank'}
                              </Text>
                              {p4 && (
                                <View style={[styles.chip, { backgroundColor: colors.goldSoft }]}>
                                  <Text style={[typeScale.labelSm, { color: colors.gold }]}>PAY IN 4</Text>
                                </View>
                              )}
                            </View>
                            <Body style={{ marginTop: 2 }} numberOfLines={1}>
                              {accountsLine || 'Linked account'}
                            </Body>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                              <Ionicons
                                name={item.readForSubscriptions ? 'eye-outline' : 'eye-off-outline'}
                                size={12}
                                color={item.readForSubscriptions ? colors.accInk : colors.mut}
                              />
                              <Text
                                style={[styles.readLabel, { color: item.readForSubscriptions ? colors.accInk : colors.mut }]}
                              >
                                {item.readForSubscriptions ? 'Read for subscriptions' : 'Not read for subscriptions'}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
                        </View>
                      </PressScale>
                    </View>
                  );
                })}
              </Surface>
            )
          )}

          <PayIn4AccountPicker
            visible={pickerOpen}
            data={linkedBanks}
            onClose={() => setPickerOpen(false)}
            onSaved={loadLinkedBanks}
          />

          {/* --- add a bank ----------------------------------------------------- */}
          {/*
            Same hook as the dashboard call-out, so linking behaves identically
            wherever it starts: Link -> exchange -> sync -> refresh. Settings is
            where people look to add a SECOND account, which the dashboard tile
            is not a natural home for once the first one is connected.
          */}
          <PressScale
            onPress={() => void connectBank.connect(loadLinkedBanks)}
            disabled={connectBank.busy}
            style={{ marginTop: 10 }}
          >
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
  p4Card: {
    borderRadius: radius.cardLg,
    borderWidth: 1,
    padding: 14,
  },
  p4Head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  p4Footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  p4Amount: {
    fontFamily: fontFamily.serif,
    fontSize: 26,
  },
  p4Empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.cardLg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 16,
  },
  connectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
  },
  bankTile: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankTileText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  mono: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },
  changeLink: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  readLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
  },
});
