// Port of apps/mobile/utils/chargeOccurrences.ts
//
// EZER Mobile — date-range helpers
//
// This file used to expand `demoSubscriptions` / `demoCharges` into synthetic charge occurrences,
// and those functions shipped in the production bundle with no caller. Their only effect was to
// keep 508 lines of invented merchants (Netflix, Spotify, Disney+ …) reachable from a release
// build, which is how the Wallet once listed subscriptions for a user who had connected no bank
// at all.
//
// Everything charge-shaped now comes from the API. What remains here is the pure date arithmetic
// the Wallet range picker needs, which never touched demo data.

import Foundation

enum RangePreset: String, Hashable, Sendable {
    case custom, thisMonth, lastMonth, ytd
}

/** 23:59:59.999 local on the given calendar day. */
func endOfDay(_ d: Date) -> Date {
    // new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    let p = jsParts(d)
    let cal = Calendar.current
    var c = DateComponents()
    c.year = p.year
    c.month = p.month + 1
    c.day = p.day
    c.hour = 23
    c.minute = 59
    c.second = 59
    c.nanosecond = 999_000_000
    if let out = cal.date(from: c) { return out }
    // Unreachable for a real calendar day; keep the JS value's meaning anyway.
    return jsDate(p.year, p.month, p.day).addingTimeInterval(86_399.999)
}

// Every preset ends at the END of its last day, for two reasons:
//  - the API filters `date <= endDate` on a DateTime, so an end of "last day at 00:00" drops
//    that whole day for anyone east of UTC;
//  - "ytd" used to end at `new Date()` — millisecond precision — so the Wallet's per-range
//    breakdown cache (keyed on the range) never hit for YTD: the key the prefetch warmed was
//    never the key a tap asked for, and every YTD tap was a round trip while the other presets
//    were not.
//
// TS signature: presetRange(preset: Exclude<RangePreset, 'custom'>). Swift cannot exclude a
// case from the type, so `.custom` falls through to the last branch exactly as it would in the
// TS body (callers never pass it: wallet.tsx maps 'custom' to 'thisMonth' first).
func presetRange(_ preset: RangePreset) -> (start: Date, end: Date) {
    let now = Date()
    let n = jsParts(now)

    if preset == .thisMonth {
        return (
            start: jsDate(n.year, n.month, 1),
            end: endOfDay(jsDate(n.year, n.month + 1, 0))
        )
    }

    if preset == .lastMonth {
        return (
            start: jsDate(n.year, n.month - 1, 1),
            end: endOfDay(jsDate(n.year, n.month, 0))
        )
    }

    // ytd: January 1st of this year through the end of today.
    return (
        start: jsDate(n.year, 0, 1),
        end: endOfDay(now)
    )
}
