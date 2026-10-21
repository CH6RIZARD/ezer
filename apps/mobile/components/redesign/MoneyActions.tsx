// =============================================================================
// EZER Redesign — Add / Withdraw / Move ("SavingsTab" handoff, TOTAL SAVED card)
//
// The three money buttons under a balance. ONE row for the Savings tab's hero
// and the goal screen's, so they can never drift; each opens MoveMoneySheet in
// the mode tapped. The caller decides what is disabled. With `dim` (the goal
// screen) a disabled button also dims, so "nothing to withdraw" reads before
// the tap; the Savings tab's never dimmed and still doesn't.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius, layout, motion } from '../../theme/type';
import { PressScale } from './Primitives';
import type { MoveMode } from './MoveMoneySheet';

const BUTTONS = [
  { mode: 'add', title: 'Add', icon: 'add', size: 16 },
  { mode: 'withdraw', title: 'Withdraw', icon: 'arrow-up', size: 15 },
  { mode: 'move', title: 'Move', icon: 'swap-horizontal', size: 15 },
] as const;

export default function MoneyActions({
  onPress,
  disabled = {},
  dim = false,
}: {
  onPress: (mode: MoveMode) => void;
  disabled?: Partial<Record<MoveMode, boolean>>;
  /** Disabled buttons also dim (the goal screen). */
  dim?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.actions}>
      {BUTTONS.map(b => {
        const primary = b.mode === 'add';
        const off = !!disabled[b.mode];
        const fg = primary ? '#FFFFFF' : colors.ink;
        return (
          <PressScale
            key={b.mode}
            onPress={() => onPress(b.mode)}
            scaleTo={motion.pressScaleStrong}
            style={[styles.actionSlot, dim && off && styles.off]}
            disabled={off}
          >
            <View
              style={[
                styles.actionBtn,
                primary
                  ? { backgroundColor: colors.accent }
                  : { backgroundColor: colors.bg2, borderColor: colors.line, borderWidth: 1 },
              ]}
            >
              <Ionicons name={b.icon} size={b.size} color={fg} />
              <Text style={[styles.actionText, { color: fg }]}>{b.title}</Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionSlot: {
    flex: 1,
  },
  off: {
    opacity: 0.45,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.button,
    minHeight: layout.hitTarget,
  },
  actionText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
});
