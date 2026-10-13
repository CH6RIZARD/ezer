// Port of apps/mobile/components/redesign/DayPopover.tsx
//
// =============================================================================
// EZER Redesign — Home day popover (handoff §2)
//
// Scrim rgba(20,10,46,.42) + blur. Sheet anchored above the tab bar: `card`
// r22, spring-up. Serif italic date title, ✕ close. Rows: 38px logo, name,
// type label ("Renewal" / "Trial ends — becomes $X/mo"), amount in `red`.
// Footer: "Day total" + serif italic sum. Rows open Subscription Detail.
// =============================================================================
//
// RN <Modal transparent animationType="fade"> -> Foundation's .rnModal(.fade) (an .overFullScreen
// cross-dissolve, as RN presents it). The sheet's own rise (opacity 0->1, translateY 26->0 over
// motion.popover 280ms, motion.easeOut, no overshoot) runs each time it opens.

import SwiftUI

/// RN `DayEvent` (exported interface of DayPopover.tsx).
struct HomeDayEvent: Hashable, Identifiable {
    var id: String
    var merchantId: String
    /**
     * Kept separate from merchantId. They used to be conflated — merchantId held
     * a subscription id — which meant logo lookup and routing were fighting over
     * one field, and only one of them could be right.
     */
    var subscriptionId: String
    var merchantName: String
    var amountCents: Int
    /// 'renewal' | 'trial'
    var type: String
    /** For trials: the price once it converts. */
    var afterTrialCents: Int?
    /** Plaid-enriched merchant logo, when the API supplies one. */
    var logo: String?
}

/// { weekday: 'long', month: 'long', day: 'numeric' } -> "Monday, October 12"
private let homePopoverTitleFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
    return f
}()

struct DayPopover: View {
    let visible: Bool
    let date: Date?
    let events: [HomeDayEvent]
    let onClose: () -> Void
    var onSelect: ((HomeDayEvent) -> Void)?

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .allowsHitTesting(false)
            .rnModal(isPresented: visible, animationType: .fade, onRequestClose: onClose) {
                HomeDayPopoverModal(date: date, events: events, onClose: onClose, onSelect: onSelect)
            }
    }
}

/// The Modal's children.
private struct HomeDayPopoverModal: View {
    let date: Date?
    let events: [HomeDayEvent]
    let onClose: () -> Void
    let onSelect: ((HomeDayEvent) -> Void)?

    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    @State private var anim: Double = 0
    /// The rows' natural height, for the ScrollView's `maxHeight: 280`.
    @State private var rowsHeight: CGFloat = 0

    var body: some View {
        let colors = theme.colors
        let total = events.reduce(0) { $0 + $1.amountCents }
        let title = date.map { homePopoverTitleFormatter.string(from: $0) } ?? ""

        ZStack(alignment: .bottom) {
            // <Pressable style={fill} onPress={onClose}><BlurView intensity={12}><View scrim/></BlurView></Pressable>
            Button(action: onClose) {
                ZStack {
                    RNBlurView(intensity: 12, tint: theme.isDark ? .dark : .light)
                        .allowsHitTesting(false)
                    colors.scrim
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())

            // Anchored above the floating tab bar.
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    Text(verbatim: title)
                        .typeStyle(TypeScale.serifTitle)
                        .foregroundStyle(colors.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: onClose) {
                        Ionicon("close", size: 20, color: colors.mut)
                            .padding(12)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PlainPressStyle())
                    .padding(-12)
                }
                .padding(.bottom, 12)

                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(events) { e in
                            row(e, colors: colors)
                        }
                    }
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        proxy.size.height
                    } action: { h in
                        rowsHeight = h
                    }
                }
                .scrollIndicators(.hidden)
                .frame(height: min(rowsHeight, 280))

                // footer: marginTop 10, paddingTop 12, borderTopWidth 1
                HStack(alignment: .center, spacing: 0) {
                    Text("Day total")
                        .typeStyle(TypeScale.label)
                        .foregroundStyle(colors.mut)
                    Spacer(minLength: 0)
                    Text(verbatim: formatCents(total))
                        .typeStyle(TypeScale.statValue)
                        .foregroundStyle(colors.ink)
                }
                .padding(.top, 12 + 1)
                .overlay(alignment: .top) {
                    Rectangle().fill(colors.line).frame(height: 1)
                }
                .padding(.top, 10)
            }
            // padding 16 + borderWidth 1: RN's border takes layout space; the overlay only draws it.
            .padding(16 + 1)
            .background(rnRect(Radius.hero).fill(colors.card))
            .overlay(rnRect(Radius.hero).strokeBorder(colors.line, lineWidth: 1))
            .opacity(anim)
            .offset(y: 26 * (1 - anim))
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom + insets.bottom - 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .onAppear {
            // anim.setValue(0); Animated.timing(anim, { toValue: 1, duration: motion.popover,
            // easing: Easing.bezier(...motion.easeOut) }) — ease-out, not the handoff's overshoot:
            // a popover opened by a tap carries no momentum, so a bounce past its resting place
            // reads wrong.
            withoutAnimation { anim = 0 }
            onNextRunLoop {
                withAnimation(.rn(.easeOut, Motion.popover)) { anim = 1 }
            }
        }
        .debugScreenCapture("home-day-popover")
    }

    private func row(_ e: HomeDayEvent, colors: ThemeColors) -> some View {
        Button {
            onSelect?(e)
        } label: {
            HStack(alignment: .center, spacing: 11) {
                MerchantMark(name: e.merchantName, merchantId: e.merchantId, size: 38, logoUrl: e.logo)
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: e.merchantName)
                        .font(.custom(FontFamily.bold, size: 14.5))
                        .foregroundStyle(colors.ink)
                        .lineLimit(1)
                    Text(verbatim: e.type == "trial"
                         ? "Trial ends — becomes \(formatCents(e.afterTrialCents ?? e.amountCents))/mo"
                         : "Renewal")
                        .font(.custom(FontFamily.regular, size: 11.5))
                        .foregroundStyle(colors.mut)
                        .lineLimit(1)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: formatCents(e.amountCents))
                    .font(.custom(FontFamily.bold, size: 14))
                    .foregroundStyle(colors.red)
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.6))
    }
}
