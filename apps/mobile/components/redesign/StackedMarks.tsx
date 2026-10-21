// =============================================================================
// EZER Redesign — stacked merchant marks
//
// Up to three MerchantMarks cascading over each other, each ringed in the
// surface colour so the overlap reads as layers. Subscription savings uses it
// for "which subscriptions feed this goal" (Savings tab row: 30px tiles, 10px
// cascade down and right).
// =============================================================================

import React from 'react';
import { View } from 'react-native';
import MerchantMark from './MerchantMark';

export type StackedMark = { name: string; merchantId?: string; logoUrl?: string };

export default function StackedMarks({
  marks,
  size = 30,
  step = 10,
  diagonal = true,
  ringColor,
}: {
  marks: StackedMark[];
  size?: number;
  step?: number;
  /** Cascade down as well as right (the Savings row); false = a flat row. */
  diagonal?: boolean;
  /** The surface the marks sit on. */
  ringColor: string;
}) {
  const shown = marks.slice(0, 3);
  const n = Math.max(1, shown.length);
  // `size` is the outer tile, ring included (the mock's border-box 30px).
  const w = size + (n - 1) * step;
  const h = diagonal ? w : size;
  return (
    <View style={{ width: w, height: h }}>
      {shown.map((m, i) => (
        <View
          key={`${m.name}-${i}`}
          style={{
            position: 'absolute',
            left: i * step,
            top: diagonal ? i * step : 0,
            borderWidth: 2,
            borderColor: ringColor,
            borderRadius: Math.round(size * 0.34),
          }}
        >
          <MerchantMark name={m.name} merchantId={m.merchantId} logoUrl={m.logoUrl} size={size - 4} />
        </View>
      ))}
    </View>
  );
}
