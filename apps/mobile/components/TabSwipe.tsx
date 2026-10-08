// =============================================================================
// Swipe between the four main tabs (Home ⇄ Pay in 4 ⇄ Wallet ⇄ Savings).
//
// Wraps each tab screen via the Tabs navigator's `screenLayout`. A horizontal
// swipe moves to the neighbouring tab; the page follows the finger a little
// (resisted) so the swipe reads as physical, then the tab changes with no
// slide, matching tab taps.
//
// Everything else that moves horizontally wins, natively, because
// gesture-handler activates whichever handler crosses its threshold first and
// cancels the rest: SpinCard's pan starts at 2px, and Wallet's carousel and
// chip row are RNGH ScrollViews that start at the platform's scroll slop,
// both well before this pan's 30px. Vertical movement past 12px fails this
// pan, so page scrolling is untouched. Keep any NEW horizontal scroller on a
// tab an RNGH ScrollView, or it and this swipe will both fire.
// =============================================================================

import React from 'react';
import { Platform, ScrollView as RNScrollView, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useIsFocused } from '@react-navigation/native';
import { motion } from '../theme/type';

export const SWIPE_TABS = ['home', 'payin4', 'wallet', 'savings'] as const;

// On native, a gesture that activates cancels the JS touch under it, so the
// tile a swipe started on never fires its press. Gesture-handler's web build
// does not, and the mouse-up after a swipe opened whatever tile it began on
// (a swipe from Home's Savings tile landed on Savings). PressScale asks this.
let lastSwipeAt = 0;
const markSwipe = () => {
  lastSwipeAt = Date.now();
};
// Web only: SpinCard's web path is a PanResponder, which gesture-handler
// can't see, so a card turn there would also count as a tab swipe. The card
// calls this on every move; a swipe ending inside the window is dropped.
let heldUntil = 0;
export const holdTabSwipe = () => {
  heldUntil = Date.now() + 400;
};
export const tabSwipeHeld = () => Date.now() < heldUntil;

/** True while a tab swipe runs and briefly after, so its release isn't a tap. */
export const swipedRecently = () => Date.now() - lastSwipeAt < 350;

/**
 * The ScrollView for tab screens. Native: RNGH's, which only claims a touch
 * once it really scrolls, so horizontal content and this swipe sort
 * themselves out natively. Web: RN's own, because RNGH's web ScrollView
 * claims the pointer at press-down and no swipe on that page could start.
 */
export const TabScrollView = (Platform.OS === 'web' ? RNScrollView : GHScrollView) as typeof RNScrollView;

/** Commit when dragged this far, or flicked this fast (px/s). */
const COMMIT_DX = 70;
const COMMIT_VX = 600;
/** How much of the finger's travel the page shows: a hint, not a pager. */
const FOLLOW = 0.25;
const FOLLOW_MAX = 48;

export function TabSwipe({
  routeName,
  onSwipeTo,
  children,
}: {
  routeName: string;
  onSwipeTo: (name: string) => void;
  children: React.ReactNode;
}) {
  const index = (SWIPE_TABS as readonly string[]).indexOf(routeName);
  // Every tab stays mounted, and on web the hidden ones still sit in the page
  // under the pointer: only the focused tab's swipe may run, or a swipe on
  // Home is caught by Wallet's handler and lands somewhere else entirely.
  const focused = useIsFocused();
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  if (index < 0) return <>{children}</>;
  const prev = index > 0 ? SWIPE_TABS[index - 1] : null;
  const next = index < SWIPE_TABS.length - 1 ? SWIPE_TABS[index + 1] : null;

  const pan = Gesture.Pan()
    .enabled(focused)
    .activeOffsetX([-30, 30])
    .failOffsetY([-12, 12])
    .onStart(() => {
      scheduleOnRN(markSwipe);
    })
    .onUpdate(e => {
      // Rubber-band at the ends: no neighbour that way, so barely move.
      const blocked = (e.translationX > 0 && !prev) || (e.translationX < 0 && !next);
      const f = blocked ? FOLLOW / 3 : FOLLOW;
      x.set(Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, e.translationX * f)));
    })
    .onEnd(e => {
      scheduleOnRN(markSwipe);
      const go = e.translationX < -COMMIT_DX || e.velocityX < -COMMIT_VX ? next
        : e.translationX > COMMIT_DX || e.velocityX > COMMIT_VX ? prev
        : null;
      if (go) {
        // The page is frozen once blurred (freezeOnBlur), so reset it now.
        x.set(0);
        scheduleOnRN(onSwipeTo, go);
      } else {
        x.set(withTiming(0, { duration: 200, easing: Easing.bezier(...motion.easeOut) }));
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
