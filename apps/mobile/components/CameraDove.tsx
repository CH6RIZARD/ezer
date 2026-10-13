// =============================================================================
// EZER — the one loader: a dove that comes out of the phone's camera.
//
// There are no spinners in this app. A wait registers with
//   useCameraDove(active, label?)   or   <DoveLoader active={...} />
// and ONE app-wide host (mounted once inside LockGate in app/_layout.tsx,
// pointerEvents none, above the screens) flies a rendered dove out of the
// camera cut-out, keeps it hovering in the ~21 dp band between the camera and
// the header while any registration is active, and when the last one ends
// finishes the current lap and flies FULLY back into the camera. Rules
// (owner, Oct 2026):
//   - each appearance picks one of the approved paths A, B, C, F at random,
//     never the same one twice in a row;
//   - it only comes out if the wait outlasts WAIT_MS; once out it always
//     completes in, at least to the end of a lap, and out;
//   - the exit always goes all the way into the camera (no sliver at the
//     island's edge), and only the exit does: F's mid-loop pop up was removed;
//   - reduced motion: a still dove fades in and out near the camera point;
//   - backgrounded or behind the lock: gone at once, re-shown on return if
//     something is still loading.
// Paths, cells and the fit rule come from E:\ezer-dove\loaders\frames\camera_*
// \path.json via E:\ezer-dove\loaders\work\export_app_doves.py
// (cameraDoveFrames.ts). Camera point: top-centre, half the status-bar height
// down (island centre on iPhone, the punch hole on most Androids).
//
// Sheets (Modal) on Android draw above the root view, so each sheet that waits
// also mounts <CameraDoveHost nested />: the last mounted host draws, the
// animation state is shared, so a sheet opening mid-flight continues it. On
// iOS the root host sits in a FullWindowOverlay, above presented sheets.
// =============================================================================

import React, { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Platform, StatusBar, View, useWindowDimensions } from 'react-native';
import Animated, { makeMutable, useAnimatedStyle, useFrameCallback, useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAMERA_DOVES, CAMERA_FIT, type CameraDoveId } from './cameraDoveFrames';
import { EDGE, EDGE_DP, EDGE_OPACITY, useEdge } from './DoveReveal';
import { LockOpenContext } from './LockGate';

const WAIT_MS = 300;
const FPS = 30;
const IDS = Object.keys(CAMERA_DOVES) as CameraDoveId[];
/** Reduced motion: frames of fade in and out around the still dove. */
const RM_FADE = 8;

// ------------------------------------------------------------------ store

let count = 0;
const labels: string[] = [];
let gate = false; // app active and the lock open (root host reports it)
let timer: ReturnType<typeof setTimeout> | null = null;
let run: { id: CameraDoveId; serial: number } | null = null;
let last: CameraDoveId | null = null;
let serial = 0;
const hosts: number[] = [];
let hostSeq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// Shared with the UI thread. phase: 0 in, 1 loop, 2 out, 3 done.
const want = makeMutable(false);
const phase = makeMutable(3);
const t = makeMutable(0);

function start() {
  const pool = IDS.filter(i => i !== last);
  const id = pool[Math.floor(Math.random() * pool.length)];
  last = id;
  t.value = 0;
  phase.value = 0;
  run = { id, serial: ++serial };
  emit();
  if (labels.length) AccessibilityInfo.announceForAccessibility(labels[labels.length - 1]);
}

function update() {
  const on = count > 0 && gate;
  want.value = on;
  if (!gate) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (run) {
      run = null;
      phase.value = 3;
      emit();
    }
    return;
  }
  if (run) return; // the UI thread reads `want`: loops on, or finishes the lap and goes in
  if (on && !timer) {
    timer = setTimeout(() => {
      timer = null;
      if (count > 0 && gate && !run) start();
    }, WAIT_MS);
  } else if (!on && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function done(s: number) {
  if (!run || run.serial !== s) return;
  run = null;
  emit();
  update(); // still loading: it comes out again (after WAIT_MS)
}

/** Shows the camera dove while `active` (after WAIT_MS). `label` is announced to screen readers. */
export function useCameraDove(active: boolean, label = 'Loading') {
  useEffect(() => {
    if (!active) return;
    count++;
    labels.push(label);
    update();
    return () => {
      count--;
      labels.splice(labels.lastIndexOf(label), 1);
      update();
    };
  }, [active, label]);
}

/** The same as useCameraDove, for JSX. Renders nothing where it is placed. */
export function DoveLoader({ active = true, label }: { active?: boolean; label?: string }) {
  useCameraDove(active, label);
  return null;
}

// ------------------------------------------------------------------ host

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Mount once at the root (inside LockGate); `nested` inside an Android sheet's Modal. */
export function CameraDoveHost({ nested = false }: { nested?: boolean }) {
  const [me] = useState(() => ++hostSeq);
  const skip = nested && Platform.OS === 'ios'; // the root's overlay is above sheets there
  useEffect(() => {
    if (skip) return;
    hosts.push(me);
    emit();
    return () => {
      hosts.splice(hosts.indexOf(me), 1);
      emit();
    };
  }, [me, skip]);
  const top = useSyncExternalStore(subscribe, () => hosts[hosts.length - 1]);
  const cur = useSyncExternalStore(subscribe, () => run);

  // The root host owns the gate: app in the foreground and the lock open.
  const lockOpen = useContext(LockOpenContext);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    if (nested) return;
    const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, [nested]);
  useEffect(() => {
    if (nested) return;
    gate = active && lockOpen;
    update();
  }, [nested, active, lockOpen]);

  if (skip || top !== me || !cur) return null;
  const dove = <Sprite key={cur.serial} id={cur.id} serial={cur.serial} />;
  return Platform.OS === 'ios' ? <FullWindowOverlay>{dove}</FullWindowOverlay> : dove;
}

function Sprite({ id, serial: s }: { id: CameraDoveId; serial: number }) {
  const P = CAMERA_DOVES[id];
  const reduced = useReducedMotion();
  const edge = useEdge();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const box = useRef<View>(null);
  // Where this view's top is in the window (a Modal or a non edge-to-edge root starts lower).
  const [offY, setOffY] = useState(0);

  // Camera point and the fit rule (path.json: band = content top - camera y).
  const bar = Platform.OS === 'android' ? StatusBar.currentHeight ?? insets.top : insets.top;
  const camX = W / 2;
  const camY = bar / 2 - offY;
  const fp = Math.min(1, Math.max(CAMERA_FIT.posMin, (bar + 10 - bar / 2) / CAMERA_FIT.bandRef));
  const fs = 0.4 + 0.6 * fp;
  const sd = (W / 390) * fp;
  const C = P.cell;
  const { ni, nl, no, f, cols } = P;
  const NI = reduced ? RM_FADE : ni;
  const NL = reduced ? 1 : nl;
  const NO = reduced ? RM_FADE : no;

  useFrameCallback(info => {
    'worklet';
    if (phase.value === 3) return;
    // Capped: after a long stall it skips at most a few frames, never a whole clip.
    let x = t.value + (Math.min(info.timeSincePreviousFrame ?? 16.7, 100) * FPS) / 1000;
    if (phase.value === 0 && x >= NI) {
      phase.value = 1;
      x -= NI;
    }
    if (phase.value === 1 && x >= NL) {
      x -= NL;
      if (!want.value) phase.value = 2;
    }
    if (phase.value === 2 && x >= NO) {
      phase.value = 3;
      x = NO - 0.001;
      scheduleOnRN(done, s);
    }
    t.value = x;
  });

  const frame = () => {
    'worklet';
    if (reduced) return ni; // loop frame 0, under the camera
    const i = Math.floor(t.value);
    return phase.value === 0 ? Math.min(i, ni - 1) : phase.value === 1 ? ni + (i % nl) : ni + nl + Math.min(i, no - 1);
  };
  const win = useAnimatedStyle(() => {
    const i = frame();
    let o = f[i * 4 + 3];
    if (reduced) o = phase.value === 0 ? t.value / RM_FADE : phase.value === 1 ? 1 : 1 - t.value / RM_FADE;
    return {
      opacity: phase.value === 3 ? 0 : o,
      transform: [
        { translateX: camX + f[i * 4] * sd - C / 2 },
        { translateY: camY + f[i * 4 + 1] * sd - C / 2 },
        { scale: f[i * 4 + 2] * fs },
      ],
    };
  });
  const slide = useAnimatedStyle(() => {
    const i = frame();
    return { transform: [{ translateX: -(i % cols) * C }, { translateY: -Math.floor(i / cols) * C }] };
  });
  const size = { width: C * cols, height: C * P.rows };
  return (
    <View
      ref={box}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: W, height: 160 }}
      onLayout={() => box.current?.measureInWindow((_x, y) => setOffY(y))}
    >
      <Animated.View
        needsOffscreenAlphaCompositing={!!edge}
        style={[{ position: 'absolute', left: 0, top: 0, width: C, height: C, overflow: 'hidden' }, win]}
      >
        {edge &&
          EDGE.map(([dx, dy], i) => (
            <View key={i} style={{ position: 'absolute', left: dx * EDGE_DP, top: dy * EDGE_DP, opacity: EDGE_OPACITY }}>
              <Animated.Image source={P.sheet} style={[size, { tintColor: edge }, slide]} />
            </View>
          ))}
        <Animated.Image source={P.sheet} style={[size, slide]} />
      </Animated.View>
    </View>
  );
}
