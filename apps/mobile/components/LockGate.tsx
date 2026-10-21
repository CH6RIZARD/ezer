// =============================================================================
// EZER — passcode lock
//
// Wraps the router's Stack (see app/_layout.tsx) and draws a full-screen layer
// above it, so locking never touches navigation: whatever screen was open is
// still there, with its state, when the layer lifts.
//
//   cold start, passcode set     EZER fades in once → keypad → (EZER breathing
//                                while auth/data are still loading) → app
//   leaving the app              covered at once (app switcher, first frames
//                                back), then on return: the app again if away
//                                under 60s, else the keypad
//   signed in, no passcode       required "Set a passcode" (onboarding asks
//                                for it first; this catches everyone else)
//   signed out                   nothing; any stored passcode is deleted
//
// The layer is drawn in its own native surface — react-native-screens'
// FullWindowOverlay (a subview of the key window, above presented sheets) on
// iOS, a dialog window on Android — because RN <Modal> sheets (Move Money,
// the pickers) and the iOS fullScreenModal Paywall draw above the root view:
// a plain absolute View left them visible and usable under a "locked" app.
// A Paywall presented AFTER the overlay would still land above it, so
// usePremiumGate waits for LockOpenContext.
//
// The 60s grace only applies while the process lives: a cold start always
// asks. A grace window that trusted a stored wall-clock time could be skipped
// by setting the phone's clock back.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  AppState,
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../utils/appAlert';
import { FullWindowOverlay } from 'react-native-screens';
import { router } from 'expo-router';
import { markLockWarm } from '../utils/lockWarm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useData } from '../contexts/DataContext';
import { DoveFlight, DoveMark, DoveP1, DoveP1Preload } from './DoveReveal';
import { WORD } from './doveFrames';
import PasscodePad from './PasscodePad';
import PasscodeSetup from './PasscodeSetup';
import { fontFamily } from '../theme/type';
import { LOCK_GRACE_MS } from '../utils/passcodeCore';
import {
  clearPasscode,
  getPasscodeInfo,
  inAppFlowActive,
  onPasscodeChange,
  verifyPasscode,
  type PasscodeInfo,
} from '../utils/passcode';

type Phase =
  | 'cover' // nothing decided yet, or the app is away: an opaque EZER screen
  | 'intro' // the one EZER fade-in before the keypad
  | 'locked'
  | 'loading' // unlocked, but auth or data still on their way
  | 'setup'
  | 'open';

const SMALL_MARK = 96; // header wordmark width, dp
const FADE_MS = 900; // the index screen's breathing half-cycle

/** False while the lock is up. Screens that navigate on their own (the
 *  premium gate) wait for it, or they would present above the lock. */
export const LockOpenContext = React.createContext(true);
/**
 * True once the passcode is accepted (or there is none): the app may do its
 * heavy work now. While the keypad is up it must not — on the S22 mounting
 * all four tabs under the lock made the first digit take 3.9s to show.
 */
export const LockWarmContext = React.createContext(true);
/** Bank linking and the photo picker leave the app on Android; give them longer. */
const IN_APP_FLOW_GRACE_MS = 10 * 60_000;

export default function LockGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const auth = useAuth();
  const { isReady: dataReady } = useData();

  // undefined: not read yet.
  const [info, setInfo] = useState<PasscodeInfo | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('cover');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // A cover put over an OPEN app (a quick app switch; on iOS also Control
  // Centre, a notification, the app switcher) keeps the tabs mounted behind
  // it. Unmounting them there threw away the Wallet's cached totals, card and
  // range on every return, so the next switches waited on the network (Oct 21
  // 2026). The keypad ('locked') still unmounts them: nothing is under it.
  const [coverKeepsTabs, setCoverKeepsTabs] = useState(false);
  // A past-grace return: the cover has dropped the tabs, the keypad is next.
  const [relock, setRelock] = useState(false);
  const infoRef = useRef(info);
  infoRef.current = info;

  // The sheet's opacity. Lifted to 0 by `lift` below; back to 1 HERE, the
  // moment any covering phase is chosen, never after an `open`. It used to
  // be reset in lift's completion callback right after setPhase('open'):
  // setValue is immediate on the native side, setPhase is a React render,
  // and with the JS thread busy just after launch the render lagged 100-
  // 200ms, so the fully opaque wordmark sheet flashed back over the home
  // screen before it unmounted (device capture, Oct 2026).
  const layer = useRef(new Animated.Value(1)).current;
  // The after-passcode dove (P1) flies up into the camera WHILE the layer
  // lifts, so it is drawn outside the faded layer, and 'open' (which unmounts
  // the overlay) waits until it is in.
  const [p1Exit, setP1Exit] = useState(false);
  const p1Busy = useRef(false);
  const openAfterP1 = useRef(false);

  // Write the ref WITH the state, so a second AppState event queued before
  // the re-render reads the phase it just set.
  const move = useCallback(
    (next: Phase) => {
      const p = phaseRef.current;
      setCoverKeepsTabs(k => next === 'cover' && (p === 'open' || p === 'loading' || (p === 'cover' && k)));
      if (next === 'open' || next === 'loading') markLockWarm();
      if (next !== 'open') layer.setValue(1);
      p1Busy.current = false;
      openAfterP1.current = false;
      setP1Exit(false);
      phaseRef.current = next;
      setPhase(next);
    },
    [layer]
  );


  // --- cold start ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    getPasscodeInfo()
      // Unreadable or corrupt: fail closed. Only "Forgot passcode" (sign out)
      // gets past a record that cannot be checked.
      .catch((): PasscodeInfo => ({ len: 4, lockedUntil: 0 }))
      .then(stored => {
        if (cancelled) return;
        setInfo(stored);
        if (!stored) markLockWarm();
        setPhase(stored ? 'intro' : 'open');
      });
    const off = onPasscodeChange(next => {
      setInfo(next);
      if (!next) setPhase('open');
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // --- auth settles --------------------------------------------------------------
  // Signed out (logout, deleted account, or a session the server rejected at
  // launch): the passcode belonged to that session. Cleared HERE, after the
  // session is really gone — clearing it inside logout() dropped the lock
  // while the app was still signed in.
  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || info === undefined) return;
    if (info) void clearPasscode();
    else if (phaseRef.current !== 'open') setPhase('open');
  }, [auth.isLoading, auth.isAuthenticated, info]);

  // Signed in with no passcode: required. Onboarding asks first (its last
  // step, for accounts that have never finished it); this catches the rest.
  useEffect(() => {
    if (
      !auth.isLoading &&
      auth.isAuthenticated &&
      auth.hasCompletedOnboarding &&
      info === null &&
      phase === 'open'
    ) {
      move('setup'); // through move(): the layer may still be 0 from a lift
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.hasCompletedOnboarding, info, phase]);

  // --- leaving and coming back -------------------------------------------------------
  // Two clocks, and BOTH must say "under the grace": performance.now() cannot
  // be moved by setting the device clock, but on Android it stops while the
  // phone sleeps; Date.now() counts sleep, and a negative reading means the
  // clock was set back.
  const leftAt = useRef<{ mono: number; wall: number } | null>(null);
  // Taken when the app LEAVES: Plaid's onSuccess can land before the app is
  // active again, so asking at return time would already read "no flow".
  const leftInFlow = useRef(false);
  const resumeTo = useRef<Phase>('open');
  // Remounts the iOS overlay each time the app comes back: one first mounted
  // while the app was going to the background attaches to no window at all
  // (RCTKeyWindow() is nil then) and would never show the keypad.
  const [overlayKey, setOverlayKey] = useState(0);

  const markLeft = useCallback(() => {
    if (leftAt.current === null) {
      leftAt.current = { mono: performance.now(), wall: Date.now() };
      leftInFlow.current = inAppFlowActive();
    }
  }, []);

  // Every way INTO the app goes through here: an unlock or a lift that
  // finishes while the app is away becomes an ordinary "left while open",
  // so the grace check still runs on return instead of being skipped.
  const enter = useCallback(
    (next: 'open' | 'loading') => {
      if (AppState.currentState === 'active') return move(next);
      markLeft();
      resumeTo.current = next;
      move('cover');
    },
    [move, markLeft]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        // 'inactive' (iOS app switcher, before its snapshot) or 'background':
        // cover NOW, so neither the snapshot nor the first frames back show
        // the app. Only an unlocked app earns the grace window.
        const p = phaseRef.current;
        if (infoRef.current && (p === 'open' || p === 'loading')) {
          markLeft();
          resumeTo.current = p;
          move('cover');
        }
        return;
      }
      setOverlayKey(k => k + 1);
      if (leftAt.current === null) return;
      const mono = performance.now() - leftAt.current.mono;
      const wall = Date.now() - leftAt.current.wall;
      leftAt.current = null;
      if (phaseRef.current !== 'cover') return;
      const grace = leftInFlow.current ? IN_APP_FLOW_GRACE_MS : LOCK_GRACE_MS;
      if (mono < grace && wall >= 0 && wall < grace) return move(resumeTo.current);
      // Past the grace: the tabs come down behind the opaque cover first and
      // the keypad follows in the next commit (the effect below), so none of
      // the teardown lands in the keypad's commit (k62 first-digit time).
      setCoverKeepsTabs(false);
      setRelock(true);
    });
    return () => sub.remove();
  }, [move, markLeft]);

  useEffect(() => {
    if (!relock) return;
    setRelock(false);
    if (phaseRef.current === 'cover') move('locked');
  }, [relock, move]);

  // --- lift the layer --------------------------------------------------------------
  const lift = useCallback(() => {
    const from = phaseRef.current;
    Animated.timing(layer, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      // Only if nothing re-locked or covered the app during the fade (a
      // re-cover went through move(), which already put the layer back).
      if (phaseRef.current !== from) return;
      if (p1Busy.current) openAfterP1.current = true;
      else enter('open');
    });
  }, [layer, enter]);
  const p1Exited = useCallback(() => {
    p1Busy.current = false;
    if (openAfterP1.current && phaseRef.current === 'loading') {
      openAfterP1.current = false;
      enter('open');
    }
  }, [enter]);

  // Unlocked: one full EZER breath (up and back down), then in. Always the
  // one cycle, even when the saved dashboard is ready at once (the owner
  // wants the beat); longer only if auth or the first data are still out.
  // The dove (P1) loops for as long as that takes, and the moment both are
  // true it leaves from wherever it is in its loop: never cut shorter than
  // the breath, never held for the end of a lap.
  const [cycleDone, setCycleDone] = useState(false);
  useEffect(() => {
    if (phase !== 'loading') return;
    setCycleDone(false);
    const t = setTimeout(() => setCycleDone(true), FADE_MS * 2);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'loading' || !cycleDone || auth.isLoading || p1Exit) return;
    if (!auth.isAuthenticated || dataReady) {
      p1Busy.current = true;
      setP1Exit(true);
      lift();
    }
  }, [phase, cycleDone, auth.isLoading, auth.isAuthenticated, dataReady, lift, p1Exit]);

  // A keyboard left open in a sheet sits in its own window ABOVE the lock on
  // iOS, covering the keypad and typing into the hidden field. Blur it.
  useEffect(() => {
    if (phase !== 'open') Keyboard.dismiss();
  }, [phase]);

  // Android back must not reach the screen under the keypad (outside the
  // dialog; the dialog's own back press is swallowed by onRequestClose).
  useEffect(() => {
    if (phase === 'open') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [phase]);

  // --- wordmark ------------------------------------------------------------------------
  const mark = useRef(new Animated.Value(0.3)).current;
  // The intro waits for its two images, the word and the flight's sprite
  // sheet: on a cold start (above all the first after an install) decoding
  // them took longer than the fade, so the fade ran on an empty screen and
  // the dove first appeared already landing. Held at most 1.5s, so a failed
  // load never keeps the keypad back.
  const [introLoaded, setIntroLoaded] = useState({ word: false, dove: false });
  const introReady = introLoaded.word && introLoaded.dove;
  const wordLoaded = useCallback(() => setIntroLoaded(l => (l.word ? l : { ...l, word: true })), []);
  const doveLoaded = useCallback(() => setIntroLoaded(l => (l.dove ? l : { ...l, dove: true })), []);
  useEffect(() => {
    if (phase !== 'intro' || introReady) return;
    const t = setTimeout(() => setIntroLoaded({ word: true, dove: true }), 1500);
    return () => clearTimeout(t);
  }, [phase, introReady]);
  useEffect(() => {
    if (phase === 'intro') {
      if (!introReady) {
        mark.setValue(0);
        return;
      }
      mark.setValue(0.3);
      const fade = Animated.timing(mark, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      fade.start(({ finished }) => {
        if (finished && phaseRef.current === 'intro') setPhase('locked');
      });
      return () => fade.stop();
    }
    if (phase === 'cover' || phase === 'loading') {
      // Loading starts dim so its one cycle is a full rise and fall.
      if (phase === 'loading') mark.setValue(0.3);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(mark, { toValue: 1, duration: FADE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(mark, { toValue: 0.3, duration: FADE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [phase, mark, introReady]);

  // --- keypad -----------------------------------------------------------------------
  const pad = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase === 'locked' || phase === 'setup') {
      pad.setValue(0);
      Animated.timing(pad, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }
  }, [phase, pad]);

  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  // A stored lockout (from before a restart): refresh the clock with it, or a
  // lockout that expired during the intro would read as still running.
  useEffect(() => {
    if (phase === 'locked' && info?.lockedUntil) {
      setNow(Date.now());
      setLockedUntil(info.lockedUntil);
    }
  }, [phase, info]);

  // Tick the "try again in" countdown while a lockout runs.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const waitSecs = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  const unlock = async (code: string) => {
    const res = await verifyPasscode(code);
    if (res.ok) {
      setMessage(null);
      setLockedUntil(0);
      enter('loading');
      return true;
    }
    setNow(Date.now());
    setLockedUntil(res.lockedUntil);
    setMessage(
      res.lockedUntil > Date.now()
        ? null
        : `Wrong passcode. ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'try' : 'tries'} left before a short lockout.`
    );
    return false;
  };

  const forgot = () => {
    const signOut = async () => {
      await auth.logout();
      router.replace('/onboarding');
    };
    const text = 'You will be signed out. Sign back in to set a new passcode.';
    Alert.alert('Forgot your passcode?', text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const locked = phase !== 'open';
  const warm = phase === 'open' || phase === 'loading' || (phase === 'cover' && coverKeepsTabs);
  const showMark = phase === 'cover' || phase === 'intro' || phase === 'loading';

  // The approved render's proportions: the word is 0.517 of the screen width.
  const bigMark = Math.round(winW * 0.517);
  const smallMarkEl = (
    <View style={styles.smallMark}>
      <DoveMark width={SMALL_MARK} />
    </View>
  );

  // The camera point in the word's units, for P1's climb into it: top-centre,
  // half the status bar down (island centre / punch hole). The word's place
  // in the window is measured; the estimate is the centred layout below.
  const k = bigMark / WORD.w;
  const wordRef = useRef<View>(null);
  const [wordAt, setWordAt] = useState<{ x: number; y: number } | null>(null);
  const bar = Platform.OS === 'android' ? StatusBar.currentHeight ?? insets.top : insets.top;
  const word = wordAt ?? { x: (winW - bigMark) / 2, y: insets.top + (winH - insets.top - WORD.h * k) / 2 };
  const cam = { x: (winW / 2 - word.x) / k, y: (bar / 2 - word.y) / k };

  const padLayer = useMemo(() => Animated.multiply(pad, layer), [pad, layer]);

  const sheet = (
    // The layer's opacity is on the background and the content, not on this
    // root: P1 keeps flying, at full strength, over the app as it appears.
    <View style={StyleSheet.absoluteFill} pointerEvents={p1Exit ? 'none' : 'auto'} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: layer }]} />
      {showMark ? (
        // Same box as app/index.tsx, so the hand-off from that screen is seamless.
        <View style={[styles.center, { paddingTop: insets.top }]}>
          {/* Intro: only the word fades; the dove flies in at full strength
              and lands on the R as the fade ends. Loading (after the
              passcode): the word breathes while the dove (P1) takes off from
              the R and circles it. Covering: the whole mark, dove included, breathes. */}
          <View ref={wordRef} onLayout={() => wordRef.current?.measureInWindow((x, y) => setWordAt({ x, y }))}>
            <Animated.View style={{ opacity: layer }}>
              <Animated.View style={{ opacity: mark }}>
                <DoveMark width={bigMark} perched={phase === 'cover'} onLoad={wordLoaded} />
              </Animated.View>
            </Animated.View>
            {phase === 'loading' && (
              <DoveP1
                width={bigMark}
                cam={cam}
                exit={p1Exit}
                fade={!(Platform.OS === 'ios' && insets.top >= 44)}
                onExited={p1Exited}
              />
            )}
            {phase === 'intro' && (
              <DoveFlight width={bigMark} duration={FADE_MS} play={introReady} onLoad={doveLoaded} />
            )}
          </View>
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: padLayer }}>
          {/* Decode P1's sheets now, so the dove takes off on the
              loading phase's first frame instead of freezing, then popping. */}
          {phase === 'locked' && <DoveP1Preload />}
          {phase === 'setup' ? (
            <PasscodeSetup
              palette={colors}
              header={smallMarkEl}
              onDone={lift}
            />
          ) : (
            <PasscodePad
              palette={colors}
              header={smallMarkEl}
              title="Enter your passcode"
              length={info?.len ?? 4}
              onSubmit={unlock}
              disabled={waitSecs > 0}
              message={waitSecs > 0 ? `Too many tries. Try again in ${waitSecs}s.` : message}
              footer={
                <Pressable onPress={forgot} hitSlop={10} accessibilityRole="button">
                  <Text style={[styles.forgot, { color: colors.mut }]}>Forgot passcode?</Text>
                </Pressable>
              }
            />
          )}
        </Animated.View>
      )}
    </View>
  );

  return (
    <>
      {/* Screen readers must not reach the app under the lock. */}
      <View
        style={styles.fill}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}
      >
        <LockWarmContext.Provider value={warm}>
          {/* The Stack stays mounted under the lock (mounting it late
              remounted every provider above — timeline on the k62); what
              stays OUT until the code is accepted is the tabs' content, see
              app/(tabs)/_layout.tsx's LockWarmContext placeholder. */}
          <LockOpenContext.Provider value={!locked}>{children}</LockOpenContext.Provider>
        </LockWarmContext.Provider>
      </View>
      {locked &&
        (Platform.OS === 'ios' ? (
          <FullWindowOverlay key={overlayKey}>{sheet}</FullWindowOverlay>
        ) : Platform.OS === 'android' ? (
          <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
            {sheet}
          </Modal>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.web]}>{sheet}</View>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  web: { zIndex: 1000 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // The perched dove rises 0.36 of the word's width above it.
  smallMark: { marginTop: Math.ceil(SMALL_MARK * 0.36), marginBottom: 18 },
  forgot: { fontFamily: fontFamily.semibold, fontSize: 14 },
});
