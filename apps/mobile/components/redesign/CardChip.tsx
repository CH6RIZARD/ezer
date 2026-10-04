// =============================================================================
// EZER Redesign — EMV chip with real depth
//
// Replaces the flat 40x29 gradient rectangle both card fronts used to carry.
// Three layers sell the depth, the same way light sells a real chip:
//   1. a recessed WELL — a darker ring around the chip, shaded from the top,
//      lit at its bottom lip: the chip is seated IN the card, not stuck on
//      it (a drop shadow is the sticker look; a seated chip casts none);
//   2. metal body — diagonal gold gradient plus a bevel overlay: inset top
//      highlight where light lands, inset bottom shade where it falls away;
//   3. a faint diagonal glint sweep so the metal reads curved, not printed.
// PLAIN metal, no engraved EMV contact lines: the owner chose the plain chip
// (Oct 2026). The lines were an SVG that only ever drew on native, so web and
// the APK disagreed; do not add them back.
//
// Shared by VirtualCard.tsx and CardCanvas.tsx (physical-card designer and
// the finished-design spin preview); change the look here and every card
// front follows. Pass `width`; the radii and the well scale with it.
// =============================================================================

import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Design-space geometry; everything scales off these with `width`. */
const W = 44;
const H = 33;
const R = 7;
/** Ring of recessed card visible around the seated chip, design units. */
const WELL_PAD = 3;

/** Gold family of gradients.metalEdge, widened to four stops so the body
 *  has a bright shoulder and a deep heel instead of a flat sheen. */
const CHIP_METAL = ['#F3DDA6', '#E7C77E', '#C49A4E', '#A87D2F'] as const;
const CHIP_METAL_LOCATIONS = [0, 0.35, 0.72, 1] as const;

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
          backgroundColor: 'rgba(0,0,0,0.32)',
          boxShadow:
            'inset 0 2px 3px rgba(0,0,0,0.55), inset 0 -1px 1px rgba(255,255,255,0.14)',
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
      {/* The card's overhang shading the chip's top — the strongest "it sits
          BELOW the surface" cue a flat render can give. A surface-mounted
          chip is lit evenly; a seated one is darkest right under the lip. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.45 }}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      {/* The bevel, LAST so it paints above the metal and glint: light
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
