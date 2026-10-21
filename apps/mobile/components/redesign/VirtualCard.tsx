// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The free-drag spin physics live in SpinCard.tsx (a "hard requirement" per
// the handoff, and shared with Card Studio's finished-design review so there
// is exactly one implementation of it). This file owns only what is specific
// to the Pay in 4 card: its front/back content.
//
// There is NO tap-to-reveal. GET /cards/highnote returns only last4 + expiry,
// never the full number (PAN), so an issued card cannot be revealed from what
// this app holds; a real reveal needs Highnote's PCI-scoped secure display.
// The preview card's "revealed" number (and its 09/29 expiry) was invented,
// which is worse than showing nothing. Keep it masked.
//
// The front is Card Studio's own CardFrontFace (chip, logo, artwork), so a
// saved design shows here exactly as the designer drew it (owner, Oct 18
// 2026: "if you customize a card ... your pay in 4 tab reflects your
// design"). The number and cardholder rows sit on top of it.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, cardBackFinishes, isDarkFinish, type CardFinish } from '../../theme/tokens';
import { fontFamily, radius } from '../../theme/type';
import SpinCard from './SpinCard';
import { CardFrontFace, CHIP_BOTTOM, type Stroke } from './CardCanvas';

const NUMBER_MASKED = '••••  ••••  ••••  ••••';
const NO_STROKES: Stroke[] = [];

export interface VirtualCardProps {
  finish?: CardFinish;
  style?: StyleProp<ViewStyle>;
  /**
   * Fired when a turn starts/ends. The parent screen uses this to switch its
   * ScrollView off, so a vertical drag on the card rotates it instead of
   * scrolling the page.
   */
  onDragChange?: (dragging: boolean) => void;
  /** Issued card (Highnote TEST). Absent = the preview card. */
  issued?: { last4: string; expiry: string };
  /** The design saved in Card Studio. Absent = the plain `finish` card. */
  design?: { finish: CardFinish; strokes: Stroke[] };
}

export function VirtualCard({ finish = 'amethyst', style, onDragChange, issued, design }: VirtualCardProps) {
  const f = design?.finish ?? finish;
  // Text is white on the dark finishes and Card Studio's ink on bone.
  const ink = isDarkFinish(f) ? '#FFFFFF' : '#241A38';
  const sub = isDarkFinish(f) ? 'rgba(255,255,255,.55)' : 'rgba(36,26,56,.55)';

  return (
    <SpinCard
      style={style}
      onDragChange={onDragChange}
      front={
        <View style={[styles.fill, styles.clip]}>
          <CardFrontFace finish={f} strokes={design?.strokes ?? NO_STROKES} />
          <View style={[StyleSheet.absoluteFill, styles.facePad]} pointerEvents="none">
            {/* The number row starts below the chip, as on a real card (18 = facePad). */}
            <View style={{ height: CHIP_BOTTOM - 18 }} />

            <Text selectable={false} style={[styles.number, { color: ink }]}>
              {issued ? `••••  ••••  ••••  ${issued.last4}` : NUMBER_MASKED}
            </Text>

            <View style={styles.rowBetween}>
              <View>
                <Text selectable={false} style={[styles.cardLabel, { color: sub }]}>CARDHOLDER</Text>
                <Text selectable={false} style={[styles.cardValue, { color: ink }]}>EZER MEMBER</Text>
              </View>
              <View>
                <Text selectable={false} style={[styles.cardLabel, { color: sub }]}>
                  {issued ? 'EXPIRES' : 'STATUS'}
                </Text>
                <Text selectable={false} style={[styles.cardValue, { color: ink }]}>
                  {issued ? issued.expiry : 'PREVIEW'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      }
      back={
        <LinearGradient
          colors={(design ? cardBackFinishes[design.finish] : gradients.cardBack) as unknown as readonly [string, string, ...string[]]}
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
          <Text selectable={false} style={[styles.backNote, design && { color: sub }]}>SINGLE-USE VIRTUAL CARD</Text>
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
  clip: {
    overflow: 'hidden',
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
