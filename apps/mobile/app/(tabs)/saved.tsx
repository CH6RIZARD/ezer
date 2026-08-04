import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { usePlaid } from '../../utils/usePlaid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 64, 340);
const CARD_HEIGHT = CARD_WIDTH * 0.61;

function getPaymentDates() {
  return Array.from({ length: 4 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index * 14);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
}

function VirtualCard({ isLinked }: { isLinked: boolean }) {
  const { colors } = useTheme();
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const spin = useRef(new Animated.Value(0)).current;
  const isMoving = useRef(false);

  const spinCard = () => {
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      position.extractOffset();
      isMoving.current = false;
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) isMoving.current = true;
      position.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: () => {
      position.flattenOffset();
      if (!isMoving.current) spinCard();
    },
    onPanResponderTerminate: () => {
      position.flattenOffset();
    },
  }), [position]);

  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ height: CARD_HEIGHT + 190, marginHorizontal: -24, marginBottom: 12, overflow: 'visible' }}>
      <Animated.View
        {...panResponder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel="Virtual Ezer Pay in 4 card. Drag freely to move it. Tap to spin the card 360 degrees."
        style={{
          position: 'absolute',
          top: 72,
          left: (SCREEN_WIDTH - CARD_WIDTH) / 2,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          zIndex: 5,
          transform: position.getTranslateTransform(),
        }}
      >
        <Animated.View style={{ flex: 1, transform: [{ perspective: 1100 }, { rotateY }] }}>
          <LinearGradient colors={[colors.primary, '#294B8F', '#131827']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ ...cardShell(colors), backfaceVisibility: 'hidden' }}>
            <View style={{ position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.09)', right: -70, top: -110 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 17, letterSpacing: 3, fontWeight: '800' }}>EZER</Text>
              <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.17)' }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>PAY IN 4</Text></View>
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Ionicons name="wifi" size={26} color="#F7D48A" style={{ transform: [{ rotate: '90deg' }] }} />
              <Text style={{ color: '#FFFFFF', fontSize: 21, letterSpacing: 3, fontWeight: '600', marginTop: 13 }}>••••  ••••  ••••  ••••</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View><Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9, letterSpacing: 1 }}>CARDHOLDER</Text><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 3 }}>{isLinked ? 'EZER MEMBER' : 'YOUR NAME'}</Text></View>
              <Ionicons name="card" size={28} color="#F7D48A" />
            </View>
          </LinearGradient>
          <LinearGradient colors={[colors.primary, '#1C2541', '#10141E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ ...cardShell(colors), position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backfaceVisibility: 'hidden', transform: [{ rotateY: '180deg' }] }}>
            <View style={{ height: 38, backgroundColor: '#0B1020', marginHorizontal: -22, marginTop: 8 }} />
            <View style={{ marginTop: 18, alignItems: 'flex-end' }}><View style={{ width: 126, height: 30, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)' }}><Text style={{ color: '#0B1020', fontSize: 12, letterSpacing: 2, fontWeight: '700' }}>CVV •••</Text></View></View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}><Text style={{ color: 'rgba(255,255,255,0.77)', fontSize: 11, lineHeight: 15 }}>A single-use virtual card is created for each approved purchase. Card details remain hidden until your program launches.</Text></View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function cardShell(colors: ReturnType<typeof useTheme>['colors']) {
  return { flex: 1, borderRadius: 22, padding: 22, overflow: 'hidden' as const, shadowColor: colors.shadow, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 };
}

export default function BnplScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { linkedAccounts, openPlaidLink, isLoading } = usePlaid();
  const [joined, setJoined] = useState(false);
  const dates = useMemo(getPaymentDates, []);
  const isLinked = linkedAccounts.length > 0;

  const handleJoin = () => {
    if (isLinked) {
      setJoined(true);
      return;
    }
    openPlaidLink(
      () => setJoined(true),
      result => {
        if (result.error) Alert.alert('Bank linking paused', 'You can return any time to securely connect your bank and finish your request.');
      },
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: Math.max(insets.top, 32) + 14, paddingBottom: insets.bottom + 28 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View>
          <Text style={{ fontSize: 31, fontWeight: '800', color: colors.text, letterSpacing: -0.8 }}>Ezer Pay in 4</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 5 }}>A virtual card for purchases, paid in four.</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.accent, letterSpacing: 2 }}>EZER</Text>
      </View>

      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.accent + '18', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, marginBottom: 20 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>COMING SOON · EARLY ACCESS</Text>
      </View>

      <VirtualCard isLinked={isLinked} />
      <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginBottom: 27 }}>Move your finger to rotate the card in any direction</Text>

      <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles-outline" size={21} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>Spend with clarity</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>One purchase. Four scheduled payments.</Text>
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>Connect your bank to request early access and help us determine your estimated spending power. Every purchase will be reviewed separately when the card launches.</Text>
      </View>

      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>How Pay in 4 works</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
        {dates.map((date, index) => (
          <View key={date} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 13, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: index === 0 ? colors.accent + '70' : colors.border }}>
            <Text style={{ color: index === 0 ? colors.accent : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>PAY {index + 1}</Text>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>{index === 0 ? 'Today' : date}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 3 }}>¼ total</Text>
          </View>
        ))}
      </View>

      {joined ? (
        <View style={{ backgroundColor: colors.accent + '16', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.accent + '45', flexDirection: 'row', gap: 12, marginBottom: 18 }}>
          <Ionicons name="checkmark-circle" size={23} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>You’re on the early-access list</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 }}>Your bank connection is ready for a pre-approval review once Ezer Pay in 4 launches.</Text>
          </View>
        </View>
      ) : (
        <Pressable onPress={handleJoin} disabled={isLoading} style={{ borderRadius: 17, overflow: 'hidden', marginBottom: 12, opacity: isLoading ? 0.7 : 1 }}>
          <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 17, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>{isLoading ? 'Opening secure bank link…' : isLinked ? 'Join early access' : 'Join now · connect your bank'}</Text>
          </LinearGradient>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>Secure bank connection · no impact to your credit score to join</Text>
      </View>

      <View style={{ marginTop: 25, paddingTop: 17, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>Ezer Pay in 4 is not yet available. Joining does not guarantee approval or a credit limit. Card issuance, lending, and payment services will be provided through participating bank or credit-union partners when the program launches.</Text>
      </View>
    </ScrollView>
  );
}
