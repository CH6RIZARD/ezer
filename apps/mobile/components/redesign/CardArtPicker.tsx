// =============================================================================
// CardArtPicker — "Make it look like my card"
//
// A bottom sheet for one wallet card. Two ways to get closer to the real thing:
//   1. a photo of the physical card (the only exact match), kept on-device;
//   2. a look from our catalog for the card's bank.
// "Automatic" clears both and returns to whatever the resolver picks.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius } from '../../theme/type';
import BankCardFace, { type BankCardFaceProps } from './BankCardFace';
import { defaultDesignFor, designsForIssuer, GENERIC_DESIGNS } from '../../utils/cardArt/catalog';
import { matchIssuer } from '../../utils/cardArt/matching';
import { recolorDesign, resolveCardArt } from '../../utils/cardArt/resolver';
import type { CardArtFallback, CardArtInput, CardArtPrefs, CardDesign, Gradient } from '../../utils/cardArt/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** What we know about the card, for matching and the live preview. */
  input: CardArtInput;
  prefs: CardArtPrefs;
  fallback: CardArtFallback;
  /** Text fields for the preview face (same values the carousel shows). */
  face: Omit<BankCardFaceProps, 'art' | 'width' | 'height' | 'borderRadius' | 'style'>;
  onSelectDesign: (designId: string | null) => void;
  /** Resolves to an error message to show, or null. */
  onAddPhoto: (source: 'camera' | 'library') => Promise<string | null>;
  onRemovePhoto: () => void;
}

const PREVIEW_W = 260;
const PREVIEW_H = 154;

export default function CardArtPicker({
  visible,
  onClose,
  input,
  prefs,
  fallback,
  face,
  onSelectDesign,
  onAddPhoto,
  onRemovePhoto,
}: Props) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issuer = useMemo(() => matchIssuer(input.institutionName), [input.institutionName]);
  const art = resolveCardArt(input, prefs, fallback);

  // The bank's own looks first, then the neutral ones (without repeating them
  // when the bank is unknown and the list already is the generic set).
  const designs = useMemo<CardDesign[]>(() => {
    const own = issuer ? [...designsForIssuer(issuer.id)] : [];
    // Same recolouring the card itself gets, so a swatch matches its result.
    return [...own, ...GENERIC_DESIGNS].map(d => recolorDesign(d, input.issuerColorHint));
  }, [issuer, input.issuerColorHint]);

  const autoDesign = issuer ? recolorDesign(defaultDesignFor(issuer.id), input.issuerColorHint) : null;
  const usingAuto = !prefs.photoUri && !prefs.designId;
  const hasNetworkArt = !!input.networkTokenArtUri;

  const takePhoto = async (source: 'camera' | 'library') => {
    setBusy(true);
    setError(null);
    const message = await onAddPhoto(source);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.ink }]}>Card look</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={[styles.done, { color: colors.accInk }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.previewWrap}>
            <BankCardFace {...face} art={art} width={PREVIEW_W} height={PREVIEW_H} />
          </View>

          <Text style={[styles.section, { color: colors.mut }]}>MATCH YOUR EXACT CARD</Text>
          <Text style={[styles.hint, { color: colors.mut }]}>
            Take a photo of the front of your card. It stays on this phone, and your card number is
            covered whenever it is shown.
          </Text>
          <View style={styles.row}>
            <ActionButton label="Take photo" onPress={() => takePhoto('camera')} disabled={busy} />
            <ActionButton label="Choose photo" onPress={() => takePhoto('library')} disabled={busy} />
            {prefs.photoUri ? <ActionButton label="Remove" onPress={onRemovePhoto} disabled={busy} subtle /> : null}
            {busy ? <ActivityIndicator style={{ marginLeft: 6 }} /> : null}
          </View>
          {error ? <Text style={[styles.error, { color: colors.red }]}>{error}</Text> : null}

          <Text style={[styles.section, { color: colors.mut, marginTop: 22 }]}>
            {issuer ? `${issuer.name.toUpperCase()} LOOKS` : 'LOOKS'}
          </Text>
          <View style={styles.grid}>
            <Tile
              label={hasNetworkArt ? 'Official' : 'Auto'}
              selected={usingAuto}
              gradient={autoDesign?.gradient ?? fallback.gradient}
              onPress={() => onSelectDesign(null)}
            />
            {designs.map(d => (
              <Tile
                key={d.id}
                label={d.label}
                selected={!prefs.photoUri && prefs.designId === d.id}
                gradient={d.gradient}
                onPress={() => onSelectDesign(d.id)}
              />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.mut2, marginTop: 14 }]}>
            Designs are EZER's own artwork in the bank's colors — not the bank's card art.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );

  function ActionButton({ label, onPress, disabled, subtle }: { label: string; onPress: () => void; disabled?: boolean; subtle?: boolean }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={[
          styles.action,
          subtle
            ? { borderColor: colors.line2, backgroundColor: 'transparent' }
            : { borderColor: colors.goldLine, backgroundColor: colors.goldSoft },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={[styles.actionText, { color: subtle ? colors.mut : colors.gold }]}>{label}</Text>
      </Pressable>
    );
  }

  function Tile({ label, selected, gradient, onPress }: { label: string; selected: boolean; gradient: Gradient; onPress: () => void }) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label} design`}
        style={styles.tileWrap}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: selected ? colors.gold : 'transparent' }]}
        />
        <Text style={[styles.tileLabel, { color: selected ? colors.ink : colors.mut }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: fontFamily.bold, fontSize: 18 },
  done: { fontFamily: fontFamily.bold, fontSize: 15 },
  body: { paddingHorizontal: 20, paddingBottom: 36 },
  previewWrap: { alignItems: 'center', marginVertical: 12 },
  section: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  hint: { fontFamily: fontFamily.regular, fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  action: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
  actionText: { fontFamily: fontFamily.bold, fontSize: 13 },
  error: { fontFamily: fontFamily.regular, fontSize: 12.5, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  tileWrap: { width: 82 },
  tile: { width: 82, height: 52, borderRadius: 10, borderWidth: 2 },
  tileLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, marginTop: 5, textAlign: 'center' },
});
