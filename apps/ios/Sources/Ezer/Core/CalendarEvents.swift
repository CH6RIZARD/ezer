// Port of apps/mobile/utils/calendarEvents.ts
//
// A subscription is a RULE, not a single dated event: this projects that rule into whatever month
// is on screen, forwards or backwards, from the anchor renewal date and the cadence. Trials stay
// one-off. All dates are LOCAL (Calendar.current, device time zone), months are 0-based like JS.

import Foundation

struct CalendarEvent: Hashable, Identifiable, Sendable {
    var id: String
    var subscriptionId: String
    var merchantId: String
    var merchantName: String
    var logo: String?
    var amountCents: Int
    /// 'renewal' | 'trial'
    var type: String
    var date: Date
    /** After-trial price, for the popover's "becomes $X/mo" line. */
    var afterTrialCents: Int?
}

/// JS `new Date(y, m0, d)`: local midnight, with overflow / underflow rolling over like JS.
func jsDate(_ year: Int, _ month0: Int, _ day: Int) -> Date {
    let cal = Calendar.current
    let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1))!
    let m = cal.date(byAdding: .month, value: month0, to: jan1)!
    return cal.date(byAdding: .day, value: day - 1, to: m)!
}

/// (year, 0-based month, day-of-month) of a date in local time — getFullYear/getMonth/getDate.
func jsParts(_ d: Date) -> (year: Int, month: Int, day: Int) {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return (c.year ?? 1970, (c.month ?? 1) - 1, c.day ?? 1)
}

private func clampDayToMonth(_ year: Int, _ month: Int, _ day: Int) -> Int {
    min(day, jsParts(jsDate(year, month + 1, 0)).day)
}

private func startOfDay(_ d: Date) -> Date { Calendar.current.startOfDay(for: d) }

/**
 * A date-only value ('YYYY-MM-DD', or an ISO datetime whose date part is the meaning — e.g. a
 * renewal date stored at UTC midnight) -> local midnight. `new Date(iso)` would place it at UTC
 * midnight, which is the PREVIOUS day for anyone west of UTC. nil when it does not parse (RN's
 * Invalid Date).
 */
func parseLocalDay(_ iso: String) -> Date? {
    let head = String(iso.prefix(10))
    let parts = head.split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
    // Year bounded so jsDate's Calendar math (force-unwrapped) can never see an out-of-range date.
    guard parts.count == 3, let y = parts[0], let m = parts[1], let d = parts[2], (1...9999).contains(y) else { return nil }
    return jsDate(y, m - 1, d)
}

/// JS Date.toDateString(), e.g. "Mon Oct 12 2026" (used only inside event ids).
private let dateStringFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "EEE MMM dd yyyy"
    return f
}()
func toDateString(_ d: Date) -> String { dateStringFormatter.string(from: d) }

/**
 * Every occurrence of one subscription that falls inside the given month.
 */
private func occurrencesInMonth(_ anchor: Date, _ cadence: String, _ year: Int, _ month: Int) -> [Date] {
    let monthStart = jsDate(year, month, 1)
    let monthEnd = jsDate(year, month + 1, 0)
    var out: [Date] = []
    let a = jsParts(anchor)

    switch cadence {
    case "weekly":
        // Calendar-day stepping, NOT anchor + k*7*24h: a DST week is 167 or 169 hours.
        let occ = { (n: Int) -> Date in jsDate(a.year, a.month, a.day + n * 7) }
        var k = Int(jsRound((monthStart.timeIntervalSince1970 - anchor.timeIntervalSince1970) / (7 * 24 * 60 * 60)))
        while occ(k) < monthStart { k += 1 }
        while occ(k - 1) >= monthStart { k -= 1 }
        var d = occ(k)
        while d <= monthEnd {
            out.append(d)
            k += 1
            d = occ(k)
        }

    case "yearly":
        // Only lands in the month that matches the anchor's month.
        if a.month == month {
            out.append(jsDate(year, month, clampDayToMonth(year, month, a.day)))
        }

    default: // 'monthly' and anything else
        // Every month, on the anchor's day-of-month, clamped (31st -> 30th / 28th / 29th).
        out.append(jsDate(year, month, clampDayToMonth(year, month, a.day)))
    }
    return out
}

/**
 * All charge events for the month being viewed (month is 0-based).
 *
 * @param subscriptions live subscriptions
 * @param risks         the 0–30 day window, used ONLY for trial conversions and as a price source
 *                      for subscriptions that carry none
 */
func projectMonthEvents(_ subscriptions: [Subscription], _ risks: [RiskItem], year: Int, month: Int) -> [CalendarEvent] {
    var events: [CalendarEvent] = []

    var priceBySubId: [String: Int] = [:]
    for r in risks where r.amountCents > 0 { priceBySubId[r.subscriptionId] = r.amountCents }

    let trialSubIds = Set(risks.filter { $0.type == "trial" }.map { $0.subscriptionId })

    // --- trial conversions: one-off, never projected ---
    for r in risks where r.type == "trial" {
        guard let d = parseLocalDay(r.dueDate) else { continue }
        let p = jsParts(d)
        if p.year != year || p.month != month { continue }
        events.append(CalendarEvent(
            id: "trial-\(r.subscriptionId)-\(toDateString(d))",
            subscriptionId: r.subscriptionId,
            merchantId: r.subscriptionId,
            merchantName: r.merchantName,
            logo: r.logo,
            amountCents: r.amountCents,
            type: "trial",
            date: startOfDay(d),
            afterTrialCents: r.amountCents
        ))
    }

    // --- recurring renewals ---
    for sub in subscriptions {
        if sub.status == "canceled" || sub.status == "paused" { continue }
        guard let renewal = sub.renewalDate, let anchor = parseLocalDay(renewal) else { continue }

        let amount = sub.amountCents ?? priceBySubId[sub.id] ?? 0
        // A renewal with no known price would render as "-$0.00": not drawn.
        if amount <= 0 { continue }

        for date in occurrencesInMonth(anchor, sub.cadence, year, month) {
            // A still-running trial converts on its end date; that conversion is already emitted.
            if trialSubIds.contains(sub.id) && date == anchor { continue }
            events.append(CalendarEvent(
                id: "renewal-\(sub.id)-\(toDateString(date))",
                subscriptionId: sub.id,
                merchantId: sub.merchantId,
                merchantName: sub.merchantName,
                logo: sub.logo,
                amountCents: amount,
                type: "renewal",
                date: date,
                afterTrialCents: nil
            ))
        }
    }

    return events.sorted { $0.date < $1.date }
}

/** Bucket by day-of-month for O(1) cell lookup. */
func groupEventsByDay(_ events: [CalendarEvent]) -> [Int: [CalendarEvent]] {
    var map: [Int: [CalendarEvent]] = [:]
    for e in events {
        map[jsParts(e.date).day, default: []].append(e)
    }
    return map
}
