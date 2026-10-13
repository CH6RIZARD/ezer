// Port of @expo/vector-icons `Ionicons` (v15.0.3) — the app's only icon set (port map §4).
//
// Draws the same Ionicons.ttf glyphs RN does; SF Symbols would change every icon.
// vector-icons renders a Text with allowFontScaling: false, so icons are a FIXED size (they do
// not follow Dynamic Type, unlike the app's other text). Default size 12, like vector-icons.
// An unknown name renders "?", like create-icon-set.js.
//
//   Ionicon("chevron-back", size: 18, color: colors.ink)

import SwiftUI

struct Ionicon: View {
    let name: String
    var size: CGFloat = 12
    var color: Color = .black

    init(_ name: String, size: CGFloat = 12, color: Color = .black) {
        self.name = name
        self.size = size
        self.color = color
    }

    var body: some View {
        Text(Ionicon.glyph(name))
            .font(.custom(EzerFonts.ionicons, fixedSize: size))
            .foregroundStyle(color)
            .accessibilityHidden(true)
    }

    /// The glyph string for an Ionicons name, or "?" when the name is unknown.
    static func glyph(_ name: String) -> String {
        if let cp = IoniconGlyph.codepoints[name] ?? fullGlyphMap[name], let u = UnicodeScalar(cp) {
            return String(Character(u))
        }
        return "?"
    }

    /// Every Ionicons glyph (Resources/Fonts/Ionicons.json, the map vector-icons ships), loaded once.
    private static let fullGlyphMap: [String: UInt32] = {
        guard let url = Bundle.module.url(forResource: "Ionicons", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let map = try? JSONDecoder().decode([String: UInt32].self, from: data)
        else { return [:] }
        return map
    }()
}
