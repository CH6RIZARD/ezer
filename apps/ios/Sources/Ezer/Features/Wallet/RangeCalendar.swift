// Port of apps/mobile/components/redesign/RangeCalendar.tsx
//
// EZER Redesign — Wallet custom range picker (handoff §4)
//
// A bottom sheet over the Wallet (presented with `.rnModal(.none)`; this view animates its own
// scrim and slide), not a card inline in the page. Month nav, S–M–T–W–T–F–S header, 32px day
// cells. First tap = start, second = end (auto-swap if reversed). Endpoints get a gold fill with
// white text; days between get `goldSoft`. Footer shows the picked range (plus its total once
// known) and a gold Done button.
//
// Why it is built this way (owner report: "insanely buggy, laggy, glitches the screen when they
// set"), same as the RN file:
//  - The half-picked range is LOCAL state. It used to be the Wallet's own state, so every day tap
//    re-ran WalletView's body, and a first tap (start set, end nil) made the Wallet fall back to
//    "This month" and swap its numbers mid-pick. Now the Wallet hears about a range exactly once,
//    when Done is pressed with both ends chosen, AFTER the sheet has left.
//  - It is an overlay, so opening and closing never changes the page's height (inline, it pushed
//    Total drained down ~350pt in one frame and Done pulled it back).
//  - The footer total comes from `quote` (which warms the Wallet's breakdown cache), never from
//    the Wallet's on-screen total, which was the PREVIOUS range's figure next to the new dates.

import SwiftUI

private let DOW = ["S", "M", "T", "W", "T", "F", "S"]
private let ROW_H: CGFloat = 36
private let IN_MS: Double = 300
private let OUT_MS: Double = 220
/// iOS sheet curve (animate-expo's EASE_SHEET).
private let EASE_SHEET: RNEasing = .bezier(0.32, 0.72, 0, 1)

/// new Date(d.getFullYear(), d.getMonth(), d.getDate())
private func startOfDay(_ d: Date) -> Date {
    let p = jsParts(d)
    return jsDate(p.year, p.month, p.day)
}

/// Whole months from this month to d's month (negative = past).
private func monthOffset(_ d: Date) -> Int {
    let n = jsParts(Date()), p = jsParts(d)
    return (p.year - n.year) * 12 + p.month - n.month
}

private enum DayState: Equatable { case end, mid, none }

/// One day. Equatable on its inputs, so a tap only re-renders the cells whose state changed.
private struct RangeDayCell: View, Equatable {
    let day: Int
    let state: DayState
    let ink: Color
    let gold: Color
    let goldBg: Color
    let goldSoft: Color
    let onTap: () -> Void

    static func == (a: Self, b: Self) -> Bool {
        a.day == b.day && a.state == b.state && a.ink == b.ink && a.gold == b.gold
            && a.goldBg == b.goldBg && a.goldSoft == b.goldSoft
    }

    var body: some View {
        Button(action: onTap) {
            Text("\(day)")
                .font(.custom(FontFamily.semibold, size: 12.5))
                .foregroundStyle(state == .end ? Color(css: "#FFFFFF") : state == .mid ? gold : ink)
        }
        .buttonStyle(DayPressStyle(state: state, goldBg: goldBg, goldSoft: goldSoft))
    }
}

/// Immediate feedback under the finger: the soft fill shows while pressed.
private struct DayPressStyle: ButtonStyle {
    let state: DayState
    let goldBg: Color
    let goldSoft: Color
    func makeBody(configuration: Configuration) -> some View {
        let fill: Color = state == .end ? goldBg
            : (state == .mid || configuration.isPressed) ? goldSoft : Color.clear
        return configuration.label
            .frame(width: 32, height: 32)
            .background(rnRect(9).fill(fill))
    }
}

struct RangeCalendar: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    @Environment(\.accessibilityReduceMotion) private var reduce

    /** The range already applied, if any; the picker starts from it. */
    let initialStart: Date?
    let initialEnd: Date?
    /** Total drained for a complete range, or nil if it can't be had. Footer only. */
    let quote: (Date, Date) async -> Int?
    /** Called once the sheet has finished leaving. A range when Done was pressed with both ends
     *  chosen; nil means "change nothing". */
    let onClose: ((start: Date, end: Date)?) -> Void

    @State private var start: Date?
    @State private var end: Date?
    @State private var offset = 0
    @State private var quoted: (key: String, cents: Int)?
    @State private var p: Double = 0
    @State private var sheetH: CGFloat = 600
    @State private var closing = false

    init(
        initialStart: Date?,
        initialEnd: Date?,
        quote: @escaping (Date, Date) async -> Int?,
        onClose: @escaping ((start: Date, end: Date)?) -> Void
    ) {
        self.initialStart = initialStart
        self.initialEnd = initialEnd
        self.quote = quote
        self.onClose = onClose
        _start = State(initialValue: initialStart)
        _end = State(initialValue: initialEnd)
        _offset = State(initialValue: initialEnd.map(monthOffset) ?? 0)
    }

    /// d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
    private var month: Date {
        let n = jsParts(Date())
        return jsDate(n.year, n.month + offset, 1)
    }

    /// Always 42 cells (six rows), so changing month never resizes the sheet.
    private var cells: [Date?] {
        let m = jsParts(month)
        let first = jsDate(m.year, m.month, 1)
        let lead = Calendar.current.component(.weekday, from: first) - 1 // getDay(): 0 = Sunday
        let days = jsParts(jsDate(m.year, m.month + 1, 0)).day
        var out: [Date?] = []
        for _ in 0..<max(0, lead) { out.append(nil) }
        if days >= 1 {
            for d in 1...days { out.append(jsDate(m.year, m.month, d)) }
        }
        while out.count < 42 { out.append(nil) }
        return out
    }

    private var rangeKey: String? {
        guard let start, let end else { return nil }
        return "\(start.timeIntervalSince1970)|\(end.timeIntervalSince1970)"
    }

    /** First tap sets start; second sets end, swapping if the user picked backwards. */
    private func tap(_ d: Date) {
        let day = startOfDay(d)
        guard let s = start, end == nil else {
            start = day
            end = nil
            return
        }
        if day < s {
            start = day
            end = s
        } else {
            end = day
        }
    }

    private func stateOf(_ d: Date) -> DayState {
        if let start, d == start { return .end }
        if let end, d == end { return .end }
        if let start, let end, d > start, d < end { return .mid }
        return .none
    }

    private var footer: String {
        guard let start else { return "Tap a start date" }
        guard let end else { return "Now tap an end date" }
        let dates = "\(WalletDateFormat.monthDay(start)) – \(WalletDateFormat.monthDay(end))"
        if let q = quoted, q.key == rangeKey { return "\(dates) · \(formatCents(q.cents)) drained" }
        return dates
    }

    private func close(apply: Bool) {
        if closing { return }
        closing = true
        var range: (start: Date, end: Date)?
        if apply, let s = start, let e = end { range = (start: s, end: e) }
        let picked = range
        // The Wallet applies the range only once the sheet is gone, so its re-render never
        // competes with the exit and the total rolls in view.
        withAnimation(.rn(.easeOut, OUT_MS)) { p = 0 } completion: { onClose(picked) }
    }

    var body: some View {
        let colors = theme.colors
        let all = cells

        ZStack(alignment: .bottom) {
            colors.scrim
                .opacity(p)
                .contentShape(Rectangle())
                .onTapGesture { close(apply: false) }

            VStack(alignment: .leading, spacing: 0) {
                rnRect(2.5)
                    .fill(colors.line2)
                    .frame(width: 44, height: 5)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 12)

                // --- monthRow: row, center, space-between, marginBottom 10
                HStack(alignment: .center, spacing: 0) {
                    Button { offset -= 1 } label: {
                        Ionicon("chevron-back", size: 17, color: colors.ink).hitSlop(10)
                    }
                    .buttonStyle(PlainPressStyle())
                    Spacer(minLength: 0)
                    Text(WalletDateFormat.monthYear(month))
                        .typeStyle(TypeScale.serifTitle.size(17))
                        .foregroundStyle(colors.ink)
                    Spacer(minLength: 0)
                    Button { offset += 1 } label: {
                        Ionicon("chevron-forward", size: 17, color: colors.ink).hitSlop(10)
                    }
                    .buttonStyle(PlainPressStyle())
                }
                .padding(.bottom, 10)

                // --- dowRow
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { i in
                        Text(DOW[i])
                            .font(.custom(FontFamily.bold, size: 10))
                            .foregroundStyle(colors.mut2)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                }

                // --- grid: six fixed rows, cells 100/7 % wide, marginTop 4
                VStack(spacing: 0) {
                    ForEach(0..<6, id: \.self) { r in
                        HStack(spacing: 0) {
                            ForEach(0..<7, id: \.self) { col in
                                Group {
                                    if let d = all[r * 7 + col] {
                                        RangeDayCell(
                                            day: jsParts(d).day,
                                            state: stateOf(d),
                                            ink: colors.ink,
                                            gold: colors.gold,
                                            goldBg: colors.goldBg,
                                            goldSoft: colors.goldSoft,
                                            onTap: { tap(d) }
                                        )
                                        .equatable()
                                    } else {
                                        Color.clear
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: ROW_H)
                            }
                        }
                    }
                }
                .padding(.top, 4)

                // --- footer: marginTop 12, paddingTop 12, borderTopWidth 1, row center gap 10
                HStack(alignment: .center, spacing: 10) {
                    Text(footer)
                        .font(.custom(FontFamily.semibold, size: 11.5))
                        .foregroundStyle(colors.mut)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { close(apply: true) } label: {
                        Text("Done")
                            .font(.custom(FontFamily.bold, size: 12.5))
                            .foregroundStyle(Color(css: "#FFFFFF"))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(rnRect(Radius.chip).fill(colors.goldBg))
                    }
                    .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.8))
                }
                .padding(.top, 12 + 1)
                .overlay(alignment: .top) {
                    Rectangle().fill(colors.line).frame(height: 1)
                }
                .padding(.top, 12)
            }
            .padding(.horizontal, Layout.screenX)
            .padding(.top, 10)
            .padding(.bottom, insets.bottom + 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rnRect(topLeading: 26, topTrailing: 26).fill(colors.card))
            .overlay(rnRect(topLeading: 26, topTrailing: 26).strokeBorder(colors.goldLine, lineWidth: 1))
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { sheetH = $0 }
            .opacity(reduce ? p : 1)
            .offset(y: reduce ? 0 : (1 - p) * sheetH)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.rn(EASE_SHEET, IN_MS)) { p = 1 }
        }
        // Footer total for a complete range. Keyed, so a late answer for an older pick can never
        // land next to newer dates.
        .task(id: rangeKey) {
            guard let s = start, let e = end, let key = rangeKey else { return }
            let cents = await quote(s, e)
            if Task.isCancelled { return }
            if let cents { quoted = (key: key, cents: cents) }
        }
    }
}
