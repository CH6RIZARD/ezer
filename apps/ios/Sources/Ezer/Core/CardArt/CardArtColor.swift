// Port of apps/mobile/utils/cardArt/color.ts
// Colour helpers shared by the wallet card and the card-art resolver. Pure arithmetic, ported
// exactly (rounding included: JS Math.round).

import Foundation

/** True when `value` is a 3- or 6-digit hex colour, with or without `#`. */
func isHexColor(_ value: String?) -> Bool {
    guard let v = value?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
    let h = v.hasPrefix("#") ? String(v.dropFirst()) : v
    return (h.count == 3 || h.count == 6) && h.allSatisfy { $0.isHexDigit }
}

/** Normalises to `#rrggbb`. Callers must check isHexColor first. */
func normalizeHex(_ hex: String) -> String {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if let i = h.firstIndex(of: "#") { h.remove(at: i) } // JS .replace('#', '') — first only
    let full = h.count == 3 ? h.map { "\($0)\($0)" }.joined() : h
    return "#\(full.lowercased())"
}

func hexToRgb(_ hex: String) -> (Int, Int, Int) {
    let full = Array(normalizeHex(hex).dropFirst())
    func p(_ i: Int) -> Int {
        guard full.count >= i + 2 else { return 0 }
        return Int(String(full[i..<(i + 2)]), radix: 16) ?? 0
    }
    return (p(0), p(2), p(4))
}

private func hex2(_ v: Int) -> String {
    let s = String(v, radix: 16)
    return s.count < 2 ? "0" + s : s
}

func darken(_ hex: String, _ amount: Double) -> String {
    let (r, g, b) = hexToRgb(hex)
    let d = { (v: Int) -> Int in max(0, Int(jsRound(Double(v) * (1 - amount)))) }
    return "#" + [d(r), d(g), d(b)].map(hex2).joined()
}

func lighten(_ hex: String, _ amount: Double) -> String {
    let (r, g, b) = hexToRgb(hex)
    let l = { (v: Int) -> Int in min(255, Int(jsRound(Double(v) + Double(255 - v) * amount))) }
    return "#" + [l(r), l(g), l(b)].map(hex2).joined()
}

/** Perceived luminance — decides whether card text should be light or dark. */
func isLightColor(_ hex: String) -> Bool {
    let (r, g, b) = hexToRgb(hex)
    return 0.299 * Double(r) + 0.587 * Double(g) + 0.114 * Double(b) > 170
}

/** Text colours that stay legible on a gradient starting at `hex`. */
func textColorsFor(_ hex: String) -> (fg: String, fgDim: String) {
    let light = isLightColor(hex)
    return (
        fg: light ? "#241A38" : "#FFFFFF",
        fgDim: light ? "rgba(36,26,56,.6)" : "rgba(255,255,255,.65)"
    )
}

/** A bank-brand-tinted skin: `hex` fading to a darker shade of itself. */
func brandSkin(_ hex: String) -> CardArtFallback {
    let t = textColorsFor(hex)
    return CardArtFallback(gradient: [hex, darken(hex, 0.45)], fg: t.fg, fgDim: t.fgDim)
}
