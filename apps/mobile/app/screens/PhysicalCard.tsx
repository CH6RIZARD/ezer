// =============================================================================
// EZER Redesign — Physical card designer
//
// Product flow is deliberately DESIGN FIRST, QUALIFY AFTER: the user draws the
// card they want, saves it, and only then lands on the approval choice
// (/screens/PhysicalCardApproval). Asking for eligibility before anyone has
// anything to be excited about is what kills conversion on card products, so
// this screen never mentions limits — only the required approval disclosure.
//
// LOCKED layout (Card Studio comp): the front carries only the chip and the
// contactless mark, no wording — name, masked number, CVV and expiry live on
// the back, reached with the flip control. See CardCanvas.tsx.
//
// Ink is: gold foil, a custom mixer (hue + lightness, built on PanResponder —
// no Reanimated in deps), and 20 named pigments — the comp's tool row, which
// had been cut down to 6 colors at some point without being re-checked
// against it. Line weight is a continuous 1.5-11 drag instead of the comp's
// 5 fixed stops, which reads more like a real pen than snapping between
// presets.
//
// The saved payload is { finish, strokes: [{d,color,width}], updatedAt } and is
// persisted through utils/cardDesignStore.ts (owned by another module). Strokes
// are SVG path data in card-local 308x190 space — see components/redesign/
// CardCanvas.tsx for why. Autosave debounces 700ms after the last stroke, same
// as the comp's "Autosaved" indicator; the final CTA just flushes and moves on.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type GestureResponderEvent,
  PanResponder,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polygon } from 'react-native-svg';
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
import { saveCardDesign, loadCardDesign, getCardAccessOutcome } from '../../utils/cardDesignStore';

const FINISHES: { key: CardFinish; label: string }[] = [
  { key: 'amethyst', label: 'Amethyst' },
  { key: 'onyx', label: 'Onyx' },
  { key: 'rose', label: 'Rose' },
  { key: 'bone', label: 'Bone' },
];

/**
 * Line weight is a continuous drag, not the comp's 5 fixed stops — sliding to
 * an in-between width reads as more of a real pen than snapping to one of
 * five presets does. Range and the default (5) still match the comp.
 */
const WEIGHT_MIN = 1.5;
const WEIGHT_MAX = 11;
const DEFAULT_WEIGHT = 5;

/** Flat pigment swatch, same 20 named inks as the comp. */
const INKS: { key: string; hex: string }[] = [
  { key: 'black', hex: '#111111' },
  { key: 'white', hex: '#FFFFFF' },
  { key: 'grey', hex: '#9CA3AF' },
  { key: 'slate', hex: '#4B5563' },
  { key: 'red', hex: '#E23D2E' },
  { key: 'orange', hex: '#F97316' },
  { key: 'yellow', hex: '#FACC15' },
  { key: 'lime', hex: '#A3E635' },
  { key: 'green', hex: '#22C55E' },
  { key: 'teal', hex: '#14B8A6' },
  { key: 'cyan', hex: '#06B6D4' },
  { key: 'sky', hex: '#38BDF8' },
  { key: 'blue', hex: '#2563EB' },
  { key: 'indigo', hex: '#4F46E5' },
  { key: 'violet', hex: '#8B5CF6' },
  { key: 'pink', hex: '#EC4899' },
  { key: 'rose', hex: '#F43F5E' },
  { key: 'brown', hex: '#92400E' },
  { key: 'tan', hex: '#D2A86A' },
  { key: 'cream', hex: '#F5E9C9' },
];

/**
 * Flat stand-in for the comp's shimmering SVG-gradient foil stroke. A true
 * gradient stroke needs an SVG <linearGradient> wired through CardCanvas's
 * Path per-stroke, which is a print-fidelity upgrade for later — this is the
 * comp's own documented fallback color, not a placeholder guess.
 */
const FOIL_HEX = '#D6B36F';

/** The comp's 7-stop rainbow hue track, as real gradient stops — not a fallback. */
const HUE_STOPS = ['#E23D2E', '#F97316', '#FACC15', '#22C55E', '#06B6D4', '#2563EB', '#8B5CF6', '#EC4899', '#E23D2E'] as const;

/** hsl(h, 78%, l%) → hex, matching the comp's custom-ink formula exactly. */
function hslToHex(h: number, s: number, l: number): string {
  const sf = s / 100;
  const lf = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sf * Math.min(lf, 1 - lf);
  const f = (n: number) => lf - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Guard for restoring a persisted finish — storage is untyped at rest. */
function isFinish(v: string): v is CardFinish {
  return Object.prototype.hasOwnProperty.call(cardFinishes, v);
}

/**
 * A horizontal drag track (hue or lightness) built on PanResponder — no
 * Reanimated in deps, so the thumb position is driven straight off state
 * rather than an animated value; it is a discrete drag, not a spring.
 */
function SliderTrack({
  pct,
  onPct,
  flatColor,
  gradientColors,
}: {
  pct: number;
  onPct: (pct: number) => void;
  /** Solid track color — used for the lightness track (varies with hue). */
  flatColor?: string;
  /** Multi-stop track color — used for the hue rainbow. */
  gradientColors?: readonly string[];
}) {
  const widthRef = useRef(1);
  const fromEvent = useCallback((e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    return Math.max(0, Math.min(1, x / widthRef.current));
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => onPct(fromEvent(e)),
        onPanResponderMove: e => onPct(fromEvent(e)),
      }),
    [fromEvent, onPct]
  );

  return (
    <View
      onLayout={ev => {
        widthRef.current = Math.max(1, ev.nativeEvent.layout.width);
      }}
      style={styles.sliderTrack}
      {...responder.panHandlers}
    >
      <View style={styles.sliderFill}>
        {gradientColors ? (
          <LinearGradient
            colors={gradientColors as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: flatColor }]} />
        )}
      </View>
      <View style={[styles.sliderThumb, { left: `${pct * 100}%` }]} />
    </View>
  );
}

/**
 * Continuous line weight, dragged along a thin→thick wedge rather than picked
 * from fixed stops. Built on the same pill-track shell as the ink mixer's
 * sliders (styles.sliderTrack/sliderFill/sliderThumb) so it reads as the same
 * control family instead of a foreign shape dropped on bare background — the
 * wedge sits inset inside that pill, and the thumb is the same fixed-size
 * white/dark ring as Hue and Lightness, carrying an inner dot sized to the
 * current weight instead of resizing the whole thumb (which is what made the
 * old version look inconsistent).
 *
 * The wedge is drawn in a fixed-ratio viewBox stretched to the row's real
 * width (preserveAspectRatio="none") so it always fills the inset regardless
 * of screen width; pointer math still needs the row's measured pixel width,
 * tracked separately via onLayout.
 */
function LineWeightSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const widthRef = useRef(1);

  const fromEvent = useCallback((e: GestureResponderEvent) => {
    const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / widthRef.current));
    return WEIGHT_MIN + pct * (WEIGHT_MAX - WEIGHT_MIN);
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => onChange(fromEvent(e)),
        onPanResponderMove: e => onChange(fromEvent(e)),
      }),
    [fromEvent, onChange]
  );

  const pct = (value - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN);
  const dotSize = Math.max(3, Math.min(13, value * 1.3));

  return (
    <View
      onLayout={ev => {
        widthRef.current = Math.max(1, ev.nativeEvent.layout.width);
      }}
      style={styles.sliderTrack}
      {...responder.panHandlers}
    >
      <View style={[styles.sliderFill, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Polygon points="10,19 90,10 90,19" fill={colors.line2} />
        </Svg>
      </View>
      <View style={[styles.sliderThumb, { left: `${pct * 100}%`, borderColor: colors.accInk }]}>
        <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: colors.accInk }} />
      </View>
    </View>
  );
}

export default function PhysicalCardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [finish, setFinish] = useState<CardFinish>('amethyst');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // Undone strokes, newest last. Drawing anything new drops them: the redo
  // stack describes one linear history, and keeping it across a fresh stroke
  // would let redo resurrect artwork from a branch the user abandoned.
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [ink, setInk] = useState<'foil' | 'custom' | string>('foil');
  const [customHue, setCustomHue] = useState(265);
  const [customLit, setCustomLit] = useState(55);
  const [lineWeight, setLineWeight] = useState<number>(DEFAULT_WEIGHT);
  const [flipped, setFlipped] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const activeColor = useMemo(() => {
    if (ink === 'foil') return FOIL_HEX;
    if (ink === 'custom') return hslToHex(customHue, 78, customLit);
    return INKS.find(i => i.key === ink)?.hex ?? FOIL_HEX;
  }, [ink, customHue, customLit]);

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

  // Autosave, debounced — mirrors the comp's "Autosaved" indicator. Local
  // write happens on every call inside saveCardDesign; the network POST is
  // best-effort, so firing this on a timer rather than per-stroke is purely
  // to avoid hammering the API while someone is doodling fast.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || strokes.length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveCardDesign({ finish, strokes, updatedAt: new Date().toISOString() })
        .then(() => {
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 1600);
        })
        .catch(() => {
          // Best-effort — the next stroke or the final CTA retries.
        });
    }, 700);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, finish, loading]);

  const handleStrokeEnd = useCallback((s: Stroke) => {
    setStrokes(prev => [...prev, s]);
    setUndone([]);
  }, []);

  const undo = useCallback(() => {
    setStrokes(prev => {
      if (prev.length === 0) return prev;
      setUndone(u => [...u, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setUndone(prev => {
      if (prev.length === 0) return prev;
      setStrokes(st => [...st, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }, []);

  // Clear is undoable in one step rather than being a point of no return —
  // the whole drawing goes onto the redo stack, so a mis-tap costs nothing.
  const clearAll = useCallback(() => {
    setStrokes(prev => {
      if (prev.length === 0) return prev;
      setUndone(prev.slice().reverse());
      return [];
    });
  }, []);

  const go = useCallback(async () => {
    if (saving || strokes.length === 0) return;
    setSaving(true);
    try {
      await saveCardDesign({
        finish,
        strokes,
        updatedAt: new Date().toISOString(),
      });
      // Already been through approval once (this is a re-edit reached from
      // PhysicalCardReview's "Edit design") → go straight back to the review
      // screen instead of re-running the connect-bank-or-skip choice on
      // someone who already made it. saveCardDesign carries the outcome
      // forward on its own, so nothing further needs writing here. First time
      // through still pushes to Approval, unchanged.
      const access = await getCardAccessOutcome();
      if (access) {
        router.replace('/screens/PhysicalCardReview');
      } else {
        router.push('/screens/PhysicalCardApproval');
      }
    } catch {
      // Keep the user on the screen with their artwork intact rather than
      // navigating on with nothing persisted behind it.
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
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[typeScale.screenTitle, { color: colors.ink }]}>Design your card</Text>
              <Body style={{ marginTop: 1 }}>
                {flipped
                  ? 'The back is fixed — flip over to draw.'
                  : 'The front is all yours — details live on the back.'}
              </Body>
            </View>
            {strokes.length > 0 ? (
              <Text
                style={[
                  typeScale.labelSm,
                  { color: justSaved ? colors.success : colors.mut2, marginLeft: 8 },
                ]}
              >
                {justSaved ? 'Saved' : 'Autosaved'}
              </Text>
            ) : null}
          </View>

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
                color={activeColor}
                width={lineWeight}
                flipped={flipped}
                onStrokeEnd={handleStrokeEnd}
                onDrawingChange={setDrawing}
              />
            )}
          </View>

          <View style={styles.historyRow}>
            <View style={styles.historyLeft}>
              <PressScale onPress={undo} scaleTo={0.92} disabled={strokes.length === 0}>
                <View
                  style={[
                    styles.historyIcon,
                    { borderColor: colors.line2, backgroundColor: colors.card, opacity: strokes.length === 0 ? 0.4 : 1 },
                  ]}
                >
                  <Ionicons name="arrow-undo-outline" size={15} color={colors.ink} />
                </View>
              </PressScale>
              <PressScale onPress={redo} scaleTo={0.92} disabled={undone.length === 0}>
                <View
                  style={[
                    styles.historyIcon,
                    { borderColor: colors.line2, backgroundColor: colors.card, opacity: undone.length === 0 ? 0.4 : 1 },
                  ]}
                >
                  <Ionicons name="arrow-redo-outline" size={15} color={colors.ink} />
                </View>
              </PressScale>
              <PressScale onPress={clearAll} scaleTo={0.94} disabled={strokes.length === 0}>
                <View
                  style={[
                    styles.clearBtn,
                    { borderColor: colors.line2, backgroundColor: colors.card, opacity: strokes.length === 0 ? 0.4 : 1 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.red} />
                  <Text style={[styles.historyText, { color: colors.red }]}>Clear</Text>
                </View>
              </PressScale>
            </View>

            <PressScale onPress={() => setFlipped(f => !f)} scaleTo={0.92}>
              <View style={[styles.flipBtn, { backgroundColor: colors.ink }]}>
                <Text style={[styles.historyText, { color: colors.bg }]}>
                  {flipped ? 'Show front' : 'See the back'}
                </Text>
              </View>
            </PressScale>
          </View>

          {flipped ? (
            <Surface style={styles.flippedNote}>
              <Body>
                The back is fixed for security printing — name, number, CVV and
                expiry live here.{' '}
                <Text style={{ fontFamily: fontFamily.bold, color: colors.ink }}>
                  Flip to the front to draw.
                </Text>
              </Body>
            </Surface>
          ) : (
            <>
              {/* --- Ink ---------------------------------------------------- */}
              <SectionHeader style={{ marginTop: 22 }}>Ink</SectionHeader>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.inkRow}
              >
                <PressScale onPress={() => setInk('foil')} scaleTo={0.94}>
                  <View
                    style={[
                      styles.foilChip,
                      { borderColor: ink === 'foil' ? colors.ink : 'transparent' },
                    ]}
                  >
                    <Text style={styles.foilChipText}>Gold foil</Text>
                  </View>
                </PressScale>

                <PressScale onPress={() => setMixerOpen(true)} scaleTo={0.94}>
                  <View
                    style={[
                      styles.mixChip,
                      {
                        backgroundColor: colors.card,
                        borderColor: ink === 'custom' ? colors.ink : colors.line,
                      },
                    ]}
                  >
                    <View style={styles.mixSwatch} />
                    <Text style={[styles.historyText, { color: colors.ink }]}>Mix</Text>
                  </View>
                </PressScale>

                {INKS.map(i => {
                  const active = ink === i.key;
                  const needsRing = i.hex === '#FFFFFF' || i.hex === '#F5E9C9';
                  return (
                    <PressScale key={i.key} onPress={() => setInk(i.key)} scaleTo={0.88}>
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: i.hex,
                            borderColor: active ? colors.ink : needsRing ? colors.line2 : 'transparent',
                            borderWidth: active ? 2.5 : needsRing ? 1.5 : 0,
                          },
                        ]}
                      />
                    </PressScale>
                  );
                })}
              </ScrollView>

              {/* --- Line weight ------------------------------------------------ */}
              <SectionHeader style={{ marginTop: 18 }}>Line weight</SectionHeader>
              <LineWeightSlider value={lineWeight} onChange={setLineWeight} />

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
            </>
          )}

          {/* --- Continue ----------------------------------------------------- */}
          <PressScale
            onPress={go}
            scaleTo={0.97}
            disabled={saving || strokes.length === 0}
            style={{ marginTop: 26 }}
          >
            <View
              style={[
                styles.cta,
                {
                  backgroundColor: colors.goldBg,
                  opacity: saving ? 0.6 : strokes.length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Text style={styles.ctaText}>
                {saving ? 'Saving…' : strokes.length === 0 ? 'Draw something first' : 'Continue'}
              </Text>
            </View>
          </PressScale>
          <Body style={{ textAlign: 'center', marginTop: 9 }}>
            Nothing is printed until you confirm at the end.
          </Body>

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

      {/* --- Mix your own ink -------------------------------------------------- */}
      <Modal visible={mixerOpen} transparent animationType="slide" onRequestClose={() => setMixerOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMixerOpen(false)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        </Pressable>
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />
            <View style={styles.mixHead}>
              <View style={[styles.mixPreview, { backgroundColor: hslToHex(customHue, 78, customLit) }]} />
              <Text style={[typeScale.cardTitle, { color: colors.ink }]}>Mix your own ink</Text>
            </View>

            <Label style={{ marginTop: 16, marginBottom: 6 }}>Hue</Label>
            <SliderTrack
              pct={customHue / 360}
              onPct={p => {
                setCustomHue(p * 360);
                setInk('custom');
              }}
              gradientColors={HUE_STOPS}
            />

            <Label style={{ marginTop: 16, marginBottom: 6 }}>Lightness</Label>
            <SliderTrack
              pct={(customLit - 15) / 70}
              onPct={p => {
                setCustomLit(15 + p * 70);
                setInk('custom');
              }}
              flatColor={hslToHex(customHue, 78, 50)}
            />

            <PressScale
              onPress={() => {
                setInk('custom');
                setMixerOpen(false);
              }}
              scaleTo={0.97}
              style={{ marginTop: 22 }}
            >
              <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                <Text style={styles.ctaText}>Use this ink</Text>
              </View>
            </PressScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  historyLeft: {
    flexDirection: 'row',
    gap: 7,
  },
  historyIcon: {
    width: 38,
    height: 36,
    borderRadius: radius.buttonSm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: radius.buttonSm,
    borderWidth: 1.5,
  },
  flipBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.buttonSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
  },
  flippedNote: {
    marginTop: 14,
    padding: 14,
  },
  inkRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingRight: 4,
    alignItems: 'center',
  },
  foilChip: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C49A4E',
  },
  foilChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 10.5,
    color: '#3E2C08',
  },
  mixChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    borderWidth: 2,
  },
  mixSwatch: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  mixHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mixPreview: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sliderTrack: {
    height: 24,
    justifyContent: 'center',
  },
  sliderFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    marginTop: -13,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#241A38',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
