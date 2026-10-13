// Port of apps/mobile/components/redesign/ProgressRing.tsx
//
// A goal's progress as a ring: track circle + progress arc (round cap) starting at twelve o'clock,
// children centred. size default 46, stroke 4, r = (size - stroke)/2 (inset by half the stroke),
// progress clamped 0–1 (non-finite -> 0); no arc at all at 0.
//
//   ProgressRing(progress: 0.4, color: colors.accInk, trackColor: colors.line) { Ionicon(goal.icon, size: 18, color: c) }

import SwiftUI

struct ProgressRing<Content: View>: View {
    /** 0–1. Values outside the range are clamped rather than drawn wrong. */
    let progress: Double
    var size: CGFloat = 46
    var stroke: CGFloat = 4
    let color: Color
    let trackColor: Color
    @ViewBuilder var content: Content

    init(progress: Double, size: CGFloat = 46, stroke: CGFloat = 4, color: Color, trackColor: Color, @ViewBuilder content: () -> Content = { EmptyView() }) {
        self.progress = progress
        self.size = size
        self.stroke = stroke
        self.color = color
        self.trackColor = trackColor
        self.content = content()
    }

    var body: some View {
        let pct = max(0, min(1, progress.isFinite ? progress : 0))
        let r = (size - stroke) / 2
        ZStack {
            Circle()
                .stroke(trackColor, lineWidth: stroke)
                .frame(width: r * 2, height: r * 2)
            if pct > 0 {
                Circle()
                    .trim(from: 0, to: pct)
                    .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .frame(width: r * 2, height: r * 2)
                    // -90° puts 0% at twelve o'clock instead of three.
                    .rotationEffect(.degrees(-90))
            }
            content
        }
        .frame(width: size, height: size)
    }
}
