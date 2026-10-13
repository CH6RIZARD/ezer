// Port of the CSS colour strings React Native accepts in apps/mobile (port map §1.3).
//
// Tokens stay STRINGS (Theme/Tokens.swift), exactly as the TS source writes them, and are parsed
// here. Accepted, because the app's code uses exactly these: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
// (alpha LAST, like RN), rgb(r,g,b), rgba(r,g,b,a) with `a` written like `.5`, `transparent`,
// and the named colours `white` / `black`. sRGB.
//
// Several call sites build colours by concatenation (`colors.red + '1F'` in Primitives' Chip).
// On an rgba() token that yields garbage, and RN then draws NOTHING: anything unparsable here
// returns .clear for the same reason.

import SwiftUI
import UIKit

struct RGBA: Hashable, Sendable {
    var r: Double
    var g: Double
    var b: Double
    var a: Double
}

enum CSSColor {
    /// nil when RN would not understand the string either.
    static func parse(_ raw: String) -> RGBA? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if s.isEmpty { return nil }
        switch s {
        case "transparent": return RGBA(r: 0, g: 0, b: 0, a: 0)
        case "white": return RGBA(r: 1, g: 1, b: 1, a: 1)
        case "black": return RGBA(r: 0, g: 0, b: 0, a: 1)
        default: break
        }
        if s.hasPrefix("#") { return parseHex(String(s.dropFirst())) }
        if s.hasPrefix("rgba(") || s.hasPrefix("rgb(") {
            guard let open = s.firstIndex(of: "("), s.hasSuffix(")") else { return nil }
            let inner = s[s.index(after: open)..<s.index(before: s.endIndex)]
            let parts = inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count == 3 || parts.count == 4 else { return nil }
            guard let r = Double(parts[0]), let g = Double(parts[1]), let b = Double(parts[2]) else { return nil }
            var a = 1.0
            if parts.count == 4 {
                guard let v = Double(parts[3]) else { return nil }
                a = v
            }
            return RGBA(r: clamp(r / 255), g: clamp(g / 255), b: clamp(b / 255), a: clamp(a))
        }
        return nil
    }

    private static func clamp(_ v: Double) -> Double { min(1, max(0, v)) }

    private static func parseHex(_ h: String) -> RGBA? {
        guard h.allSatisfy({ $0.isHexDigit }) else { return nil }
        let chars = Array(h)
        func nib(_ c: Character) -> Double { Double(c.hexDigitValue ?? 0) }
        func byte(_ i: Int) -> Double { Double((chars[i].hexDigitValue ?? 0) * 16 + (chars[i + 1].hexDigitValue ?? 0)) / 255 }
        switch chars.count {
        case 3: return RGBA(r: nib(chars[0]) * 17 / 255, g: nib(chars[1]) * 17 / 255, b: nib(chars[2]) * 17 / 255, a: 1)
        case 4: return RGBA(r: nib(chars[0]) * 17 / 255, g: nib(chars[1]) * 17 / 255, b: nib(chars[2]) * 17 / 255, a: nib(chars[3]) * 17 / 255)
        case 6: return RGBA(r: byte(0), g: byte(2), b: byte(4), a: 1)
        case 8: return RGBA(r: byte(0), g: byte(2), b: byte(4), a: byte(6))
        default: return nil
        }
    }

    static func color(_ s: String) -> Color {
        guard let c = parse(s) else { return .clear }
        return Color(.sRGB, red: c.r, green: c.g, blue: c.b, opacity: c.a)
    }

    static func uiColor(_ s: String) -> UIColor {
        guard let c = parse(s) else { return .clear }
        return UIColor(red: c.r, green: c.g, blue: c.b, alpha: c.a)
    }
}

extension Color {
    /// A CSS colour string exactly as the RN source writes it. Unparsable -> `.clear` (RN draws nothing).
    init(css: String) {
        self = CSSColor.color(css)
    }
}

extension UIColor {
    convenience init(css: String) {
        let c = CSSColor.parse(css) ?? RGBA(r: 0, g: 0, b: 0, a: 0)
        self.init(red: c.r, green: c.g, blue: c.b, alpha: c.a)
    }
}
