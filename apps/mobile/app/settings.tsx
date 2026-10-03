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
import { lightTokens, darkTokens, blackTokens } from '../theme/tokens';
import {
  Body,
  Label,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
} from '../components/redesign/Primitives';
import { isInboxScanEnabled } from '../utils/inboxScan';

const NOTIFS = [
  { key: 'renewals', title: 'Renewal alerts', sub: '3 days before' },
  { key: 'trials', title: 'Trial warnings', sub: 'Before a trial converts' },
  { key: 'digest', title: 'Weekly digest', sub: 'Sunday' },
] as const;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, mode, setMode } = useTheme();
  const auth = useAuth() as {
    user?: { email?: string; createdAt?: string };
    signOut?: () => void;
    logout?: () => void;
  };
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    renewals: true,
    trials: true,
    digest: false,
  });
  // Server-gated until Google verifies gmail.readonly (routes/inbox.ts).
  const [inboxEnabled, setInboxEnabled] = useState(false);
  useEffect(() => {
    void isInboxScanEnabled().then(setInboxEnabled);
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
          {/* Three unlabelled swatches, each painted the actual screen
              background of the theme it selects — light (cream), dark (the
              handoff's purple-tinted dark) and true black. The colour IS the
              label; a ring marks the active one. */}
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {(
              [
                ['light', lightTokens.bg],
                ['dark', darkTokens.bg],
                ['black', blackTokens.bg],
              ] as const
            ).map(([m, swatch]) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m} theme`}
                  accessibilityState={{ selected: active }}
                  style={styles.swatchItem}
                >
                  <View
                    style={[
                      styles.swatchRing,
                      { borderColor: active ? colors.accInk : 'transparent' },
                    ]}
                  >
                    <View style={[styles.swatch, { backgroundColor: swatch, borderColor: colors.line2 }]} />
                  </View>
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
            Its OWN screen (settings/linked-banks.tsx), per the mock's 3a·1 —
            not inlined here. This row is the only thing on the main Settings
            page; "Pay in 4 pays from", the connected-banks list and
            "Connect a bank" all live on the far side of this tap.
          */}
          <SectionHeader style={styles.section}>Banks</SectionHeader>
          <PressScale onPress={() => router.push('/settings/linked-banks')}>
            <Surface style={styles.connectRow}>
              <View style={[styles.connectIcon, { backgroundColor: colors.accSoft }]}>
                <Ionicons name="card-outline" size={19} color={colors.accInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kvValue, { color: colors.ink }]}>Linked banks</Text>
                <Body style={{ marginTop: 2 }}>Pay in 4's account, and every connected bank</Body>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
            </Surface>
          </PressScale>

          {inboxEnabled && (
            <>
              <SectionHeader style={styles.section}>Inbox</SectionHeader>
              <PressScale onPress={() => router.push('/settings/inbox')}>
                <Surface style={styles.connectRow}>
                  <View style={[styles.connectIcon, { backgroundColor: colors.accSoft }]}>
                    <Ionicons name="mail-outline" size={19} color={colors.accInk} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kvValue, { color: colors.ink }]}>Connect inbox</Text>
                    <Body style={{ marginTop: 2 }}>Find subscriptions and trials from your receipts</Body>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
                </Surface>
              </PressScale>
            </>
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
  swatchItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
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
