// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The free-drag spin physics live in SpinCard.tsx (a "hard requirement" per
// the handoff, and shared with Card Studio's finished-design review so there
// is exactly one implementation of it). This file owns only what is specific
// to the Pay in 4 card: its front/back content and the tap-to-reveal number.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { gradients, cardFinishes, type CardFinish } from '../../theme/tokens';
import { fontFamily, radius } from '../../theme/type';
import SpinCard from './SpinCard';

const NUMBER_MASKED = '••••  ••••  ••••  ••••';
const NUMBER_REAL = '5312 7702 4401 8873';

export interface VirtualCardProps {
  finish?: CardFinish;
  style?: StyleProp<ViewStyle>;
  /**
   * Fired when a turn starts/ends. The parent screen uses this to switch its
   * ScrollView off, so a vertical drag on the card rotates it instead of
   * scrolling the page.
   */
  onDragChange?: (dragging: boolean) => void;
}

export function VirtualCard({ finish = 'amethyst', style, onDragChange }: VirtualCardProps) {
  const [revealed, setRevealed] = useState(false);
  const finishColors = cardFinishes[finish];

  return (
    <SpinCard
      style={style}
      onDragChange={onDragChange}
      onTap={() => setRevealed(v => !v)}
      hint="Drag to spin it around · tap to reveal/hide the number"
      front={
        <LinearGradient
          colors={finishColors as unknown as readonly [string, string, ...string[]]}
          locations={gradients.cardFrontLocations as unknown as readonly [number, number, ...number[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, styles.facePad]}
        >
          <View style={styles.rowBetween}>
            <LinearGradient
              colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.chip}
            />
            <Ionicons name="wifi" size={20} color="rgba(255,255,255,.85)" />
          </View>

          <Text selectable={false} style={styles.number}>{revealed ? NUMBER_REAL : NUMBER_MASKED}</Text>

          <View style={styles.rowBetween}>
            <View>
              <Text selectable={false} style={styles.cardLabel}>CARDHOLDER</Text>
              <Text selectable={false} style={styles.cardValue}>EZER MEMBER</Text>
            </View>
            <View>
              <Text selectable={false} style={styles.cardLabel}>
                {revealed ? 'EXPIRES' : 'STATUS'}
              </Text>
              <Text selectable={false} style={styles.cardValue}>
                {revealed ? '09/29' : 'PREVIEW'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      }
      back={
        <LinearGradient
          colors={gradients.cardBack as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          <View style={styles.magStripe} />
          <View style={styles.signatureRow}>
            <View style={styles.signature}>
              <Text selectable={false} style={styles.cvv}>•••</Text>
            </View>
          </View>
          <Text selectable={false} style={styles.backNote}>SINGLE-USE VIRTUAL CARD</Text>
        </LinearGradient>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    borderRadius: radius.virtualCard,
  },
  facePad: {
    padding: 18,
    justifyContent: 'space-between',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chip: {
    width: 40,
    height: 29,
    borderRadius: 6,
  },
  number: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    letterSpacing: 1.6,
    color: '#FFFFFF',
  },
  cardLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,.55)',
    marginBottom: 3,
  },
  cardValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#FFFFFF',
  },
  magStripe: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: '#000000',
  },
  signatureRow: {
    marginTop: 78,
    paddingHorizontal: 18,
  },
  signature: {
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,.9)',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 10,
  },
  cvv: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: '#1A1A1A',
    letterSpacing: 2,
  },
  backNote: {
    position: 'absolute',
    bottom: 16,
    left: 18,
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,.5)',
  },
});

export default VirtualCard;
