// =============================================================================
// EZER Mobile — Onboarding ("Ticker Cut")
//
// Five screens: ticker → card → leak replay → radar → auth.
//
// DARK ONLY, on purpose. The flow is designed as one committed dark aesthetic,
// so it reads `darkTokens` directly rather than `useTheme().colors`. Running it
// through the light palette would wash out the gold and the coral, which carry
// the meaning here (gold = a trial about to convert, coral = money leaving).
//
// Animation is React Native's own `Animated`. Reanimated is not a dependency
// and everything needed — marquee translate, card spin, staggered rise, the
// calendar pop-in — is transform and opacity, which the native driver handles.
//
// The numbers in screens 03 and 04 are ILLUSTRATIVE and labelled as such on
// screen. They are not a claim about anyone's account, and they are not the
// bundled demo data that used to leak into the real screens — that is deleted.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../utils/AuthContext';
import { darkTokens as T } from '../theme/tokens';

// --- shared -----------------------------------------------------------------

const SERIF = Platform.select({ default: 'InstrumentSerif_400Regular_Italic' });
const UI = 'SpaceGrotesk_400Regular';
const UI_BOLD = 'SpaceGrotesk_700Bold';
const UI_SEMI = 'SpaceGrotesk_600SemiBold';

/** Screens 02–04 carry the three progress bars; 01 and 05 carry none. */
const PROGRESS_STEPS = [1, 2, 3];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 11, fontFamily: UI_BOLD, letterSpacing: 2.5, color: T.gold }}>
      {children}
    </Text>
  );
}

function Display({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: SERIF, fontSize: size, lineHeight: size * 1.06, color: T.ink }}>
      {children}
    </Text>
  );
}

function Cta({
  label, onPress, variant = 'primary', disabled,
}: { label: string; onPress: () => void; variant?: 'primary' | 'gradient' | 'quiet'; disabled?: boolean }) {
  const [down, setDown] = useState(false);
  const inner = (
    <Text style={{ fontFamily: UI_BOLD, fontSize: 15, color: variant === 'quiet' ? T.ink : '#FFFFFF' }}>
      {label}
    </Text>
  );
  const base = {
    height: 54, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const,
    transform: [{ scale: down ? 0.97 : 1 }], opacity: disabled ? 0.45 : 1,
  };
  if (variant === 'gradient') {
    return (
      <Pressable onPress={onPress} disabled={disabled} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)}>
        <LinearGradient colors={[T.accent, '#A87D2F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={[base, variant === 'primary'
        ? { backgroundColor: T.accent }
        : { borderWidth: 1, borderColor: T.line2, backgroundColor: 'transparent' }]}
    >
      {inner}
    </Pressable>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {PROGRESS_STEPS.map(i => (
        <View
          key={i}
          style={{
            width: 26, height: 3, borderRadius: 2,
            backgroundColor: i <= step ? T.gold : T.line,
          }}
        />
      ))}
    </View>
  );
}

/** Staggered rise+fade, the entrance every screen uses. */
function Rise({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 800, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// --- 01 · ticker ------------------------------------------------------------

const CHIPS = [
  { pre: 'Netflix', hl: '-$15.49', hc: T.red, post: 'caught' },
  { pre: 'Hulu trial', hl: 'flagged', hc: T.gold, post: '' },
  { pre: 'Adobe CC', hl: '-$22.99', hc: T.red, post: 'caught' },
  { pre: 'Spotify', hl: '-$11.99', hc: T.red, post: 'caught' },
  { pre: 'Gym app', hl: 'renewal seen', hc: T.gold, post: '' },
  { pre: 'YouTube', hl: '-$13.99', hc: T.red, post: 'caught' },
  { pre: 'Figma', hl: '-$34', hc: T.red, post: 'caught' },
  { pre: 'Split in 4', hl: '$212 sofa', hc: T.accInk, post: '' },
  { pre: 'iCloud', hl: '-$2.99', hc: T.red, post: 'caught' },
];

function Marquee({ duration, reverse }: { duration: number; reverse?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const [runWidth, setRunWidth] = useState(0);

  useEffect(() => {
    if (!runWidth) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [x, duration, runWidth]);

  // The chip run is rendered twice; translating by exactly one run's width puts
  // the copy where the original was, so the loop has no visible seam.
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-runWidth, 0] : [0, -runWidth],
  });

  const run = (key: string) => (
    <View key={key} style={{ flexDirection: 'row', gap: 8 }} onLayout={key === 'a' ? e => setRunWidth(e.nativeEvent.layout.width + 8) : undefined}>
      {CHIPS.map((c, i) => (
        <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: T.card, borderWidth: 1, borderColor: T.line }}>
          <Text style={{ fontSize: 11.5, fontFamily: UI_SEMI, color: T.mut }}>
            {c.pre} <Text style={{ color: c.hc, fontFamily: UI_BOLD }}>{c.hl}</Text>{c.post ? ` ${c.post}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ height: 34, overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', gap: 8, transform: [{ translateX }] }}>
        {run('a')}
        {run('b')}
      </Animated.View>
    </View>
  );
}

function ScreenTicker({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', top: insets.top + 40, left: 0, right: 0, opacity: 0.55, gap: 10 }}>
        <Marquee duration={26000} />
        <Marquee duration={34000} reverse />
        <Marquee duration={30000} />
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(21,16,33,0.15)', 'rgba(21,16,33,0.92)', T.bg]}
        locations={[0, 0.26, 0.44, 0.56]}
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 320 }}
        pointerEvents="none"
      />

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <Rise delay={100}>
            <Text style={{ fontFamily: SERIF, fontSize: 72, lineHeight: 78, letterSpacing: -2, color: T.ink }}>Ezer</Text>
          </Rise>
          <Rise delay={250}>
            <Text style={{ fontSize: 15, lineHeight: 22, color: T.mut, textAlign: 'center', maxWidth: 280, marginTop: 12 }}>
              While you read this, somebody's trial just billed. Yours won't.
            </Text>
          </Rise>
          <Rise delay={350}>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: T.goldSoft }}>
                <Text style={{ fontSize: 11, fontFamily: UI_BOLD, color: T.gold }}>Read-only access</Text>
              </View>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: T.accSoft }}>
                <Text style={{ fontSize: 11, fontFamily: UI_BOLD, color: T.accInk }}>Bank-grade encryption</Text>
              </View>
            </View>
          </Rise>
        </View>

        <Rise delay={500}>
          <View style={{ gap: 12 }}>
            <Cta label="Get started" variant="gradient" onPress={onStart} />
            <Pressable onPress={onLogin} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: UI_SEMI, color: T.accInk }}>I already have an account</Text>
            </Pressable>
          </View>
        </Rise>
      </View>
    </View>
  );
}

// --- 02 · card --------------------------------------------------------------

function SpinCard() {
  const spin = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    s.start(); b.start();
    return () => { s.stop(); b.stop(); };
  }, [spin, bob]);

  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateYBack = spin.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '540deg'] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

    // No `inset: 0` — React Native does not implement the shorthand, so it is
  // dropped silently and the face never fills the card.
  const face: any = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, backfaceVisibility: 'hidden', overflow: 'hidden' };

  return (
    <Animated.View style={{ width: 300, height: 188, transform: [{ translateY }] }}>
      <Animated.View style={{ width: 300, height: 188, transform: [{ perspective: 1200 }, { rotateY }] }}>
        <LinearGradient colors={['#E7C77E', '#A87D2F']} style={{ position: 'absolute', width: 300, height: 188, borderRadius: 20 }} />
        <View style={[face, { padding: 2 }]}>
          <LinearGradient colors={['#33303B', '#17151D', '#0B0A10']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 18, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <LinearGradient colors={['#E7C77E', '#A87D2F']} style={{ width: 42, height: 31, borderRadius: 7 }} />
              <Text style={{ fontSize: 14, fontFamily: UI_BOLD, letterSpacing: 2.5, color: T.gold }}>EZER</Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Text style={{ fontSize: 17, letterSpacing: 2, color: 'rgba(255,255,255,0.92)' }}>••••  ••••  ••••  ••••</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 }}>
                <Text style={{ fontSize: 10, fontFamily: UI_BOLD, letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>EZER MEMBER</Text>
                <Text style={{ fontSize: 10, fontFamily: UI_BOLD, letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>PAY IN 4</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>

      <Animated.View style={{ position: 'absolute', width: 300, height: 188, transform: [{ perspective: 1200 }, { rotateY: rotateYBack }] }}>
        <LinearGradient colors={['#3B1580', '#1E0B45', '#0E0724']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[face, { backgroundColor: '#1E0B45' }]}>
          <View style={{ position: 'absolute', top: 24, left: 0, right: 0, height: 40, backgroundColor: '#0B0812' }} />
          <View style={{ position: 'absolute', top: 84, left: 22, right: 22, height: 32, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 13 }}>
            <Text style={{ fontSize: 14, letterSpacing: 2, color: '#241A38' }}>•••</Text>
          </View>
          <Text style={{ position: 'absolute', bottom: 17, left: 22, fontSize: 9, fontFamily: UI_BOLD, letterSpacing: 1, color: 'rgba(255,255,255,0.45)' }}>
            SINGLE-USE VIRTUAL CARD
          </Text>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

// --- 03 · leak replay -------------------------------------------------------

const CHARGES = [
  { day: 3, letter: 'N', color: '#E50914', amount: 15.49 },
  { day: 7, letter: 'S', color: '#1DB954', amount: 11.99 },
  { day: 12, letter: 'Y', color: '#FF0033', amount: 13.99 },
  { day: 16, letter: 'A', color: '#FA0F00', amount: 22.99 },
  { day: 21, letter: 'F', color: T.accent, amount: 34.0 },
  { day: 27, letter: 'H', color: '#17B26A', amount: 17.99 },
];
const LEAK_TOTAL = CHARGES.reduce((s, c) => s + c.amount, 0);

function ChargeDot({ charge, shown }: { charge: typeof CHARGES[number]; shown: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: shown ? 1 : 0, duration: 350,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1.2), useNativeDriver: true,
    }).start();
  }, [a, shown]);
  return (
    <Animated.View style={{ alignItems: 'center', gap: 1, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
      <View style={{ width: 17, height: 17, borderRadius: 6, backgroundColor: charge.color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 9, fontFamily: UI_BOLD, color: '#FFFFFF' }}>{charge.letter}</Text>
      </View>
      <Text style={{ fontSize: 9, fontFamily: UI_BOLD, color: T.red }}>
        -${charge.amount.toFixed(2).replace('.00', '')}
      </Text>
    </Animated.View>
  );
}

function LeakCalendar({ shownCount }: { shownCount: number }) {
  const byDay = useMemo(() => {
    const m: Record<number, { charge: typeof CHARGES[number]; index: number }> = {};
    CHARGES.forEach((c, i) => { m[c.day] = { charge: c, index: i }; });
    return m;
  }, []);

  return (
    <View style={{ backgroundColor: T.card, borderRadius: 22, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 21, color: T.ink }}>October</Text>
        <Text style={{ fontSize: 10, fontFamily: UI_BOLD, letterSpacing: 0.8, color: T.mut2 }}>EXAMPLE MONTH</Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 7 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontFamily: UI_BOLD, letterSpacing: 0.5, color: T.mut2 }}>{d}</Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 35 }).map((_, i) => {
          const day = i - 2; // October starts Wednesday
          const inMonth = day >= 1 && day <= 31;
          const hit = inMonth ? byDay[day] : undefined;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, padding: 2 }}>
              <View style={{ minHeight: 52, borderRadius: 9, alignItems: 'center', paddingVertical: 4, gap: 1, backgroundColor: hit ? T.cellHl : inMonth ? T.cellBg : 'transparent' }}>
                <Text style={{ fontSize: 10, fontFamily: UI_SEMI, color: T.mut }}>{inMonth ? day : ''}</Text>
                {hit ? <ChargeDot charge={hit.charge} shown={hit.index < shownCount} /> : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
        <Text style={{ fontSize: 11, fontFamily: UI_BOLD, letterSpacing: 0.8, color: T.mut }}>DRAINED SO FAR</Text>
        <Text style={{ fontFamily: SERIF, fontSize: 36, color: T.red }}>
          ${CHARGES.slice(0, shownCount).reduce((s, c) => s + c.amount, 0).toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

// --- 04 · radar -------------------------------------------------------------

function PulseBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0, duration: 1200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [p]);
  return (
    <Animated.View style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: bg, transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
      <Text style={{ fontSize: 11, fontFamily: UI_BOLD, color }}>{label}</Text>
    </Animated.View>
  );
}

const UPCOMING = [
  { letter: 'N', color: '#E50914', name: 'Netflix', sub: 'Renewal · $15.49', badge: 'in 3d', pulse: false },
  { letter: 'H', color: '#17B26A', name: 'Hulu', sub: 'Trial ends · becomes $17.99/mo', badge: 'in 5d', pulse: true },
  { letter: 'A', color: '#FA0F00', name: 'Adobe CC', sub: 'Renewal · $22.99', badge: 'in 9d', pulse: false },
];

// --- 05 · auth --------------------------------------------------------------

function AuthStep({ mode, setMode, onDone }: {
  mode: 'signup' | 'login';
  setMode: (m: 'signup' | 'login') => void;
  onDone: () => void;
}) {
  const { loginWithProvider } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provider = async (p: 'apple' | 'google') => {
    setBusy(p); setError(null);
    const res = await loginWithProvider(p);
    setBusy(null);
    if (res.ok) { onDone(); return; }
    if (res.reason === 'cancelled') return;
    const label = p[0].toUpperCase() + p.slice(1);
    setError(res.reason === 'unavailable'
      ? `${label} sign-in needs the installed app, not Expo Go or a browser${res.error ? ` — ${res.error}` : '.'}`
      : res.error || `Could not sign in with ${label}.`);
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Display size={34}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</Display>
        <Text style={{ fontSize: 15, lineHeight: 22, color: T.mut }}>
          {mode === 'signup' ? 'Sixty seconds. Free to start. Cancel anytime.' : 'Good to see you again.'}
        </Text>
      </View>

      {error ? (
        <View style={{ backgroundColor: 'rgba(224,112,90,0.12)', borderColor: 'rgba(224,112,90,0.4)', borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: T.red, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <Pressable
          onPress={() => provider('apple')}
          disabled={busy !== null}
          style={{ height: 54, borderRadius: 17, backgroundColor: T.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, opacity: busy ? 0.6 : 1 }}
        >
          {busy === 'apple' ? <ActivityIndicator color={T.bg} /> : (
            <><Ionicons name="logo-apple" size={19} color={T.bg} />
            <Text style={{ fontSize: 15, fontFamily: UI_BOLD, color: T.bg }}>Continue with Apple</Text></>
          )}
        </Pressable>

        <Pressable
          onPress={() => provider('google')}
          disabled={busy !== null}
          style={{ height: 54, borderRadius: 17, backgroundColor: T.card, borderWidth: 1, borderColor: T.line2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, opacity: busy ? 0.6 : 1 }}
        >
          {busy === 'google' ? <ActivityIndicator color={T.ink} /> : (
            <><Ionicons name="logo-google" size={19} color={T.ink} />
            <Text style={{ fontSize: 15, fontFamily: UI_BOLD, color: T.ink }}>Continue with Google</Text></>
          )}
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
        <Text style={{ fontSize: 12, color: T.mut2 }}>OR</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
      </View>

      <View style={{ gap: 12 }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={T.mut2}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{ height: 54, borderRadius: 16, backgroundColor: T.card, borderWidth: 1, borderColor: T.line2, paddingHorizontal: 18, fontSize: 15, color: T.ink }}
        />
        {/* Password and name live on the existing auth screens, which already do
            the validation and the bcrypt round-trip. Carrying the typed email
            across means the user does not enter it twice. */}
        <Cta
          label="Continue with email"
          disabled={email.trim().length === 0}
          onPress={() => router.push({
            pathname: mode === 'signup' ? '/auth/signup' : '/auth/login',
            params: { email: email.trim() },
          })}
        />
      </View>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')} style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ fontSize: 14, color: T.mut }}>
          {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
          <Text style={{ color: T.accInk, fontFamily: UI_BOLD }}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Text>
        </Text>
      </Pressable>

      <Text style={{ fontSize: 11, lineHeight: 17, color: T.mut2, textAlign: 'center' }}>
        By continuing you agree to Ezer's Terms & Privacy Policy. Bank-grade 256-bit encryption. We never sell your data.
      </Text>
    </View>
  );
}

// --- flow -------------------------------------------------------------------

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, isAuthenticated } = useAuth();
  const { height } = useWindowDimensions();

  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [shownCharges, setShownCharges] = useState(0);

  // Any manual tap stops auto-advance for the rest of the run. "Get started"
  // does not count — it is the flow's own first beat, not an override.
  const [manual, setManual] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const fade = useRef(new Animated.Value(1)).current;
  const go = useCallback((next: number, byHand: boolean) => {
    if (byHand) { setManual(true); }
    clearTimers();
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fade, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [fade]);

  const finish = useCallback(async () => {
    await completeOnboarding();
    router.replace('/(tabs)/home');
  }, [completeOnboarding]);

  // Already signed in and just replaying the story? Step 05 has nothing to ask
  // for. Anyone who authenticated before this flow existed still has
  // hasCompletedOnboarding false, and would otherwise be sent to a sign-in
  // screen for an account they are already inside.
  useEffect(() => {
    if (step === 4 && isAuthenticated) { void finish(); }
  }, [step, isAuthenticated, finish]);

  // Screen 02 auto-advances after 3.8s.
  useEffect(() => {
    if (step !== 1 || manual) return;
    timers.current.push(setTimeout(() => go(2, false), 3800));
    return clearTimers;
  }, [step, manual, go]);

  // Screen 03 replays the charges, then advances 1.8s after the last one.
  useEffect(() => {
    if (step !== 2) return;
    setShownCharges(0);
    CHARGES.forEach((_, i) => {
      timers.current.push(setTimeout(() => setShownCharges(i + 1), 700 * (i + 1)));
    });
    if (!manual) {
      timers.current.push(setTimeout(() => go(3, false), 700 * CHARGES.length + 1800));
    }
    return clearTimers;
  }, [step, manual, go]);

  const chrome = (label: string, next: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20 }}>
      <Pressable onPress={() => go(step - 1, true)} hitSlop={12} style={{ width: 44, height: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={22} color={T.mut} />
      </Pressable>
      <Progress step={step} />
      <Pressable onPress={() => go(4, true)} hitSlop={12} style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontFamily: UI_SEMI, color: T.mut }}>Skip</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* RN has no radial gradient; a top-down linear from bg2 to bg is the
          closest approximation of the spec's 520×420 glow at 50% -8%. */}
      <LinearGradient colors={[T.bg2, T.bg]} locations={[0, 0.65]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.55 }} />

      <Animated.View style={{ flex: 1, opacity: fade }}>
        {step === 0 && (
          <ScreenTicker
            onStart={() => go(1, false)}
            onLogin={() => { setAuthMode('login'); go(4, true); }}
          />
        )}

        {step === 1 && (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
            {chrome('Next', 2)}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <SpinCard />
            </View>
            <View style={{ gap: 12, marginBottom: 24 }}>
              <Eyebrow>EZER · PAY IN 4</Eyebrow>
              <Display size={36}>Split anything in four.</Display>
              <Text style={{ fontSize: 15, lineHeight: 23, color: T.mut }}>
                One virtual card that turns any purchase into four easy payments.
              </Text>
            </View>
            <Cta label="Next" onPress={() => go(2, true)} />
          </View>
        )}

        {step === 2 && (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
            {chrome('Ezer notices', 3)}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 18 }}>
              <View style={{ gap: 10 }}>
                <Eyebrow>MEANWHILE, LAST MONTH</Eyebrow>
                <Display size={30}>This is a month, leaking.</Display>
              </View>
              <LeakCalendar shownCount={shownCharges} />
              {shownCharges >= CHARGES.length ? (
                <Rise>
                  <Text style={{ fontSize: 14, color: T.mut }}>
                    Six charges. Nobody noticed a single one.
                  </Text>
                </Rise>
              ) : null}
            </ScrollView>
            <Cta label="Ezer notices" onPress={() => go(3, true)} />
          </View>
        )}

        {step === 3 && (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
            {chrome('Create my account', 4)}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: 18 }}>
              <Display size={34}>Ezer catches all of it.</Display>
              <View style={{ backgroundColor: T.card, borderRadius: 22, padding: 16, gap: 14 }}>
                <Text style={{ fontSize: 10, fontFamily: UI_BOLD, letterSpacing: 0.8, color: T.mut2 }}>EXAMPLE</Text>
                {UPCOMING.map(u => (
                  <View key={u.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: u.color, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, fontFamily: UI_BOLD, color: '#FFFFFF' }}>{u.letter}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontFamily: UI_BOLD, color: T.ink }}>{u.name}</Text>
                      <Text style={{ fontSize: 12, color: T.mut }}>{u.sub}</Text>
                    </View>
                    {u.pulse
                      ? <PulseBadge label={u.badge} color={T.gold} bg={T.goldSoft} />
                      : (
                        <View style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(224,112,90,0.16)' }}>
                          <Text style={{ fontSize: 11, fontFamily: UI_BOLD, color: T.red }}>{u.badge}</Text>
                        </View>
                      )}
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 15, lineHeight: 23, color: T.mut }}>
                Flagged before they bill. Cancelled in one tap.
              </Text>
            </ScrollView>
            <View style={{ gap: 12 }}>
              <Cta label="Create my account" variant="gradient" onPress={() => { setAuthMode('signup'); go(4, true); }} />
              <Pressable onPress={() => { setAuthMode('login'); go(4, true); }} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: UI_SEMI, color: T.accInk }}>I already have an account</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 4 && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }}
          >
            <Pressable onPress={() => go(3, true)} hitSlop={12} style={{ width: 44, height: 44, justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="chevron-back" size={22} color={T.mut} />
            </Pressable>
            <AuthStep mode={authMode} setMode={setAuthMode} onDone={finish} />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}
