// Port of apps/mobile/components/redesign/BankTile.tsx
//
// Bank initial/logo tile, shared by settings/linked-banks.tsx, screens/BankDetail.tsx and
// PayIn4AccountPicker.tsx. A real logo (networkArt, the same field Wallet's card art renders) on a
// white tile; falls back to the tinted initial — tintFor()'s real per-bank brand colour, not a flat
// purple — when there's no logo, or the logo URL fails to load (RN Image onError).
//
// styles.wrap carries borderWidth: StyleSheet.hairlineWidth on BOTH branches. The logo branch sets
// borderColor: colors.line; the initial branch sets none, so RN draws its default black hairline.
// Kept as drawn.

import SwiftUI

struct SettingsBankTile: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.displayScale) private var displayScale
    let institutionName: String?
    var networkArt: String? = nil
    var size: CGFloat = 38

    init(institutionName: String?, networkArt: String? = nil, size: CGFloat = 38) {
        self.institutionName = institutionName
        self.networkArt = networkArt
        self.size = size
    }

    var body: some View {
        let radius = CGFloat(jsRound(Double(size) * 0.32))
        if let art = networkArt, !art.isEmpty {
            RemoteImage(uri: art) { phase in
                switch phase {
                case .failure:
                    initialTile(radius)
                case .loading:
                    logoTile(nil, radius)
                case let .success(img, _):
                    logoTile(img, radius)
                }
            }
        } else {
            initialTile(radius)
        }
    }

    private var hairline: CGFloat { 1 / max(displayScale, 1) }

    private func logoTile(_ img: Image?, _ radius: CGFloat) -> some View {
        ZStack {
            if let img {
                img.resizable()
                    .aspectRatio(contentMode: .fit)   // resizeMode="contain"
                    .frame(width: size * 0.72, height: size * 0.72)
            }
        }
        .frame(width: size, height: size)
        .rnBox(bg: Color(css: "#FFFFFF"), radius: radius, border: theme.colors.line, borderWidth: hairline, clip: true)
    }

    private func initialTile(_ radius: CGFloat) -> some View {
        let tint = SettingsLinkedBanks.tintFor(institutionName).map { Color(css: $0) } ?? theme.colors.accInk
        return Text(SettingsLinkedBanks.initialFor(institutionName))
            .font(.ezer(FontFamily.bold, CGFloat(jsRound(Double(size) * 0.34))))
            .foregroundStyle(Color(css: "#FFFFFF"))
            .frame(width: size, height: size)
            .rnBox(bg: tint, radius: radius, border: Color(css: "black"), borderWidth: hairline, clip: true)
    }
}
