// Port of apps/mobile/utils/cardArt/resolver.ts
//
// Card art resolver — pure, no UI, no I/O
//
// First hit wins:
//
//   1. user_photo     the user's own photo of the card. Explicit user action, and the only
//                     source that can match the exact plastic (affinity designs included).
//   2. user_design    a look the user picked from the catalog.
//   3. network_token  issuer-approved art from Visa/Mastercard. Only exists for cards we hold a
//                     network token for (cards the user entered in full) — never for
//                     aggregator-linked cards. Its display is governed by the networks' rules,
//                     see BankCardFace.
//   4. catalog        our rendering for the matched issuer, in the bank's REAL brand colour when
//                     Plaid supplied one, and in a metal / dark finish when the product name says
//                     so ("Platinum").
//   5. template       bank colour + logo on a generic template. Always resolves.
//
// Explicit user choices outrank automatic sources: someone who photographed their card, or
// picked a look, wants that — even if a network image exists.
//
// Nothing here can reproduce a specific card's artwork (no data source has it). Steps 4-5 aim
// for "reads as the same card at a glance": right colour, right logo, right finish.
//
// Names: TS `CardDesign` is Foundation's `CardArtDesign`, TS `Gradient` is `CardArtGradient`
// (Core/CardArt/CardArtTypes.swift). The TS `Finish` union ('silver' | 'gold' | 'obsidian') is a
// String here because ResolvedCardArt.finish is one.

import Foundation

/** Used only when nothing at all is known about the card. */
private let NEUTRAL_FALLBACK = CardArtFallback(
    gradient: ["#3A3D45", "#15171C"],
    fg: "#FFFFFF",
    fgDim: "rgba(255,255,255,.65)"
)

private struct WalletFinishLook {
    let gradient: CardArtGradient
    let pattern: DesignPattern
}

private let FINISH_GRADIENTS: [String: WalletFinishLook] = [
    "silver": WalletFinishLook(gradient: ["#DDE0E6", "#9AA0AB"], pattern: .diagonal),
    "gold": WalletFinishLook(gradient: ["#E9D9B8", "#C4A15A", "#9A7838"], pattern: .wave),
    "obsidian": WalletFinishLook(gradient: ["#2E2F35", "#0A0A0C"], pattern: .diagonal),
]

// Whole-word product names that imply a finish on real cards. Order matters: the first list that
// matches wins, so a "Black Platinum" reads as dark.
private let FINISH_KEYWORDS: [(String, [String])] = [
    ("obsidian", ["black", "reserve", "infinite", "world elite", "obsidian", "onyx"]),
    ("gold", ["gold"]),
    ("silver", ["platinum", "titanium", "premier", "silver"]),
]

/** Picks a finish from an account's product name, or nil. */
func finishFor(_ productName: String?) -> String? {
    guard let productName, !productName.isEmpty else { return nil }
    // ` ${productName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
    let squashed = jsReplace(productName.lowercased(), "[^a-z0-9]+", " ")
    let padded = " \(squashed.trimmingCharacters(in: .whitespacesAndNewlines)) "
    for (finish, words) in FINISH_KEYWORDS {
        if words.contains(where: { padded.contains(" \($0) ") }) { return finish }
    }
    return nil
}

/**
 * Re-tints a generated design with the bank's real brand colour from Plaid. Our catalog hues are
 * approximations; Plaid's `primary_color` is the bank's own, so it wins whenever we have it.
 * "Night" keeps its dark secondary.
 */
func recolorDesign(_ design: CardArtDesign, _ brandHex: String?) -> CardArtDesign {
    guard isHexColor(brandHex), let brandHex else { return design }
    let hex = normalizeHex(brandHex)
    var out = design
    if design.variant == "classic" {
        out.gradient = [hex, darken(hex, 0.45)]
        return out
    }
    if design.variant == "light" {
        out.gradient = [lighten(hex, 0.88), lighten(hex, 0.62)]
        return out
    }
    return design
}

private func fromDesign(_ design: CardArtDesign, _ tier: CardArtTier, _ logoUri: String?) -> ResolvedCardArt {
    let t = textColorsFor(design.gradient[0])
    return ResolvedCardArt(
        tier: tier,
        gradient: design.gradient,
        fg: t.fg,
        fgDim: t.fgDim,
        pattern: design.pattern,
        imageUri: nil,
        logoUri: logoUri,
        issuerId: design.issuerId,
        designId: design.id,
        finish: nil,
        maskNumberBand: false
    )
}

func resolveCardArt(
    _ input: CardArtInput,
    _ prefs: CardArtPrefs = CardArtPrefs(),
    _ fallback: CardArtFallback? = nil
) -> ResolvedCardArt {
    // TS default parameter `fallback = NEUTRAL_FALLBACK` (an optional here, so the private
    // constant stays file-private).
    let fallback = fallback ?? NEUTRAL_FALLBACK
    let issuer = matchIssuer(input.institutionName)
    let logoUri = input.logoUri

    // 1. The user's own photo.
    if let photoUri = prefs.photoUri, !photoUri.isEmpty {
        return ResolvedCardArt(
            tier: .user_photo,
            gradient: fallback.gradient,
            fg: "#FFFFFF",
            fgDim: "rgba(255,255,255,.75)",
            pattern: .solid,
            imageUri: photoUri,
            logoUri: nil,
            issuerId: issuer?.id,
            designId: nil,
            finish: nil,
            maskNumberBand: true
        )
    }

    // 2. A design the user picked. An id that no longer exists (catalog changed) is ignored
    //    rather than treated as an error.
    if let picked = getDesign(prefs.designId) {
        return fromDesign(recolorDesign(picked, input.issuerColorHint), .user_design, logoUri)
    }

    // 3. Network-token art.
    if let art = input.networkTokenArtUri, !art.isEmpty {
        return ResolvedCardArt(
            tier: .network_token,
            gradient: fallback.gradient,
            fg: "#FFFFFF",
            fgDim: "rgba(255,255,255,.75)",
            pattern: .solid,
            imageUri: art,
            logoUri: nil,
            issuerId: issuer?.id,
            designId: nil,
            finish: nil,
            maskNumberBand: false
        )
    }

    // 4a. The product name implies a finish ("Platinum", "Reserve", "Gold"): a metal or dark card
    //     reads as that product far more than the bank's colour does. The bank's logo and name
    //     still identify it.
    if let finish = finishFor(input.displayName), let f = FINISH_GRADIENTS[finish] {
        let t = textColorsFor(f.gradient[0])
        return ResolvedCardArt(
            tier: .catalog,
            gradient: f.gradient,
            fg: t.fg,
            fgDim: t.fgDim,
            pattern: f.pattern,
            imageUri: nil,
            logoUri: logoUri,
            issuerId: issuer?.id,
            designId: nil,
            finish: finish,
            maskNumberBand: false
        )
    }

    // 4b. Our catalog rendering for the matched issuer, in Plaid's real colour.
    if let issuer {
        return fromDesign(recolorDesign(defaultDesignFor(issuer.id), input.issuerColorHint), .catalog, logoUri)
    }

    // 5. Template: the bank's own colour if Plaid gave us one, else the caller's fallback skin
    //    (the wallet passes its existing cycling skins).
    let skin: CardArtFallback
    if isHexColor(input.issuerColorHint), let hint = input.issuerColorHint {
        skin = brandSkin(normalizeHex(hint))
    } else {
        skin = fallback
    }
    return ResolvedCardArt(
        tier: .template,
        gradient: skin.gradient,
        fg: skin.fg,
        fgDim: skin.fgDim,
        pattern: .solid,
        imageUri: nil,
        logoUri: logoUri,
        issuerId: nil,
        designId: nil,
        finish: nil,
        maskNumberBand: false
    )
}
