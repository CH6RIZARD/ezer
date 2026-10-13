// Port helper (no single original file): the `toLocaleDateString('en-US', …)` calls made by
// apps/mobile/app/(tabs)/wallet.tsx, components/redesign/RangeCalendar.tsx and
// app/screens/SubscriptionDetail.tsx, as en_US DateFormatters in local time (port map §1.8).
// Full-date "Oct 12, 2026" ({ month: 'short', day: 'numeric', year: 'numeric' }) is Foundation's
// formatDate(_ date: Date).

import Foundation

enum WalletDateFormat {
    private static func make(_ template: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    private static let monthDayF = make("MMMd")
    private static let monthYearF = make("MMMMyyyy")
    private static let longMonthDayF = make("MMMMd")
    private static let shortMonthF = make("MMM")

    /// { month: 'short', day: 'numeric' } -> "Sep 1"
    static func monthDay(_ d: Date) -> String { monthDayF.string(from: d) }
    /// { month: 'long', year: 'numeric' } -> "October 2026"
    static func monthYear(_ d: Date) -> String { monthYearF.string(from: d) }
    /// { month: 'long', day: 'numeric' } -> "October 15"
    static func longMonthDay(_ d: Date) -> String { longMonthDayF.string(from: d) }
    /// { month: 'short' } -> "Oct"
    static func shortMonth(_ d: Date) -> String { shortMonthF.string(from: d) }
}
