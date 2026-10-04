// =============================================================================
// EZER Redesign — EMV chip with real depth
//
// Replaces the flat 40x29 gradient rectangle both card fronts used to carry.
// Four layers sell the depth, the same way light sells a real chip:
//   1. a recessed WELL — a darker ring around the chip, shaded from the top,
//      lit at its bottom lip: the chip is seated IN the card, not stuck on
//      it (a drop shadow is the sticker look; a seated chip casts none);
//   2. metal body — diagonal gold gradient plus a bevel overlay: inset top
//      highlight where light lands, inset bottom shade where it falls away;
//   3. engraved contact grooves — the classic EMV pattern drawn TWICE in one
//      SVG: a light stroke offset 0.75px below a dark one, so every groove
//      has a shaded cut and a lit lower lip (that offset pair IS the
//      engraving illusion; remove either stroke and it goes flat again);
//   4. a faint diagonal glint sweep so the metal reads curved, not printed.
//
// Shared by VirtualCard.tsx and CardCanvas.tsx (physical-card designer and
// the finished-design spin preview); change the look here and every card
// front follows. Scales as a vector: pass `width` and the grooves, bevel
// radii and strokes all scale with the viewBox.
// =============================================================================

import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Rect } from 'react-native-svg';

/** Design-space geometry; everything scales off these via the viewBox. */
const W = 44;
const H = 33;
const R = 7;
/** Ring of recessed card visible around the seated chip, design units. */
const WELL_PAD = 3;

/** Gold family of gradients.metalEdge, widened to four stops so the body
 *  has a bright shoulder and a deep heel instead of a flat sheen. */
const CHIP_METAL = ['#F3DDA6', '#E7C77E', '#C49A4E', '#A87D2F'] as const;
const CHIP_METAL_LOCATIONS = [0, 0.35, 0.72, 1] as const;

const GROOVE_DARK = 'rgba(74, 52, 14, 0.55)';
const GROOVE_LIGHT = 'rgba(255, 243, 214, 0.6)';

/** Classic EMV contact layout: outer groove, centre pad, three horizontal
 *  contact cuts a side, and the two vertical stubs into the pad. Fresh
 *  elements per call because the pattern is rendered twice (light + dark). */
const grooves = () => (
  <>
    <Rect x={3.5} y={3.5} width={37} height={26} rx={5} />
    <Rect x={16.5} y={10.5} width={11} height={12} rx={2} />
    <Path d="M3.5 8.5H16.5 M3.5 16.5H16.5 M3.5 24.5H16.5 M27.5 8.5H40.5 M27.5 16.5H40.5 M27.5 24.5H40.5 M22 3.5V10.5 M22 22.5V29.5" />
  </>
);

export interface CardChipProps {
  /** Rendered width; height keeps the 44:33 chip ratio. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}

export function CardChip({ width = W, style }: CardChipProps) {
  const s = width / W;
  const h = H * s;
  const r = R * s;

  const pad = WELL_PAD * s;

  return (
    <View
      style={[
        {
          width: width + pad * 2,
          height: h + pad * 2,
          borderRadius: r + pad,
          alignItems: 'center',
          justifyContent: 'center',
          // The milled pocket the chip is seated in — this ring is what makes
          // it read as cut INTO the card rather than stuck on top: darker
          // than any card finish, shaded from the top where the pocket wall
          // blocks the light, a faint lit lip at the bottom. The chip covers
          // the centre, so these edge-hugging insets paint exactly on the
          // exposed ring. (No drop shadow anywhere: a seated chip casts none.)
          backgroundColor: 'rgba(0,0,0,0.25)',
          boxShadow:
            'inset 0 1.5px 2.5px rgba(0,0,0,0.5), inset 0 -1px 1px rgba(255,255,255,0.12)',
        },
        style,
      ]}
    >
      <View style={{ width, height: h, borderRadius: r }}>
      <LinearGradient
        colors={CHIP_METAL as unknown as readonly [string, string, ...string[]]}
        locations={CHIP_METAL_LOCATIONS as unknown as readonly [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      {/* Glint sweep, bottom-left to top-right across the grain. Narrow and
          faint — at 44px wide, anything stronger reads as wash, not shine. */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        locations={[0.38, 0.5, 0.62]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <Svg width={width} height={h} viewBox={`0 0 ${W} ${H}`}>
        {/* Lit lower lip first, shaded cut on top — the order matters. */}
        <G stroke={GROOVE_LIGHT} strokeWidth={1} fill="none" transform="translate(0, 0.75)">
          {grooves()}
        </G>
        <G stroke={GROOVE_DARK} strokeWidth={1} fill="none">
          {grooves()}
        </G>
      </Svg>
      {/* The bevel, LAST so it paints above the metal and grooves: light
          catches the top edge, the bottom edge falls into shade. This was on
          the wrapper before, where the gradient children covered it — the
          chip shipped flat, which was the whole complaint. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            boxShadow:
              'inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1.5px 2px rgba(0,0,0,0.3)',
          },
        ]}
      />
      </View>
    </View>
  );
}

export default CardChip;
