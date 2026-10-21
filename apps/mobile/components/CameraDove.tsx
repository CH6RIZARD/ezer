// =============================================================================
// EZER — the one loader: a dove that comes out of the phone's camera.
//
// There are no spinners in this app. A wait registers with
//   useCameraDove(active, label?)   or   <DoveLoader active={...} />
// and ONE app-wide host (mounted once inside LockGate in app/_layout.tsx,
// pointerEvents none, above the screens) flies a rendered dove out of the
// camera cut-out, keeps it hovering in the ~21 dp band between the camera and
// the header while any registration is active, and when the last one ends
// leaves from WHERE IT IS (no finishing the lap: the out clip is carried over
// to start at the current loop frame and blended in, like P1's exit) and
// flies FULLY back into the camera. Rules (owner, Oct 2026):
//   - each appearance picks one of the 16 approved paths (A-P) at random,
//     never the same one twice in a row;
//   - it only comes out if the wait outlasts WAIT_MS; once out it always
//     completes in and out;
//   - the camera forms a black droplet that releases it (SPAWN), and its
//     return ends in a small liquid bump at the cut-out (ENTRY);
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

import React, { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Platform, StatusBar, View, useWindowDimensions } from 'react-native';
import Animated, { makeMutable, useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAMERA_DOVES, CAMERA_FIT, type CameraDoveId } from './cameraDoveFrames';
import { EDGE, EDGE_DP, EDGE_OPACITY, useEdge } from './DoveReveal';
import { LockOpenContext } from './LockGate';
import { useTheme } from '../utils/ThemeContext';
import { darkTokens } from '../theme/tokens';

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
/** The loop frame an exit left from (it carries the out clip over to start there). */
const exitL = makeMutable(0);

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

/** True while the camera dove is out. The tabs' EZER mark leaves its perch empty meanwhile: it is the same bird,
 *  and a perched dove plus a flying one read as two (owner, Oct 14 2026: "dupe birds in initial load"). */
export function useCameraDoveOut(): boolean {
  return useSyncExternalStore(subscribe, () => run !== null);
}

/** The same as useCameraDove, for JSX. Renders nothing where it is placed. */
export function DoveLoader({ active = true, label }: { active?: boolean; label?: string }) {
  useCameraDove(active, label);
  return null;
}

// ------------------------------------------------------------------ host

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

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
    const opened = lockOpen && !gate;
    gate = active && lockOpen;
    // The lock just opened (P1 has gone into the camera) with something still
    // loading: come straight back out, no 300 ms wait, so it reads as the same
    // bird ducking in and out rather than a pause and a second dove.
    if (opened && gate && count > 0 && !run) start();
    update();
  }, [nested, active, lockOpen]);

  if (skip || top !== me || !cur) return null;
  const dove = <Sprite key={cur.serial} id={cur.id} serial={cur.serial} />;
  return Platform.OS === 'ios' ? <FullWindowOverlay>{dove}</FullWindowOverlay> : dove;
}

/** Frames the droplet forms before the bird's in clip starts (the bird is inside it until it pinches off). */
const SPAWN = 10;
/** Frames of the "entered liquid" bump after the bird is in the camera. */
const ENTRY = 12;
/**
 * The loading bird drawn over its rendered size: 15% (owner, Oct 14 2026: "15 percent
 * bigger"), then 22% more on top (Oct 15 2026: "22 percent bigger... it's so small").
 */
const BIRD_K = 1.15 * 1.22;
/** Frames over which an early exit blends from the running loop into the out clip. */
const EXIT_BLEND = 6;
const AnimatedPath = Animated.createAnimatedComponent(Path);

const sm = (v: number) => {
  'worklet';
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** The droplet: a teardrop hanging from the cut-out's bottom edge y0. Its body is an ellipse (centre (cx, cy),
 *  radii rx, ry: taller than wide while it stretches); its neck leaves the cut-out at x = nx with half-width bw
 *  and narrows to a waist of half-width nw before flaring into the body, as one smooth outline (cubic sides, an
 *  arc round the bottom). nw 0 = pinched off: the body alone, plus `stub`, the neck's remnant retracting into
 *  the cut-out. Owner, Oct 14 2026: the first version "just looks like a dot". */
function dropPath(cx: number, cy: number, rx: number, ry: number, nx: number, y0: number, bw: number, nw: number, stub: number) {
  'worklet';
  let p = '';
  if (rx >= 0.3) {
    if (nw > 0.3) {
      const k = cy - y0;
      p = `M ${nx - bw - 2} ${y0 - 4} L ${nx + bw + 2} ${y0 - 4} L ${nx + bw + 2} ${y0}` +
        ` C ${nx + nw} ${y0 + 0.25 * k} ${cx + rx} ${cy - 0.75 * ry} ${cx + rx} ${cy}` +
        ` A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}` +
        ` C ${cx - rx} ${cy - 0.75 * ry} ${nx - nw} ${y0 + 0.25 * k} ${nx - bw - 2} ${y0} Z`;
    } else {
      p = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`;
    }
  }
  if (stub > 0.3) {
    const w = 2 + stub * 0.8;
    p += ` M ${nx - w - 2} ${y0 - 4} L ${nx + w + 2} ${y0 - 4} L ${nx + w + 2} ${y0} Q ${nx} ${y0 + 2 * stub} ${nx - w - 2} ${y0} Z`;
  }
  return p;
}

type Pose = { x: number; y: number; s: number; ca: number; oa: number; cb: number; ob: number };

function Sprite({ id, serial: s }: { id: CameraDoveId; serial: number }) {
  const P = CAMERA_DOVES[id];
  const reduced = useReducedMotion();
  const edge = useEdge();
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const box = useRef<View>(null);
  // Where this view's top is in the window (a Modal or a non edge-to-edge root starts lower).
  const [offY, setOffY] = useState(0);

  // Camera point and the fit rule (path.json: band = content top - camera y).
  const bar = Platform.OS === 'android' ? StatusBar.currentHeight ?? insets.top : insets.top;
  const camX = W / 2;
  const camY = bar / 2 - offY;
  // Bottom of the cut-out the droplet hangs from: the Dynamic Island (top 11, 37 tall), a notch, or a hole.
  const y0 = (Platform.OS === 'ios' ? (insets.top >= 51 ? insets.top - 11 : insets.top * 0.66) : bar / 2 + 4.5) - offY;
  const fp = Math.min(1, Math.max(CAMERA_FIT.posMin, (bar + 10 - bar / 2) / CAMERA_FIT.bandRef));
  const fs = 0.4 + 0.6 * fp;
  const sd = (W / 390) * fp;
  const C = P.cell;
  const { ni, nl, no, f, cols } = P;
  const SP = reduced ? 0 : SPAWN;
  const NI = (reduced ? RM_FADE : ni) + SP;
  const NL = reduced ? 1 : nl;
  const NO = reduced ? RM_FADE : no;
  const NE = reduced ? 0 : ENTRY;
  // Where the bird comes out: the first in-clip frame whose body is below the cut-out. The drop forms at the
  // camera, travels there, pinches off, and the bird fades in out of it (it used to appear beside the drop).
  const { ke, ex, ey } = useMemo(() => {
    let k = 0;
    while (k < ni - 1 && camY + f[k * 4 + 1] * sd < y0 + 4) k++;
    return { ke: k, ex: f[k * 4] * sd, ey: camY + f[k * 4 + 1] * sd - y0 };
  }, [f, ni, camY, sd, y0]);
  // Half-width of the cut-out's bottom edge the neck may leave from (island ~50, notch ~70, hole ~3).
  const edgeW = Platform.OS === 'ios' ? (insets.top >= 51 ? 50 : 70) : 3;
  // Widest the neck's base may be where it leaves the cut-out: a punch hole is ~9 dp, so wider reads as a keyhole.
  const bwCap = Platform.OS === 'ios' ? 12 : 2.5;

  useFrameCallback(info => {
    'worklet';
    if (phase.value === 3) return;
    // Capped: after a long stall it skips at most a few frames, never a whole clip.
    let x = t.value + (Math.min(info.timeSincePreviousFrame ?? 16.7, 100) * FPS) / 1000;
    if (phase.value === 0 && x >= NI) {
      phase.value = 1;
      x -= NI;
    }
    if (phase.value === 1) {
      if (!want.value) {
        // Loading is done: leave from THIS loop frame, no finishing the lap (owner, Oct 14 2026). The out
        // clip is carried over to start where the dove is and blends in over EXIT_BLEND frames.
        exitL.value = Math.floor(x) % NL;
        phase.value = 2;
        x -= Math.floor(x);
      } else if (x >= NL) x -= NL;
    }
    if (phase.value === 2 && x >= NO + NE) {
      phase.value = 3;
      x = NO + NE - 0.001;
      scheduleOnRN(done, s);
    }
    t.value = x;
  });

  // Where the bird is and which cells show: a = the running clip's cell, b = the out clip's (exit blend).
  const pose = (): Pose => {
    'worklet';
    const ph = phase.value;
    const i = Math.floor(t.value);
    if (reduced) {
      const o = ph === 0 ? t.value / RM_FADE : ph === 1 ? 1 : Math.max(0, 1 - t.value / RM_FADE);
      return { x: f[ni * 4], y: f[ni * 4 + 1], s: f[ni * 4 + 2], ca: ni, oa: ph === 3 ? 0 : o, cb: 0, ob: 0 };
    }
    if (ph === 0) {
      const k = i - SP;
      const c = Math.min(Math.max(k, 0), ni - 1);
      const a = sm((t.value - SP - ke) / 3); // fades in out of the drop
      return { x: f[c * 4], y: f[c * 4 + 1], s: f[c * 4 + 2], ca: c, oa: a * f[c * 4 + 3], cb: 0, ob: 0 };
    }
    if (ph === 1) {
      const c = ni + (i % nl);
      return { x: f[c * 4], y: f[c * 4 + 1], s: f[c * 4 + 2], ca: c, oa: f[c * 4 + 3], cb: 0, ob: 0 };
    }
    // Exit from loop frame L: the out clip's own motion, carried over to start at L and drawn in to the camera
    // as it goes (c), blended over EXIT_BLEND frames from the loop that is still running (b).
    const ie = Math.min(i, no - 1);
    const L = exitL.value;
    const li = ni + ((L + ie) % nl);
    const lL = ni + L;
    const e = ni + nl + ie;
    const e0 = ni + nl;
    const c = sm(ie / (no - 1));
    const px = (1 - c) * (f[lL * 4] + f[e * 4] - f[e0 * 4]) + c * f[e * 4];
    const py = (1 - c) * (f[lL * 4 + 1] + f[e * 4 + 1] - f[e0 * 4 + 1]) + c * f[e * 4 + 1];
    const ps = (1 - c) * ((f[lL * 4 + 2] * f[e * 4 + 2]) / f[e0 * 4 + 2]) + c * f[e * 4 + 2];
    const b = sm(t.value / EXIT_BLEND);
    const o = ph === 3 || i >= no ? 0 : f[e * 4 + 3];
    return {
      x: f[li * 4] + (px - f[li * 4]) * b,
      y: f[li * 4 + 1] + (py - f[li * 4 + 1]) * b,
      s: f[li * 4 + 2] + (ps - f[li * 4 + 2]) * b,
      // One sprite at a time (P1's exit, same reason): a cross-fade drew two translucent doves at once.
      ca: li,
      oa: b < 0.5 ? o : 0,
      cb: e,
      ob: b < 0.5 ? 0 : o,
    };
  };
  const place = (q: Pose, o: number) => {
    'worklet';
    return {
      opacity: o,
      transform: [
        { translateX: camX + q.x * sd - C / 2 },
        { translateY: camY + q.y * sd - C / 2 },
        { scale: q.s * fs * BIRD_K },
      ],
    };
  };
  const winA = useAnimatedStyle(() => {
    const q = pose();
    return place(q, q.oa);
  });
  const winB = useAnimatedStyle(() => {
    const q = pose();
    return place(q, q.ob);
  });
  const cellAt = (c: number) => {
    'worklet';
    return { transform: [{ translateX: -(c % cols) * C }, { translateY: -Math.floor(c / cols) * C }] };
  };
  const slideA = useAnimatedStyle(() => cellAt(pose().ca));
  const slideB = useAnimatedStyle(() => cellAt(pose().cb));

  // The droplet (owner, Oct 14 2026): the camera forms a black drop that releases the dove, and when the dove
  // flies back in, the cut-out's edge gives a small liquid bump, as if it entered something.
  const drop = useAnimatedProps(() => {
    if (reduced) return { d: '' };
    const ph = phase.value;
    const v = t.value;
    if (ph === 0) {
      // Swells out of the cut-out, stretches down toward where the bird comes out, necks in, pinches off at tp
      // with a wobble, and the body shrinks away while the bird fades in out of it.
      const tp = SP + ke;
      const u = sm(v / tp);
      const grow = sm(v / (0.6 * tp));
      const after = Math.max(0, v - tp);
      const rx0 = 9.5 * grow * (1 - sm(after / 6));
      const wob = after > 0 ? 0.28 * Math.exp(-after / 2.5) * Math.cos(after * 1.4) : 0;
      const rx = rx0 * (1 - wob * 0.5);
      const ry = rx0 * (1 + 0.45 * u * (1 - sm(after / 3)) + wob);
      const cy = y0 + 2 + ry * 0.6 + (ey - 2) * u;
      const cx = camX + ex * u;
      const nx = camX + Math.max(-edgeW, Math.min(edgeW, ex * u * 0.4));
      const bw = Math.min(bwCap, 9 * grow * (1 - 0.35 * u));
      const nw = after > 0 ? 0 : rx * 0.55 * (1 - sm((v - (tp - 5)) / 5));
      const stub = after > 0 ? Math.min(bwCap + 1, 4) * (1 - sm(after / 5)) : 0;
      return { d: dropPath(cx, cy, rx, ry, nx, y0, bw, nw, stub) };
    }
    if (ph === 2) {
      // The bird is in: the surface takes it like liquid, a small drop bulges out, springs back once, settles.
      const e = v - (NO - 3);
      if (e < 0 || e > NE) return { d: '' };
      const amp = Math.exp(-e / 3.5) * Math.cos(e * 0.75);
      if (amp <= 0) return { d: '' };
      const r = 5.5 * amp;
      return { d: dropPath(camX, y0 + 1 + r * 0.9, r, r * 1.2, camX, y0, Math.min(bwCap, 6 * amp), r * 0.7, 0) };
    }
    return { d: '' };
  });

  const size = { width: C * cols, height: C * P.rows };
  const win = (style: object, slide: object) => (
    <Animated.View
      needsOffscreenAlphaCompositing={!!edge}
      style={[{ position: 'absolute', left: 0, top: 0, width: C, height: C, overflow: 'hidden' }, style]}
    >
      {edge &&
        EDGE.map(([dx, dy], i) => (
          <View key={i} style={{ position: 'absolute', left: dx * EDGE_DP, top: dy * EDGE_DP, opacity: EDGE_OPACITY }}>
            <Animated.Image source={P.sheet} resizeMode="stretch" style={[size, { tintColor: edge }, slide]} />
          </View>
        ))}
      <Animated.Image source={P.sheet} resizeMode="stretch" style={[size, slide]} />
    </Animated.View>
  );
  return (
    <View
      ref={box}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: W, height: 160 }}
      onLayout={() => box.current?.measureInWindow((_x, y) => setOffY(y))}
    >
      {win(winA, slideA)}
      {win(winB, slideB)}
      {/* Above the bird: it is inside the drop until the neck pinches. On black the drop would vanish, so it
          gets a 1 dp hairline in the line colour (a stroke pass under the fill, so the neck's seam never shows). */}
      <Svg width={W} height={160} style={{ position: 'absolute', left: 0, top: 0 }}>
        {mode === 'black' && (
          <AnimatedPath animatedProps={drop} fill={darkTokens.line} stroke={darkTokens.line} strokeWidth={2} />
        )}
        <AnimatedPath animatedProps={drop} fill="#000" />
      </Svg>
    </View>
  );
}
