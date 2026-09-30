// =============================================================================
// BankCardFace — the wallet's linked-bank card, for every art tier
//
// One component draws all five sources from utils/cardArt/resolver.ts so the
// wallet carousel and the picker preview cannot drift apart (the same reason
// CardCanvas.tsx owns the physical card's layout).
//
//   gradient tiers   bank name, logo, chip, masked number, holder, subs pill.
//   user_photo       the photo full-bleed; the printed-number band is covered
//                    and our own "•••• 1234" drawn over it.
//   network_token    the network's art, untouched. Visa/Mastercard display
//                    rules allow only rounded corners plus last-4 (and/or the
//                    cardholder name) at the bottom-left, "Visa 4865" for Visa;
//                    nothing else may sit on the art, so the subs pill is
//                    omitted on this tier. Falls back to the gradient card if
//                    the image fails to load.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { gradients } from '../../theme/tokens';
import { fontFamily, radius } from '../../theme/type';
import type { DesignPattern, ResolvedCardArt } from '../../utils/cardArt/types';

export interface BankCardFaceProps {
  art: ResolvedCardArt;
  bankName: string;
  /** The account's own nickname ("Spend"), shown after the holder's name. */
  accountLabel?: string;
  /** Card network, e.g. "VISA". "CARD" when unknown. */
  network: string;
  last4: string;
  holderName: string;
  /** Text for the pill at bottom-right, e.g. "6 subs". Omit to hide the pill. */
  subsLabel?: string;
  width: number;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

const SHEEN = ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.05)'] as const;

/** Faint decorative texture, drawn in the text colour at low opacity. */
function PatternLayer({ pattern, color, w, h }: { pattern: DesignPattern; color: string; w: number; h: number }) {
  if (pattern === 'solid') return null;
  return (
    <Svg
      pointerEvents="none"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={StyleSheet.absoluteFillObject}
    >
      {pattern === 'wave' && (
        <>
          <Path
            d={`M0 ${h * 0.7} C ${w * 0.25} ${h * 0.5}, ${w * 0.5} ${h * 0.95}, ${w} ${h * 0.58} L ${w} ${h} L 0 ${h} Z`}
            fill={color}
            opacity={0.08}
          />
          <Path
            d={`M0 ${h * 0.84} C ${w * 0.3} ${h * 0.68}, ${w * 0.6} ${h * 1.02}, ${w} ${h * 0.76} L ${w} ${h} L 0 ${h} Z`}
            fill={color}
            opacity={0.07}
          />
        </>
      )}
      {pattern === 'diagonal' &&
        Array.from({ length: Math.ceil((w + h) / 34) }, (_, i) => (
          <Line
            key={i}
            x1={i * 34 - h}
            y1={h}
            x2={i * 34}
            y2={0}
            stroke={color}
            strokeWidth={10}
            opacity={0.05}
          />
        ))}
      {pattern === 'dots' &&
        Array.from({ length: Math.ceil(h / 16) * Math.ceil(w / 16) }, (_, i) => {
          const cols = Math.ceil(w / 16);
          return (
            <Circle
              key={i}
              cx={(i % cols) * 16 + 8}
              cy={Math.floor(i / cols) * 16 + 8}
              r={1.3}
              fill={color}
              opacity={0.16}
            />
          );
        })}
      {pattern === 'rings' &&
        [60, 95, 130].map(r => (
          <Circle key={r} cx={w * 0.88} cy={h * 0.15} r={r} stroke={color} strokeWidth={1.5} fill="none" opacity={0.1} />
        ))}
    </Svg>
  );
}

export default function BankCardFace({
  art,
  bankName,
  accountLabel,
  network,
  last4,
  holderName,
  subsLabel,
  width,
  height,
  borderRadius = radius.virtualCard,
  style,
}: BankCardFaceProps) {
  // If the artwork fails to load (expired URL, no network), fall back to the
  // gradient card rather than showing an empty rectangle.
  const [imageFailed, setImageFailed] = useState(false);
  // A new image (e.g. a retaken photo) deserves a fresh attempt.
  useEffect(() => setImageFailed(false), [art.imageUri]);
  const showImage = !!art.imageUri && !imageFailed;

  // Plaid-linked accounts carry no card network (brand is "Bank"/"Unknown"),
  // so only show a network name when one is genuinely known.
  const hasNetwork = !!network && !['CARD', 'BANK', 'UNKNOWN'].includes(network.toUpperCase());

  const a11y = `${bankName}${accountLabel ? ` ${accountLabel}` : ''} card ending in ${last4}`;
  const frame: ViewStyle = { width, height, borderRadius, overflow: 'hidden' };

  // ---- full-bleed artwork tiers ---------------------------------------------
  if (showImage) {
    const isPhoto = art.tier === 'user_photo';
    const showPill = isPhoto && !!subsLabel;
    // Visa's rules want "Visa 1234"; other networks just the digits.
    const networkLabel = hasNetwork ? `${network[0]}${network.slice(1).toLowerCase()} ` : '';
    return (
      <View style={[frame, style]} accessible accessibilityLabel={a11y}>
        <Image
          source={{ uri: art.imageUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />

        {art.maskNumberBand && (
          // Covers wherever the physical card prints its number. Drawn over the
          // photo, and our own masked digits sit on top of it.
          <View pointerEvents="none" style={[styles.maskBand, { top: height * 0.4, height: height * 0.26 }]}>
            <Text style={[styles.maskText, { color: '#FFFFFF' }]}>{'•••• •••• •••• '}{last4}</Text>
          </View>
        )}

        {!isPhoto && (
          <Text style={styles.networkLast4}>
            {networkLabel}
            {last4}
          </Text>
        )}

        {showPill && (
          <View style={[styles.subsPill, styles.subsPillAbs, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Text style={[styles.subsText, { color: '#FFFFFF' }]}>{subsLabel}</Text>
          </View>
        )}
      </View>
    );
  }

  // ---- gradient tiers (catalog / user_design / template) --------------------
  const pillBg = art.fg === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(36,26,56,0.12)';
  return (
    <LinearGradient
      colors={art.gradient}
      // The wallet's gold skin has a middle stop at 65%, not the midpoint.
      locations={
        art.gradient.length === 3
          ? (gradients.bankGoldLocations as unknown as readonly [number, number, ...number[]])
          : undefined
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[frame, styles.gradientPad, style]}
      accessible
      accessibilityLabel={a11y}
    >
      <PatternLayer pattern={art.pattern} color={art.fg} w={width} h={height} />

      {/* Diagonal foil sheen — decorative, intercepts no touches. */}
      <LinearGradient
        pointerEvents="none"
        colors={SHEEN as unknown as readonly [string, string, string]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.9 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.top}>
        {/* Real cards lead with the bank's mark at top-left, so the logo sits
            there beside the name; the network label (when known) goes right. */}
        <View style={styles.brand}>
          {art.logoUri ? (
            <Image source={{ uri: art.logoUri }} style={styles.logo} resizeMode="contain" />
          ) : null}
          <Text style={[styles.bankName, { color: art.fg }]} numberOfLines={1}>
            {bankName}
          </Text>
        </View>
        {hasNetwork ? (
          <Text style={[styles.network, { color: art.fgDim }]}>{network}</Text>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        <LinearGradient
          colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
          locations={gradients.metalEdgeLocations as unknown as readonly [number, number, ...number[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chip}
        />
        {/* Contactless mark, as on any tap-to-pay card. */}
        <Svg width={18} height={22} viewBox="0 0 18 22">
          {[5, 9, 13].map((r, i) => (
            <Path
              key={r}
              d={`M${3 + i * 0.4} ${11 - r} A ${r} ${r} 0 0 1 ${3 + i * 0.4} ${11 + r}`}
              stroke={art.fg}
              strokeWidth={1.6}
              strokeLinecap="round"
              fill="none"
              opacity={0.7}
            />
          ))}
        </Svg>
      </View>

      <Text style={[styles.pan, { color: art.fg }]}>{'•••• •••• •••• '}{last4}</Text>

      <View style={styles.bottom}>
        <Text style={[styles.holder, { color: art.fgDim }]} numberOfLines={1}>
          {holderName.toUpperCase()}
          {accountLabel ? `  ·  ${accountLabel.toUpperCase()}` : ''}
        </Text>
        {subsLabel ? (
          <View style={[styles.subsPill, { backgroundColor: pillBg }]}>
            <Text style={[styles.subsText, { color: art.fg }]}>{subsLabel}</Text>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientPad: { padding: 20, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bankName: { fontFamily: fontFamily.bold, fontSize: 14, letterSpacing: 0.4, flexShrink: 1 },
  network: { fontFamily: fontFamily.semibold, fontSize: 11 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 24, height: 24, borderRadius: 5 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: { width: 36, height: 26, borderRadius: 5 },
  pan: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: 1.8 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  holder: { fontFamily: fontFamily.regular, fontSize: 11, flexShrink: 1 },
  subsPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  subsPillAbs: { position: 'absolute', right: 14, bottom: 12 },
  subsText: { fontFamily: fontFamily.bold, fontSize: 11 },
  maskBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(12,12,16,0.96)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  maskText: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: 1.8 },
  networkLast4: {
    position: 'absolute',
    left: 16,
    bottom: 12,
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
});
