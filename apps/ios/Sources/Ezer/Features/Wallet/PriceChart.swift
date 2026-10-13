// Port of apps/mobile/components/redesign/PriceChart.tsx
//
// EZER Redesign — price history chart (handoff §6)
//
// SVG line chart of the last 6 monthly prices on the purple gradient card: gold 3px line,
// gold-ringed dots, 3 faint gridlines, month labels beneath. Colours are fixed across themes —
// the card is always the purple finish.
//
// Geometry is a 1:1 port of the prototype's SVG:
//   viewBox 0 0 300 138 · x = 16 + i*(268/(n-1)) · gridlines at y 36/74/112
//   plot band y 112 (min) -> 36 (max) · labels on the baseline at y 132
// The 16-unit side inset matters: at x=0 the first and last dots (r4.5 plus a 2.5 stroke) were
// clipped by the SVG bounds, and the month labels sat flush against the card padding instead of
// centred under their dots.
//
// Drawn with a Canvas in viewBox units scaled to the frame. The Svg is width x width*138/300 with
// viewBox 300x138, so the scale is uniform (width/300) with no letterboxing; strokes and the
// label font scale with it, as they do in SVG.

import SwiftUI

/** Prototype viewBox. Everything below is expressed in these units. */
private let VB_W: CGFloat = 300
private let VB_H: CGFloat = 138
private let PAD_X: CGFloat = 16
/** Baseline (min price) and height of the plot band. */
private let Y_BASE: CGFloat = 112
private let Y_SPAN: CGFloat = 76
private let LABEL_Y: CGFloat = 132

/** Dot core. The prototype fills against the gradient's TOP stop, not the end. */
private let DOT_FILL = "#31136E"
private let GRID_STROKE = "rgba(255,255,255,.14)"
private let LABEL_FILL = "rgba(255,255,255,.65)"

struct PricePoint: Hashable, Sendable {
    /** Short month label, e.g. "May". */
    let label: String
    let cents: Int
}

/// JS `n.toFixed(1)` for the path string's coordinates.
private func toFixed1(_ v: CGFloat) -> CGFloat {
    CGFloat(Double(String(format: "%.1f", Double(v))) ?? Double(v))
}

struct PriceChart: View {
    let points: [PricePoint]
    let width: CGFloat

    var body: some View {
        if points.isEmpty {
            EmptyView()
        } else {
            Canvas { context, _ in
                draw(&context)
            }
            .frame(width: width, height: (width * VB_H) / VB_W)
            .allowsHitTesting(false)
        }
    }

    private func draw(_ context: inout GraphicsContext) {
        let s = width / VB_W

        let values = points.map { CGFloat($0.cents) }
        let minV = values.min() ?? 0
        let maxV = values.max() ?? 0
        let flat = maxV == minV

        let stepX: CGFloat = points.count > 1 ? (VB_W - PAD_X * 2) / CGFloat(points.count - 1) : 0
        func x(_ i: Int) -> CGFloat { PAD_X + CGFloat(i) * stepX }
        // A flat history sits on the baseline, not floating mid-band — nothing above it is a real
        // number, so there's nothing to leave room for.
        func y(_ cents: CGFloat) -> CGFloat { flat ? Y_BASE : Y_BASE - ((cents - minV) / (maxV - minV)) * Y_SPAN }
        func pt(_ px: CGFloat, _ py: CGFloat) -> CGPoint { CGPoint(x: px * s, y: py * s) }

        // Gridlines.
        for gy: CGFloat in [36, 74, 112] {
            var p = Path()
            p.move(to: pt(PAD_X, gy))
            p.addLine(to: pt(VB_W - PAD_X, gy))
            context.stroke(p, with: .color(Color(css: GRID_STROKE)), lineWidth: 1 * s)
        }

        // The line: `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`.
        var line = Path()
        for (i, p) in points.enumerated() {
            let q = pt(toFixed1(x(i)), toFixed1(y(CGFloat(p.cents))))
            if i == 0 { line.move(to: q) } else { line.addLine(to: q) }
        }
        context.stroke(
            line,
            with: .color(Color(css: ChartColors.line)),
            style: StrokeStyle(lineWidth: 3 * s, lineCap: .round, lineJoin: .round)
        )

        // Dots.
        for (i, p) in points.enumerated() {
            // A flat line's middle dots mark nothing — every point already says the same number.
            // Endpoints still bound the line visually; the ones between them are just clutter
            // once price is the whole story.
            let isEndpoint = i == 0 || i == points.count - 1
            if flat && !isEndpoint { continue }
            let c = pt(x(i), y(CGFloat(p.cents)))
            let r = 4.5 * s
            let circle = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
            context.fill(circle, with: .color(Color(css: DOT_FILL)))
            context.stroke(circle, with: .color(Color(css: ChartColors.line)), lineWidth: 2.5 * s)
        }

        // Month labels: textAnchor middle, baseline at LABEL_Y, fontSize 10, Space Grotesk.
        for (i, p) in points.enumerated() {
            let text: Text = Text(p.label)
                .font(.custom(FontFamily.regular, fixedSize: 10 * s))
                .foregroundStyle(Color(css: LABEL_FILL))
            let resolved = context.resolve(text)
            let size = resolved.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
            let baseline = resolved.firstBaseline(in: size)
            let a = pt(x(i), LABEL_Y)
            context.draw(resolved, in: CGRect(x: a.x - size.width / 2, y: a.y - baseline, width: size.width, height: size.height))
        }
    }
}
