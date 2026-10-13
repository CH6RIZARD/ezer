// Port of apps/mobile/components/redesign/BankCardFace.tsx
//
// BankCardFace — the wallet's linked-bank card, for every art tier
//
// One component draws all five sources from CardArtResolver so the wallet carousel and the picker
// preview cannot drift apart (the same reason CardCanvas owns the physical card's layout).
//
//   gradient tiers   bank name, logo, chip, masked number, holder.
//   user_photo       the photo full-bleed; the printed-number band is covered and our own
//                    "•••• 1234" drawn over it.
//   network_token    the network's art, untouched. Visa/Mastercard display rules allow only
//                    rounded corners plus last-4 (and/or the cardholder name) at the bottom-left,
//                    "Visa 4865" for Visa; nothing else may sit on the art, so the subs pill is
//                    omitted on this tier. Falls back to the gradient card if the image fails to
//                    load. (CLAUDE.md: these display rules are load-bearing — add no overlay.)
//
// RN wrapped this in React.memo (three gradients + an SVG pattern layer per card); SwiftUI only
// re-renders it when its inputs change, and wallet passes a resolved `art` value.

import SwiftUI

private let SHEEN = ["rgba(255,255,255,0.16)", "rgba(255,255,255,0)", "rgba(255,255,255,0.05)"]

/** Faint decorative texture, drawn in the text colour at low opacity. */
private struct PatternLayer: View {
    let pattern: DesignPattern
    let color: String
    let w: CGFloat
    let h: CGFloat

    var body: some View {
        if pattern == .solid {
            EmptyView()
        } else {
            // Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}: one unit = one point.
            Canvas { ctx, _ in
                let base = Color(css: color)
                switch pattern {
                case .wave:
                    var p1 = Path()
                    p1.move(to: CGPoint(x: 0, y: h * 0.7))
                    p1.addCurve(
                        to: CGPoint(x: w, y: h * 0.58),
                        control1: CGPoint(x: w * 0.25, y: h * 0.5),
                        control2: CGPoint(x: w * 0.5, y: h * 0.95)
                    )
                    p1.addLine(to: CGPoint(x: w, y: h))
                    p1.addLine(to: CGPoint(x: 0, y: h))
                    p1.closeSubpath()
                    ctx.fill(p1, with: .color(base.opacity(0.08)))

                    var p2 = Path()
                    p2.move(to: CGPoint(x: 0, y: h * 0.84))
                    p2.addCurve(
                        to: CGPoint(x: w, y: h * 0.76),
                        control1: CGPoint(x: w * 0.3, y: h * 0.68),
                        control2: CGPoint(x: w * 0.6, y: h * 1.02)
                    )
                    p2.addLine(to: CGPoint(x: w, y: h))
                    p2.addLine(to: CGPoint(x: 0, y: h))
                    p2.closeSubpath()
                    ctx.fill(p2, with: .color(base.opacity(0.07)))

                case .diagonal:
                    let n = Int(ceil((w + h) / 34))
                    for i in 0..<max(0, n) {
                        var l = Path()
                        l.move(to: CGPoint(x: CGFloat(i) * 34 - h, y: h))
                        l.addLine(to: CGPoint(x: CGFloat(i) * 34, y: 0))
                        ctx.stroke(l, with: .color(base.opacity(0.05)), lineWidth: 10)
                    }

                case .dots:
                    let cols = Int(ceil(w / 16))
                    let rows = Int(ceil(h / 16))
                    let count = rows * cols
                    if cols > 0 {
                        for i in 0..<max(0, count) {
                            let cx = CGFloat(i % cols) * 16 + 8
                            let cy = CGFloat(i / cols) * 16 + 8
                            let r: CGFloat = 1.3
                            ctx.fill(
                                Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)),
                                with: .color(base.opacity(0.16))
                            )
                        }
                    }

                case .rings:
                    for r: CGFloat in [60, 95, 130] {
                        let cx = w * 0.88, cy = h * 0.15
                        ctx.stroke(
                            Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)),
                            with: .color(base.opacity(0.1)),
                            lineWidth: 1.5
                        )
                    }

                case .solid:
                    break
                }
            }
            .frame(width: w, height: h)
            .allowsHitTesting(false)
        }
    }
}

struct BankCardFace: View {
    let art: ResolvedCardArt
    let bankName: String
    /** The account's own nickname ("Spend"), shown after the holder's name. */
    var accountLabel: String?
    /** Card network, e.g. "VISA". "CARD" when unknown. */
    let network: String
    let last4: String
    let holderName: String
    let width: CGFloat
    let height: CGFloat
    var borderRadius: CGFloat = Radius.virtualCard

    init(
        art: ResolvedCardArt,
        bankName: String,
        accountLabel: String? = nil,
        network: String,
        last4: String,
        holderName: String,
        width: CGFloat,
        height: CGFloat,
        borderRadius: CGFloat = Radius.virtualCard
    ) {
        self.art = art
        self.bankName = bankName
        self.accountLabel = accountLabel
        self.network = network
        self.last4 = last4
        self.holderName = holderName
        self.width = width
        self.height = height
        self.borderRadius = borderRadius
    }

    // Plaid-linked accounts carry no card network (brand is "Bank"/"Unknown"), so only show a
    // network name when one is genuinely known.
    private var hasNetwork: Bool {
        !network.isEmpty && !["CARD", "BANK", "UNKNOWN"].contains(network.uppercased())
    }

    private var accountLabelSet: String? {
        guard let accountLabel, !accountLabel.isEmpty else { return nil }
        return accountLabel
    }

    private var a11y: String {
        "\(bankName)\(accountLabelSet.map { " \($0)" } ?? "") card ending in \(last4)"
    }

    var body: some View {
        Group {
            // If the artwork fails to load (expired URL, no network), fall back to the gradient
            // card rather than showing an empty rectangle. RN kept an `imageFailed` flag reset on
            // a new `art.imageUri`; RemoteImage tracks the failure per URI, so a new image (e.g. a
            // retaken photo) gets a fresh attempt the same way.
            if let uri = art.imageUri, !uri.isEmpty {
                RemoteImage(uri: uri) { phase in
                    switch phase {
                    case .failure:
                        gradientFace
                    case .loading:
                        imageFace(nil)
                    case let .success(img, _):
                        imageFace(img)
                    }
                }
            } else {
                gradientFace
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11y)
    }

    // ---- full-bleed artwork tiers ---------------------------------------------
    @ViewBuilder
    private func imageFace(_ img: Image?) -> some View {
        let isPhoto = art.tier == .user_photo
        // Visa's rules want "Visa 1234"; other networks just the digits.
        let networkLabel = hasNetwork ? "\(network.prefix(1))\(network.dropFirst().lowercased()) " : ""

        ZStack(alignment: .topLeading) {
            // <Image resizeMode="cover" style={absoluteFill}> — nothing drawn while it loads.
            if let img {
                img
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: width, height: height)
                    .clipped()
            }

            if art.maskNumberBand {
                // Covers wherever the physical card prints its number. Drawn over the photo, and
                // our own masked digits sit on top of it.
                Text("•••• •••• •••• \(last4)")
                    .font(.custom(FontFamily.semibold, size: 15.5))
                    .tracking(1.8)
                    .foregroundStyle(Color(css: "#FFFFFF"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .frame(width: width, height: height * 0.26)
                    .background(Color(css: "rgba(12,12,16,0.96)"))
                    .offset(y: height * 0.4)
                    .allowsHitTesting(false)
            }

            if !isPhoto {
                Text("\(networkLabel)\(last4)")
                    .font(.custom(FontFamily.semibold, size: 12))
                    .foregroundStyle(Color(css: "#FFFFFF"))
                    .shadow(color: Color(css: "rgba(0,0,0,0.55)"), radius: 3, x: 0, y: 1)
                    .padding(.leading, 16)
                    .padding(.bottom, 12)
                    .frame(width: width, height: height, alignment: .bottomLeading)
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .clipShape(rnRect(borderRadius))
    }

    // ---- gradient tiers (catalog / user_design / template) --------------------
    private var gradientFace: some View {
        let fg = Color(css: art.fg)
        let fgDim = Color(css: art.fgDim)

        // padding 20, justifyContent space-between over top / chipRow / pan / bottom.
        return VStack(alignment: .leading, spacing: 0) {
            // top: row, space-between, center. Real cards lead with the bank's mark at top-left,
            // so the logo sits there beside the name; the network label (when known) goes right.
            HStack(alignment: .center, spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    if let logo = art.logoUri, !logo.isEmpty {
                        RemoteImage(uri: logo) { phase in
                            switch phase {
                            case let .success(img, _):
                                img
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(width: 24, height: 24)
                                    .clipShape(rnRect(5))
                            default:
                                Color.clear.frame(width: 24, height: 24)
                            }
                        }
                        .frame(width: 24, height: 24)
                    }
                    Text(bankName)
                        .font(.custom(FontFamily.bold, size: 14))
                        .tracking(0.4)
                        .foregroundStyle(fg)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if hasNetwork {
                    Text(network)
                        .font(.custom(FontFamily.semibold, size: 11))
                        .foregroundStyle(fgDim)
                        .fixedSize()
                }
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)

            // chipRow: row, center, gap 10.
            HStack(alignment: .center, spacing: 10) {
                LinearGradient.rn(
                    Gradients.metalEdge,
                    locations: Gradients.metalEdgeLocations,
                    start: UnitPoint(x: 0, y: 0),
                    end: UnitPoint(x: 1, y: 1)
                )
                .frame(width: 36, height: 26)
                .clipShape(rnRect(5))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            Text("•••• •••• •••• \(last4)")
                .font(.custom(FontFamily.semibold, size: 15.5))
                .tracking(1.8)
                .foregroundStyle(fg)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            // bottom: row, space-between, flex-end.
            HStack(alignment: .bottom, spacing: 0) {
                Text("\(holderName.uppercased())\(accountLabelSet.map { "  ·  \($0.uppercased())" } ?? "")")
                    .font(.custom(FontFamily.regular, size: 11))
                    .foregroundStyle(fgDim)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(20)
        .frame(width: width, height: height)
        .background {
            ZStack {
                LinearGradient.rn(
                    art.gradient,
                    // The wallet's gold skin has a middle stop at 65%, not the midpoint.
                    locations: art.gradient.count == 3 ? Gradients.bankGoldLocations : nil,
                    start: UnitPoint(x: 0, y: 0),
                    end: UnitPoint(x: 1, y: 1)
                )
                PatternLayer(pattern: art.pattern, color: art.fg, w: width, h: height)
                // Diagonal foil sheen — decorative, intercepts no touches.
                LinearGradient.rn(
                    SHEEN,
                    locations: [0, 0.5, 1],
                    start: UnitPoint(x: 0, y: 0),
                    end: UnitPoint(x: 1, y: 0.9)
                )
                .allowsHitTesting(false)
            }
        }
        .clipShape(rnRect(borderRadius))
    }
}
