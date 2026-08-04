// =============================================================================
// EZER Redesign — progress ring
//
// A goal's progress as a ring rather than a bar. Two reasons it earns the
// dependency on react-native-svg (already in the tree):
//
//   * a ring reads as a single object at list density, where a 6px bar under
//     two lines of text reads as a divider; and
//   * it gives the goal's icon a home in the centre, so the row needs one
//     visual anchor instead of two competing ones.
//
// Stroke is drawn with strokeDasharray/offset and rotated -90° so 0% starts at
// twelve o'clock, which is the only place users expect it to start.
// =============================================================================

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export default function ProgressRing({
  /** 0–1. Values outside the range are clamped rather than drawn wrong. */
  progress,
  size = 46,
  stroke = 4,
  color,
  trackColor,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  // Inset by half the stroke: SVG centres a stroke on the path, so a circle at
  // r = size/2 would clip its outer half at the viewBox edge.
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={size}
        height={size}
        // -90° puts 0% at twelve o'clock instead of three.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {pct > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
