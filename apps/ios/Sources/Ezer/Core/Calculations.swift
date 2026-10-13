// Port of apps/mobile/utils/calculations.ts

import Foundation

/**
 * Calculate investment opportunity cost at 7% annualized compound interest
 * This shows what the money would be worth today if invested instead of spent
 */
func calculateOpportunityCost(_ monthlyAmount: Double, _ months: Int) -> Double {
    let monthlyRate = 0.07 / 12 // 7% annual rate converted to monthly
    var futureValue = 0.0
    for i in 0..<max(0, months) {
        // Each month's contribution grows for (months - i) months
        futureValue += monthlyAmount * pow(1 + monthlyRate, Double(months - i))
    }
    return jsRound(futureValue * 100) / 100
}

// One formatter, reused — Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).
private let USD: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .currency
    f.currencyCode = "USD"
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f
}()

private func usd(_ dollars: Double) -> String {
    USD.string(from: NSNumber(value: dollars)) ?? "$0.00"
}

/**
 * Format cents to dollar string. Grouping is right ("$1,549.00"); non-finite input renders as
 * $0.00 instead of "$NaN".
 */
func formatCents(_ cents: Double) -> String {
    usd(cents.isFinite ? cents / 100 : 0)
}
func formatCents(_ cents: Int) -> String { formatCents(Double(cents)) }

/**
 * Format dollars to string
 */
func formatDollars(_ dollars: Double) -> String {
    usd(dollars.isFinite ? dollars : 0)
}

private let mediumDate: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMdyyyy")
    return f
}()

/**
 * Format date as "Jan 15, 2025" (toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })).
 */
func formatDate(_ date: Date) -> String {
    mediumDate.string(from: date)
}

/**
 * Format billing interval for display
 */
func formatBillingInterval(_ interval: String) -> String {
    switch interval {
    case "monthly": return "Monthly"
    case "yearly": return "Yearly"
    case "weekly": return "Weekly"
    default: return "Unknown"
    }
}

/**
 * Get confidence level label from score: 'High' | 'Medium' | 'Low'
 */
func getConfidenceLevel(_ score: Double) -> String {
    if score >= 0.8 { return "High" }
    if score >= 0.5 { return "Medium" }
    return "Low"
}

/**
 * Calculate lifetime total from charges (dollars)
 */
func calculateLifetimeTotal(_ charges: [SubscriptionCharge]) -> Double {
    Double(charges.reduce(0) { $0 + $1.amountCents }) / 100
}

/**
 * Calculate months of subscription history
 */
func calculateMonthsOfHistory(_ charges: [SubscriptionCharge]) -> Int {
    if charges.isEmpty { return 0 }
    let dates = charges.map { $0.chargeTimestamp.timeIntervalSince1970 * 1000 }
    let earliest = dates.min() ?? 0
    let latest = dates.max() ?? 0
    let monthsDiff = (latest - earliest) / (1000 * 60 * 60 * 24 * 30)
    return max(1, Int(ceil(monthsDiff)))
}
