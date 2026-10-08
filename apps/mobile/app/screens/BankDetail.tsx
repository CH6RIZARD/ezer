// =============================================================================
// EZER Redesign — Bank detail (Settings › Linked banks › a bank)
//
// Patch 3 of PATCH-NOTES-early-access-sheet.md (3a·2). Reached by tapping a
// bank row in settings.tsx. Three things live here, all real server calls:
//   - Accounts: which ones exist, and "Use for Pay in 4" on the eligible
//     (non-credit) ones that aren't already the funding account.
//   - Subscriptions: the per-bank read/don't-read switch
//     (PlaidItem.readForSubscriptions).
//   - Disconnect: revokes this ONE bank via Plaid, unlike account
//     deletion's revoke-everything.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { Alert } from '../../utils/appAlert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, Label, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import { useData } from '../../contexts/DataContext';
import { fetchLinkedBanks, type LinkedBankItem } from '../../utils/linkedBanks';
import BankTile from '../../components/redesign/BankTile';
import { api } from '../../utils/api';

function typeLabel(subtype: string | null): string {
  if (!subtype) return 'Account';
  return subtype.charAt(0).toUpperCase() + subtype.slice(1);
}

export default function BankDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { refresh: refreshWallet } = useData();
  const params = useLocalSearchParams<{ itemId: string }>();

  const [item, setItem] = useState<LinkedBankItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [readBusy, setReadBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchLinkedBanks();
    setItem(data?.items.find(i => i.itemId === params.itemId) ?? null);
    setLoading(false);
  }, [params.itemId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const makePayIn4 = async (instrumentId: string) => {
    if (busyAccountId) return;
    setBusyAccountId(instrumentId);
    try {
      await api.post('/cards/pay-in4-account', { instrumentId });
    } catch {
      // The row simply won't show the new chip — load() below is the real
      // source of truth and will reflect whatever the server actually did.
    }
    await load();
    setBusyAccountId(null);
  };

  const toggleRead = async (enabled: boolean) => {
    if (!item || readBusy) return;
    setReadBusy(true);
    try {
      await api.post(`/plaid/items/${item.itemId}/read-for-subscriptions`, { enabled });
    } catch {
      // Best-effort — load() reconciles either way.
    }
    await Promise.all([load(), refreshWallet()]);
    setReadBusy(false);
  };

  const disconnect = () => {
    if (!item) return;
    Alert.alert(
      `Disconnect ${item.institutionName ?? 'this bank'}?`,
      item.accounts.some(a => a.isPayIn4)
        ? 'Pay in 4 pays from this bank. Disconnecting it removes your spending power until you pick another account.'
        : "This removes the bank's access and stops reading it for subscriptions.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await api.del(`/plaid/items/${item.itemId}`);
              await refreshWallet();
              router.back();
            } catch {
              setDisconnecting(false);
              Alert.alert('Could not disconnect', 'Please try again.');
            }
          },
        },
      ]
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
      >
        <ScreenBody>
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            {item && (
              <View style={{ marginLeft: 12 }}>
                <BankTile institutionName={item.institutionName} networkArt={item.networkArt} size={36} />
              </View>
            )}
            <Text
              style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 10, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {item?.institutionName ?? (loading ? '' : 'Bank')}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.gold} />
          ) : !item ? (
            <Body style={{ marginTop: 24 }}>This bank is no longer connected.</Body>
          ) : (
            <>
              <View style={styles.sinceRow}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.success} />
                <Body style={{ marginLeft: 8 }}>
                  Connected via Plaid ·{' '}
                  {new Date(item.connectedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Body>
              </View>

              <SectionHeader style={styles.section}>Accounts</SectionHeader>
              <Surface style={styles.block}>
                {item.accounts.map((a, i) => (
                  <View key={a.instrumentId}>
                    {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
                    <View style={styles.accountRow}>
                      <Ionicons
                        name={a.type === 'card' ? 'card-outline' : 'business-outline'}
                        size={19}
                        color={colors.mut}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.kvValue, { color: colors.ink }]} numberOfLines={1}>
                          {a.displayName}
                        </Text>
                        <Body style={{ marginTop: 2 }}>{`${typeLabel(a.subtype)} · •••• ${a.last4}`}</Body>
                      </View>
                      {a.isPayIn4 ? (
                        <View style={[styles.chip, { backgroundColor: colors.goldSoft }]}>
                          <Text style={[typeScale.labelSm, { color: colors.gold }]}>PAY IN 4</Text>
                        </View>
                      ) : a.eligibleForPayIn4 ? (
                        <Pressable onPress={() => makePayIn4(a.instrumentId)} disabled={busyAccountId === a.instrumentId}>
                          {busyAccountId === a.instrumentId ? (
                            <ActivityIndicator size="small" color={colors.gold} />
                          ) : (
                            <Text style={[styles.useForP4, { color: colors.gold }]}>Use for Pay in 4</Text>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Surface>

              <SectionHeader style={styles.section}>Subscriptions</SectionHeader>
              <Surface style={[styles.block, styles.readRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kvValue, { color: colors.ink }]}>Read this bank for subscriptions</Text>
                  <Body style={{ marginTop: 3, lineHeight: 17 }}>
                    {item.readForSubscriptions
                      ? 'Ezer reads charges on these accounts to find recurring payments.'
                      : 'Connected for Pay in 4 only. Turn on to find subscriptions here too.'}
                  </Body>
                </View>
                {readBusy ? (
                  <ActivityIndicator color={colors.accInk} />
                ) : (
                  <Switch
                    value={item.readForSubscriptions}
                    onValueChange={toggleRead}
                    trackColor={{ false: colors.line2, true: colors.accInk }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </Surface>

              {item.accounts.some(a => a.isPayIn4) && (
                <Body style={{ marginTop: 14, textAlign: 'center', fontSize: 11.5, lineHeight: 16 }}>
                  Pay in 4 pays from this bank. Disconnecting it removes your spending power until you
                  pick another account.
                </Body>
              )}
              <PressScale onPress={disconnect} scaleTo={motionPress} disabled={disconnecting} style={{ marginTop: 14 }}>
                <View style={[styles.disconnect, { borderColor: colors.line2, opacity: disconnecting ? 0.6 : 1 }]}>
                  {disconnecting ? (
                    <ActivityIndicator color={colors.red} />
                  ) : (
                    <>
                      <Ionicons name="unlink-outline" size={18} color={colors.red} />
                      <Text style={[styles.disconnectText, { color: colors.red }]}>
                        Disconnect {item.institutionName ?? 'bank'}
                      </Text>
                    </>
                  )}
                </View>
              </PressScale>
            </>
          )}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const motionPress = 0.97;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sinceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 50 },
  section: { marginTop: 24, marginBottom: 10 },
  block: { paddingHorizontal: 14 },
  divider: { height: 1 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  kvValue: { fontFamily: fontFamily.semibold, fontSize: 14 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  useForP4: { fontFamily: fontFamily.semibold, fontSize: 12 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  disconnect: {
    height: 52,
    borderRadius: radius.buttonLg,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disconnectText: { fontFamily: fontFamily.bold, fontSize: 15 },
});
