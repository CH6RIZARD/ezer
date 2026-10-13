// Port of apps/mobile/app/screens/Paywall.tsx
//
// Layout is the approved "Amethyst on bone" design: the virtual card is the
// hero, tilted, over a warm paper ground. Deliberately light where the rest of
// the app is dark — this screen is a moment, not a surface you live in, and the
// card has to read as an object sitting on something.
//
// COPY IS NOT THE DESIGN'S. This is $7.99/month against a $14 list price; both are display
// strings from RevenueCatConfig. The amount actually charged is whatever the store package
// resolves to at runtime; this screen never computes a price.
//
// TODO(native): RevenueCat (purchases-ios) is not linked and there is no iOS key, so
// PremiumStore.isPurchaseNativeAvailable is false and "Start your free 7-day trial" / "Restore
// purchase" show RN's own 'Preview' notices. The success branches are ported for when it is.
// The developer-code unlock is server-checked and works today.

import SwiftUI

struct PaywallView: View {
    @Environment(PremiumStore.self) private var premium
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win

    @State private var isPurchasing = false
    @State private var isRestoring = false
    @State private var showDevCodeInput = false
    @State private var devCode = ""
    @State private var isRedeeming = false
    @State private var devCodeError: String?
    /// Content height without the flex spacer (padding included), measured — see `flexSpacer`.
    @State private var fixedHeight: CGFloat = 0

    // Paper palette, from the comp. Not in Theme/Tokens because nothing else in
    // the app uses it — putting it there would imply a second surface style exists.
    private let PAPER = Color(css: "#F7F3EA")
    private let PAPER_EDGE = Color(css: "#EEE7D6")
    private let INK = Color(css: "#241A38")
    private let INK_MUTED = Color(css: "#8A7F6B")
    private let INK_FAINT = Color(css: "#A99E86")
    private let GOLD = Color(css: "#A87D2F")
    private let PURPLE = Color(css: "#4C1D95")
    private let GREEN = Color(css: "#348F66")

    private let SERIF = FontFamily.serif
    private let UI_BOLD = FontFamily.bold
    private let UI_SEMI = FontFamily.semibold
    private let UI_MED = FontFamily.medium

    /**
     * What a subscriber gets. Two of these are not built yet, and both say so —
     * "early access" is a promise about timing, which is true, rather than a claim
     * that the feature works today, which is not.
     */
    private let FEATURES = [
        "Unlimited subscription tracking",
        "Smart alerts and trial watchdog",
        "Savings goals — early access",
        "Ezer Pay in 4 — early access",
    ]

    private var FOUNDING_PRICE_LABEL: String { RevenueCatConfig.FOUNDING_PRICE_LABEL }
    private var LIST_PRICE_LABEL: String { RevenueCatConfig.LIST_PRICE_LABEL }
    private var BILLING_PERIOD_LABEL: String { RevenueCatConfig.BILLING_PERIOD_LABEL }

    private var trimmedCode: String { devCode.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        // An expired user has nothing behind this screen to return to, so the close
        // affordance is hidden rather than shown-and-inert.
        let canDismiss = premium.status == .trial || premium.status == .loading || isLoosePreviewMode()
        let busy = isPurchasing || isRestoring
        // contentContainerStyle minHeight: '100%' + <View style={{ flex: 1, minHeight: 24 }} />:
        // the spacer takes whatever the screen has left, never less than 24. (A Spacer inside
        // .frame(minHeight:) does not grow in a ScrollView, whose scroll axis is unproposed.)
        let flexSpacer = max(24, win.height - fixedHeight)

        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header(canDismiss: canDismiss)
                card
                title
                previewPill
                features
                Color.clear.frame(height: flexSpacer)
                priceRow
                cta(busy: busy)
                devCodeSection
                restoreRow(busy: busy)
                disclosure
            }
            .padding(.top, insets.top + 14)
            .padding(.bottom, insets.bottom + 24)
            .padding(.horizontal, 20)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in
                let fixed = h - flexSpacer
                if abs(fixed - fixedHeight) > 0.5 { fixedHeight = fixed }
            }
        }
        .background(PAPER.ignoresSafeArea())
        .rnScreen()
    }

    // MARK: - header

    private func header(canDismiss: Bool) -> some View {
        HStack(spacing: 0) {
            if canDismiss {
                Button(action: { router.back() }) {
                    Ionicon("close", size: 18, color: INK)
                        .frame(width: 42, height: 42)
                        .rnBox(bg: Color(css: "#FFFFFF"), radius: 21, border: PAPER_EDGE)
                }
                .buttonStyle(PlainPressStyle())
                .hitSlop(10)
            } else {
                Color.clear.frame(width: 42, height: 0)
            }
            Spacer(minLength: 0)
            Text("EZER")
                .font(.ezer(UI_BOLD, 15))
                .tracking(2.5)
                .foregroundStyle(GOLD)
            Spacer(minLength: 0)
            Color.clear.frame(width: 42, height: 0)
        }
    }

    // MARK: - the card, tilted — the hero

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                LinearGradient.rn(["#E7C77E", "#A87D2F", "#E7C77E"], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                    .frame(width: 38, height: 28)
                    .clipShape(rnRect(7))
                Spacer(minLength: 0)
                Text("Founding member")
                    .font(.ezer(UI_SEMI, 10))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(Color(css: "#C9BCE8"))
            }

            Spacer(minLength: 0)
            Text("Ezer Premium")
                .font(.ezer(SERIF, 30))
                .tracking(1)
                .foregroundStyle(Color(css: "#FFFFFF"))
            Spacer(minLength: 0)

            HStack(alignment: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    // No fontFamily in the TS: the system font.
                    Text("Cardholder")
                        .font(.system(size: 9))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(Color(css: "#C9BCE8"))
                    Text("EZER MEMBER")
                        .font(.ezer(UI_SEMI, 12))
                        .tracking(1)
                        .foregroundStyle(Color(css: "#FFFFFF"))
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    Text("Rate")
                        .font(.system(size: 9))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(Color(css: "#C9BCE8"))
                    Text("LOCKED")
                        .font(.ezer(UI_SEMI, 12))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                }
            }
        }
        .padding(20)
        .frame(width: 308, height: 190)
        .background(
            // The shadow belongs to the gradient box (an iOS layer shadow), not to the text on it.
            LinearGradient.rn(["#5B21B6", "#31136E", "#150A33"], locations: [0, 0.55, 1], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                .clipShape(rnRect(20))
                .rnShadow("#241A38", opacity: 0.28, radius: 48, y: 24)
        )
        .rotationEffect(.degrees(-4))
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    // MARK: - headline

    private var title: some View {
        Text("One rate. Every feature. \(Text("Locked.").font(.ezer(SERIF, 26)).foregroundStyle(PURPLE))")
            .font(.ezer(UI_BOLD, 26))
            .tracking(-0.6)
            .foregroundStyle(INK)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 36)
    }

    // "Trial" is two different things on this screen and they must not share the word.
    // `status` here is the local, device-only APP PREVIEW window (PremiumStore's timer) — it has
    // nothing to do with the subscription's own free-trial OFFER advertised on the CTA below as
    // "Start your free 7-day trial". This says "preview" instead.
    @ViewBuilder
    private var previewPill: some View {
        if premium.status == .trial && premium.daysRemaining > 0 {
            pill("\(premium.daysRemaining) \(premium.daysRemaining == 1 ? "day" : "days") left in your free preview")
        }
        if premium.status == .expired {
            pill("Your free preview has ended")
        }
    }

    private func pill(_ s: String) -> some View {
        Text(s)
            .font(.ezer(UI_SEMI, 10))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(GOLD)
            .padding(.horizontal, 10 + 1)   // + the 1px border (Yoga lays it out; rnBox overlays it)
            .padding(.vertical, 6 + 1)
            .rnBox(bg: Color(css: "#F6EBD3"), radius: 999, border: Color(css: "#E2C892"))
            .frame(maxWidth: .infinity) // alignSelf: 'center'
            .padding(.top, 14)
    }

    private var features: some View {
        VStack(spacing: 10) {
            ForEach(FEATURES, id: \.self) { f in
                HStack(spacing: 12) {
                    Ionicon("checkmark", size: 16, color: GREEN)
                    Text(f)
                        .font(.ezer(UI_MED, 13.5))
                        .foregroundStyle(INK)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                // Yoga lays the 1px border out inside the box, around the padding; rnBox only
                // overlays it, so each padding is written N + 1.
                .padding(.horizontal, 14 + 1)
                .padding(.vertical, 12 + 1)
                .rnBox(bg: Color(css: "#FFFFFF"), radius: 15, border: PAPER_EDGE)
            }
        }
        .padding(.top, 24)
    }

    // MARK: - price + CTA

    private var priceRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Founding rate")
                .font(.ezer(UI_SEMI, 11))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(INK_MUTED)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(FOUNDING_PRICE_LABEL)
                    .font(.ezer(SERIF, 34))
                    .rnLineHeight(38, family: SERIF, size: 34)
                    .foregroundStyle(PURPLE)
                Text("/\(BILLING_PERIOD_LABEL)")
                    .font(.ezer(UI_MED, 13))
                    .foregroundStyle(INK_MUTED)
                Text(LIST_PRICE_LABEL)
                    .font(.ezer(UI_MED, 13))
                    .strikethrough()
                    .foregroundStyle(INK_FAINT)
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 22)
    }

    private func cta(busy: Bool) -> some View {
        Button(action: handlePurchase) {
            ZStack {
                Group {
                    Text("Start your free 7-day trial")
                        .font(.ezer(UI_BOLD, 15))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                }
                .cameraDove(isPurchasing)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                LinearGradient.rn([PURPLE, GOLD], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 0))
                    .clipShape(rnRect(17))
            )
        }
        .buttonStyle(PlainPressStyle())
        .disabled(busy)
        .opacity(busy ? 0.6 : 1)
        .padding(.top, 16)
    }

    // Private, server-checked bypass — not a client-side toggle. See POST /account/dev-unlock:
    // the code is validated and the expiry enforced entirely server-side, against the server's
    // clock, so it cannot be extended by changing this phone's date and cannot be found by
    // decompiling the app (the real code is a Railway environment variable, never shipped).
    @ViewBuilder
    private var devCodeSection: some View {
        if !showDevCodeInput {
            Button(action: { showDevCodeInput = true }) {
                Text("Enter developer code")
                    .font(.system(size: 12))
                    .underline()
                    .foregroundStyle(INK_MUTED)
            }
            .buttonStyle(PlainPressStyle())
            .hitSlop(8)
            .frame(maxWidth: .infinity) // alignSelf: 'center'
            .padding(.top, 14)
        } else {
            let unlockDisabled = isRedeeming || trimmedCode.isEmpty
            VStack(spacing: 8) {
                SecureField("", text: $devCode, prompt: Text("Developer code").foregroundStyle(INK_FAINT))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .disabled(isRedeeming)
                    .font(.system(size: 14))
                    .foregroundStyle(INK)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14 + 1)   // + the 1px border
                    .frame(height: 46)
                    .rnBox(bg: Color(css: "#FFFFFF"), radius: 12, border: devCodeError != nil ? Color(css: "#B3402A") : PAPER_EDGE)
                    .onChange(of: devCode) { _, _ in devCodeError = nil }
                if let devCodeError {
                    Text(devCodeError)
                        .font(.system(size: 11))
                        .foregroundStyle(Color(css: "#B3402A"))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                Button(action: handleRedeemDevCode) {
                    ZStack {
                        Group {
                            Text("Unlock")
                                .font(.ezer(UI_SEMI, 13))
                                .foregroundStyle(Color(css: "#FFFFFF"))
                        }
                        .cameraDove(isRedeeming)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .rnBox(bg: INK, radius: 12)
                }
                .buttonStyle(PlainPressStyle())
                .disabled(unlockDisabled)
                .opacity(unlockDisabled ? 0.5 : 1)
            }
            .padding(.top, 14)
        }
    }

    private func restoreRow(busy: Bool) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Button(action: handleRestore) {
                Group {
                    Text("Restore purchase")
                        .font(.system(size: 12))
                        .underline()
                        .foregroundStyle(INK_MUTED)
                }
                .cameraDove(isRestoring)
                .opacity(isRestoring ? 0.6 : 1)
            }
            .buttonStyle(PlainPressStyle())
            .disabled(busy)
            .hitSlop(8)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 14)
    }

    // Required disclosure. Auto-renewal, the trial-to-paid transition and cancellation must all
    // be stated on the screen that takes the money — a store review checks for exactly this, and
    // its absence is a rejection.
    private var disclosure: some View {
        Text("Free for 7 days, then \(FOUNDING_PRICE_LABEL)/\(BILLING_PERIOD_LABEL). Renews automatically until cancelled — cancel any time before the trial ends in your App Store or Google Play account settings to avoid being charged. Your founding rate stays \(FOUNDING_PRICE_LABEL) for as long as the subscription remains active.")
            .font(.system(size: 10.5))
            .foregroundStyle(INK_FAINT)
            .multilineTextAlignment(.center)
            .rnLineHeight(16, family: nil, size: 10.5)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
    }

    // MARK: - Actions

    private func handleRedeemDevCode() {
        let code = trimmedCode
        if code.isEmpty { return }
        isRedeeming = true
        devCodeError = nil
        Task {
            let error = await premium.redeemDevCode(code)
            if let error {
                devCodeError = error
            } else {
                // This screen is most often reached via the premium gate when status was
                // 'expired', which leaves nothing behind it. Force the destination instead of
                // assuming there is one to go back to.
                router.replace("/(tabs)/home")
            }
            isRedeeming = false
        }
    }

    private func handlePurchase() {
        if !premium.isPurchaseNativeAvailable {
            AppAlert.alert(
                "Preview",
                isExpoGo()
                    ? "In-app purchases are not available in Expo Go. Use a development build to test billing, or close this screen to keep exploring."
                    : "Billing is not available in this build. Set up RevenueCat and a dev client to test purchases."
            )
            return
        }
        isPurchasing = true
        Task {
            let success = await premium.purchasePremium()
            if success {
                // Same reasoning as the dev-code path above: an expired-triggered
                // visit to this screen has nothing behind it to go back to.
                AppAlert.alert("You’re in", "Your founding rate is locked for as long as you stay subscribed.", [
                    AlertButton("Let’s go") { router.replace("/(tabs)/home") },
                ])
            }
            isPurchasing = false
        }
    }

    private func handleRestore() {
        if !premium.isPurchaseNativeAvailable {
            AppAlert.alert("Preview", "Restore purchases requires a development build with the store SDK.")
            return
        }
        isRestoring = true
        Task {
            let success = await premium.restorePurchases()
            if success {
                AppAlert.alert("Subscription restored", "Your access is back.", [
                    AlertButton("Great") { router.replace("/(tabs)/home") },
                ])
            } else {
                AppAlert.alert("Nothing to restore", "We couldn’t find a subscription on this account.")
            }
            isRestoring = false
        }
    }
}
