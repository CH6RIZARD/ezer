// Port of apps/mobile/utils/cardArt/catalog.ts
//
// Card art catalog — EZER's OWN renderings, keyed by issuer. Style tokens (colours + a pattern),
// NOT copies of any bank's card artwork (copyrighted, trademarked). Never add scraped issuer art
// here (CLAUDE.md "Wallet card art"). Add an issuer by appending one entry to ISSUERS.

import Foundation

let ISSUERS: [Issuer] = [
    Issuer(id: "pnc", name: "PNC", aliases: ["pnc"], primary: "#F58025", secondary: "#1B365D"),
    Issuer(id: "chase", name: "Chase", aliases: ["chase", "jpmorgan chase", "jpmorgan"], primary: "#117ACA", secondary: "#0B2E59"),
    Issuer(id: "bofa", name: "Bank of America", aliases: ["bank of america", "bofa", "merrill"], primary: "#E31837", secondary: "#012169"),
    Issuer(id: "wells-fargo", name: "Wells Fargo", aliases: ["wells fargo"], primary: "#D71E28", secondary: "#7A1015"),
    Issuer(id: "citi", name: "Citi", aliases: ["citibank", "citi"], primary: "#056DAE", secondary: "#1B2B50"),
    Issuer(id: "capital-one", name: "Capital One", aliases: ["capital one"], primary: "#D03027", secondary: "#004977"),
    Issuer(id: "us-bank", name: "U.S. Bank", aliases: ["us bank", "u s bank"], primary: "#0C2074", secondary: "#D9272E"),
    Issuer(id: "td", name: "TD Bank", aliases: ["td bank", "td"], primary: "#2E9B3D", secondary: "#1C5E2A"),
    Issuer(id: "truist", name: "Truist", aliases: ["truist", "suntrust", "bb t"], primary: "#2E1A47", secondary: "#6C3F9E"),
    Issuer(id: "regions", name: "Regions", aliases: ["regions"], primary: "#3C8D2F", secondary: "#1F4D18"),
    Issuer(id: "fifth-third", name: "Fifth Third", aliases: ["fifth third"], primary: "#1C3F94", secondary: "#0D2258"),
    Issuer(id: "keybank", name: "KeyBank", aliases: ["keybank", "key bank"], primary: "#D2202F", secondary: "#6E1019"),
    // "First Citizens" is a different bank from "Citizens"; its longer alias is tried first.
    Issuer(id: "first-citizens", name: "First Citizens", aliases: ["first citizens"], primary: "#0066A1", secondary: "#00375A"),
    Issuer(id: "citizens", name: "Citizens", aliases: ["citizens"], primary: "#00A651", secondary: "#005C2E"),
    Issuer(id: "mt", name: "M&T Bank", aliases: ["m t bank", "m and t bank", "mt bank"], primary: "#00543C", secondary: "#002D20"),
    Issuer(id: "huntington", name: "Huntington", aliases: ["huntington"], primary: "#00794B", secondary: "#00402A"),
    Issuer(id: "bmo", name: "BMO", aliases: ["bmo", "bmo harris"], primary: "#0079C1", secondary: "#004A78"),
    Issuer(id: "santander", name: "Santander", aliases: ["santander"], primary: "#EC0000", secondary: "#7A0000"),
    Issuer(id: "hsbc", name: "HSBC", aliases: ["hsbc"], primary: "#DB0011", secondary: "#6E0009"),
    Issuer(id: "ally", name: "Ally", aliases: ["ally"], primary: "#650298", secondary: "#3A0160"),
    Issuer(id: "discover", name: "Discover", aliases: ["discover"], primary: "#FF6000", secondary: "#1F1F1F"),
    Issuer(id: "amex", name: "American Express", aliases: ["american express", "amex"], primary: "#006FCF", secondary: "#00175A"),
    Issuer(id: "chime", name: "Chime", aliases: ["chime"], primary: "#1EC677", secondary: "#0B6B45"),
    Issuer(id: "sofi", name: "SoFi", aliases: ["sofi"], primary: "#00A8E1", secondary: "#004E6B"),
    Issuer(id: "navy-federal", name: "Navy Federal", aliases: ["navy federal"], primary: "#00205B", secondary: "#B8860B"),
    Issuer(id: "usaa", name: "USAA", aliases: ["usaa"], primary: "#00355F", secondary: "#001C33"),
    Issuer(id: "schwab", name: "Charles Schwab", aliases: ["charles schwab", "schwab"], primary: "#00A0DF", secondary: "#005A80"),
    Issuer(id: "fidelity", name: "Fidelity", aliases: ["fidelity"], primary: "#4E8542", secondary: "#2A4D24"),
    Issuer(id: "cash-app", name: "Cash App", aliases: ["cash app"], primary: "#00D64F", secondary: "#007A2D"),
    Issuer(id: "paypal", name: "PayPal", aliases: ["paypal"], primary: "#003087", secondary: "#009CDE"),
    Issuer(id: "venmo", name: "Venmo", aliases: ["venmo"], primary: "#3D95CE", secondary: "#1F5A85"),
    Issuer(id: "apple-card", name: "Apple Card", aliases: ["apple card", "goldman sachs"], primary: "#F2F2F2", secondary: "#1D1D1F"),
]

/** Neutral looks offered for any bank, including ones we have no entry for. */
let GENERIC_ISSUER_ID = "generic"

let GENERIC_DESIGNS: [CardArtDesign] = [
    CardArtDesign(id: "generic-graphite", issuerId: GENERIC_ISSUER_ID, variant: "generic", label: "Graphite", gradient: ["#3A3D45", "#15171C"], pattern: .diagonal, isDefault: true),
    CardArtDesign(id: "generic-midnight", issuerId: GENERIC_ISSUER_ID, variant: "generic", label: "Midnight", gradient: ["#1E2A55", "#0B1230"], pattern: .wave),
    CardArtDesign(id: "generic-sand", issuerId: GENERIC_ISSUER_ID, variant: "generic", label: "Sand", gradient: ["#EFE7D8", "#CDBFA5"], pattern: .dots),
]

/** The generated + curated designs for one issuer. */
private func designsFor(_ issuer: Issuer) -> [CardArtDesign] {
    let id = issuer.id, primary = issuer.primary, secondary = issuer.secondary
    return [
        CardArtDesign(id: "\(id)-classic", issuerId: id, variant: "classic", label: "Classic", gradient: [primary, darken(primary, 0.45)], pattern: .wave, isDefault: true),
        CardArtDesign(id: "\(id)-night", issuerId: id, variant: "night", label: "Night", gradient: [secondary, darken(secondary, 0.55)], pattern: .diagonal),
        CardArtDesign(id: "\(id)-light", issuerId: id, variant: "light", label: "Light", gradient: [lighten(primary, 0.88), lighten(primary, 0.62)], pattern: .dots),
    ]
}

private let DESIGNS: [CardArtDesign] = ISSUERS.flatMap(designsFor) + GENERIC_DESIGNS

private let BY_ID: [String: CardArtDesign] = Dictionary(DESIGNS.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

func getDesign(_ id: String?) -> CardArtDesign? {
    guard let id else { return nil }
    return BY_ID[id]
}

func getIssuer(_ id: String?) -> Issuer? {
    guard let id else { return nil }
    return ISSUERS.first { $0.id == id }
}

/** All looks to offer for an issuer — always non-empty (falls back to generic). */
func designsForIssuer(_ issuerId: String?) -> [CardArtDesign] {
    let own = DESIGNS.filter { $0.issuerId == issuerId }
    return own.isEmpty ? GENERIC_DESIGNS : own
}

/** The look used automatically for an issuer. */
func defaultDesignFor(_ issuerId: String?) -> CardArtDesign {
    let list = designsForIssuer(issuerId)
    return list.first { $0.isDefault } ?? list[0]
}
