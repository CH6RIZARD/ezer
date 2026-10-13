// Port of apps/mobile/app/screens/PhysicalCardApproval.tsx
//
// =============================================================================
// EZER Redesign — Physical card approval (two-tier)
//
// Reached ONLY after the design is saved (see PhysicalCardView.swift).
// The artwork is already on disk by the time this screen mounts, so nothing
// here can lose it — both branches below keep the saved design either way.
//
// Two tiers, deliberately unequal:
//   · CONNECT YOUR BANK  — runs a trust assessment, reveals a real spending
//     limit, and puts the user on the access list WITH PRIORITY.
//   · SKIP FOR NOW       — plain early-access list, notified at launch, no
//     limit yet. Never framed as a failure; it is a legitimate choice.
//
// Issuance is restated as subject to approval in EVERY terminal state — a
// revealed limit is an indication, not a card.
//
// PLAID: gated behind the FEATURE_PLAID build flag (RN EXPO_PUBLIC_FEATURE_PLAID).
// With the flag off (the demo build) Plaid Link is skipped, but the assessment
// is still the server's.
//
// A failed assessment shows NO number. This screen used to fall back to an
// invented $1,000 "demo" approval on any request failure, and SAVED it. It now
// ends the way SpendingPowerSheet does: an honest "couldn't check" banner,
// nothing saved, retry available. 'suspended' shows the sheet's "Paused";
// there is no manual-review state (CLAUDE.md), so any other no-limit answer is
// the same honest failure. Keep both.
//
// RN kept this state in the component; here it lives in
// CardStudioReviewApprovalModel (held in @State), whose `alive` flag is the
// useEffect cleanup: onDisappear stands in for unmount, as HomeCardFlowStatus does.
// =============================================================================

import Observation
import SwiftUI
import UIKit

// -----------------------------------------------------------------------------
// Feature flag + constants
// -----------------------------------------------------------------------------

/**
 * Real Plaid Link is opt-in. RN inlined EXPO_PUBLIC_FEATURE_PLAID at build time;
 * here it is the `FEATURE_PLAID` compilation condition (port map §1.10), so the
 * native Plaid path is never even reached in the demo build.
 */
private let FEATURE_PLAID: Bool = {
    #if FEATURE_PLAID
    return true
    #else
    return false
    #endif
}()

/** Assessment theatre. Fixed order, fixed timing — deterministic, like the result. */
private let CHECK_STEPS: [(key: String, label: String)] = [
    (key: "link", label: "Verifying your bank connection"),
    (key: "income", label: "Reading deposit history"),
    (key: "buffer", label: "Checking account stability"),
    (key: "limit", label: "Calculating your starting limit"),
]
private let STEP_MS: Double = 620

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Cents → "$1,000". Whole dollars: a starting limit is never a cents figure. */
private func formatLimit(_ cents: Int) -> String {
    "$" + Int(jsRound(Double(cents) / 100)).formatted(.number.locale(Locale(identifier: "en_US")))
}

@Observable
@MainActor
final class CardStudioReviewApprovalModel {
    enum Phase { case choice, assessing, approved, suspended, waitlist }
    struct Decision { let status: CardAccessOutcome.Status; let limitCents: Int }

    var phase: Phase = .choice
    var stepIndex = 0
    var limitCents: Int?
    var busy = false
    /** The last assessment failed: banner up on .choice, nothing saved. */
    var assessmentError = false

    // Timers must not fire into an unmounted tree — the user can back out of the
    // assessment mid-run.
    @ObservationIgnored private var alive = true
    private let plaid = PlaidLinkModel()

    func mount() { alive = true }
    func unmount() { alive = false }

    private func wait(_ ms: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(ms * 1_000_000))
    }

    /**
     * Join the access list. Returns the server's decision, or nil when the
     * request failed or the answer was unreadable. Never invents one. A
     * 'waitlist' POST from someone already assessed gets that earlier decision
     * back (routes/cards.ts), so the caller must read the status, not assume it.
     */
    private func joinAccessList(_ mode: String) async -> Decision? {
        let designId = CardDesignStore.getCardDesignId()
        do {
            // A `local_…` id means the design never reached the server; sending it
            // would 404, so it is dropped and the entry is created design-less.
            guard let payload = try await api.accessList(
                mode: mode,
                designId: designId.flatMap { !$0.isEmpty && !$0.hasPrefix("local_") ? $0 : nil }
            ), let status = CardDesignStore.mapServerStatus(payload.status) else { return nil }
            return Decision(status: status, limitCents: payload.limitCents ?? 0)
        } catch {
            return nil
        }
    }

    /** Show and save a real decision. False = nothing usable; the caller shows the failure. */
    @discardableResult
    private func settle(_ result: Decision?) -> Bool {
        let joinedAt = toISOString(Date())
        if let result, result.status == .approved, result.limitCents > 0 {
            limitCents = result.limitCents
            phase = .approved
            let outcome = CardAccessOutcome(status: .approved, limitCents: result.limitCents, joinedAt: joinedAt)
            CardDesignStore.saveCardAccessOutcome(outcome)
            // A real decision also goes to the Spending Power sheet's key, so the
            // sheet can't keep showing an older answer than this one.
            CardDesignStore.saveSpendingPowerOutcome(outcome)
            return true
        }
        if let result, result.status == .suspended || result.status == .waitlist {
            limitCents = nil
            phase = result.status == .suspended ? .suspended : .waitlist
            let outcome = CardAccessOutcome(status: result.status, limitCents: nil, joinedAt: joinedAt)
            CardDesignStore.saveCardAccessOutcome(outcome)
            if result.status == .suspended { CardDesignStore.saveSpendingPowerOutcome(outcome) }
            return true
        }
        return false
    }

    func runAssessment() async {
        phase = .assessing
        stepIndex = 0
        assessmentError = false

        for i in 0..<CHECK_STEPS.count {
            await wait(STEP_MS)
            if !alive { return }
            stepIndex = i + 1
        }

        let result = await joinAccessList("plaid")
        if !alive { return }

        if !settle(result) {
            // Failed, or no limit and not suspended: never show or save a number.
            limitCents = nil
            assessmentError = true
            phase = .choice
        }
    }

    func handleConnectBank(hasBank: Bool) async {
        if busy { return }
        busy = true

        if !FEATURE_PLAID || hasBank {
            // Already linked, or the demo build: no Plaid Link, no credentials.
            // Everything downstream of the link step is identical to the real
            // path, so the screen is fully exercised.
            await runAssessment()
            if alive { busy = false }
            return
        }

        // REAL PATH: open native Plaid Link first; only assess once a bank is
        // actually linked.
        // TODO(native): Plaid LinkKit is not linked (Core/Plaid.swift); openPlaidLink shows an
        // in-app alert and calls neither callback until it is (RN's usePlaid did the same when
        // the native module was missing).
        await plaid.openPlaidLink(
            onSuccess: { [weak self] _ in
                guard let self else { return }
                await self.runAssessment()
                if self.alive { self.busy = false }
            },
            onExit: { [weak self] _ in
                // Abandoned or errored the Link flow — return them to the choice with
                // "Skip for now" still available rather than dead-ending.
                guard let self, self.alive else { return }
                self.phase = .choice
                self.busy = false
            }
        )
    }

    func handleSkip() async {
        if busy { return }
        busy = true
        assessmentError = false
        let result = await joinAccessList("waitlist")
        if !alive { return }
        // Best-effort join: a failed request still lands on the list locally (as
        // SpendingPowerSheet does); a real earlier decision coming back wins.
        if !settle(result) { settle(Decision(status: .waitlist, limitCents: 0)) }
        busy = false
    }
}

struct PhysicalCardApprovalView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(DataStore.self) private var data
    @Environment(\.safeInsets) private var insets

    @State private var model = CardStudioReviewApprovalModel()

    var body: some View {
        let c = theme.colors
        // Same "already has a bank" test as SpendingPowerSheet: someone whose
        // bank is already linked (for Pay in 4, subscriptions, anything) is assessed
        // against it directly — /cards/access-list picks the Pay in 4 account
        // server-side (resolvePayIn4Instrument) — instead of being sent through a
        // second Plaid Link they don't need.
        let hasBank = !data.instruments.isEmpty || !data.subscriptions.isEmpty
        let phase = model.phase
        let done = phase == .approved || phase == .suspended || phase == .waitlist

        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    header(c)

                    // The reassurance that the artwork survived has to come first — it is
                    // the thing the user was just emotionally invested in.
                    Surface(borderColor: Color(css: "transparent"), background: c.successBg) {
                        HStack(alignment: .center, spacing: 10) {
                            Ionicon("checkmark-circle", size: 18, color: c.success)
                            BodyText("Your design is saved. Whichever you choose below, we keep it.", color: c.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(14 + 1) // padding 14; RN's 1px (transparent) border takes layout space
                    }

                    // --- Choice -----------------------------------------------------
                    if phase == .choice {
                        choice(c, hasBank: hasBank)
                    }

                    // --- Assessing ---------------------------------------------------
                    if phase == .assessing {
                        assessing(c)
                    }

                    // --- Approved: the reveal ----------------------------------------
                    if phase == .approved, let limitCents = model.limitCents {
                        Surface(borderColor: c.goldLine, background: c.goldSoft) {
                            VStack(alignment: .leading, spacing: 0) {
                                Label("Your starting limit", color: c.gold)
                                Text(formatLimit(limitCents))
                                    .typeStyle(TypeScale.totalValue)
                                    .foregroundStyle(c.gold)
                                    .padding(.top, 4)
                                BodyText("You're on the access list with priority. We'll print the design you saved.")
                                    .padding(.top, 6)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18 + 1)
                        }
                        .padding(.top, 22)
                    }

                    // --- Uncured missed Pay in 4 payment: same words as the sheet ----
                    if phase == .suspended {
                        Surface {
                            VStack(alignment: .leading, spacing: 0) {
                                Label("Paused", color: c.red)
                                BodyText("A Pay in 4 payment didn’t go through, so new spending power is paused until it’s resolved. Nothing else on your account is affected.")
                                    .padding(.top, 6)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18 + 1)
                        }
                        .padding(.top, 22)
                    }

                    // --- Waitlist -----------------------------------------------------
                    if phase == .waitlist {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("You're on the early-access list ✓")
                                .font(.ezer(FontFamily.bold, 16.5))
                                .foregroundStyle(c.ink)
                            BodyText("We'll notify you at launch. No spending limit yet — connect your bank any time to get one and move up the list.")
                                .padding(.top, 6)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                        .rnBox(bg: c.successBg, radius: Radius.cardLg)
                        .padding(.top, 22)
                    }

                    // Terminal states get a way forward.
                    if done {
                        if phase == .waitlist {
                            PressScale(scaleTo: 0.97, disabled: model.busy, action: {
                                Task { await model.handleConnectBank(hasBank: hasBank) }
                            }) {
                                Text(hasBank ? "Use your connected bank instead" : "Connect your bank instead")
                                    .font(.ezer(FontFamily.bold, 15))
                                    .tracking(0.3)
                                    .foregroundStyle(Color(css: "#FFFFFF"))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .rnBox(bg: c.goldBg, radius: Radius.buttonLg)
                                    .opacity(model.busy ? 0.6 : 1)
                            }
                            .padding(.top, 16)
                        }
                        // Replace, not push-back: the raw designer sits underneath this
                        // screen on the stack, and popping back into it after the flow
                        // is exactly the "reopens the edit screen" problem this avoids.
                        // Landing on the review screen also means the back gesture from
                        // here goes straight to wherever launched Card Studio.
                        // Home's Spending Power tile once pushed here directly without a
                        // design, and PhysicalCardReview then redirected to the blank
                        // designer — so check for a saved design before deciding where
                        // Done goes, instead of assuming the "design saved" contract held.
                        PressScale(scaleTo: 0.97, action: {
                            let design = CardDesignStore.loadCardDesign()
                            router.replace(design != nil ? "/screens/PhysicalCardReview" : "/(tabs)/home")
                        }) {
                            Text("Done")
                                .font(.ezer(FontFamily.bold, 15))
                                .foregroundStyle(c.ink)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 15 + 1.5) // + the 1.5 border RN lays out
                                .rnBox(radius: Radius.buttonLg, border: c.line2, borderWidth: 1.5)
                        }
                        .padding(.top, 12)
                    }

                    // --- Standing disclosure ------------------------------------------
                    note(c)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            .background(CardStudioNoBounce()) // bounces={false}
        }
        .scrollIndicators(.hidden)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(c.bg)
        .rnScreen()
        .onAppear { model.mount() }
        .onDisappear { model.unmount() }
    }

    private func header(_ c: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                Ionicon("chevron-back", size: 18, color: c.ink)
                    .frame(width: 38, height: 38)
                    .rnBox(bg: c.card, radius: 19, border: c.line)
            }
            Text("Almost yours")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(c.ink)
                .padding(.leading, 12)
        }
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private func choice(_ c: ThemeColors, hasBank: Bool) -> some View {
        SectionHeader("How do you want to qualify?")
            .padding(.top, 22)
        BodyText("Two ways in. One tells you your number today.")
            .padding(.top, 6)
            .padding(.bottom, 14)

        // Same banner and words as SpendingPowerSheet's.
        if model.assessmentError {
            HStack(alignment: .center, spacing: 8) {
                Ionicon("alert-circle-outline", size: 16, color: c.red)
                Text("Couldn't check your spending power just now. Try again.")
                    .font(.ezer(FontFamily.semibold, 12.5))
                    .foregroundStyle(c.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .rnBox(bg: c.card, radius: Radius.chip, border: c.red, borderWidth: 1)
            .padding(.bottom, 14)
        }

        PressScale(scaleTo: 0.98, disabled: model.busy, action: {
            Task { await model.handleConnectBank(hasBank: hasBank) }
        }) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    Ionicon("link-outline", size: 18, color: c.gold)
                    // optionTitle flexShrink 1; the pill's marginLeft 'auto' pushes it to the
                    // end with the row's 8 gap as its minimum (a Spacer would add a second gap).
                    Text(hasBank ? "Use your connected bank" : "Connect your bank")
                        .font(.ezer(FontFamily.bold, 15))
                        .foregroundStyle(c.ink)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Priority")
                        .font(.ezer(FontFamily.semibold, 10))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(Color(css: "#FFFFFF"))
                        .fixedSize()
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(c.goldBg))
                }
                BodyText(
                    hasBank
                        ? "We assess the bank you already linked and reveal your starting spending limit right now, and you move to the front of the access list."
                        : "A read-only connection. We assess your account and reveal your starting spending limit right now, and you move to the front of the access list."
                )
                .multilineTextAlignment(.leading)
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16 + 1) // padding 16 + the 1 border RN lays out
            .rnBox(bg: c.goldSoft, radius: Radius.cardLg, border: c.goldLine)
            .opacity(model.busy ? 0.6 : 1)
        }

        PressScale(scaleTo: 0.98, disabled: model.busy, action: {
            Task { await model.handleSkip() }
        }) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    Ionicon("time-outline", size: 18, color: c.mut)
                    Text("Skip for now")
                        .font(.ezer(FontFamily.bold, 15))
                        .foregroundStyle(c.ink)
                }
                BodyText("Join the early-access list. We'll notify you at launch. No limit yet, and nothing to connect.")
                    .multilineTextAlignment(.leading)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16 + 1)
            .rnBox(bg: c.card, radius: Radius.cardLg, border: c.line)
            .opacity(model.busy ? 0.6 : 1)
        }
        .padding(.top, 12)
    }

    private func assessing(_ c: ThemeColors) -> some View {
        Surface {
            VStack(alignment: .leading, spacing: 12) {
                Label("Assessing")
                ForEach(CHECK_STEPS.indices, id: \.self) { i in
                    let s = CHECK_STEPS[i]
                    let complete = i < model.stepIndex
                    let current = i == model.stepIndex
                    HStack(alignment: .center, spacing: 10) {
                        if complete {
                            Ionicon("checkmark-circle", size: 18, color: c.success)
                        } else if current {
                            Ionicon("ellipse", size: 18, color: c.accInk)
                                .cameraDove(true)
                        } else {
                            Ionicon("ellipse-outline", size: 18, color: c.mut3)
                        }
                        Text(s.label)
                            .font(.ezer(FontFamily.medium, 13))
                            .foregroundStyle(complete || current ? c.ink : c.mut3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(minHeight: 22)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16 + 1)
        }
        .padding(.top, 22)
    }

    private func note(_ c: ThemeColors) -> some View {
        Surface {
            HStack(alignment: .top, spacing: 10) {
                Ionicon("information-circle-outline", size: 16, color: c.mut)
                VStack(alignment: .leading, spacing: 0) {
                    Label("Please note")
                    BodyText("Card issuance is subject to approval. Any limit shown is an indication based on the information available now and may change before your card is issued.")
                        .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14 + 1)
        }
        .padding(.top, 18)
    }
}

// bounces={false}: CardStudioNoBounce (PhysicalCardView.swift).
