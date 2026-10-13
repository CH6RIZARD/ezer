// Port of apps/mobile/components/redesign/CardChip.tsx
//
// =============================================================================
// EZER Redesign — EMV chip with real depth
//
// Three layers sell the depth, the same way light sells a real chip:
//   1. a recessed WELL — a darker ring around the chip, shaded from the top,
//      lit at its bottom lip: the chip is seated IN the card, not stuck on it;
//   2. metal body — diagonal gold gradient plus a bevel overlay: inset top
//      highlight where light lands, inset bottom shade where it falls away;
//   3. a faint diagonal glint sweep so the metal reads curved, not printed.
// PLAIN metal, no engraved EMV contact lines: the owner chose the plain chip
// (Oct 2026). Do not add them back.
//
// Shared by VirtualCard.swift and CardFaces.swift (physical-card designer and
// the finished-design spin preview); change the look here and every card
// front follows. Pass `width`; the radii and the well scale with it.
// =============================================================================

import SwiftUI

/** Design-space geometry; everything scales off these with `width`. */
private let W: CGFloat = 44
private let H: CGFloat = 33
private let R: CGFloat = 7
/** Ring of recessed card visible around the seated chip, design units. */
private let WELL_PAD: CGFloat = 3

/** Gold family of gradients.metalEdge, widened to four stops so the body
 *  has a bright shoulder and a deep heel instead of a flat sheen. */
private let CHIP_METAL = ["#F3DDA6", "#E7C77E", "#C49A4E", "#A87D2F"]
private let CHIP_METAL_LOCATIONS: [Double] = [0, 0.35, 0.72, 1]

struct CardChip: View {
    /** Rendered width; height keeps the 44:33 chip ratio. */
    var width: CGFloat = W

    init(width: CGFloat = W) { self.width = width }

    var body: some View {
        let s = width / W
        let h = H * s
        let r = R * s
        let pad = WELL_PAD * s

        ZStack {
            // The milled pocket the chip is seated in — darker than any card finish, shaded from
            // the top where the pocket wall blocks the light, a faint lit lip at the bottom.
            // (No drop shadow anywhere: a seated chip casts none.)
            // boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.55), inset 0 -1px 1px rgba(255,255,255,0.14)'
            rnRect(r + pad)
                .fill(Color(css: "rgba(0,0,0,0.32)"))
                .overlay(PayIn4InsetShadow(radius: r + pad, color: "rgba(255,255,255,0.14)", x: 0, y: -1, blur: 1))
                .overlay(PayIn4InsetShadow(radius: r + pad, color: "rgba(0,0,0,0.55)", x: 0, y: 2, blur: 3))

            ZStack {
                LinearGradient.rn(CHIP_METAL, locations: CHIP_METAL_LOCATIONS, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                    .clipShape(rnRect(r))
                // Glint sweep, bottom-left to top-right across the grain. Narrow and
                // faint — at 44px wide, anything stronger reads as wash, not shine.
                LinearGradient.rn(
                    ["rgba(255,255,255,0)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"],
                    locations: [0.38, 0.5, 0.62],
                    start: UnitPoint(x: 0, y: 1),
                    end: UnitPoint(x: 1, y: 0)
                )
                .clipShape(rnRect(r))
                // The card's overhang shading the chip's top — the strongest "it sits
                // BELOW the surface" cue a flat render can give.
                LinearGradient.rn(["rgba(0,0,0,0.38)", "rgba(0,0,0,0)"], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 0, y: 0.45))
                    .clipShape(rnRect(r))
                // The bevel, LAST so it paints above the metal and glint: light
                // catches the top edge, the bottom edge falls into shade.
                // boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -1.5px 2px rgba(0,0,0,0.3)'
                ZStack {
                    PayIn4InsetShadow(radius: r, color: "rgba(0,0,0,0.3)", x: 0, y: -1.5, blur: 2)
                    PayIn4InsetShadow(radius: r, color: "rgba(255,255,255,0.5)", x: 0, y: 1, blur: 1)
                }
            }
            .frame(width: width, height: h)
            .allowsHitTesting(false)
        }
        .frame(width: width + pad * 2, height: h + pad * 2)
    }
}

/// CSS `box-shadow: inset X Y BLUR color` on a rounded box, which RN 0.81 draws on iOS. The
/// region OUTSIDE the box, shifted by the offset and blurred, painted in `color` and clipped to the
/// box. Multiple CSS shadows paint the FIRST on top, so overlay them last-first.
struct PayIn4InsetShadow: View {
    let radius: CGFloat
    let color: String
    let x: CGFloat
    let y: CGFloat
    let blur: CGFloat

    var body: some View {
        let shape = rnRect(radius)
        let pad = blur * 2 + abs(x) + abs(y) + 1
        Rectangle()
            .fill(Color(css: color))
            .mask {
                ZStack {
                    Rectangle().padding(-pad)
                    shape.offset(x: x, y: y).blendMode(.destinationOut)
                }
                .compositingGroup()
                .blur(radius: blur / 2)
            }
            .clipShape(shape)
            .allowsHitTesting(false)
    }
}
