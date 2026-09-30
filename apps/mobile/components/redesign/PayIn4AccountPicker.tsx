// =============================================================================
// EZER Redesign — Pay in 4 account picker sheet
//
// Patch 3 of PATCH-NOTES-early-access-sheet.md (3a·3): "Change" on Settings'
// "Pay in 4 pays from" card opens this. A radio list of every eligible
// (non-credit) linked account across every connected bank, plus "Connect a
// new bank" for someone who wants to fund Pay in 4 from an account they
// haven't linked yet. Saving calls POST /cards/pay-in4-account, which sets
// User.payIn4InstrumentId AND re-runs the real assessment against it
// server-side (trustScoring.ts) — this sheet shows that re-check happening,
// it doesn't compute anything itself.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius, motion } from '../../theme/type';
import { Body, PressScale } from './Primitives';
import { type LinkedBanksData, type LinkedBankAccount, initialFor, tintFor } from '../../utils/linkedBanks';
import { api } from '../../utils/api';
import { useConnectBank } from '../../utils/useConnectBank';
import {
  saveSpendingPowerOutcome,
  mirrorServerAccessOutcome,
  mapServerStatus,
  type CardAccessOutcome,
} from '../../utils/cardDesignStore';

type Row = LinkedBankAccount & { bankName: string | null };

export default function PayIn4AccountPicker({
  visible,
  data,
  onClose,
  onSaved,
}: {
  visible: boolean;
  data: LinkedBanksData | null;
  onClose: () => void;
  /** Called after a successful save, so the caller can refetch. */
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const connectBank = useConnectBank();

  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setPending(data?.payIn4InstrumentId ?? null);
  }, [visible, data?.payIn4InstrumentId]);

  const rows: Row[] = (data?.items ?? []).flatMap(item =>
    item.accounts.filter(a => a.eligibleForPayIn4).map(a => ({ ...a, bankName: item.institutionName }))
  );

  const changed = pending !== (data?.payIn4InstrumentId ?? null);

  const handleSave = async () => {
    if (!changed || !pending || saving) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{
        data?: { status?: string; limitCents?: number };
        status?: string;
        limitCents?: number;
      }>('/cards/pay-in4-account', { instrumentId: pending });
      const payload = res?.data ?? res;
      const status = mapServerStatus(payload?.status) ?? 'approved';
      const limitCents = typeof payload?.limitCents === 'number' ? payload.limitCents : null;
      const outcome: CardAccessOutcome = { status, limitCents, joinedAt: new Date().toISOString() };
      await saveSpendingPowerOutcome(outcome);
      await mirrorServerAccessOutcome(outcome);
    } catch {
      // Best-effort mirror — the server-side change already landed even if
      // this local cache update fails; onSaved()'s refetch is the real
      // source of truth for this screen either way.
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleConnectNew = () => {
    void connectBank.connect(onSaved);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Pressable>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />

          <Text style={[styles.eyebrow, { color: colors.mut }]}>PAY IN 4</Text>
          <Text style={[styles.headline, { color: colors.ink }]}>
            Which account pays the installments?
          </Text>
          <Body style={{ marginTop: 10, lineHeight: 19 }}>
            Checking or savings only. Your spending power is worked out from this account&rsquo;s
            deposits and balance.
          </Body>

          <ScrollView style={{ marginTop: 18, maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8 }}>
              {rows.map(row => {
                const on = row.instrumentId === pending;
                return (
                  <Pressable
                    key={row.instrumentId}
                    onPress={() => setPending(row.instrumentId)}
                    disabled={saving}
                    style={[
                      styles.row,
                      { borderColor: on ? colors.gold : colors.line, backgroundColor: on ? colors.goldSoft : colors.bg2 },
                    ]}
                  >
                    <View style={[styles.radio, { borderColor: on ? colors.gold : colors.line2, backgroundColor: on ? colors.gold : 'transparent' }]}>
                      {on && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                    </View>
                    <View style={[styles.bankTile, { backgroundColor: tintFor(row.bankName) ?? colors.accInk }]}>
                      <Text style={styles.bankTileText}>{initialFor(row.bankName)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>
                        {row.bankName ? `${row.bankName} · ${row.displayName}` : row.displayName}
                      </Text>
                      <Text style={[styles.rowSub, { color: colors.mut }]}>{`•••• ${row.last4}`}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={handleConnectNew}
                disabled={connectBank.busy || saving}
                style={[styles.row, styles.rowDashed, { borderColor: colors.line2 }]}
              >
                <View style={{ width: 22, alignItems: 'center' }}>
                  <Ionicons name="add" size={18} color={colors.mut} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.mut }]}>
                    {connectBank.busy ? connectBank.label : 'Connect a new bank'}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.mut2 }]}>
                    Via Plaid · read for subscriptions by default
                  </Text>
                </View>
              </Pressable>
            </View>
          </ScrollView>

          <Text style={[styles.finePrint, { color: colors.mut3 }]}>
            {changed
              ? 'Switching accounts re-runs the spending-power check (a soft check, no effect on your credit score).'
              : "Credit cards can't fund Pay in 4, so they're not listed."}
          </Text>

          <PressScale onPress={handleSave} scaleTo={motion.pressScale} disabled={saving} style={{ marginTop: 18 }}>
            <View style={[styles.cta, { backgroundColor: colors.ink, opacity: saving ? 0.6 : 1 }]}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.ctaText}>{changed ? 'Save · re-check spending power' : 'Keep current account'}</Text>
              )}
            </View>
          </PressScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  eyebrow: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  headline: { fontFamily: fontFamily.serif, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  rowDashed: { borderStyle: 'dashed' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankTile: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bankTileText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#FFFFFF' },
  rowTitle: { fontFamily: fontFamily.semibold, fontSize: 14 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },
  finePrint: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 14 },
  cta: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF' },
});
