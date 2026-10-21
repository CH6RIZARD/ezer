// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The free-drag spin physics live in SpinCard.tsx (a "hard requirement" per
// the handoff, and shared with Card Studio's finished-design review so there
// is exactly one implementation of it). This file owns only what is specific
// to the Pay in 4 card: which faces it shows.
//
// There is NO tap-to-reveal. GET /cards/highnote returns only last4 + expiry,
// never the full number (PAN), so an issued card cannot be revealed from what
// this app holds; a real reveal needs Highnote's PCI-scoped secure display.
// The preview card's "revealed" number (and its 09/29 expiry) was invented,
// which is worse than showing nothing. Keep it masked.
//
// Both faces are Card Studio's own, CardFrontFace (chip, logo, artwork) and
// CardBackFace, so a saved design shows here exactly as the designer drew it
// (owner, Oct 18 2026: "if you customize a card ... your pay in 4 tab
// reflects your design"). Nothing is written on the front: the number, name
// and expiry are on the back (owner, Oct 21 2026: the front's CARDHOLDER /
// STATUS PREVIEW rows were "slop, the content is on the back").
// =============================================================================

import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { type CardFinish } from '../../theme/tokens';
import SpinCard from './SpinCard';
import { CardFrontFace, CardBackFace, type Stroke } from './CardCanvas';

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
  return (
    <SpinCard
      style={style}
      onDragChange={onDragChange}
      front={<CardFrontFace finish={f} strokes={design?.strokes ?? NO_STROKES} />}
      back={<CardBackFace finish={f} last4={issued?.last4} expiry={issued?.expiry} note="SINGLE-USE VIRTUAL CARD" />}
    />
  );
}

export default VirtualCard;
