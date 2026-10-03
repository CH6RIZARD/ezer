// =============================================================================
// EZER Redesign — Settings (handoff §7)
//
// Appearance: one three-colour theme pill (Patch 4) — must re-theme every
// screen, calendar, popover and the tab bar, which it does by driving
// ThemeContext.setMode. Then Account, Linked banks, three gold notification
// toggles, and a red Sign out row.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeMode } from '../utils/ThemeContext';
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

// Shown names map onto the app's ThemeMode values ('light' | 'dark' | 'black',
// CLAUDE.md "three theme modes"): the purple-tinted 'dark' theme is named
// "EZER" (owner's call — not "Purple" as in the Patch 4 mock), and true
// 'black' is "Dark". Colours all come from tokens.ts.
const THEME_SEGMENTS: { mode: ThemeMode; name: string; fill: string; check: string }[] = [
  { mode: 'light', name: 'Light', fill: lightTokens.bg, check: lightTokens.ink },
  { mode: 'dark', name: 'EZER', fill: lightTokens.accent, check: darkTokens.ink },
  { mode: 'black', name: 'Dark', fill: blackTokens.bg, check: darkTokens.ink },
];
const PILL_EASE = Easing.bezier(0.22, 1, 0.36, 1);

function ThemePill({ mode, onChange }: { mode: ThemeMode; onChange: (m: ThemeMode) => void }) {
  const { colors } = useTheme();
  // Active segment flex 2, others 1. flex is a layout prop, so the width
  // animation runs on the JS driver (350ms, three views — cheap); the
  // checkmark fade is a separate native-driven opacity.
  const flex = useRef(THEME_SEGMENTS.map(s => new Animated.Value(s.mode === mode ? 2 : 1))).current;
  const check = useRef(THEME_SEGMENTS.map(s => new Animated.Value(s.mode === mode ? 1 : 0))).current;

  useEffect(() => {
    Animated.parallel(
      THEME_SEGMENTS.flatMap((s, i) => [
        Animated.timing(flex[i], { toValue: s.mode === mode ? 2 : 1, duration: 350, easing: PILL_EASE, useNativeDriver: false }),
        Animated.timing(check[i], { toValue: s.mode === mode ? 1 : 0, duration: 150, useNativeDriver: true }),
      ])
    ).start();
  }, [mode, flex, check]);

  return (
    // line2 comes from the active theme, so in the dark modes it is dark.line2
    // and the Dark segment still reads against the dark card.
    <View style={[styles.pill, { borderColor: colors.line2 }]}>
      {THEME_SEGMENTS.map((s, i) => (
        <Animated.View key={s.mode} style={{ flex: flex[i] }}>
          <Pressable
            onPress={() => s.mode !== mode && onChange(s.mode)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${s.name} theme`}
            accessibilityState={{ selected: s.mode === mode }}
            style={[styles.pillSegment, { backgroundColor: s.fill }]}
          >
            <Animated.View style={{ opacity: check[i] }}>
              <Ionicons name="checkmark" size={16} color={s.check} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

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
          {/* Patch 4 (Appearance Toggle mock 1b): one three-colour pill. */}
          <View style={styles.themeRow}>
            <Text style={[styles.kvValue, { color: colors.ink }]}>Theme</Text>
            <Text style={[styles.themeMode, { color: colors.mut }]}>{THEME_SEGMENTS.find(s => s.mode === mode)?.name}</Text>
          </View>
          <ThemePill mode={mode} onChange={setMode} />


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
  themeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  themeMode: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  pill: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillSegment: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
