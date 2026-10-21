// Port of apps/mobile/components/redesign/VirtualCard.tsx
//
// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The free-drag spin physics live in SpinCard.swift (shared with Card Studio's
// finished-design review so there is exactly one implementation of it). This
// file owns only what is specific to the Pay in 4 card: which faces it shows.
// No contactless mark anywhere (CLAUDE.md).
//
// There is NO tap-to-reveal. GET /cards/highnote returns only last4 + expiry,
// never the full number (PAN), so an issued card cannot be revealed from what
// this app holds; a real reveal needs Highnote's PCI-scoped secure display.
// The preview card's "revealed" number (and its 09/29 expiry) was invented,
// which is worse than showing nothing. Keep it masked.
//
// Both faces are Card Studio's own, CardFrontFace (chip, logo, artwork) and
// CardBackFace, so a saved design shows here exactly as the designer drew it
// (owner, Oct 18 2026). Nothing is written on the front: the number, name and
// expiry are on the back (owner, Oct 21 2026: the front's CARDHOLDER / STATUS
// PREVIEW rows were "slop, the content is on the back").
// =============================================================================

import SwiftUI

/// The design saved in Card Studio, as the Pay in 4 card draws it.
struct SavedCardDesign: Equatable {
    let finish: CardFinish
    let strokes: [Stroke]
    let updatedAt: String
}

struct VirtualCard: View {
    var finish: CardFinish = .amethyst
    /**
     * Fired when a turn starts/ends. The parent screen uses this to switch its
     * ScrollView off, so a vertical drag on the card rotates it instead of
     * scrolling the page.
     */
    var onDragChange: ((Bool) -> Void)?
    /** Issued card (Highnote TEST). nil = the preview card. */
    var issued: (last4: String, expiry: String)?
    /** The design saved in Card Studio. nil = the plain `finish` card. */
    var design: SavedCardDesign?

    init(
        finish: CardFinish = .amethyst,
        onDragChange: ((Bool) -> Void)? = nil,
        issued: (last4: String, expiry: String)? = nil,
        design: SavedCardDesign? = nil
    ) {
        self.finish = finish
        self.onDragChange = onDragChange
        self.issued = issued
        self.design = design
    }

    var body: some View {
        let f = design?.finish ?? finish
        SpinCard(onDragChange: onDragChange) {
            CardFrontFace(finish: f, strokes: design?.strokes ?? [])
        } back: {
            CardBackFace(finish: f, last4: issued?.last4, expiry: issued?.expiry, note: "SINGLE-USE VIRTUAL CARD")
        }
    }
}
