// =============================================================================
// EZER Mobile — Onboarding ("Ticker Cut" v1)
//
// Five screens: Opening (ticker) → Card → Leak replay → Radar → Auth.
//
// Auth is the LAST screen, not the first. The old flow was
// index → auth → onboarding → home, so a stranger had to hand over
// credentials before being told what the product does. Here the story runs
// first and the account is created at the end, which is what the flow map
// specifies.
//
// The calendar replay is ILLUSTRATIVE and says so on screen. It is driven by
// the CHARGES table below — one source of truth for both the cell pops and
// the running total, so the two can never disagree.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Animated,
  Easing,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../utils/AuthContext';

// --- tokens ------------------------------------------------------------------

const C = {
  bg: '#151021',
  bgTop: '#251C3D',
  ink: '#F1EAF9',
  muted: '#A79BC2',
  faint: '#6F6390',
  gold: '#D6B36F',
  goldFrom: '#E7C77E',
  goldTo: '#A87D2F',
  purple: '#4C1D95',
  lilac: '#C4A9F7',
  coral: '#E0705A',
  success: '#348F66',
  surface: '#1F1834',
  border: '#2C2347',
  input: '#3B2F5A',
};

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

// --- illustrative replay data (single source of truth) -----------------------

const CHARGES = [
  { day: 3, letter: 'N', color: '#E50914', cents: 1549 },
  { day: 7, letter: 'S', color: '#1DB954', cents: 1199 },
  { day: 12, letter: 'Y', color: '#FF0033', cents: 1399 },
  { day: 16, letter: 'A', color: '#FA0F00', cents: 2299 },
  { day: 21, letter: 'F', color: '#4C1D95', cents: 3400 },
  { day: 27, letter: 'H', color: '#17B26A', cents: 1799 },
];

const TICKER = [
  { pre: 'Netflix', hl: '-$15.49', hc: C.coral, post: 'caught' },
  { pre: 'Hulu trial', hl: 'flagged', hc: C.gold, post: '' },
  { pre: 'Adobe CC', hl: '-$22.99', hc: C.coral, post: 'caught' },
  { pre: 'Spotify', hl: '-$11.99', hc: C.coral, post: 'caught' },
  { pre: 'Gym app', hl: 'renewal seen', hc: C.gold, post: '' },
  { pre: 'YouTube', hl: '-$13.99', hc: C.coral, post: 'caught' },
  { pre: 'Figma', hl: '-$34', hc: C.coral, post: 'caught' },
  { pre: 'Split in 4', hl: '$212 sofa', hc: C.lilac, post: '' },
  { pre: 'iCloud', hl: '-$2.99', hc: C.coral, post: 'caught' },
];

const money = (cents: number) => {
  const s = (cents / 100).toFixed(2);
  return '$' + (s.endsWith('.00') ? s.slice(0, -3) : s);
};

// --- ticker row --------------------------------------------------------------
//
// One chip run is rendered TWICE and translated by exactly the measured width
// of a single run, so the second copy is already in place when the first
// scrolls out. Without the duplicate the row visibly snaps back at the loop.

function TickerRow({ speed, reverse }: { speed: number; reverse?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const [runWidth, setRunWidth] = useState(0);

  useEffect(() => {
    if (!runWidth) return;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [runWidth, speed, x]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-runWidth, 0] : [0, -runWidth],
  });

  const chips = TICKER.map((t, i) => (
    <View
      key={i}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        marginRight: 8,
        flexDirection: 'row',
      }}
    >
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.muted }}>{t.pre} </Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: t.hc }}>{t.hl}</Text>
      {!!t.post && <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.muted }}> {t.post}</Text>}
    </View>
  ));

  return (
    <View style={{ height: 34, overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }}>
        <View style={{ flexDirection: 'row' }} onLayout={e => setRunWidth(e.nativeEvent.layout.width)}>
          {chips}
        </View>
        <View style={{ flexDirection: 'row' }}>{chips}</View>
      </Animated.View>
    </View>
  );
}

// --- virtual card ------------------------------------------------------------

function SpinningCard() {
  const spin = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [spin, bob]);

  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  // backfaceVisibility is unreliable across RN versions and platforms, so the
  // two faces cross-fade on the same schedule the rotation runs on instead of
  // relying on it. The swap happens at the quarter turns, where the card is
  // edge-on and the cut is invisible.
  const frontOpacity = spin.interpolate({
    inputRange: [0, 0.24, 0.26, 0.74, 0.76, 1],
    outputRange: [1, 1, 0, 0, 1, 1],
  });
  const backOpacity = spin.interpolate({
    inputRange: [0, 0.24, 0.26, 0.74, 0.76, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });

  const face = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

  return (
    <Animated.View style={{ transform: [{ translateY }], alignItems: 'center' }}>
      <Animated.View style={{ width: 300, height: 188, transform: [{ perspective: 1200 }, { rotateY }] }}>
        {/* front */}
        <Animated.View style={[face, { opacity: frontOpacity }]}>
          <LinearGradient
            colors={[C.goldFrom, C.goldTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[face, { borderRadius: 20 }]}
          />
          <LinearGradient
            colors={['#33303B', '#17151D', '#0B0A10']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderRadius: 18, padding: 20 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <LinearGradient colors={[C.goldFrom, C.goldTo]} style={{ width: 42, height: 31, borderRadius: 7 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: 2.5, color: C.gold }}>EZER</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 17, letterSpacing: 2, color: 'rgba(255,255,255,0.92)' }}>
              {'••••  ••••  ••••  ••••'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>EZER MEMBER</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>PAY IN 4</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* back */}
        <Animated.View style={[face, { opacity: backOpacity }]}>
          <LinearGradient
            colors={['#3B1580', '#1E0B45', '#0E0724']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[face, { borderRadius: 20, overflow: 'hidden' }]}
          >
            <View style={{ position: 'absolute', top: 24, left: 0, right: 0, height: 40, backgroundColor: '#0B0812' }} />
            <View
              style={{
                position: 'absolute', top: 84, left: 22, right: 22, height: 32, borderRadius: 7,
                backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 13,
              }}
            >
              <Text style={{ fontSize: 14, letterSpacing: 2, color: '#241A38' }}>•••</Text>
            </View>
            <Text
              style={{
                position: 'absolute', bottom: 17, left: 22,
                fontSize: 9, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.45)',
              }}
            >
              SINGLE-USE VIRTUAL CARD
            </Text>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// --- calendar replay ---------------------------------------------------------

function ChargePip({ visible, letter, color, amount }: { visible: boolean; letter: string; color: string; amount: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [visible, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Animated.View style={{ opacity: v, transform: [{ scale }], alignItems: 'center', marginTop: 1 }}>
      <View style={{ width: 17, height: 17, borderRadius: 6, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{letter}</Text>
      </View>
      <Text style={{ fontSize: 9, fontWeight: '700', color: C.coral, marginTop: 1 }}>-{amount}</Text>
    </Animated.View>
  );
}

function LeakCalendar({ onFinished }: { onFinished: () => void }) {
  const [shown, setShown] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setShown(s => {
        if (s >= CHARGES.length) return s;
        const next = s + 1;
        if (next === CHARGES.length && !finished.current) {
          finished.current = true;
          setTimeout(onFinished, 1800);
        }
        return next;
      });
    }, 700);
    return () => clearInterval(id);
  }, [onFinished]);

  const byDay: Record<number, { letter: string; color: string; cents: number; idx: number }> = {};
  CHARGES.forEach((c, idx) => { byDay[c.day] = { ...c, idx }; });

  const total = CHARGES.slice(0, shown).reduce((s, c) => s + c.cents, 0);
  // October 2025 starts on a Wednesday — three leading blanks.
  const cells = Array.from({ length: 35 }, (_, i) => i - 2);

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 21, color: C.ink }}>October</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: C.faint }}>ILLUSTRATIVE</Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 7 }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: C.faint }}>
            {d}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          const inMonth = day >= 1 && day <= 31;
          const ch = inMonth ? byDay[day] : undefined;
          return (
            <View key={i} style={{ width: '14.285%', minHeight: 52, padding: 2 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 9,
                  backgroundColor: ch ? '#2C2148' : inMonth ? '#211A38' : 'transparent',
                  alignItems: 'center',
                  paddingTop: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: C.muted }}>{inMonth ? String(day) : ''}</Text>
                {ch && <ChargePip visible={ch.idx < shown} letter={ch.letter} color={ch.color} amount={money(ch.cents)} />}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.muted }}>DRAINED SO FAR</Text>
        <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, color: C.coral }}>
          ${(total / 100).toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

// --- shared bits -------------------------------------------------------------

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: C.gold }}>{children}</Text>;
}

function Display({ children, size = 34 }: { children: React.ReactNode; size?: number }) {
  return (
    <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: size, lineHeight: size * 1.1, color: C.ink }}>
      {children}
    </Text>
  );
}

function Cta({
  label, onPress, gradient, disabled, busy,
}: { label: string; onPress: () => void; gradient?: boolean; disabled?: boolean; busy?: boolean }) {
  const [down, setDown] = useState(false);
  const body = busy ? <ActivityIndicator color="#fff" /> : (
    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{label}</Text>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={{ transform: [{ scale: down ? 0.97 : 1 }], opacity: disabled ? 0.45 : 1 }}
    >
      {gradient ? (
        <LinearGradient
          colors={[C.purple, C.goldTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
        >
          {body}
        </LinearGradient>
      ) : (
        <View style={{ height: 54, borderRadius: 17, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' }}>
          {body}
        </View>
      )}
    </Pressable>
  );
}

function Progress({ step }: { step: number }) {
  // Three bars across screens 2–4. Opening and Auth carry no progress UI.
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
      {[1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            width: 26, height: 3, borderRadius: 2, marginHorizontal: 3,
            backgroundColor: i <= step ? C.gold : 'rgba(214,179,111,0.22)',
          }}
        />
      ))}
    </View>
  );
}

function Screen({ children, k }: { children: React.ReactNode; k: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [k, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={{ flex: 1, opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function UpcomingRow({
  letter, color, name, detail, chip, chipColor, pulse,
}: { letter: string; color: string; name: string; detail: string; chip: string; chipColor: string; pulse?: boolean }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [pulse, p]);
  const scale = p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{letter}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, marginHorizontal: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{name}</Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{detail}</Text>
      </View>
      <Animated.View
        style={{
          paddingVertical: 6, paddingHorizontal: 11, borderRadius: 10,
          backgroundColor: chipColor === C.gold ? 'rgba(214,179,111,0.15)' : 'rgba(224,112,90,0.16)',
          transform: [{ scale }],
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: chipColor }}>{chip}</Text>
      </Animated.View>
    </View>
  );
}

// --- screen 05 ---------------------------------------------------------------

const inputStyle = {
  height: 54,
  borderRadius: 16,
  backgroundColor: C.surface,
  borderWidth: 1,
  borderColor: C.input,
  paddingHorizontal: 16,
  fontSize: 15,
  color: C.ink,
  marginBottom: 12,
} as const;

function AuthStep({
  mode, setMode, insets, succeeded, onBack, onDone, onEnter, login, signup, loginWithProvider,
}: {
  mode: 'signup' | 'login';
  setMode: (m: 'signup' | 'login') => void;
  insets: { top: number; bottom: number };
  succeeded: boolean;
  onBack: () => void;
  onDone: () => Promise<void>;
  onEnter: () => void;
  login: (e: string, p: string) => Promise<any>;
  signup: (e: string, p: string, n: string) => Promise<any>;
  loginWithProvider: (p: 'google' | 'apple' | 'microsoft') => Promise<any>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!succeeded) return;
    Animated.spring(check, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [succeeded, check]);

  if (succeeded) {
    const scale = check.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Animated.View
          style={{
            width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(52,143,102,0.18)',
            borderWidth: 1, borderColor: C.success, alignItems: 'center', justifyContent: 'center',
            opacity: check, transform: [{ scale }],
          }}
        >
          <Ionicons name="checkmark" size={40} color={C.success} />
        </Animated.View>
        <View style={{ height: 24 }} />
        <Display size={36}>You're in.</Display>
        <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center', marginTop: 14, lineHeight: 23, maxWidth: 300 }}>
          Ezer is already scanning for subscriptions you forgot about.
        </Text>
        <View style={{ height: 32 }} />
        <View style={{ alignSelf: 'stretch' }}>
          <Cta label="Continue" gradient onPress={onEnter} />
        </View>
      </View>
    );
  }

  const run = async (kind: 'email' | 'apple' | 'google') => {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'email') {
        const res = mode === 'signup'
          ? await signup(email.trim(), password, name.trim())
          : await login(email.trim(), password);
        if (!res.ok) { setError(res.error); return; }
      } else {
        const res = await loginWithProvider(kind);
        if (!res.ok) {
          // Backing out of the provider sheet is not a failure.
          if (res.reason === 'cancelled') return;
          const label = kind === 'apple' ? 'Apple' : 'Google';
          setError(
            res.reason === 'unavailable'
              ? `${label} sign-in needs the installed app, not Expo Go.`
              : res.error || `Could not sign in with ${label}. Try again, or use your email.`
          );
          return;
        }
      }
      await onDone();
    } finally {
      setBusy(null);
    }
  };

  const ready = mode === 'signup'
    ? !!name.trim() && !!email.trim() && password.length >= 6
    : !!email.trim() && !!password;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} hitSlop={12} style={{ width: 40, marginBottom: 20 }}>
          <Ionicons name="chevron-back" size={22} color={C.faint} />
        </Pressable>

        <Display size={34}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</Display>
        <Text style={{ fontSize: 15, color: C.muted, marginTop: 12, lineHeight: 22 }}>
          {mode === 'signup' ? 'Sixty seconds. Free to start. Cancel anytime.' : 'Good to see you again.'}
        </Text>

        {!!error && (
          <View
            style={{
              marginTop: 18, padding: 12, borderRadius: 12,
              backgroundColor: 'rgba(224,112,90,0.12)', borderWidth: 1, borderColor: 'rgba(224,112,90,0.4)',
            }}
          >
            <Text style={{ color: C.coral, fontSize: 13, lineHeight: 19 }}>{error}</Text>
          </View>
        )}

        <View style={{ height: 26 }} />

        {Platform.OS === 'ios' && (
          <Pressable
            onPress={() => run('apple')}
            disabled={busy !== null}
            style={{
              height: 54, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', marginBottom: 12, opacity: busy ? 0.6 : 1,
            }}
          >
            {busy === 'apple' ? <ActivityIndicator color={C.bg} /> : (
              <>
                <Ionicons name="logo-apple" size={19} color={C.bg} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.bg, marginLeft: 10 }}>Continue with Apple</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={() => run('google')}
          disabled={busy !== null}
          style={{
            height: 54, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.input,
            alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'google' ? <ActivityIndicator color={C.ink} /> : (
            <>
              <Ionicons name="logo-google" size={19} color={C.ink} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, marginLeft: 10 }}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 22 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 1, color: C.faint, marginHorizontal: 14 }}>OR</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        </View>

        {mode === 'signup' && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={C.faint}
            style={inputStyle}
            autoCapitalize="words"
          />
        )}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={C.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={inputStyle}
        />
        {/* The flow map shows an email field only, but /auth/login and
            /auth/signup authenticate with a password — an email-only button
            could not actually sign anyone in. */}
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'signup' ? 'Password (6+ characters)' : 'Password'}
          placeholderTextColor={C.faint}
          secureTextEntry
          autoCapitalize="none"
          style={inputStyle}
        />

        <View style={{ height: 6 }} />
        <Cta
          label={mode === 'signup' ? 'Create account' : 'Log in'}
          onPress={() => run('email')}
          disabled={!ready}
          busy={busy === 'email'}
        />

        <Pressable
          onPress={() => { setError(null); setMode(mode === 'signup' ? 'login' : 'signup'); }}
          style={{ height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}
        >
          <Text style={{ fontSize: 14, color: C.muted }}>
            {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
            <Text style={{ color: C.lilac, fontWeight: '700' }}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Text>
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11.5, lineHeight: 18, color: C.faint, textAlign: 'center', marginTop: 20 }}>
          By continuing you agree to Ezer's Terms & Privacy Policy. Bank-grade 256-bit encryption. We never sell your data.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- the flow ----------------------------------------------------------------

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { login, signup, loginWithProvider, completeOnboarding } = useAuth();

  const [step, setStep] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [autoOk, setAutoOk] = useState(true);
  const [succeeded, setSucceeded] = useState(false);

  // Any manual tap stops auto-advance for the rest of the run. "Get started"
  // does not count as one — the story is meant to keep moving from there.
  const go = useCallback((n: number, manual = true) => {
    if (manual) setAutoOk(false);
    setStep(n);
  }, []);

  useEffect(() => {
    if (step !== 1 || !autoOk) return;
    const id = setTimeout(() => setStep(2), 3800);
    return () => clearTimeout(id);
  }, [step, autoOk]);

  const calendarDone = useCallback(() => {
    setStep(s => (s === 2 && autoOk ? 3 : s));
  }, [autoOk]);

  const shell = { flex: 1 };

  if (step === 0) {
    return (
      <LinearGradient colors={[C.bgTop, C.bg]} locations={[0, 0.65]} style={shell}>
        <Screen k={0}>
          <View style={{ position: 'absolute', top: insets.top + 40, left: 0, right: 0, opacity: 0.55 }}>
            <TickerRow speed={26000} />
            <View style={{ height: 10 }} />
            <TickerRow speed={34000} reverse />
            <View style={{ height: 10 }} />
            <TickerRow speed={30000} />
          </View>

          <LinearGradient
            colors={['transparent', 'rgba(21,16,33,0.92)', C.bg]}
            locations={[0, 0.44, 0.56]}
            style={{ position: 'absolute', top: insets.top + 40, left: 0, right: 0, height: 280 }}
            pointerEvents="none"
          />

          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 28, paddingHorizontal: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 36 }}>
              <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 72, color: C.ink, letterSpacing: -2 }}>Ezer</Text>
              <Text style={{ fontSize: 15, color: C.muted, textAlign: 'center', maxWidth: 280, marginTop: 12, lineHeight: 22 }}>
                While you read this, somebody's trial just billed. Yours won't.
              </Text>
            </View>

            <Cta label="Get started" gradient onPress={() => go(1, false)} />
            <Pressable
              onPress={() => { setAuthMode('login'); go(4); }}
              style={{ height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}
            >
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.lilac }}>I already have an account</Text>
            </Pressable>
          </View>
        </Screen>
      </LinearGradient>
    );
  }

  if (step === 4) {
    return (
      <LinearGradient colors={[C.bgTop, C.bg]} locations={[0, 0.65]} style={shell}>
        <AuthStep
          mode={authMode}
          setMode={setAuthMode}
          insets={insets}
          succeeded={succeeded}
          onBack={() => go(3)}
          onDone={async () => {
            await completeOnboarding();
            setSucceeded(true);
          }}
          onEnter={() => router.replace('/(tabs)/home')}
          login={login}
          signup={signup}
          loginWithProvider={loginWithProvider}
        />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[C.bgTop, C.bg]} locations={[0, 0.65]} style={shell}>
      <View style={{ flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 24, marginBottom: 8,
          }}
        >
          <Pressable onPress={() => go(step - 1)} hitSlop={12} style={{ width: 60 }}>
            <Ionicons name="chevron-back" size={22} color={C.faint} />
          </Pressable>
          <Progress step={step} />
          <Pressable onPress={() => go(4)} hitSlop={12} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.faint }}>Skip</Text>
          </Pressable>
        </View>

        <Screen k={step}>
          {step === 1 && (
            <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
              <View style={{ alignItems: 'center', marginBottom: 44 }}>
                <SpinningCard />
              </View>
              <Eyebrow>EZER · PAY IN 4</Eyebrow>
              <View style={{ height: 12 }} />
              <Display size={36}>Split anything in four.</Display>
              <Text style={{ fontSize: 15.5, lineHeight: 24, color: C.muted, marginTop: 16 }}>
                No interest. No credit pull. One virtual card that turns any purchase into four easy payments.
              </Text>
              <View style={{ height: 28 }} />
              <Cta label="Next" onPress={() => go(2)} />
            </View>
          )}

          {step === 2 && (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              <Eyebrow>MEANWHILE, LAST MONTH</Eyebrow>
              <View style={{ height: 10 }} />
              <Display size={30}>This is a month, leaking.</Display>
              <View style={{ height: 20 }} />
              <LeakCalendar onFinished={calendarDone} />
              <Text style={{ fontSize: 14.5, color: C.muted, marginTop: 16, lineHeight: 22 }}>
                Six charges. Nobody noticed a single one.
              </Text>
              <View style={{ height: 22 }} />
              <Cta label="Ezer notices" onPress={() => go(3)} />
            </ScrollView>
          )}

          {step === 3 && (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' }}
              showsVerticalScrollIndicator={false}
            >
              <Display size={34}>Ezer catches all of it.</Display>
              <View style={{ height: 22 }} />
              <View style={{ backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 18 }}>
                <UpcomingRow letter="N" color="#E50914" name="Netflix" detail="Renewal · $15.49" chip="in 3d" chipColor={C.coral} />
                <View style={{ height: 16 }} />
                <UpcomingRow letter="H" color="#17B26A" name="Hulu" detail="Trial ends · becomes $17.99/mo" chip="in 5d" chipColor={C.gold} pulse />
                <View style={{ height: 16 }} />
                <UpcomingRow letter="A" color="#FA0F00" name="Adobe CC" detail="Renewal · $22.99" chip="in 9d" chipColor={C.coral} />
              </View>
              <Text style={{ fontSize: 15.5, lineHeight: 24, color: C.muted, marginTop: 20 }}>
                Flagged before they bill. Cancelled in one tap.
              </Text>
              <View style={{ height: 26 }} />
              <Cta label="Create my account" gradient onPress={() => { setAuthMode('signup'); go(4); }} />
              <Pressable
                onPress={() => { setAuthMode('login'); go(4); }}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
              >
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.lilac }}>I already have an account</Text>
              </Pressable>
            </ScrollView>
          )}
        </Screen>
      </View>
    </LinearGradient>
  );
}
