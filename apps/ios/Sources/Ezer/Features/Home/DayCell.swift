// Port of apps/mobile/components/redesign/DayCell.tsx
//
// One calendar day on Home. Memoised and deliberately CHEAP: 42 of these
// mount at once, and Home's cost on a slow phone is its native view count,
// not its JS (k62 timeline, Oct 2026: Home's JS render+commit ~0.3s, the
// tab taking seconds to show). So: no PressScale (that is a Pressable plus
// a Reanimated view per cell), press feedback is a plain opacity dip, a day
// with no charges is a plain View, and nothing here re-renders unless its
// own props change.
//
// RN `memo(DayCellImpl)` -> DayCell is Equatable (onPress excluded, like memo's shallow compare of
// a stable useCallback) and the caller applies `.equatable()`.
// The wrap's `width: 100/7 %` is the caller's 7-column grid; `padding: 2` is here.

import SwiftUI

/// RN `DayMark` (exported type of DayCell.tsx).
struct HomeDayMark: Hashable {
    var id: String
    var merchantName: String
    var merchantId: String?
    var logo: String?
}

/// The `colors` prop: { cellHl, cellBg, accent, ink, red }.
struct HomeDayCellColors: Equatable {
    var cellHl: Color
    var cellBg: Color
    var accent: Color
    var ink: Color
    var red: Color
}

struct DayCell: View, Equatable {
    /** Day of month, or 0 for a leading/trailing blank. */
    let day: Int
    let isToday: Bool
    let totalCents: Int
    let marks: [HomeDayMark]
    let colors: HomeDayCellColors
    var onPress: ((Int) -> Void)?

    nonisolated static func == (a: DayCell, b: DayCell) -> Bool {
        a.day == b.day && a.isToday == b.isToday && a.totalCents == b.totalCents && a.marks == b.marks && a.colors == b.colors
    }

    var body: some View {
        let has = !marks.isEmpty
        // bg = day ? (has ? cellHl : cellBg) : 'transparent'
        let bg: Color = day != 0 ? (has ? colors.cellHl : colors.cellBg) : Color.clear
        if !has {
            cell(bg: bg, has: has)
                .padding(2)
        } else {
            Button {
                onPress?(day)
            } label: {
                cell(bg: bg, has: has)
                    .padding(2)
                    .contentShape(Rectangle())
            }
            .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.65))
            .accessibilityLabel(Text(verbatim: "\(day), \(marks.count) charge\(marks.count == 1 ? "" : "s")"))
        }
    }

    /// styles.cell + body
    private func cell(bg: Color, has: Bool) -> some View {
        VStack(alignment: .center, spacing: 3) {
            if day != 0 {
                if isToday {
                    Text(verbatim: String(day))
                        .font(.custom(FontFamily.bold, size: 11.5))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                        .padding(.horizontal, 5)
                        .frame(minWidth: 20)
                        .frame(height: 20)
                        .background(rnRect(10).fill(colors.accent))
                } else {
                    Text(verbatim: String(day))
                        .font(.custom(FontFamily.semibold, size: 12.5))
                        .foregroundStyle(colors.ink)
                }
                if has {
                    HStack(alignment: .center, spacing: 2) {
                        ForEach(Array(marks.prefix(3)), id: \.id) { m in
                            MerchantMark(name: m.merchantName, merchantId: m.merchantId, size: 15, logoUrl: m.logo)
                        }
                    }
                    Text(verbatim: "-\(formatCompactCents(totalCents))")
                        .font(.custom(FontFamily.bold, size: 9))
                        .foregroundStyle(colors.red)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, minHeight: Layout.calCellMinHeight, alignment: .top)
        .background(rnRect(Radius.cell).fill(bg))
    }
}
