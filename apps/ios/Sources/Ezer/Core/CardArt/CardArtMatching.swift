// Port of apps/mobile/utils/cardArt/matching.ts
// Matches a linked account's bank name to a catalog issuer — whole-word, longest alias first
// ("Citizens Bank" must not match "citi"; "First Citizens" is its own issuer).

import Foundation

/** Lowercase words only: "U.S. Bank, N.A." -> ["us", "bank", "n", "a"]. */
func tokenize(_ name: String) -> [String] {
    var s = name.lowercased()
    s = s.replacingOccurrences(of: "&", with: " and ")
    s = s.replacingOccurrences(of: ".", with: "") // "U.S." -> "us"
    s = jsReplace(s, "[^a-z0-9]+", " ")
    return s.trimmingCharacters(in: .whitespaces).split(separator: " ").map(String.init).filter { !$0.isEmpty }
}

/** True when `needle` appears in `hay` as a run of whole words. */
private func containsWordRun(_ hay: [String], _ needle: [String]) -> Bool {
    if needle.isEmpty || needle.count > hay.count { return false }
    for i in 0...(hay.count - needle.count) {
        var ok = true
        for j in 0..<needle.count where hay[i + j] != needle[j] {
            ok = false
            break
        }
        if ok { return true }
    }
    return false
}

// Longest alias first, so "bank of america" is tried before any shorter alias.
private let ALIAS_INDEX: [(tokens: [String], issuer: Issuer)] = ISSUERS
    .flatMap { issuer in issuer.aliases.map { (tokens: tokenize($0), issuer: issuer) } }
    .enumerated()
    .sorted { a, b in a.element.tokens.count != b.element.tokens.count ? a.element.tokens.count > b.element.tokens.count : a.offset < b.offset }
    .map { $0.element }

/** Finds the catalog issuer for a bank name, or nil. */
func matchIssuer(_ institutionName: String?) -> Issuer? {
    guard let institutionName, !institutionName.isEmpty else { return nil }
    let hay = tokenize(institutionName)
    if hay.isEmpty { return nil }
    return ALIAS_INDEX.first { containsWordRun(hay, $0.tokens) }?.issuer
}
