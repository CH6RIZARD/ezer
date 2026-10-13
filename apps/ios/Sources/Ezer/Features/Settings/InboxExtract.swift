// Port of apps/mobile/utils/inboxScan/extract.ts (+ its spec, utils/inboxScan/extract.test.ts,
// as the DEBUG self-check at the bottom).
//
// Pure, on-device extraction of subscription signals from ONE email.
// No network, no storage — nothing here can leak a message anywhere.
// The caller drops the message text as soon as this returns.
//
// Every regex is the TS literal, run through NSRegularExpression (ICU). Two spelling-only
// changes, same meaning in both engines: `\/` is written `/`, and `$`/`-` inside a character
// class are escaped (`[\$€£]`, `[\-−]`, `[a-z0-9.\-]`) so ICU's set parser can't read them as
// anything but literals. Match indices are UTF-16 offsets like JS, so every slice goes
// through NSString. Private helpers live in `SettingsExtract` so no module-level name can
// collide with another feature's.

import Foundation

enum SettingsCadence: String, Sendable {
    case monthly, yearly, weekly, unknown
}

struct SettingsEmailInput {
    /// Raw From header, e.g. `Netflix <info@account.netflix.com>`
    var from: String
    var subject: String
    /// Plain-text body (HTML already stripped by the caller).
    var text: String
    /// href targets found in the HTML body, if any.
    var links: [String]? = nil
    /// When the email was received — anchors dates written without a year.
    var receivedAt: Date
}

/// Exactly the fields the server accepts (packages/shared detectedSubscriptionSchema).
struct SettingsDetected: Equatable, Sendable {
    var merchant: String
    var amountCents: Int?
    var currency: String?
    var cadence: SettingsCadence
    var nextChargeDate: String?
    var trialEndsAt: String?
    var cancelUrl: String?
    var confidence: Double
}

/// TS `Detected & { receivedAt: number }` (ms since epoch).
struct SettingsFound: Sendable {
    var detected: SettingsDetected
    var receivedAt: Double
}

// MARK: - Public (the RN exports)

func extractSubscription(_ email: SettingsEmailInput) -> SettingsDetected? {
    SettingsExtract.extractSubscription(email)
}

/// Collapse several emails from one merchant into its newest, most complete record.
func mergeByMerchant(_ items: [SettingsFound]) -> [SettingsDetected] {
    SettingsExtract.mergeByMerchant(items)
}

/// HTML → plain text plus href list. Deliberately crude; good enough for receipts.
func htmlToText(_ html: String) -> (text: String, links: [String]) {
    SettingsExtract.htmlToText(html)
}

enum SettingsExtract {
    // MARK: JS string/RegExp semantics on NSRegularExpression

    static func rx(_ pattern: String, _ flags: String = "") -> NSRegularExpression {
        // Static patterns: a bad one is a programming error, as a JS SyntaxError would be.
        try! NSRegularExpression(pattern: pattern, options: flags.contains("i") ? [.caseInsensitive] : [])
    }

    static func range(_ s: String) -> NSRange { NSRange(location: 0, length: (s as NSString).length) }

    /// RegExp.prototype.test (non-global).
    static func test(_ re: NSRegularExpression, _ s: String) -> Bool {
        re.firstMatch(in: s, range: range(s)) != nil
    }

    /// Capture groups of one match: [whole, g1, g2 …], nil for a group that did not participate.
    static func groups(_ m: NSTextCheckingResult, _ s: String) -> [String?] {
        let n = s as NSString
        return (0..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            return r.location == NSNotFound ? nil : n.substring(with: r)
        }
    }

    /// String.prototype.match with a non-global regex.
    static func match(_ re: NSRegularExpression, _ s: String) -> [String?]? {
        guard let m = re.firstMatch(in: s, range: range(s)) else { return nil }
        return groups(m, s)
    }

    /// String.prototype.slice(start, end) in UTF-16 units, clamped like JS.
    static func slice(_ s: String, _ start: Int, _ end: Int? = nil) -> String {
        let n = s as NSString
        let a = max(0, min(start, n.length))
        let b = max(a, min(end ?? n.length, n.length))
        return n.substring(with: NSRange(location: a, length: b - a))
    }

    /// String.prototype.replace(re, fn): every match when `global` (the /g flag), else the first.
    static func replace(_ s: String, _ re: NSRegularExpression, global: Bool = true, _ f: ([String?]) -> String) -> String {
        let n = s as NSString
        let matches: [NSTextCheckingResult] = global
            ? re.matches(in: s, range: range(s))
            : (re.firstMatch(in: s, range: range(s)).map { [$0] } ?? [])
        if matches.isEmpty { return s }
        var out = ""
        var last = 0
        for m in matches {
            out += n.substring(with: NSRange(location: last, length: m.range.location - last))
            out += f(groups(m, s))
            last = m.range.location + m.range.length
        }
        out += n.substring(from: last)
        return out
    }

    /// JS unary `+` on a digit string.
    static func num(_ s: String?) -> Int { Int(s ?? "") ?? 0 }

    // MARK: Patterns and tables

    // Sender domain → merchant. Only needed where the domain doesn't already read
    // as the brand; anything else falls back to the From display name.
    static let DOMAIN_MERCHANTS: [String: String] = [
        "netflix.com": "Netflix",
        "spotify.com": "Spotify",
        "apple.com": "Apple",
        "itunes.com": "Apple",
        "adobe.com": "Adobe",
        "openai.com": "ChatGPT",
        "hulu.com": "Hulu",
        "disneyplus.com": "Disney+",
        "hbomax.com": "Max",
        "max.com": "Max",
        "youtube.com": "YouTube Premium",
        "amazon.com": "Amazon",
        "audible.com": "Audible",
        "dropbox.com": "Dropbox",
        "microsoft.com": "Microsoft",
        "planetfitness.com": "Planet Fitness",
        "peacocktv.com": "Peacock",
        "paramountplus.com": "Paramount+",
        "nytimes.com": "New York Times",
    ]

    // Mail hosts and payment platforms say nothing about the merchant.
    static let NOT_A_MERCHANT = rx(#"^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|paypal|stripe|squareup|gumroad|paddle)\.(com|me|net)$"#)

    static let SUBSCRIPTION_SIGNAL = rx(
        #"\b(subscription|subscribed|membership|renew(s|al|ed)?|recurring|free trial|trial (ends|will end|period)|your plan|billing (period|cycle)|auto-?renew|next (payment|billing|charge))\b"#,
        "i"
    )

    static let MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    static let MONTH_RE = #"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"#

    static let SENDER_AT = rx(#"@([a-z0-9.\-]+)"#, "i")
    static let ANGLE_ADDR = rx(#"<[^>]*>"#)
    static let DQUOTE = rx("\"")
    static let NON_ALNUM = rx(#"[^a-z0-9]"#)
    static let ROLE_SUFFIX = rx(#"\s+(team|support|billing|no-?reply)$"#, "i")

    static let CURRENCY_SYMBOL: [String: String] = ["$": "USD", "€": "EUR", "£": "GBP"]

    // Both separator conventions, with a trailing digit boundary: without the
    // (?!\d) lookahead "€1.234,56" parsed as 1.23 — the match stopped after two
    // decimal-looking digits with more digits still to come.
    static let AMOUNT_NUM = #"\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?"#
    static let AMOUNT_RE = rx(
        #"(?:(US|CA|A)?([\$€£])\s?("# + AMOUNT_NUM + #")(?!\d))|(?:\b(USD|EUR|GBP|CAD|AUD)\s?("# + AMOUNT_NUM + #")(?!\d))"#
    )
    static let DECIMAL_TAIL = rx(#"^(.+)[.,](\d{1,2})$"#)
    static let SEPARATORS = rx(#"[.,]"#)
    static let CREDIT_SIGN = rx(#"[\-−]\s*$"#)
    static let REFUND_CUE = rx(#"\brefund(ed|s)?\b"#, "i")
    static let PRICE_CUE = rx(#"\b(total|charged|amount|price|billed|paid|pay)\W{0,40}$"#, "i")

    static let CADENCE_MONTHLY = rx(#"\b(per|a|each|every|/)\s?(month|mo)\b|\bmonthly\b"#, "i")
    static let CADENCE_YEARLY = rx(#"\b(per|a|each|every|/)\s?(year|yr)\b|\b(annual|annually|yearly)\b"#, "i")
    static let CADENCE_WEEKLY = rx(#"\b(per|a|each|every|/)\s?week\b|\bweekly\b"#, "i")

    static let DATE_ISO = rx(#"\b(\d{4})-(\d{2})-(\d{2})\b"#)
    static let DATE_US = rx(#"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b"#) // US style M/D/Y
    // \b after the day, or "15 October 2026" reads as "October 20".
    static let DATE_MONTH_DAY = rx(#"\b"# + MONTH_RE + #"\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?"#, "i")
    static let DATE_DAY_MONTH = rx(#"\b(\d{1,2})(?:st|nd|rd|th)?\s+"# + MONTH_RE + #"(?:,?\s+(\d{4}))?"#, "i")

    static let TRIAL_WORD = rx(#"trial"#, "i")
    static let TRIAL_CUE = rx(
        #"\b(trial (ends|will end|expires|is over)( on)?|free (trial )?(until|through|ends)|you('ll| will) (be|first be) (charged|billed)( on)?|first (payment|charge|bill)( date)?( is| will be)?( on)?)\b"#,
        "i"
    )
    static let NEXT_CUE = rx(
        #"\b(renews?( automatically)? on|will renew( on)?|next (billing|payment|charge|renewal)( date)?( is| will be)?( on)?|(billed|charged) (again )?on|renewal date( is)?)\b"#,
        "i"
    )

    static let CANCEL_HTTPS = rx(#"^https://"#, "i")
    static let CANCEL_HINT = rx(#"cancel|unsubscribe-plan|manage|membership|subscription|account/plan|billing"#, "i")
    static let CANCEL_NOT = rx(#"unsubscribe(?!-plan)|email-preferences|privacy"#, "i")

    static let HREF = rx(#"href\s*=\s*["']([^"']+)["']"#, "i")
    static let STYLE_SCRIPT = rx(#"<(style|script)[\s\S]*?</\1>"#, "i")
    static let BLOCK_END = rx(#"<br\s*/?>|</(p|div|tr|li|h\d)>"#, "i")
    static let TAG = rx(#"<[^>]+>"#)
    static let NBSP = rx(#"&nbsp;"#)
    static let DEC_ENTITY = rx(#"&#(\d+);"#)
    static let HEX_ENTITY = rx(#"&#x([0-9a-f]+);"#, "i")
    static let AMP = rx(#"&amp;"#)
    static let EURO = rx(#"&euro;"#)
    static let POUND = rx(#"&pound;"#)
    static let RUN_OF_SPACES = rx(#"[ \t]+"#)
    static let BLANK_LINES = rx(#"\n\s*\n+"#)

    // MARK: Merchant

    static func senderDomain(_ from: String) -> String {
        guard let m = match(SENDER_AT, from), let host = m[1] else { return "" }
        let parts = host.lowercased().components(separatedBy: ".")
        // account.netflix.com → netflix.com; ignores 2-level TLDs like co.uk on purpose
        // (good enough for brand lookup; a wrong label only lowers confidence).
        return parts.suffix(2).joined(separator: ".")
    }

    static func displayName(_ from: String) -> String {
        let noAddr = replace(from, ANGLE_ADDR, global: false) { _ in "" }
        return replace(noAddr, DQUOTE) { _ in "" }.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func merchantFor(_ from: String) -> (name: String, known: Bool)? {
        let domain = senderDomain(from)
        if let known = DOMAIN_MERCHANTS[domain] { return (name: known, known: true) }
        if domain.isEmpty || test(NOT_A_MERCHANT, domain) {
            // Fall back to the display name only when the domain told us nothing.
            let display = displayName(from)
            return !display.isEmpty && !display.contains("@") ? (name: slice(display, 0, 80), known: false) : nil
        }
        let display = displayName(from)
        let label = domain.components(separatedBy: ".")[0]
        // Prefer a display name that actually contains the domain's brand ("Spotify" over "no-reply").
        // (JS `includes('')` is true, hence the isEmpty arm.)
        let squashed = replace(display.lowercased(), NON_ALNUM) { _ in "" }
        if !display.isEmpty && (label.isEmpty || squashed.contains(label)) {
            let trimmed = replace(display, ROLE_SUFFIX, global: false) { _ in "" }
            return (name: slice(trimmed, 0, 80), known: false)
        }
        return (name: label.prefix(1).uppercased() + String(label.dropFirst()), known: false)
    }

    // MARK: Amount

    /// '1,234.56' and '1.234,56' → cents. The last separator followed by 1-2
    /// digits is the decimal mark; every other separator groups thousands.
    static func amountToCents(_ raw: String) -> Int {
        let m = match(DECIMAL_TAIL, raw)
        let whole = replace(m?[1] ?? raw, SEPARATORS) { _ in "" }
        let fracDigits = m?[2] ?? "00"
        let frac = fracDigits.count < 2 ? fracDigits + "0" : fracDigits // padEnd(2, '0')
        // ponytail: a figure past 10^12 dollars reads as no amount (JS would send a float the
        // server rejects, failing the whole batch); Int arithmetic would trap instead.
        guard let w = Int(whole), w < 1_000_000_000_000 else { return 0 }
        return w * 100 + num(frac)
    }

    static func findAmount(_ text: String) -> (cents: Int, currency: String)? {
        var hits: [(cents: Int, currency: String, index: Int)] = []
        for m in AMOUNT_RE.matches(in: text, range: range(text)) {
            let g = groups(m, text)
            let index = m.range.location
            // A credit is not a price: skip "-$9.99" and amounts in refund context,
            // or a refund receipt reads as what the subscription costs.
            if test(CREDIT_SIGN, slice(text, max(0, index - 3), index)) { continue }
            if test(REFUND_CUE, slice(text, max(0, index - 30), index)) { continue }
            let raw = g[3] ?? g[5] ?? ""
            var currency = g[4] ?? g[2].flatMap { CURRENCY_SYMBOL[$0] } ?? "USD"
            if g[1] == "CA" { currency = "CAD" }
            if g[1] == "A" { currency = "AUD" }
            let cents = amountToCents(raw)
            if cents > 0 { hits.append((cents: cents, currency: currency, index: index)) }
        }
        guard let first = hits.first else { return nil }
        // The charged figure usually sits right after "total"/"charged"/"price";
        // otherwise the first amount in the email is the best guess.
        // \b before the cue: "Subtotal" must not count as "total".
        let near = hits.first { test(PRICE_CUE, slice(text, max(0, $0.index - 45), $0.index)) }
        let pick = near ?? first
        return (cents: pick.cents, currency: pick.currency)
    }

    static func findCadence(_ text: String) -> SettingsCadence {
        if test(CADENCE_MONTHLY, text) { return .monthly }
        if test(CADENCE_YEARLY, text) { return .yearly }
        if test(CADENCE_WEEKLY, text) { return .weekly }
        return .unknown
    }

    // MARK: Dates

    static let UTC: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    /// TS: `new Date(Date.UTC(y, monthIdx, d, 12))`, kept only if getUTCMonth() === monthIdx && d >= 1.
    /// Date.UTC rolls an out-of-range month/day over, so that check keeps exactly the real calendar
    /// days, which is what is tested here. Date.UTC also reads years 0–99 as 19xx.
    static func toDate(_ y: Int, _ monthIdx: Int, _ d: Int) -> Date? {
        let year = (0...99).contains(y) ? 1900 + y : y
        guard (0...11).contains(monthIdx), d >= 1,
              let first = UTC.date(from: DateComponents(year: year, month: monthIdx + 1, day: 1, hour: 12)),
              let days = UTC.range(of: .day, in: .month, for: first), d <= days.count
        else { return nil }
        return UTC.date(from: DateComponents(year: year, month: monthIdx + 1, day: d, hour: 12))
    }

    /// First date in `s`, inferring the year from `ref` when it's missing.
    static func parseDate(_ s: String, _ ref: Date) -> Date? {
        if let m = match(DATE_ISO, s) { return toDate(num(m[1]), num(m[2]) - 1, num(m[3])) }
        if let m = match(DATE_US, s) {
            let y = m[3] ?? ""
            return toDate(y.count == 2 ? 2000 + num(y) : num(y), num(m[1]) - 1, num(m[2]))
        }
        let monthIdx: Int
        let day: Int
        let year: Int?
        if let m = match(DATE_MONTH_DAY, s) {
            monthIdx = MONTHS.firstIndex(of: String((m[1] ?? "").prefix(3)).lowercased()) ?? -1
            day = num(m[2])
            year = m[3].map { num($0) }
        } else if let m = match(DATE_DAY_MONTH, s) {
            monthIdx = MONTHS.firstIndex(of: String((m[2] ?? "").prefix(3)).lowercased()) ?? -1
            day = num(m[1])
            year = m[3].map { num($0) }
        } else {
            return nil
        }
        // TS `if (year)`: a year of 0 is falsy, so it counts as missing.
        if let year, year != 0 { return toDate(year, monthIdx, day) }
        // No year written: the next occurrence on or after the email's date.
        let y = UTC.component(.year, from: ref)
        if let guess = toDate(y, monthIdx, day),
           guess.timeIntervalSince1970 * 1000 >= ref.timeIntervalSince1970 * 1000 - 86_400_000 {
            return guess
        }
        return toDate(y + 1, monthIdx, day)
    }

    static func dateAfter(_ text: String, _ cue: NSRegularExpression, _ ref: Date) -> Date? {
        guard let m = cue.firstMatch(in: text, range: range(text)) else { return nil }
        let end = m.range.location + m.range.length
        return parseDate(slice(text, end, end + 60), ref)
    }

    static func findCancelUrl(_ links: [String]?) -> String? {
        guard let url = links?.first(where: {
            test(CANCEL_HTTPS, $0) && test(CANCEL_HINT, $0) && !test(CANCEL_NOT, $0)
        }) else { return nil }
        return slice(url, 0, 500)
    }

    // MARK: The three exports

    static func extractSubscription(_ email: SettingsEmailInput) -> SettingsDetected? {
        let haystack = "\(email.subject)\n\(email.text)"
        if !test(SUBSCRIPTION_SIGNAL, haystack) { return nil }

        guard let merchant = merchantFor(email.from) else { return nil }

        let amount = findAmount(haystack)
        let cadence = findCadence(haystack)
        let trialEnd = test(TRIAL_WORD, haystack) ? dateAfter(haystack, TRIAL_CUE, email.receivedAt) : nil
        let next = dateAfter(haystack, NEXT_CUE, email.receivedAt)

        // A subscription signal with nothing concrete (no price, cycle or date) is
        // noise — a newsletter "manage your subscription" footer, say.
        if amount == nil && cadence == .unknown && trialEnd == nil && next == nil { return nil }

        var confidence = 0.35
        if amount != nil { confidence += 0.2 }
        if cadence != .unknown { confidence += 0.2 }
        if trialEnd != nil || next != nil { confidence += 0.15 }
        if merchant.known { confidence += 0.1 }

        return SettingsDetected(
            merchant: merchant.name,
            amountCents: amount?.cents,
            currency: amount?.currency,
            cadence: cadence,
            nextChargeDate: next.map { toISOString($0) },
            trialEndsAt: trialEnd.map { toISOString($0) },
            cancelUrl: findCancelUrl(email.links),
            confidence: min(1, jsRound(confidence * 100) / 100)
        )
    }

    static func mergeByMerchant(_ items: [SettingsFound]) -> [SettingsDetected] {
        var order: [String] = [] // a JS Map keeps first-insertion order
        var byKey: [String: SettingsFound] = [:]
        // Array.prototype.sort is stable; the offset keeps equal timestamps in input order.
        let sorted = items.enumerated()
            .sorted { ($0.element.receivedAt, $0.offset) < ($1.element.receivedAt, $1.offset) }
            .map { $0.element }
        for it in sorted {
            let key = it.detected.merchant.lowercased()
            guard let prev = byKey[key] else {
                order.append(key)
                byKey[key] = it
                continue
            }
            let p = prev.detected
            var d = it.detected
            d.amountCents = d.amountCents ?? p.amountCents
            d.currency = d.currency ?? p.currency
            d.cadence = d.cadence != .unknown ? d.cadence : p.cadence
            d.nextChargeDate = d.nextChargeDate ?? p.nextChargeDate
            d.trialEndsAt = d.trialEndsAt ?? p.trialEndsAt
            d.cancelUrl = d.cancelUrl ?? p.cancelUrl
            d.confidence = max(d.confidence, p.confidence)
            byKey[key] = SettingsFound(detected: d, receivedAt: it.receivedAt)
        }
        return order.compactMap { byKey[$0]?.detected }
    }

    static func htmlToText(_ html: String) -> (text: String, links: [String]) {
        let links = HREF.matches(in: html, range: range(html))
            .compactMap { groups($0, html)[1] }
            .map { replace($0, AMP) { _ in "&" } }
        var t = html
        t = replace(t, STYLE_SCRIPT) { _ in " " }
        t = replace(t, BLOCK_END) { _ in "\n" }
        t = replace(t, TAG) { _ in " " }
        t = replace(t, NBSP) { _ in " " }
        // Numeric entities BEFORE &amp;, so "&amp;#8364;" (literal text) is not
        // double-decoded into €. Covers &#8364; / &#163; / &#36; and friends.
        // (JS String.fromCodePoint throws on a code point it can't make, failing the whole
        // scan; such an entity is left as written here instead.)
        t = replace(t, DEC_ENTITY) { g in codePoint(Int(g[1] ?? "")) ?? (g[0] ?? "") }
        t = replace(t, HEX_ENTITY) { g in codePoint(Int(g[1] ?? "", radix: 16)) ?? (g[0] ?? "") }
        t = replace(t, AMP) { _ in "&" }
        t = replace(t, EURO) { _ in "€" }
        t = replace(t, POUND) { _ in "£" }
        t = replace(t, RUN_OF_SPACES) { _ in " " }
        t = replace(t, BLANK_LINES) { _ in "\n" }
        return (text: t.trimmingCharacters(in: .whitespacesAndNewlines), links: links)
    }

    /// String.fromCodePoint(n), nil where JS would throw.
    static func codePoint(_ n: Int?) -> String? {
        guard let n, let u = Unicode.Scalar(UInt32(clamping: max(0, n))), n >= 0 else { return nil }
        return String(Character(u))
    }
}

// MARK: - DEBUG self-check: utils/inboxScan/extract.test.ts, case for case

#if DEBUG
enum SettingsInboxExtractSelfCheck {
    /// Failures as "FAIL <case>: …" lines; empty when every case passes.
    static func run() -> [String] {
        var fails: [String] = []
        func eq<T: Equatable>(_ a: T, _ b: T, _ label: String) {
            if a != b { fails.append("FAIL \(label): got \(String(describing: a)), want \(String(describing: b))") }
        }
        func ok(_ c: Bool, _ label: String) { if !c { fails.append("FAIL \(label)") } }
        let at = parseISODate("2026-09-15T10:00:00Z") ?? Date()
        func day(_ iso: String?) -> String? { iso.map { String($0.prefix(10)) } }
        func x(_ from: String, _ subject: String, _ text: String, _ links: [String]? = nil) -> SettingsDetected? {
            extractSubscription(SettingsEmailInput(from: from, subject: subject, text: text, links: links, receivedAt: at))
        }

        var r = x("Netflix <info@account.netflix.com>", "Your Netflix membership has been renewed",
                  "Standard plan $15.49/month. Your next billing date is October 15, 2026.",
                  ["https://www.netflix.com/cancelplan", "https://www.netflix.com/email-preferences"])
        eq(r?.merchant, "Netflix", "netflix merchant")
        eq(r?.amountCents, 1549, "netflix amount")
        eq(r?.currency, "USD", "netflix currency")
        eq(r?.cadence, SettingsCadence.monthly, "netflix cadence")
        eq(day(r?.nextChargeDate), "2026-10-15", "netflix next")
        eq(r?.cancelUrl, "https://www.netflix.com/cancelplan", "netflix cancel")
        ok((r?.confidence ?? 0) >= 0.9, "netflix confidence")

        r = x("\"Spotify\" <no-reply@spotify.com>", "Your Spotify Premium receipt",
              "Premium Individual. Total charged: $11.99. Your subscription renews on Oct 15 every month.")
        eq(r?.merchant, "Spotify", "spotify merchant")
        eq(r?.amountCents, 1199, "spotify amount")
        eq(r?.cadence, SettingsCadence.monthly, "spotify cadence")
        eq(day(r?.nextChargeDate), "2026-10-15", "spotify next (no year rolls forward)")

        r = x("Apple <no_reply@email.apple.com>", "Your subscription confirmation", "iCloud+ 200GB. $29.99 per year. Renews 9/20/2027.")
        eq(r?.merchant, "Apple", "apple merchant")
        eq(r?.cadence, SettingsCadence.yearly, "apple cadence")
        eq(r?.amountCents, 2999, "apple amount")

        r = x("Adobe <mail@mail.adobe.com>", "Your Adobe subscription",
              "Creative Cloud All Apps. Subtotal $59.99 Tax $5.10 Total $65.09 per month. Next payment date: 2026-10-14.")
        eq(r?.merchant, "Adobe", "adobe merchant")
        eq(r?.amountCents, 6509, "adobe total")
        eq(day(r?.nextChargeDate), "2026-10-14", "adobe next")

        r = x("OpenAI <noreply@tm.openai.com>", "Your ChatGPT Plus subscription receipt", "ChatGPT Plus subscription. Amount paid $20.00. Billed monthly.")
        eq(r?.merchant, "ChatGPT", "openai merchant")
        eq(r?.amountCents, 2000, "openai amount")
        eq(r?.cadence, SettingsCadence.monthly, "openai cadence")

        r = x("Iron Works Gym <billing@ironworksgym.com>", "Membership dues receipt",
              "Your monthly membership dues of $45.00 were charged. Next charge on 15 October 2026.")
        eq(r?.merchant, "Iron Works Gym", "gym merchant")
        eq(r?.amountCents, 4500, "gym amount")
        eq(day(r?.nextChargeDate), "2026-10-15", "gym next")

        r = x("Hulu <hulu@hulumail.com>", "Welcome to your free trial",
              "Your free trial ends on September 22, 2026. After that you will be charged $9.99/month.")
        eq(day(r?.trialEndsAt), "2026-09-22", "hulu trial")
        eq(r?.amountCents, 999, "hulu amount")
        eq(r?.cadence, SettingsCadence.monthly, "hulu cadence")

        ok(x("Amazon.com <shipment-tracking@amazon.com>", "Your order has shipped", "Order total $34.12. Arriving Thursday.") == nil, "one-off order")
        ok(x("Weekly Digest <news@digest.example.com>", "This week in tech", "Great stories. Manage your subscription or unsubscribe at any time.") == nil, "newsletter footer")
        ok(x("someone@gmail.com", "Re: subscription", "Your plan renews on Oct 1, $5/month") == nil, "personal mail host")

        r = x("Netflix <info@account.netflix.com>", "Your Netflix refund",
              "We issued a refund of $15.49 for your membership. Your subscription renews on October 15, 2026.")
        eq(r?.amountCents, nil, "refund amount")
        eq(day(r?.nextChargeDate), "2026-10-15", "refund next")

        r = x("Spotify <no-reply@spotify.com>", "Your Spotify Premium receipt", "Adjustment -$11.99 applied to your subscription. Billed monthly.")
        eq(r?.amountCents, nil, "negative amount")
        eq(r?.cadence, SettingsCadence.monthly, "negative cadence")

        r = x("Adobe <mail@mail.adobe.com>", "Your Adobe subscription", "Creative Cloud. Total €1.234,56 per year.")
        eq(r?.amountCents, 123456, "eu amount")
        eq(r?.currency, "EUR", "eu currency")
        eq(r?.cadence, SettingsCadence.yearly, "eu cadence")

        var h = htmlToText("<p>Total &#8364;9,99 or &#163;7.99 or &#x24;5</p>")
        ok(h.text.contains("€9,99") && h.text.contains("£7.99") && h.text.contains("$5"), "html numeric entities")
        h = htmlToText("<p>Total&nbsp;&#36;9.99</p><a href=\"https://x.com/cancel?a=1&amp;b=2\">Cancel</a>")
        ok(h.text.contains("Total $9.99"), "html text")
        eq(h.links, ["https://x.com/cancel?a=1&b=2"], "html links")

        let older = SettingsDetected(merchant: "Netflix", amountCents: 1549, currency: "USD", cadence: .monthly,
                                        nextChargeDate: nil, trialEndsAt: nil, cancelUrl: nil, confidence: 0.7)
        var newer = older
        newer.merchant = "netflix"
        newer.amountCents = nil
        newer.cadence = .unknown
        newer.nextChargeDate = "2026-10-15T12:00:00.000Z"
        let out = mergeByMerchant([SettingsFound(detected: older, receivedAt: 1), SettingsFound(detected: newer, receivedAt: 2)])
        eq(out.count, 1, "merge count")
        eq(out.first?.amountCents, 1549, "merge amount")
        eq(out.first?.cadence, SettingsCadence.monthly, "merge cadence")
        eq(out.first?.nextChargeDate, "2026-10-15T12:00:00.000Z", "merge next")
        return fails
    }
}
#endif
