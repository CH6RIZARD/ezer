// Port of apps/mobile/utils/merchantDomain.ts
//
// Which website really belongs to a merchant. Plaid's per-transaction `website` is usually right
// but not always: a merchant row is shared by every user and keeps the FIRST website any of its
// transactions carried (a "Cancel" button once opened TikTok). A website is only trusted when its
// domain visibly matches the merchant's name.

import Foundation

/** Strip a Plaid `website` ("https://www.netflix.com/") down to a bare host. */
func domainFromWebsite(_ website: String?) -> String? {
    let raw = (website ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.isEmpty { return nil }
    var host = raw
    host = host.replacingOccurrences(of: "^https?://", with: "", options: [.regularExpression, .caseInsensitive])
    host = host.replacingOccurrences(of: "^www\\.", with: "", options: [.regularExpression, .caseInsensitive])
    host = String(host.split(separator: "/", omittingEmptySubsequences: false).first ?? "")
    host = String(host.split(separator: "?", omittingEmptySubsequences: false).first ?? "")
    host = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return host.contains(".") ? host : nil
}

/**
 * The website's host, but only if one of its labels and the merchant's name share a word of 3+
 * letters ("Ascent Funding" ~ ascentfunding.com, "Self" ~ self.inc). Otherwise nil, and callers
 * fall back to their curated tables.
 */
func trustedWebsiteDomain(_ website: String?, _ merchantName: String) -> String? {
    guard let host = domainFromWebsite(website) else { return nil }
    let labels = host.split(separator: ".", omittingEmptySubsequences: false).dropLast().map(String.init).filter { $0.count >= 3 }
    let name = merchantName.lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    let words = name.split(separator: " ", omittingEmptySubsequences: false).map(String.init).filter { $0.count >= 3 }
    let squashed = name.replacingOccurrences(of: " ", with: "")
    let ok = labels.contains { l in squashed.contains(l) || words.contains { l.contains($0) } }
    return ok ? host : nil
}

// merchantId -> Plaid website, filled by DataStore whenever subscriptions load, so MerchantMark
// (rendered from a dozen places that only have the id) can use the real domain.
@MainActor private var websiteByMerchant: [String: String] = [:]

@MainActor
func rememberMerchantWebsites(_ subs: [Subscription]) {
    for s in subs { if let w = s.website, !w.isEmpty { websiteByMerchant[s.merchantId] = w } }
}

@MainActor
func websiteForMerchant(_ merchantId: String?) -> String? {
    guard let merchantId else { return nil }
    return websiteByMerchant[merchantId]
}
