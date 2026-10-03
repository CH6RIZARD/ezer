// =============================================================================
// Settings › Inbox — the pre-permission screen Google's restricted-scope review
// expects: says exactly what is read, that it is processed on this phone, and
// that only subscription details are saved, BEFORE the OAuth prompt appears.
// The scan itself lives in utils/inboxScan/. The row on settings.tsx is hidden
// unless the server reports the feature enabled for this account
// (INBOX_SCAN_ENABLED / INBOX_SCAN_ALLOWLIST in routes/inbox.ts).
// =============================================================================

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import { useData } from '../../contexts/DataContext';
import { disconnectInbox, lastScanAt, scanInbox, type InboxProvider } from '../../utils/inboxScan';

const PRIVACY_URL = 'https://ch6rizard.github.io/ezer/privacy.html#email';

const PROVIDERS: { id: InboxProvider; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'gmail', label: 'Gmail', icon: 'logo-google' },
  { id: 'outlook', label: 'Outlook', icon: 'logo-microsoft' },
];

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { refresh } = useData();
  const [last, setLast] = useState<Record<InboxProvider, Date | null>>({ gmail: null, outlook: null });
  const [busy, setBusy] = useState<InboxProvider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLast({ gmail: await lastScanAt('gmail'), outlook: await lastScanAt('outlook') });
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const scan = async (p: InboxProvider) => {
    setBusy(p);
    setMessage(null);
    try {
      const r = await scanInbox(p);
      if (r.cancelled) setMessage('No access granted, so nothing was read.');
      else {
        setMessage(r.found ? `Found ${r.found} subscription${r.found === 1 ? '' : 's'} (${r.created} new).` : 'No new subscriptions found.');
        void refresh();
      }
    } catch (e: any) {
      setMessage(e?.message ? `Scan failed: ${e.message}` : 'Scan failed.');
    } finally {
      setBusy(null);
      void load();
    }
  };

  const disconnect = async (p: InboxProvider) => {
    setBusy(p);
    await disconnectInbox(p);
    setBusy(null);
    setMessage(`${p === 'gmail' ? 'Gmail' : 'Outlook'} disconnected. Subscriptions already found stay in EZER.`);
    void load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: layout.screenX, paddingBottom: layout.contentBottom }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenBody>
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>Inbox</Text>
          </View>

          <SectionHeader style={styles.section}>What EZER reads</SectionHeader>
          <Surface style={{ padding: 16, gap: 10 }}>
            {[
              ['search-outline', 'Only emails whose subject mentions a receipt, invoice, subscription, trial, renewal or billing.'],
              ['phone-portrait-outline', 'They are read on this phone. Email text never reaches EZER’s servers.'],
              ['list-outline', 'Only the subscription details are saved: merchant, price, billing cycle, next charge, trial end and cancel link.'],
              ['close-circle-outline', 'No ads, no selling, no people reading your mail, no AI training. Read-only: EZER cannot send, delete or change anything.'],
            ].map(([icon, line]) => (
              <View key={line} style={styles.point}>
                <Ionicons name={icon as any} size={17} color={colors.accInk} style={{ marginTop: 1 }} />
                <Body style={{ flex: 1, lineHeight: 19 }}>{line}</Body>
              </View>
            ))}
            <PressScale onPress={() => void Linking.openURL(PRIVACY_URL)}>
              <Text style={[styles.link, { color: colors.gold }]}>Privacy policy</Text>
            </PressScale>
          </Surface>

          <SectionHeader style={styles.section}>Inboxes</SectionHeader>
          <Surface style={{ paddingHorizontal: 14 }}>
            {PROVIDERS.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.line }} />}
                <View style={styles.row}>
                  <Ionicons name={p.icon} size={20} color={colors.ink} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kvValue, { color: colors.ink }]}>{p.label}</Text>
                    <Body style={{ marginTop: 2 }}>
                      {busy === p.id ? 'Working…' : last[p.id] ? `Last scanned ${last[p.id]!.toLocaleDateString()}` : 'Not connected'}
                    </Body>
                  </View>
                  {last[p.id] && (
                    <PressScale onPress={() => void disconnect(p.id)} disabled={!!busy}>
                      <Text style={[styles.action, { color: colors.mut }]}>Disconnect</Text>
                    </PressScale>
                  )}
                  <PressScale onPress={() => void scan(p.id)} disabled={!!busy}>
                    <View style={[styles.btn, { borderColor: colors.line2, opacity: busy ? 0.6 : 1 }]}>
                      <Text style={[styles.action, { color: colors.ink }]}>{last[p.id] ? 'Scan' : 'Connect'}</Text>
                    </View>
                  </PressScale>
                </View>
              </View>
            ))}
          </Surface>
          {message && <Body style={{ marginTop: 10 }}>{message}</Body>}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 24, marginBottom: 10 },
  point: { flexDirection: 'row', gap: 10 },
  link: { fontFamily: fontFamily.semibold, fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  kvValue: { fontFamily: fontFamily.semibold, fontSize: 14 },
  btn: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  action: { fontFamily: fontFamily.semibold, fontSize: 13 },
});
