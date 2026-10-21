// Port of apps/mobile/components/redesign/CardCanvas.tsx (CARD_W, CARD_H, Stroke, CardFrontFace,
// CardBackFace — the drawing surface itself is in CardCanvas.swift)
//
// LOCKED layout, per the Card Studio comp: the front carries the chip and the
// EZER logo (wordmark + dove on the R, top right; owner's request, Oct 18 2026)
// and no other wording, no contactless mark (removed on request). Cardholder name,
// masked number, CVV and expiry live on the back. Do not put identifying text
// back on the front; that is the one thing the design explicitly locks against.
//
// Strokes are SVG path strings in card-local coordinates (0..308 x 0..190), so
// the same stored design re-renders at any scale by changing the viewBox only.
// The `d` format is the one POST /cards/designs stores; keep it byte-compatible.

import SwiftUI

let CARD_W: CGFloat = 308
let CARD_H: CGFloat = 190

/** One freehand stroke, in card-local coordinates. Same shape as the stored design's strokes
 *  (`d` e.g. "M12 30 L13 31 L15 34", `color`, `width`), so it IS Core's CardStroke. */
typealias Stroke = CardStroke

/// The 308x190 viewBox the strokes are drawn in.
private let CARD_VIEWBOX = CGRect(x: 0, y: 0, width: CARD_W, height: CARD_H)

/// One stroke as react-native-svg drew it: round cap + join, no fill.
private struct PayIn4StrokePath: View {
    let stroke: Stroke

    var body: some View {
        SVGPathShape(d: stroke.d, viewBox: CARD_VIEWBOX)
            .stroke(Color(css: stroke.color), style: StrokeStyle(lineWidth: CGFloat(stroke.width), lineCap: .round, lineJoin: .round))
    }
}

/// The logo's wordmark width on a 308-wide card, and its corner inset (owner, Oct 21 2026:
/// "the EZER smaller and more in the corner"; was 58 and 18).
private let LOGO_W: CGFloat = 42
private let LOGO_INSET: CGFloat = 12

/// The chip's well box (CardChip at its default size, 50x39) sits where a real EMV chip does:
/// ISO 7816-2 puts the contacts' centre ~17.6% across and ~43% down an ID-1 card (owner, Oct 21
/// 2026: "put the chip where it would really be"; it was in the top-left corner). VirtualCard
/// starts its number row below CHIP_BOTTOM.
let CHIP_LEFT: CGFloat = 29
let CHIP_TOP: CGFloat = 62
let CHIP_BOTTOM: CGFloat = CHIP_TOP + 39

/**
 * The EZER logo for a card front, top right: the same DoveMark the lock screen and tabs draw.
 * Its dove sits outside the word's box (0.36 of the width above, 0.23 past the right edge,
 * DoveFrames.PERCH), so the box is offset to keep the whole bird inside the LOGO_INSET margin.
 */
struct CardLogo: View {
    let finish: CardFinish

    var body: some View {
        DoveMark(width: LOGO_W, ink: Color(css: isDarkFinish(finish) ? "#FFFFFF" : "#241A38"))
            .padding(.top, LOGO_INSET + LOGO_W * 0.36)
            .padding(.trailing, LOGO_INSET + LOGO_W * 0.23)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .allowsHitTesting(false)
    }
}

/**
 * The LOCKED front: chip + logo + the artwork, no other wording.
 * Used anywhere a finished design shows read-only — PhysicalCardReview's free-spin preview, and
 * the Pay in 4 card (VirtualCard.swift) once a design is saved — so it
 * renders exactly this and cannot drift from what the live designer draws. `liveStroke` is the
 * designer's in-progress path only (painted in the same place a committed stroke is: above the
 * artwork, under the chip); omit it everywhere else.
 */
struct CardFrontFace: View {
    let finish: CardFinish
    let strokes: [Stroke]
    var liveStroke: Stroke?

    init(finish: CardFinish, strokes: [Stroke], liveStroke: Stroke? = nil) {
        self.finish = finish
        self.strokes = strokes
        self.liveStroke = liveStroke
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient.rn(
                cardFinishes[finish] ?? [],
                locations: Gradients.cardFrontLocations,
                start: UnitPoint(x: 0, y: 0),
                end: UnitPoint(x: 1, y: 1)
            )
            ZStack {
                ForEach(strokes.indices, id: \.self) { i in
                    PayIn4StrokePath(stroke: strokes[i])
                }
                if let liveStroke {
                    PayIn4StrokePath(stroke: liveStroke)
                }
            }
            .frame(width: CARD_W, height: CARD_H)
            .allowsHitTesting(false)
            // Card furniture sits ABOVE the artwork so the chip stays readable no
            // matter how heavily the user draws. Chip only — no contactless mark,
            // removed on request.
            CardChip()
                .padding(.leading, CHIP_LEFT)
                .padding(.top, CHIP_TOP)
                .allowsHitTesting(false)
            CardLogo(finish: finish)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/** The LOCKED back: security printing — name, masked number, CVV, expiry. */
struct CardBackFace: View {
    let finish: CardFinish

    init(finish: CardFinish) { self.finish = finish }

    var body: some View {
        let backDark = isDarkFinish(finish)
        let backInk = Color(css: backDark ? "rgba(255,255,255,.92)" : "#241A38")
        let backSub = Color(css: backDark ? "rgba(255,255,255,.55)" : "rgba(36,26,56,.55)")
        let backBoxBg = Color(css: backDark ? "rgba(255,255,255,.18)" : "rgba(36,26,56,.12)")
        let backGold = Color(css: backDark ? "#D6B36F" : "#A87D2F")

        ZStack(alignment: .topLeading) {
            LinearGradient.rn(
                cardBackFinishes[finish] ?? [],
                locations: Gradients.cardFrontLocations,
                start: UnitPoint(x: 0, y: 0),
                end: UnitPoint(x: 1, y: 1)
            )
            // stripe: absolute, top 18, left/right 0, height 30
            Color(css: "#0B0812")
                .frame(height: 30)
                .frame(maxWidth: .infinity)
                .padding(.top, 18)
            // backBody: absoluteFill, top 58, padding 16, paddingTop 10
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    Text("EZER MEMBER")
                        .font(.ezer(FontFamily.bold, 11))
                        .foregroundStyle(Color(css: "#241A38"))
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(rnRect(6).fill(Color(css: "rgba(255,255,255,.92)")))
                    Spacer(minLength: 0)
                    HStack(alignment: .center, spacing: 5) {
                        Text("CVV")
                            .font(.ezer(FontFamily.bold, 8))
                            .foregroundStyle(backInk)
                            .opacity(0.6)
                        Text("•••")
                            .font(.ezer(FontFamily.medium, 11))
                            .foregroundStyle(backInk)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 10)
                    .background(rnRect(6).fill(backBoxBg))
                }
                Spacer(minLength: 0)
                Text("••••  ••••  ••••  8873")
                    .font(.ezer(FontFamily.medium, 14))
                    .tracking(1.6)
                    .foregroundStyle(backInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
                HStack(alignment: .center, spacing: 0) {
                    Text("PHYSICAL · YOUR DESIGN")
                        .font(.ezer(FontFamily.bold, 8))
                        .tracking(1.1)
                        .foregroundStyle(backSub)
                    Spacer(minLength: 0)
                    Text("EZER")
                        .font(.ezer(FontFamily.bold, 12))
                        .tracking(2.2)
                        .foregroundStyle(backGold)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.top, 58)
            .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
