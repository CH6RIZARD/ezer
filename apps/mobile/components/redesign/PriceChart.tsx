// =============================================================================
// EZER Redesign — price history chart (handoff §6)
//
// SVG line chart of the last 6 monthly prices on the purple gradient card:
// gold 3px line, gold-ringed dots, 3 faint gridlines, month labels beneath.
// Colours are fixed across themes — the card is always the purple finish.
//
// Geometry is a 1:1 port of the prototype's SVG:
//   viewBox 0 0 300 138 · x = 16 + i*(268/(n-1)) · gridlines at y 36/74/112
//   plot band y 112 (min) -> 36 (max) · labels on the baseline at y 132
// The 16-unit side inset matters: at x=0 the first and last dots (r4.5 plus a
// 2.5 stroke) were clipped by the SVG bounds, and the month labels sat flush
// against the card padding instead of centred under their dots.
// =============================================================================

import React from 'react';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { chartColors } from '../../theme/tokens';
import { fontFamily } from '../../theme/type';

/** Prototype viewBox. Everything below is expressed in these units. */
const VB_W = 300;
const VB_H = 138;
const PAD_X = 16;
/** Baseline (min price) and height of the plot band. */
const Y_BASE = 112;
const Y_SPAN = 76;
/** y of a flat history — the prototype's literal value, not (Y_BASE - Y_SPAN/2). */
const Y_FLAT = 66;
const LABEL_Y = 132;

/** Dot core. The prototype fills against the gradient's TOP stop, not the end. */
const DOT_FILL = '#31136E';
const GRID_STROKE = 'rgba(255,255,255,.14)';
const LABEL_FILL = 'rgba(255,255,255,.65)';

export interface PricePoint {
  /** Short month label, e.g. "May". */
  label: string;
  cents: number;
}

export function PriceChart({ points, width }: { points: PricePoint[]; width: number }) {
  if (points.length === 0) return null;

  const values = points.map(p => p.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;

  const stepX = points.length > 1 ? (VB_W - PAD_X * 2) / (points.length - 1) : 0;
  const x = (i: number) => PAD_X + i * stepX;
  const y = (cents: number) => (flat ? Y_FLAT : Y_BASE - ((cents - min) / (max - min)) * Y_SPAN);

  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`)
    .join(' ');

  return (
    <Svg width={width} height={(width * VB_H) / VB_W} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {[36, 74, 112].map(gy => (
        <Line
          key={gy}
          x1={PAD_X}
          x2={VB_W - PAD_X}
          y1={gy}
          y2={gy}
          stroke={GRID_STROKE}
          strokeWidth={1}
        />
      ))}

      <Path
        d={d}
        fill="none"
        stroke={chartColors.line}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => (
        <Circle
          key={`c${i}`}
          cx={x(i)}
          cy={y(p.cents)}
          r={4.5}
          fill={DOT_FILL}
          stroke={chartColors.line}
          strokeWidth={2.5}
        />
      ))}

      {points.map((p, i) => (
        <SvgText
          key={`t${i}`}
          x={x(i)}
          y={LABEL_Y}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL_FILL}
          fontFamily={fontFamily.regular}
        >
          {p.label}
        </SvgText>
      ))}
    </Svg>
  );
}

export default PriceChart;
