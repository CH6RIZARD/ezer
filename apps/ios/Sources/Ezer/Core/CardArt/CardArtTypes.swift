// Port of apps/mobile/utils/cardArt/types.ts
//
// A wallet card's *appearance* is resolved from several possible sources, best first. No
// bank-data aggregator returns card art, so "the real card" only ever comes from network-token
// art for a card entered in full, or the user's own photo. See CardArtResolver (Wallet).
//
// Renames forced by Swift's single module namespace: TS `CardDesign` -> `CardArtDesign` (the
// physical card design is `CardDesign`), TS `Gradient` -> `CardArtGradient` (SwiftUI has Gradient).

import Foundation

/** Which source produced the art, most to least specific. */
enum CardArtTier: String, Codable, Sendable {
    /** The user's own photo of their physical card, stored on this device only. */
    case user_photo
    /** A design the user explicitly picked from the catalog. */
    case user_design
    /** Issuer-approved art returned by Visa/Mastercard for a tokenized card. */
    case network_token
    /** Our own rendering for this issuer, matched automatically. */
    case catalog
    /** Bank color + logo on a generic template. Every card gets at least this. */
    case template
}

/** Two or more gradient stops (CSS colour strings; the wallet's gold skin uses three). */
typealias CardArtGradient = [String]

enum DesignPattern: String, Codable, Sendable { case solid, wave, diagonal, dots, rings }

/** One selectable look, drawn by us from style tokens — never a scraped image. */
struct CardArtDesign: Hashable, Sendable {
    var id: String
    var issuerId: String
    /// 'classic' | 'night' | 'light' | 'generic' — which generated look this is.
    var variant: String
    var label: String
    /// Exactly two stops.
    var gradient: [String]
    var pattern: DesignPattern
    /** The design used automatically when nothing more specific is known. */
    var isDefault: Bool = false
}

struct Issuer: Hashable, Sendable {
    var id: String
    /** Display name, used in the picker. */
    var name: String
    /** Alternative spellings, compared as whole-word sequences ("citi" does not match "Citizens Bank"). */
    var aliases: [String]
    /** Approximate brand hues, used to generate the issuer's designs. */
    var primary: String
    var secondary: String
}

/** What we know about a linked card. All optional — resolution degrades. */
struct CardArtInput: Hashable, Sendable {
    var institutionName: String?
    var displayName: String?
    var brand: String?
    /** Plaid's `primary_color` for the institution. */
    var issuerColorHint: String?
    /** Bank logo URL or data URI. */
    var logoUri: String?
    /** Network-issued card art for a tokenized card (never for aggregator-linked cards). */
    var networkTokenArtUri: String?
}

/** Per-card choices the user has made. Stored on-device only. */
struct CardArtPrefs: Hashable, Sendable {
    var photoUri: String?
    var designId: String?
}

struct CardArtFallback: Hashable, Sendable {
    var gradient: CardArtGradient
    var fg: String
    var fgDim: String
}

struct ResolvedCardArt: Hashable, Sendable {
    var tier: CardArtTier
    var gradient: CardArtGradient
    var fg: String
    var fgDim: String
    var pattern: DesignPattern
    /** Full-bleed artwork (user photo or network art). When set, gradient and pattern are not drawn. */
    var imageUri: String?
    /** Bank logo to draw top-right on gradient tiers. */
    var logoUri: String?
    var issuerId: String?
    var designId: String?
    /** Set when the account's product name (e.g. "Platinum") chose the finish: 'silver' | 'gold' | 'obsidian'. */
    var finish: String?
    /** True when `imageUri` is a photo of a real card, whose printed number must be covered on screen. */
    var maskNumberBand: Bool
}
