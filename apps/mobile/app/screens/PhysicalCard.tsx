// =============================================================================
// EZER Redesign — Physical card designer
//
// Product flow is deliberately DESIGN FIRST, QUALIFY AFTER: the user draws the
// card they want, saves it, and only then lands on the approval choice
// (/screens/PhysicalCardApproval). Asking for eligibility before anyone has
// anything to be excited about is what kills conversion on card products, so
// this screen never mentions limits — only the required approval disclosure.
//
// The saved payload is { finish, strokes: [{d,color,width}], updatedAt } and is
// persisted through utils/cardDesignStore.ts (owned by another module). Strokes
// are SVG path data in card-local 308x190 space — see components/redesign/
// CardCanvas.tsx for why.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Body,
  Label,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
} from '../../components/redesign/Primitives';
import CardCanvas, { CARD_W, type Stroke } from '../../components/redesign/CardCanvas';
import { cardFinishes, type CardFinish } from '../../theme/tokens';
import { saveCardDesign, loadCardDesign } from '../../utils/cardDesignStore';

const FINISHES: { key: CardFinish; label: string }[] = [
  { key: 'amethyst', label: 'Amethyst' },
  { key: 'onyx', label: 'Onyx' },
  { key: 'midnight', label: 'Midnight' },
];

const WIDTHS = [
  { key: 'fine', label: 'Fine', value: 2.5 },
  { key: 'medium', label: 'Medium', value: 5 },
  { key: 'bold', label: 'Bold', value: 9 },
] as const;

/** Guard for restoring a persisted finish — storage is untyped at rest. */
function isFinish(v: string): v is CardFinish {
  return Object.prototype.hasOwnProperty.call(cardFinishes, v);
}

export default function PhysicalCardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [finish, setFinish] = useState<CardFinish>('amethyst');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(colors.gold);
  const [strokeWidth, setStrokeWidth] = useState<number>(WIDTHS[1].value);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ink options. Gold/accent/red/success come from the brand palette so they
  // stay theme-correct; white and black are literal because they are pigments
  // on a printed card, not UI colours that should flip with the theme.
  const SWATCHES: { key: string; value: string }[] = [
    { key: 'gold', value: colors.gold },
    { key: 'accent', value: colors.accInk },
    { key: 'white', value: '#FFFFFF' },
    { key: 'black', value: '#111111' },
    { key: 'red', value: colors.red },
    { key: 'success', value: colors.success },
  ];

  // Restore the last saved design so reopening the screen never loses artwork.
  useEffect(() => {
    let alive = true;
    loadCardDesign()
      .then(design => {
        if (!alive || !design) return;
        if (isFinish(design.finish)) setFinish(design.finish);
        setStrokes(design.strokes);
      })
      .catch(() => {
        // A failed restore is not worth blocking the designer over — the user
        // simply starts from a blank card.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleStrokeEnd = useCallback((s: Stroke) => {
    setStrokes(prev => [...prev, s]);
  }, []);

  const undo = useCallback(() => {
    setStrokes(prev => prev.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    setStrokes([]);
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveCardDesign({
        finish,
        strokes,
        updatedAt: new Date().toISOString(),
      });
      router.push('/screens/PhysicalCardApproval');
    } catch {
      // Keep the user on the screen with their artwork intact rather than
      // navigating on to approval with nothing persisted behind it.
      setSaving(false);
    }
  }, [finish, strokes, saving]);

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
        // Frozen while a stroke is in progress: on Android the ScrollView will
        // otherwise claim the responder as soon as the drag turns vertical and
        // the stroke dies mid-line.
        scrollEnabled={!drawing}
      >
        <ScreenBody>
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>
              Design your card
            </Text>
          </View>

          <Body style={{ marginBottom: 16 }}>
            Draw straight onto the card. This is the artwork we print — take your
            time, you can undo anything.
          </Body>

          {/* --- Live preview / canvas ------------------------------------- */}
          <View style={styles.canvasWrap}>
            {loading ? (
              <View style={[styles.loading, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <ActivityIndicator color={colors.accInk} />
              </View>
            ) : (
              <CardCanvas
                finish={finish}
                strokes={strokes}
                color={color}
                width={strokeWidth}
                onStrokeEnd={handleStrokeEnd}
                onDrawingChange={setDrawing}
              />
            )}
          </View>

          <View style={styles.historyRow}>
            <PressScale onPress={undo} scaleTo={0.94} disabled={strokes.length === 0} style={styles.historyBtn}>
              <View
                style={[
                  styles.historyInner,
                  {
                    borderColor: colors.line2,
                    opacity: strokes.length === 0 ? 0.4 : 1,
                  },
                ]}
              >
                <Ionicons name="arrow-undo-outline" size={15} color={colors.ink} />
                <Text style={[styles.historyText, { color: colors.ink }]}>Undo</Text>
              </View>
            </PressScale>

            <PressScale onPress={clearAll} scaleTo={0.94} disabled={strokes.length === 0} style={styles.historyBtn}>
              <View
                style={[
                  styles.historyInner,
                  {
                    borderColor: colors.line2,
                    opacity: strokes.length === 0 ? 0.4 : 1,
                  },
                ]}
              >
                <Ionicons name="trash-outline" size={15} color={colors.red} />
                <Text style={[styles.historyText, { color: colors.red }]}>Clear all</Text>
              </View>
            </PressScale>
          </View>

          {/* --- Ink -------------------------------------------------------- */}
          <SectionHeader style={{ marginTop: 22 }}>Ink</SectionHeader>
          <View style={styles.swatchRow}>
            {SWATCHES.map(s => {
              const active = s.value === color;
              return (
                <PressScale
                  key={s.key}
                  onPress={() => setColor(s.value)}
                  scaleTo={0.9}
                  style={[
                    styles.swatch,
                    {
                      borderColor: active ? colors.ink : colors.line2,
                      borderWidth: active ? 2.5 : 1,
                    },
                  ]}
                >
                  {/* PressScale's inner wrapper is alignSelf:'stretch', so the
                      dot needs its own centring box rather than relying on the
                      Pressable's alignItems. */}
                  <View style={styles.swatchCenter}>
                    <View style={[styles.swatchFill, { backgroundColor: s.value }]} />
                  </View>
                </PressScale>
              );
            })}
          </View>

          {/* --- Nib -------------------------------------------------------- */}
          <SectionHeader style={{ marginTop: 20 }}>Nib</SectionHeader>
          <View style={styles.widthRow}>
            {WIDTHS.map(w => {
              const active = w.value === strokeWidth;
              return (
                <PressScale
                  key={w.key}
                  onPress={() => setStrokeWidth(w.value)}
                  scaleTo={0.95}
                  style={styles.widthBtn}
                >
                  <View
                    style={[
                      styles.widthInner,
                      {
                        backgroundColor: active ? colors.accSoft : colors.card,
                        borderColor: active ? colors.accInk : colors.line,
                      },
                    ]}
                  >
                    {/* The dot is the actual stroke width, so the control shows
                        what it does instead of describing it. */}
                    <View
                      style={{
                        width: w.value * 2,
                        height: w.value * 2,
                        borderRadius: w.value,
                        backgroundColor: colors.ink,
                      }}
                    />
                    <Text
                      style={[
                        styles.widthText,
                        { color: active ? colors.accInk : colors.mut },
                      ]}
                    >
                      {w.label}
                    </Text>
                  </View>
                </PressScale>
              );
            })}
          </View>

          {/* --- Finish ----------------------------------------------------- */}
          <SectionHeader style={{ marginTop: 20 }}>Base finish</SectionHeader>
          <View style={styles.finishRow}>
            {FINISHES.map(f => {
              const active = f.key === finish;
              return (
                <PressScale
                  key={f.key}
                  onPress={() => setFinish(f.key)}
                  scaleTo={0.95}
                  style={styles.finishBtn}
                >
                  <View
                    style={[
                      styles.finishInner,
                      { borderColor: active ? colors.accInk : colors.line, borderWidth: active ? 2 : 1 },
                    ]}
                  >
                    <View
                      style={[
                        styles.finishSwatch,
                        { backgroundColor: cardFinishes[f.key][1] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.finishText,
                        { color: active ? colors.ink : colors.mut },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </View>
                </PressScale>
              );
            })}
          </View>

          {/* --- Save ------------------------------------------------------- */}
          <PressScale onPress={save} scaleTo={0.97} disabled={saving} style={{ marginTop: 26 }}>
            <View
              style={[
                styles.cta,
                { backgroundColor: colors.goldBg, opacity: saving ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.ctaText}>
                {saving ? 'Saving…' : 'Save my design'}
              </Text>
            </View>
          </PressScale>

          <Surface style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mut} />
            <View style={{ flex: 1 }}>
              <Label>Before you go</Label>
              <Body style={{ marginTop: 3 }}>
                Card issuance is subject to approval. We save your design now and
                walk you through approval next — nothing is printed until you
                confirm.
              </Body>
            </View>
          </Surface>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasWrap: {
    alignItems: 'center',
  },
  loading: {
    width: CARD_W,
    height: 190,
    borderRadius: radius.virtualCard,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  historyBtn: {
    minWidth: 108,
  },
  historyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.buttonSm,
    borderWidth: 1.5,
    minHeight: 38,
  },
  historyText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchFill: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  widthRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  widthBtn: {
    flex: 1,
  },
  widthInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.chip,
    borderWidth: 1,
    minHeight: 66,
  },
  widthText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  finishRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  finishBtn: {
    flex: 1,
  },
  finishInner: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.chip,
    minHeight: 74,
    justifyContent: 'center',
  },
  finishSwatch: {
    width: 34,
    height: 22,
    borderRadius: 5,
  },
  finishText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  cta: {
    borderRadius: radius.buttonLg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 14,
  },
});
