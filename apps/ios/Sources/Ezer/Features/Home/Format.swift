// Port of apps/mobile/utils/format.ts
//
// Number/date formatting helpers. Home and DayCell use formatCompactCents; the rest are ported
// because format.ts exports them. JS semantics are kept where they show: Number.prototype.toFixed
// (ties away from zero), String(number) ("1" not "1.0"), Intl.NumberFormat en-US (half-expand
// rounding), toLocaleDateString('en-US', …) in the device time zone, "Invalid Date" for an
// unparsable string.

import Foundation

// MARK: - JS number helpers (private)

/// JS `String(x)` for the values these helpers produce.
private func homeJSNumber(_ x: Double) -> String {
    if x.isNaN { return "NaN" }
    if x.isInfinite { return x > 0 ? "Infinity" : "-Infinity" }
    if x == 0 { return "0" }
    if x == x.rounded(.towardZero) && abs(x) < 1e21 { return String(format: "%.0f", x) }
    return "\(x)"
}

/// JS `x.toFixed(digits)`: rounds half away from zero on the value's decimal expansion.
private func homeToFixed(_ x: Double, _ digits: Int) -> String {
    if !x.isFinite || abs(x) >= 1e21 { return homeJSNumber(x) }
    let p = pow(10, Double(digits))
    let n = (abs(x) * p).rounded(.toNearestOrAwayFromZero)
    let s = String(format: "%.\(digits)f", n / p)
    return x < 0 ? "-" + s : s
}

/// JS `new Date(isoString)` for the strings this app passes: full ISO timestamps, or a bare
/// 'YYYY-MM-DD' (which JS reads as UTC midnight). nil = Invalid Date.
private func homeJSDate(_ s: String) -> Date? {
    if let d = parseISODate(s) { return d }
    let parts = s.split(separator: "-", omittingEmptySubsequences: false)
    if s.count == 10, parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.date(from: DateComponents(year: y, month: m, day: d))
    }
    return nil
}

private func homeDateFormatter(_ template: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate(template)
    return f
}

/// { month: 'short', day: 'numeric' } -> "Jan 15"
private let homeMonthDay = homeDateFormatter("MMMd")
/// { month: 'short', day: 'numeric', year: 'numeric' } -> "Jan 15, 2025"
private let homeMonthDayYear = homeDateFormatter("MMMdyyyy")

private func homeCurrencyFormatter(_ showCents: Bool) -> NumberFormatter {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .currency
    f.currencyCode = "USD"
    f.minimumFractionDigits = showCents ? 2 : 0
    f.maximumFractionDigits = showCents ? 2 : 0
    // Intl.NumberFormat rounds half away from zero ("halfExpand").
    f.roundingMode = .halfUp
    return f
}

private let homeCurrencyCents = homeCurrencyFormatter(true)
private let homeCurrencyWhole = homeCurrencyFormatter(false)

// MARK: - format.ts

/**
 * Format a number as currency (USD)
 */
func formatCurrency(_ amount: Double, _ showCents: Bool = true) -> String {
    let formatter = showCents ? homeCurrencyCents : homeCurrencyWhole
    // Intl renders the non-finite values as "$NaN" / "$∞" / "-$∞".
    if amount.isNaN { return "$NaN" }
    if amount.isInfinite { return amount > 0 ? "$∞" : "-$∞" }
    return formatter.string(from: NSNumber(value: amount)) ?? "$0"
}

/**
 * Format a number as compact currency (e.g., $1.2K)
 */
func formatCompactCurrency(_ amount: Double) -> String {
    if amount >= 1000 {
        return "$\(homeToFixed(amount / 1000, 1))K"
    }
    return formatCurrency(amount, false)
}

/**
 * A money amount for a tight slot (a calendar day cell, ~35px wide), short
 * at every size; the sign is the caller's.
 *   $85.44 · $326 · $1.3k · $13k · $130k · $1.3M
 * Cents only under $100; whole dollars to $999; then k / M with one decimal
 * below 10, none from 10 up. A rounding that reaches the next unit moves up
 * ($999.60 → $1k, not $1000; $999,999 → $1M, not $1000k).
 */
func formatCompactCents(_ cents: Double) -> String {
    let c = abs(jsRound(cents.isFinite ? cents : 0))
    if c < 10000 { return "$\(homeToFixed(c / 100, 2))" }
    let dollars = jsRound(c / 100)
    if dollars < 1000 { return "$\(homeJSNumber(dollars))" }
    let fmt = { (v: Double) -> String in
        v < 9.95 ? homeJSNumber(jsRound(v * 10) / 10) : homeJSNumber(jsRound(v))
    }
    let k = dollars / 1000
    if jsRound(k) < 1000 { return "$\(fmt(k))k" }
    return "$\(fmt(dollars / 1e6))M"
}
func formatCompactCents(_ cents: Int) -> String { formatCompactCents(Double(cents)) }

/**
 * Format a percentage (0-100)
 */
func formatPercentage(_ value: Double, _ decimals: Int = 0) -> String {
    "\(homeToFixed(value, decimals))%"
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
func formatRelativeTime(_ isoString: String) -> String {
    guard let date = homeJSDate(isoString) else { return "Invalid Date" }
    let now = Date()
    let diffMs = (now.timeIntervalSince1970 - date.timeIntervalSince1970) * 1000
    let diffMins = floor(diffMs / (1000 * 60))
    let diffHours = floor(diffMs / (1000 * 60 * 60))
    let diffDays = floor(diffMs / (1000 * 60 * 60 * 24))

    if diffMins < 1 { return "Just now" }
    if diffMins < 60 { return "\(homeJSNumber(diffMins))m ago" }
    if diffHours < 24 { return "\(homeJSNumber(diffHours))h ago" }
    if diffDays < 7 { return "\(homeJSNumber(diffDays))d ago" }

    return homeMonthDay.string(from: date)
}

/**
 * Format a date for display
 */
func formatDate(_ isoString: String) -> String {
    guard let date = homeJSDate(isoString) else { return "Invalid Date" }
    return homeMonthDayYear.string(from: date)
}

/**
 * Format a date as short (e.g., "Jan 15")
 */
func formatDateShort(_ isoString: String) -> String {
    guard let date = homeJSDate(isoString) else { return "Invalid Date" }
    return homeMonthDay.string(from: date)
}

/**
 * Calculate progress percentage (0-100)
 */
func calculateProgress(_ current: Double, _ target: Double) -> Double {
    if target <= 0 { return 0 }
    return min(100, max(0, (current / target) * 100))
}

/**
 * Clamp a value between min and max
 */
func clamp(_ value: Double, _ min: Double, _ max: Double) -> Double {
    Swift.min(max, Swift.max(min, value))
}
