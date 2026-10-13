// Port of apps/mobile/utils/cancellation.ts
//
// Cancel / "Cut it" must land the user on THAT service's real cancellation page. Resolution order:
//   1. `cancellationUrl` on the merchant record (API-supplied).
//   2. Curated table for well-known services.
//   3. AUTO-DISCOVERY from the merchant's (trusted) website: probe CANCEL_PATHS, first that answers
//      wins, cached per device (`@ezer_cancel_urls_v2`). Redirects to another site are rejected.
//   4. The merchant's own homepage domain.
// No search-engine fallback (removed on purpose): with nothing resolvable, `openCancellation`
// says so honestly. Steps 1-2 are instant; step 3 is network, so disable the button while it runs.

import Foundation
import UIKit

// v2: v1 could hold a URL whose probe had been redirected off-site.
private let CACHE_KEY = "@ezer_cancel_urls_v2"
/** Per-request budget. Probing must never make a Cancel button feel hung. */
private let PROBE_TIMEOUT_MS: Double = 2500
/** Whole-discovery budget across all candidate paths. */
private let DISCOVERY_BUDGET_MS: Double = 6000

/// JS `s.replace(regex, with)` with JS regex semantics (NSRegularExpression).
func jsReplace(_ s: String, _ pattern: String, _ template: String) -> String {
    guard let re = try? NSRegularExpression(pattern: pattern) else { return s }
    return re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: template)
}

/** Same normalisation the logo resolver uses, so keys stay consistent (note: keeps '.'). */
private func normalise(_ raw: String?) -> String {
    var s = (raw ?? "").lowercased()
    s = jsReplace(s, "[*#]", " ")
    s = jsReplace(s, "\\b(inc|llc|ltd|co|corp|usa|com|subscription|sub|monthly|payment|recurring|bill|autopay)\\b", " ")
    s = jsReplace(s, "[^a-z0-9+. ]", " ")
    s = jsReplace(s, "\\s+", " ")
    return s.trimmingCharacters(in: .whitespaces)
}

/**
 * Curated destinations, pointing at the ACCOUNT/PLAN page where cancellation actually lives.
 */
private let FALLBACK_CANCEL_URL: [String: String] = [
    "netflix": "https://www.netflix.com/cancelplan",
    "spotify": "https://www.spotify.com/account/subscription/",
    "adobe": "https://account.adobe.com/plans",
    "youtube": "https://www.youtube.com/paid_memberships",
    "disney": "https://www.disneyplus.com/account/subscription",
    "icloud": "https://support.apple.com/en-us/HT202039",
    "apple": "https://support.apple.com/en-us/HT202039",
    "hulu": "https://secure.hulu.com/account",
    "hbomax": "https://www.max.com/account",
    "max": "https://www.max.com/account",
    "chatgpt": "https://chatgpt.com/#settings/Subscription",
    "openai": "https://chatgpt.com/#settings/Subscription",
    "amazon": "https://www.amazon.com/gp/primecentral",
    "dropbox": "https://www.dropbox.com/account/plan",
    "notion": "https://www.notion.so/my-account",
    "audible": "https://www.audible.com/account/membership",
    "paramount": "https://www.paramountplus.com/account/",
    "peacock": "https://www.peacocktv.com/account/plans",
    // Verified against each merchant's own support docs on 2026-09-29 — not guessed.
    "cursor": "https://cursor.com/dashboard/billing",
    "google": "https://myaccount.google.com/subscriptions",
    "proton": "https://account.proton.me",
    "netlify": "https://app.netlify.com",
    "netli": "https://app.netlify.com", // truncated Plaid merchant text, see brandLogos.ts
]

/** Domains for the demo set, so discovery works without Plaid connected. */
private let KNOWN_DOMAIN: [String: String] = [
    "netflix": "netflix.com",
    "spotify": "spotify.com",
    "adobe": "adobe.com",
    "youtube": "youtube.com",
    "hulu": "hulu.com",
    "icloud": "apple.com",
    "apple": "apple.com",
    "chatgpt": "openai.com",
    "openai": "openai.com",
    "fitpass": "classpass.com",
    "hbomax": "max.com",
    "disney": "disneyplus.com",
]

/**
 * Where cancellation lives, most-specific first. We take the first path that responds, so
 * `/account/subscription` must be tried before a bare `/account`.
 */
private let CANCEL_PATHS = [
    "/account/subscription",
    "/account/subscriptions",
    "/account/plan",
    "/account/membership",
    "/cancel",
    "/cancelplan",
    "/settings/subscription",
    "/settings/billing",
    "/account/billing",
    "/billing",
    "/account",
    "/settings",
]

/**
 * Secondary, informational-only hint for resolutions that are not a confirmed direct cancel URL
 * ('homepage' or 'unknown'). Text only, never an auto-opened link.
 */
func appStoreFallbackHint() -> String {
    // iOS branch of the RN Platform.OS switch.
    "If you subscribed through the App Store instead, cancel there: Settings → [Your Name] → Subscriptions."
}

struct CancellationTarget: Hashable, Sendable {
    /** Empty only when `source` is 'unknown' — there is nowhere to send the user. */
    var url: String
    /** How we got here: 'merchant' | 'known' | 'discovered' | 'homepage' | 'unknown'. Be honest when it's a guess. */
    var source: String
    var merchantName: String
}

// --- cache -------------------------------------------------------------------

private func readCache() -> [String: String] {
    KV.getJSON(CACHE_KEY, as: [String: String].self) ?? [:]
}

private func writeCache(_ domain: String, _ url: String) {
    var cache = readCache()
    cache[domain] = url
    KV.setJSON(CACHE_KEY, cache)
}

// --- discovery ---------------------------------------------------------------

/// Follows redirects (like fetch) and remembers where it landed.
private let probeSession: URLSession = {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.timeoutIntervalForRequest = PROBE_TIMEOUT_MS / 1000
    cfg.timeoutIntervalForResource = PROBE_TIMEOUT_MS / 1000
    return URLSession(configuration: cfg)
}()

private func probe(_ url: String) async -> Bool {
    guard let u = URL(string: url) else { return false }
    var req = URLRequest(url: u)
    // HEAD keeps it cheap; some hosts reject HEAD, so a 405 still counts as "this path exists".
    req.httpMethod = "HEAD"
    req.timeoutInterval = PROBE_TIMEOUT_MS / 1000
    do {
        let (_, res) = try await probeSession.data(for: req)
        guard let http = res as? HTTPURLResponse else { return false }
        // A path that bounces to ANOTHER site (a parked domain, a link-in-bio page, TikTok) is
        // not this merchant's cancel page.
        let want = domainFromWebsite(url) ?? ""
        let got = domainFromWebsite(http.url?.absoluteString) ?? want
        if got != want && !got.hasSuffix("." + want) && !want.hasSuffix("." + got) { return false }
        let s = http.statusCode
        return s < 400 || s == 401 || s == 403 || s == 405
    } catch {
        return false
    }
}

/**
 * Walk CANCEL_PATHS against a domain and return the first that answers.
 * Bounded by DISCOVERY_BUDGET_MS so a slow host cannot hang the button.
 */
func discoverCancellationUrl(_ domain: String) async -> String? {
    let cache = readCache()
    if let hit = cache[domain] { return hit }

    let deadline = nowMs() + DISCOVERY_BUDGET_MS
    for path in CANCEL_PATHS {
        if nowMs() > deadline { break }
        let url = "https://\(domain)\(path)"
        if await probe(url) {
            writeCache(domain, url)
            return url
        }
    }
    return nil
}

// --- resolution --------------------------------------------------------------

/** Instant resolution — record and curated table only, no network. */
func resolveCancellationUrlSync(_ merchantName: String, _ merchantId: String? = nil, _ merchantCancellationUrl: String? = nil) -> CancellationTarget? {
    if let explicit = merchantCancellationUrl, !explicit.isEmpty {
        return CancellationTarget(url: explicit, source: "merchant", merchantName: merchantName)
    }
    for candidate in [normalise(merchantId), normalise(merchantName)] {
        if candidate.isEmpty { continue }
        let head = String(candidate.split(separator: " ", omittingEmptySubsequences: false).first ?? "")
        if let hit = FALLBACK_CANCEL_URL[candidate] ?? FALLBACK_CANCEL_URL[head] {
            return CancellationTarget(url: hit, source: "known", merchantName: merchantName)
        }
    }
    return nil
}

/**
 * Full resolution: auto-discovery against the merchant's website, then the homepage domain.
 * Never throws, never falls back to a search engine.
 *
 * @param website Plaid merchant `website`, when available.
 */
func resolveCancellationUrl(_ merchantName: String, _ merchantId: String? = nil, _ merchantCancellationUrl: String? = nil, _ website: String? = nil) async -> CancellationTarget {
    if let quick = resolveCancellationUrlSync(merchantName, merchantId, merchantCancellationUrl) { return quick }

    let idKey = normalise(merchantId)
    let nameKey = normalise(merchantName)
    let nameHead = String(nameKey.split(separator: " ", omittingEmptySubsequences: false).first ?? "")
    // Plaid's website only when it matches the merchant (see merchantDomain).
    let domain =
        trustedWebsiteDomain(website, merchantName) ??
        KNOWN_DOMAIN[idKey] ??
        KNOWN_DOMAIN[nameKey] ??
        KNOWN_DOMAIN[nameHead] ??
        MERCHANT_DOMAIN[idKey] ??
        MERCHANT_DOMAIN[nameKey] ??
        MERCHANT_DOMAIN[nameHead]

    if let domain {
        if let found = await discoverCancellationUrl(domain) {
            return CancellationTarget(url: found, source: "discovered", merchantName: merchantName)
        }
        // We know which company this is — land on their own site rather than dead-ending.
        return CancellationTarget(url: "https://\(domain)", source: "homepage", merchantName: merchantName)
    }

    // Nothing honest to open — say so instead of guessing with a search query.
    return CancellationTarget(url: "", source: "unknown", merchantName: merchantName)
}

// --- opening -----------------------------------------------------------------

@MainActor
@discardableResult
func openCancellation(_ target: CancellationTarget) async -> Bool {
    if target.source == "unknown" || target.url.isEmpty {
        AppAlert.alert(
            "We don't have a confirmed cancellation link yet",
            "We couldn't find an official cancellation page for \(target.merchantName). Check your card or bank statement for how you signed up, or search for \(target.merchantName)'s own site directly.\n\n\(appStoreFallbackHint())"
        )
        return false
    }
    guard let url = URL(string: target.url), UIApplication.shared.canOpenURL(url) else {
        AppAlert.alert("Could not open the page", "Cancel \(target.merchantName) at:\n\(target.url)")
        return false
    }
    let ok = await UIApplication.shared.open(url)
    if !ok {
        AppAlert.alert("Could not open the page", "Cancel \(target.merchantName) at:\n\(target.url)")
    }
    return ok
}

/** Resolve (discovering if needed) and open. */
@MainActor
@discardableResult
func cancelSubscription(_ merchantName: String, _ merchantId: String? = nil, _ merchantCancellationUrl: String? = nil, _ website: String? = nil) async -> CancellationTarget {
    let target = await resolveCancellationUrl(merchantName, merchantId, merchantCancellationUrl, website)
    await openCancellation(target)
    return target
}
