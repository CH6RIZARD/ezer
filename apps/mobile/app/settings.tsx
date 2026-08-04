// =============================================================================
// EZER Redesign — Settings (handoff §7)
//
// Appearance segmented Light/Dark (active #4C1D95) — must re-theme every
// screen, calendar, popover and the tab bar, which it does by driving
// ThemeContext.setTheme. Then Account, Linked banks, three gold notification
// toggles, and a red Sign out row.
// =============================================================================

import React, { useState } from 'react';
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

          {/* --- linked banks -------------------------------------------------- */}
          {/*
            Real Plaid instruments, not a hardcoded list.
            This rendered demoFundingInstruments, so it showed Chase Sapphire,
            Amex Gold and an "Unknown Card •****" — none of which the user had
            linked, and the last of which is not a card at all. The cards listed
            here must be the cards the charges are actually billed to.
          */}
          <SectionHeader style={styles.section}>Linked banks</SectionHeader>
          {instruments.length === 0 ? (
            <Surface style={{ padding: 16 }}>
              <Body>
                No accounts linked yet. Connect one below and your cards will appear here.
              </Body>
            </Surface>
          ) : (
            <Surface style={styles.block}>
              {instruments.map((inst, i) => (
                <View key={inst.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
                  <View style={styles.bankRow}>
                    <Ionicons name="card-outline" size={19} color={colors.mut} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                        {inst.displayName || 'Account'}
                      </Text>
                      <Body style={{ marginTop: 2 }}>
                        {/* Only render the parts Plaid actually returned — a
                            missing brand/mask produced "Unknown •****". */}
                        {[inst.brand, inst.last4 ? `•${inst.last4}` : null]
                          .filter(Boolean)
                          .join(' ') || 'Linked account'}
                      </Body>
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
