// =============================================================================
// EZER Redesign — finished card review
//
// Landed on from PhysicalCardApproval.tsx's "Done", and from Home's "Get your
// physical card" tile once useCardFlowStatus reports a design AND a terminal
// approval outcome already exist. Before that point the tile still opens the
// raw designer (app/screens/PhysicalCard.tsx) — this screen is what "you
// already went through the flow" looks like, so it never reopens the blank
// canvas itself. "Edit design" is the one explicit way back into it.
//
// The card uses the same free-drag spin physics as the Pay in 4 virtual card
// (SpinCard.tsx) rather than the designer's controlled flip — this is a
// finished object being shown off, not a drawing surface. Front/back content
// comes from CardCanvas's own CardFrontFace/CardBackFace so the LOCKED layout
// (chip-only front, identifying details back) can't drift between the two
// screens that render a design.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, Label, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import { CardFrontFace, CardBackFace } from '../../components/redesign/CardCanvas';
import SpinCard from '../../components/redesign/SpinCard';
import { cardFinishes, type CardFinish } from '../../theme/tokens';
import {
  loadCardDesign,
  getCardAccessOutcome,
  type CardStroke,
  type CardAccessOutcome,
} from '../../utils/cardDesignStore';

function isFinish(v: string): v is CardFinish {
  return Object.prototype.hasOwnProperty.call(cardFinishes, v);
}

function formatLimit(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export default function PhysicalCardReviewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [finish, setFinish] = useState<CardFinish>('amethyst');
  const [strokes, setStrokes] = useState<CardStroke[]>([]);
  const [access, setAccess] = useState<CardAccessOutcome | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [design, outcome] = await Promise.all([loadCardDesign(), getCardAccessOutcome()]);
      if (!alive) return;

      // Nothing to review — send them to make something instead of showing an
      // empty spinning card.
      if (!design) {
        router.replace('/screens/PhysicalCard');
        return;
      }
      if (isFinish(design.finish)) setFinish(design.finish);
      setStrokes(design.strokes);

      // A design with no terminal outcome means approval was abandoned
      // mid-flow — that screen is the correct next step, not this one.
      if (!outcome) {
        router.replace('/screens/PhysicalCardApproval');
        return;
      }
      setAccess(outcome);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accInk} />
      </View>
    );
  }

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
        scrollEnabled={!dragging}
      >
        <ScreenBody>
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>Your card</Text>
          </View>

          <SpinCard
            style={{ marginTop: 8 }}
            onDragChange={setDragging}
            hint="Drag to spin it around"
            front={<CardFrontFace finish={finish} strokes={strokes} />}
            back={<CardBackFace finish={finish} />}
          />

          {access?.status === 'approved' && access.limitCents !== null && (
            <Surface style={[styles.reveal, { borderColor: colors.goldLine, backgroundColor: colors.goldSoft }]}>
              <Label color={colors.gold}>Your starting limit</Label>
              <Text style={[typeScale.totalValue, { color: colors.gold, marginTop: 4 }]}>
                {formatLimit(access.limitCents)}
              </Text>
              <Body style={{ marginTop: 6 }}>
                You're on the access list with priority. We'll print this design.
              </Body>
            </Surface>
          )}

          {access?.status === 'review' && (
            <Surface style={styles.reveal}>
              <Label>Under review</Label>
              <Body style={{ marginTop: 6 }}>
                A person is taking a look at your account history. You're on the
                access list and we'll be in touch.
              </Body>
            </Surface>
          )}

          {access?.status === 'waitlist' && (
            <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.bannerText, { color: colors.ink }]}>
                You're on the early-access list ✓
              </Text>
              <Body style={{ marginTop: 6 }}>
                We'll notify you at launch. No spending limit yet — connect your
                bank any time to get one and move up the list.
              </Body>
            </View>
          )}

          {access?.status === 'waitlist' && (
            <PressScale onPress={() => router.push('/screens/PhysicalCardApproval')} scaleTo={0.97} style={{ marginTop: 12 }}>
              <View style={[styles.cta, { backgroundColor: colors.goldBg }]}>
                <Text style={styles.ctaText}>Connect your bank instead</Text>
              </View>
            </PressScale>
          )}

          <SectionHeader style={{ marginTop: 26 }}>Not quite right?</SectionHeader>
          <PressScale onPress={() => router.push('/screens/PhysicalCard')} scaleTo={0.97} style={{ marginTop: 10 }}>
            <View style={[styles.editBtn, { borderColor: colors.line2, backgroundColor: colors.card }]}>
              <Ionicons name="brush-outline" size={16} color={colors.ink} />
              <Text style={[styles.editBtnText, { color: colors.ink }]}>Edit design</Text>
            </View>
          </PressScale>
          <Body style={{ marginTop: 8 }}>
            Your approval status stays as-is — redrawing the artwork doesn't
            change it.
          </Body>

          <Surface style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mut} />
            <View style={{ flex: 1 }}>
              <Label>Please note</Label>
              <Body style={{ marginTop: 3 }}>
                Card issuance is subject to approval. Any limit shown is an
                indication based on the information available now and may change
                before your card is issued.
              </Body>
            </View>
          </Surface>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reveal: {
    marginTop: 20,
    padding: 18,
  },
  banner: {
    marginTop: 20,
    padding: 18,
    borderRadius: radius.cardLg,
  },
  bannerText: {
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
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
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.buttonLg,
    borderWidth: 1.5,
  },
  editBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 18,
  },
});
