// Port of apps/mobile/components/redesign/MerchantMark.tsx
//
// A merchant's REAL brand logo in a rounded-square tile (radius ≈ 32% of size; sizes in use 15/26/
// 38–42/64). Resolution order, first hit wins:
//   1. BUNDLED brand mark (BrandLogos.swift, vector path data) — cannot fail at runtime.
//   2. Plaid-supplied `logoUrl` (https, or a bare base64 PNG wrapped into a data: URI).
//   3. Google favicon CDN (sz=256 — the only bucket guaranteed sharp) for a trusted/curated/guessed
//      domain. Its 16px grey globe for an unknown domain counts as a miss.
//   4. Brand-coloured initial tile — true last resort, and the placeholder while 2/3 load
//      (never an empty white square).
//
//   MerchantMark(name: s.merchantName, merchantId: s.merchantId, size: 40, logoUrl: s.logo)

import SwiftUI

/**
 * Reduce a display name / merchant id to a lookup key ("NETFLIX.COM *SUB" -> "netflix").
 */
private func normalise(_ raw: String?) -> String {
    var s = (raw ?? "").lowercased()
    s = jsReplace(s, "[*#]", " ")
    s = jsReplace(s, "\\b(inc|llc|ltd|co|corp|usa|com|subscription|sub|monthly|payment|recurring|bill|autopay)\\b", " ")
    s = jsReplace(s, "[^a-z0-9+]", " ")
    s = jsReplace(s, "\\s+", " ")
    return s.trimmingCharacters(in: .whitespaces)
}

private func firstWord(_ s: String) -> String {
    String(s.split(separator: " ", omittingEmptySubsequences: false).first ?? "")
}

/** Resolve a name/id to a bundled-logo key, trying exact then loose matches. */
private func resolveLogoKey(_ name: String?, _ merchantId: String?) -> String? {
    let candidates = [normalise(merchantId), normalise(name)].filter { !$0.isEmpty }
    for c in candidates {
        if BRAND_LOGOS[c] != nil { return c }
        if let a = LOGO_ALIASES[c] { return a }
    }
    for c in candidates {
        // "netflix premium 4k" -> the first word still identifies the brand.
        let head = firstWord(c)
        if BRAND_LOGOS[head] != nil { return head }
        if let a = LOGO_ALIASES[head] { return a }
        // Substring hit, e.g. "apple icloud storage plan" (JS object key order = insertion order).
        for key in BRAND_LOGO_KEYS where key.count >= 4 && c.contains(key) { return key }
    }
    return nil
}

/// BRAND_LOGOS keys in the TS object's insertion order (Object.keys), for the substring pass.
private let BRAND_LOGO_KEYS = ["netflix", "hulu", "spotify", "icloud", "apple", "youtube", "adobe", "openai", "max", "hbo", "dropbox", "notion", "fitpass"]

/**
 * Domain lookup for the optional remote step: curated MERCHANT_DOMAIN first, then `{name}.com`.
 */
private func resolveDomain(_ name: String?, _ merchantId: String?) -> String? {
    for c in [normalise(merchantId), normalise(name)] {
        if c.isEmpty { continue }
        if let d = MERCHANT_DOMAIN[c] { return d }
        if let d = MERCHANT_DOMAIN[firstWord(c)] { return d }
    }
    let n = normalise(name)
    let guess = n.isEmpty ? normalise(merchantId) : n
    let head = firstWord(guess)
    if head.count >= 3 { return "\(head).com" }
    return nil
}

/** Public favicon/logo CDN, no API key. Always 256: a real full-resolution bucket. */
private func cdnUrl(_ domain: String) -> String {
    "https://www.google.com/s2/favicons?domain=\(domain)&sz=256"
}

/** Accept an https/data URI, or a bare base64 PNG the way Plaid returns it. */
private func normaliseLogoUrl(_ logoUrl: String?) -> String? {
    let v = (logoUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if v.isEmpty { return nil }
    if v.hasPrefix("http") || v.hasPrefix("data:") { return v }
    return "data:image/png;base64,\(v)"
}

struct MerchantMark: View {
    let name: String
    var merchantId: String?
    var size: CGFloat = 40
    /** Plaid-supplied logo (https URL or base64). */
    var logoUrl: String?

    init(name: String, merchantId: String? = nil, size: CGFloat = 40, logoUrl: String? = nil) {
        self.name = name
        self.merchantId = merchantId
        self.size = size
        self.logoUrl = logoUrl
    }

    // Track WHICH uri failed / loaded rather than a boolean, so a later prop change is not
    // poisoned by an earlier miss.
    @State private var failedUri: String?

    var body: some View {
        // Handoff: radius ≈ 32% of size.
        let r = jsRound(Double(size) * 0.32)
        let shape = RoundedRectangle(cornerRadius: r, style: .circular)

        let fallbackKey = normalise(name)
        let fallbackBg = FALLBACK_BRAND_COLOR[fallbackKey] ?? FALLBACK_BRAND_COLOR[firstWord(fallbackKey)] ?? "#6E6580"
        let trimmed = (name.isEmpty ? "?" : name).trimmingCharacters(in: .whitespacesAndNewlines)
        let initial = trimmed.isEmpty ? "" : String(trimmed.prefix(1)).uppercased()
        let initialText = Text(initial)
            .font(.custom(FontFamily.bold, size: max(8, size * 0.46)))
            .foregroundStyle(Color(css: "#FFFFFF"))

        // ---- 1. Bundled brand mark ----
        if let key = resolveLogoKey(name, merchantId), let bundled = BRAND_LOGOS[key] {
            let pad = jsRound(Double(size) * bundled.inset)
            let inner = max(1, size - CGFloat(pad) * 2)
            ZStack {
                SVGPathShape(d: bundled.d, viewBox: CGRect(x: 0, y: 0, width: 24, height: 24))
                    .fill(Color(css: bundled.fg))
                    .frame(width: inner, height: inner)
            }
            .frame(width: size, height: size)
            .background(Color(css: bundled.bg))
            .clipShape(shape)
        } else {
            // ---- 2. Plaid logo, then 3. remote CDN ----
            let plaid = normaliseLogoUrl(logoUrl)
            let domain = trustedWebsiteDomain(websiteForMerchant(merchantId), name) ?? resolveDomain(name, merchantId)
            let remote = plaid ?? domain.map(cdnUrl)

            if let remote, failedUri != remote {
                RemoteImage(uri: remote) { phase in
                    switch phase {
                    case let .success(img, px) where plaid != nil || !(px.width > 0 && px.width <= 16):
                        img.resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: size, height: size)
                            .clipShape(shape)
                            .frame(width: size, height: size)
                            .background(Color(css: "#FFFFFF"))
                    case .success:
                        // The favicon service answers an unknown domain with a 16px grey globe.
                        initialText.frame(width: size, height: size).background(Color(css: fallbackBg))
                            .onAppear { failedUri = remote }
                    case .failure:
                        initialText.frame(width: size, height: size).background(Color(css: fallbackBg))
                            .onAppear { failedUri = remote }
                    case .loading:
                        // The branded initial, never an empty white square.
                        initialText.frame(width: size, height: size).background(Color(css: fallbackBg))
                    }
                }
                .clipShape(shape)
            } else {
                // ---- 4. Coloured initial — true last resort ----
                initialText
                    .frame(width: size, height: size)
                    .background(Color(css: fallbackBg))
                    .clipShape(shape)
            }
        }
    }
}
