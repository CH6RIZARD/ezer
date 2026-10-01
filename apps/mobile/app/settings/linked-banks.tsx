// =============================================================================
// EZER Redesign — Settings › Linked banks (3a·1 of
// PATCH-NOTES-early-access-sheet.md's Patch 3)
//
// Its OWN screen, reached by tapping "Linked banks" on the main Settings
// list — NOT inlined into settings.tsx. The mock's 3a·1 has its own
// back-arrow header ("‹ Linked banks"), matching every other settings
// sub-page (settings/account.tsx). This was built directly into
// settings.tsx the first time, which is why it never looked like the mock:
// there was no "Linked banks" row to tap at all, just the content sitting
// inline on the main page.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import { useConnectBank } from '../../utils/useConnectBank';
import { fetchLinkedBanks, payIn4AccountFor, type LinkedBanksData } from '../../utils/linkedBanks';
import { formatCents } from '../../utils/calculations';
import { getSpendingPowerOutcome } from '../../utils/cardDesignStore';
import PayIn4AccountPicker from '../../components/redesign/PayIn4AccountPicker';
import BankTile from '../../components/redesign/BankTile';

export default function LinkedBanksScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const connectBank = useConnectBank();

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
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>Linked banks</Text>
          </View>

          {/*
            Turn 3 model (PATCH-NOTES-early-access-sheet.md, "Patch 3"):
            Pay in 4 has exactly ONE funding account (User.payIn4InstrumentId,
            set via the picker sheet below or auto-picked by
            trustScoring.ts's resolvePayIn4Instrument the first time an
            assessment runs). Every OTHER linked bank is read for
            subscriptions unless the user turned that off for it specifically
            (PlaidItem.readForSubscriptions, flipped on BankDetail.tsx).
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
                      <BankTile institutionName={p4Item.institutionName} networkArt={p4Item.networkArt} size={40} />
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
            {linkedBanks && linkedBanks.items.length > 0 && <Body>{linkedBanks.items.length} connected</Body>}
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
                          <BankTile institutionName={item.institutionName} networkArt={item.networkArt} />
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

          {/* Same hook as the dashboard call-out, so linking behaves
              identically wherever it starts: Link -> exchange -> sync ->
              refresh. */}
          <PressScale
            onPress={() => void connectBank.connect(loadLinkedBanks)}
            disabled={connectBank.busy}
            style={{ marginTop: 16 }}
          >
            <View style={[styles.connectBtn, { borderColor: colors.line2, opacity: connectBank.busy ? 0.7 : 1 }]}>
              <Ionicons name={connectBank.busy ? 'sync-outline' : 'add'} size={18} color={colors.ink} />
              <Text style={[styles.connectBtnText, { color: colors.ink }]}>
                {connectBank.busy ? connectBank.label : 'Connect a bank'}
              </Text>
            </View>
          </PressScale>

          {connectBank.error && <Body style={{ marginTop: 8, color: colors.red }}>{connectBank.error}</Body>}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 24, marginBottom: 10 },
  block: { paddingHorizontal: 14 },
  kvValue: { fontFamily: fontFamily.semibold, fontSize: 14 },
  divider: { height: 1 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  p4Card: { borderRadius: radius.cardLg, borderWidth: 1, padding: 14 },
  p4Head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  p4Footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  p4Amount: { fontFamily: fontFamily.serif, fontSize: 26 },
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
  mono: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },
  changeLink: { fontFamily: fontFamily.semibold, fontSize: 13 },
  chip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  readLabel: { fontFamily: fontFamily.medium, fontSize: 11.5 },
  connectBtn: {
    height: 52,
    borderRadius: radius.buttonLg,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectBtnText: { fontFamily: fontFamily.bold, fontSize: 15 },
});
