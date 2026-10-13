// Port of apps/mobile/components/redesign/SpendingPowerSheet.tsx
//
// =============================================================================
// EZER Redesign — Spending Power sheet
//
// The ONLY entry point for checking or joining Pay in 4 early access (CLAUDE.md
// "Spending Power / Pay in 4 underwriting"): a bottom sheet over the Pay in 4
// tab, opened by Home's Spending Power tile (via ?sheet=spending) and by the
// tab's own CTA.
//
// One sheet, four phases: 'ask' (not yet assessed) → 'assessing' (theatre) →
// 'reveal' (first real limit, shown exactly once) → 'status' (every later
// open). 'ask' itself renders two ways depending on whether the sheet JUST
// joined the waitlist on this open — that's `justJoined`, not the same as
// `joined`, which is true any time an outcome already exists.
//
// Underwriting itself is the server's — POST /cards/access-list. 'suspended'
// (an uncured missed Pay in 4 payment) is folded into the 'status' phase with
// its own Priority/CTA copy rather than a fifth phase. There is NO manual-review
// state.
//
// Patch 2: a first tap with a bank already linked swaps the single pill for
// "Use connected bank" (runs the SAME assessment, no Link) vs "Connect a new
// bank" (Plaid Link tagged 'pay_in_4'). The slide (circle left→right, covering
// the label as it passes) is plain z-order: the circle is opaque and drawn
// AFTER the label.
//
// RN kept this state in the component (always mounted beside its <Modal>); here
// it lives in PayIn4SpendingPowerModel, held by the always-mounted
// SpendingPowerSheet view, so the modal's hosted content observes it directly.
// =============================================================================

import Observation
import SwiftUI

private let CHECK_STEPS = [
    "Verifying your bank connection",
    "Reading deposit history",
    "Checking account stability",
    "Calculating your spending power",
]
private let STEP_MS: Double = 620
/// RN `process.env.EXPO_PUBLIC_FEATURE_PLAID === '1'` → the `FEATURE_PLAID` build flag (port map
/// §1.10). Off by default = the assessment runs without opening Plaid Link.
private let FEATURE_PLAID: Bool = {
    #if FEATURE_PLAID
    return true
    #else
    return false
    #endif
}()

private let CIRCLE: CGFloat = 40
private let CIRCLE_MARGIN: CGFloat = 8
// The primary pill's circle (RN: same names, same numbers). A tap slides it across in SLIDE_MS.
// A drag follows the finger; released past COMMIT_AT of the track, or flicked forward faster than
// FLICK_VX (pt/s), it finishes in COMMIT_MS and runs the tap's action; otherwise it returns home
// in RETURN_MS (ease-out, no overshoot). Whichever axis passes DRAG_SLOP first decides (RNGH
// activeOffsetX / failOffsetY): sideways is the pill's, vertical is left to the page scroll.
private let SLIDE_MS: Double = 550
private let COMMIT_AT: Double = 0.6
private let FLICK_VX: CGFloat = 800
private let COMMIT_MS: Double = 250
private let RETURN_MS: Double = 300
private let DRAG_SLOP: CGFloat = 10

private let dollarsFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f
}()

/// `$${Math.round(cents / 100).toLocaleString('en-US')}`
private func fmtDollars(_ cents: Int) -> String {
    "$" + (dollarsFormatter.string(from: NSNumber(value: jsRound(Double(cents) / 100))) ?? "0")
}

@Observable
@MainActor
final class PayIn4SpendingPowerModel {
    enum Phase { case ask, assessing, reveal, status }

    private(set) var phase: Phase = .ask
    var loaded = false
    var justJoined = false
    var joined = false
    var limitCents: Int?
    var suspended = false
    var designSaved = false
    var stepIndex = 0
    var busy = false
    /** True once the primary pill has been tapped once and a bank is already
     *  linked — shows the "Use connected bank" / "Connect a new bank" choice
     *  in place of the single pill. Reset on every fresh sheet open. */
    var showChoice = false
    /**
     * True when the most recent assessment attempt failed. A failed assessment
     * renders its own retry state — never a fabricated "demo" limit.
     */
    var assessmentError = false
    /** "Opening your bank…" — the idle pill's post-slide label when there is
     *  NO bank to reuse, while Plaid Link is opening. */
    var opening = false

    /// RN slideAnim (0 = circle at the left, 1 = parked at the right).
    var slide: Double = 0
    var pillWidth: CGFloat = 0
    /// Bumped by every setValue/start on slideAnim, so a completion can tell it was cut short
    /// (RN's `finished: false`).
    private var slideRun = 0

    private let plaid = PlaidLinkModel()

    var slideDistance: CGFloat { max(0, pillWidth - CIRCLE - CIRCLE_MARGIN * 2) }

    /// RN `slideAnim.setValue(0)`.
    func resetSlide() {
        slideRun += 1
        withoutAnimation { slide = 0 }
    }

    /// setPhase + the RN effect that resets the slide on every phase change: each phase's own
    /// primary pill must mount at rest, never already slid over its own label.
    private func setPhase(_ p: Phase) {
        let changed = p != phase
        phase = p
        if changed { resetSlide() }
    }

    func openFresh(viaJoin: Bool) async {
        loaded = false
        busy = false
        justJoined = false
        showChoice = false
        assessmentError = false
        opening = false
        resetSlide()

        let outcome = CardDesignStore.getSpendingPowerOutcome()
        let revealSeen = CardDesignStore.getSpendingPowerRevealSeen()
        let design = CardDesignStore.loadCardDesign()
        designSaved = design != nil

        let wasAlreadyJoined = outcome != nil
        var current = outcome

        if viaJoin && !wasAlreadyJoined {
            // A real join, not local-only state.
            do {
                _ = try await api.accessList(mode: "waitlist", designId: nil)
            } catch {
                // Best-effort: the sheet still shows joined locally; the next real
                // assessment (which also POSTs) reconciles it either way.
            }
            let joinedNow = CardAccessOutcome(status: .waitlist, limitCents: nil, joinedAt: toISOString(Date()))
            current = joinedNow
            CardDesignStore.saveSpendingPowerOutcome(joinedNow)
            CardDesignStore.mirrorServerAccessOutcome(joinedNow)
            justJoined = true
        }

        joined = current != nil
        limitCents = current?.limitCents
        suspended = current?.status == .suspended

        if current?.status == .approved, let l = current?.limitCents, l != 0 {
            setPhase(revealSeen ? .status : .reveal)
        } else if current?.status == .suspended {
            setPhase(.status)
        } else if wasAlreadyJoined {
            setPhase(.status)
        } else {
            setPhase(.ask)
        }
        loaded = true
    }

    func runAssessment() async {
        setPhase(.assessing)
        stepIndex = 0
        assessmentError = false
        // The real request starts NOW and the checklist ticks alongside it. The
        // last step keeps its spinner until the answer arrives; a fast answer
        // ends the checklist early.
        let ticker = Task { @MainActor [weak self] in
            for i in 0..<(CHECK_STEPS.count - 1) {
                try? await Task.sleep(nanoseconds: UInt64(STEP_MS * 1_000_000))
                if Task.isCancelled { return }
                self?.stepIndex = i + 1
            }
        }
        var ok = true
        var res: AccessListResult?
        do {
            res = try await api.accessList(mode: "plaid", designId: nil)
        } catch {
            ok = false
        }
        ticker.cancel()
        stepIndex = CHECK_STEPS.count

        guard ok else {
            // A failed assessment must NEVER show a number — not even a "demo"
            // one. Land back wherever the primary CTA already renders (ask if
            // never joined, status otherwise) with the error banner up.
            busy = false
            assessmentError = true
            setPhase(joined ? .status : .ask)
            return
        }
        let cents = res?.limitCents ?? 0
        let status = CardDesignStore.mapServerStatus(res?.status) ?? .approved
        let outcome = CardAccessOutcome(status: status, limitCents: cents, joinedAt: toISOString(Date()))
        CardDesignStore.saveSpendingPowerOutcome(outcome)
        CardDesignStore.mirrorServerAccessOutcome(outcome)

        joined = true
        limitCents = cents
        suspended = status == .suspended
        busy = false

        if status == .approved && cents > 0 {
            setPhase(CardDesignStore.getSpendingPowerRevealSeen() ? .status : .reveal)
        } else {
            setPhase(.status)
        }
    }

    /** "Connect a new bank" — opens Plaid Link tagged 'pay_in_4', separate from
     *  whatever bank (if any) already backs subscriptions. Also the fallback for
     *  someone with NO bank linked at all. */
    func handleConnect() {
        if busy { return }
        busy = true
        showChoice = false

        if !FEATURE_PLAID {
            Task {
                await runAssessment()
                busy = false
                opening = false
                resetSlide()
            }
            return
        }

        opening = true
        // TODO(native): Plaid LinkKit is not linked (Core/Plaid.swift); openPlaidLink shows an
        // in-app alert and calls neither callback until it is.
        Task {
            await plaid.openPlaidLink(
                onSuccess: { [weak self] _ in
                    self?.opening = false
                    await self?.runAssessment()
                },
                onExit: { [weak self] _ in
                    // Cancelled — animate the circle back to idle rather than leaving it
                    // parked mid-slide.
                    guard let self else { return }
                    busy = false
                    opening = false
                    slideRun += 1
                    withAnimation(.rn(.cardSettle, SLIDE_MS)) { self.slide = 0 }
                },
                purpose: "pay_in_4"
            )
        }
    }

    /**
     * "Use connected bank" — runs the SAME assessment as "Connect a new bank",
     * just without opening Plaid Link first.
     */
    func handleUseConnected() {
        if busy { return }
        busy = true
        showChoice = false
        Task { await runAssessment() }
    }

    /**
     * Primary pill's idle tap: slide the circle left→right over 550ms first —
     * covering the label as it passes — THEN branch: a bank already linked
     * reveals the connected/new-bank choice; no bank at all goes straight to
     * Plaid (nothing to choose between for someone starting from zero).
     */
    func handlePrimaryTap(hasBank: Bool) {
        if busy { return }
        slideRun += 1
        let run = slideRun
        withAnimation(.rn(.cardSettle, SLIDE_MS), completionCriteria: .logicallyComplete) {
            slide = 1
        } completion: { [weak self] in
            guard let self, run == slideRun else { return }
            afterSlide(hasBank: hasBank)
        }
    }

    /// RN afterSlide: what the circle reaching the right runs, tapped or dragged there.
    private func afterSlide(hasBank: Bool) {
        if hasBank {
            resetSlide()
            showChoice = true
        } else {
            handleConnect()
        }
    }

    // --- Slide-to-confirm (RN pillPan) -------------------------------------------
    /// Where the circle was when the current drag took hold; nil = no drag holds the pill.
    private var dragStart: Double?
    /// The current touch went vertical first: it belongs to the page scroll.
    private var dragRejected = false
    /// The Button under the pill sees the drag's touch-up too (RN web's `dragged` ref, same
    /// reason), so its tap is ignored while a drag holds the pill and just after one releases.
    private var dragEndedAt = Date.distantPast

    /// RN onStart + onUpdate: the circle follows the finger 1:1 along the track, clamped.
    func dragPill(_ t: CGSize) {
        if dragStart == nil {
            if dragRejected { return }
            guard !busy, slideDistance > 0, abs(t.width) > abs(t.height) else {
                dragRejected = true
                return
            }
            // RN cancelAnimation: a running slide's completion must not fire under the finger.
            // ponytail: SwiftUI only exposes the target value, so grabbing a circle mid-slide starts
            // from where it was heading, not where it is drawn; RN starts from the drawn position.
            slideRun += 1
            dragStart = slide
        }
        guard let start = dragStart else { return }
        withoutAnimation { slide = min(1, max(0, start + Double(t.width / slideDistance))) }
    }

    /// RN onEnd. `cancelled`: the system took the touch (RNGH success = false), never a commit.
    func releasePill(velocityX: CGFloat, hasBank: Bool, cancelled: Bool = false) {
        dragRejected = false
        guard dragStart != nil else { return }
        dragStart = nil
        dragEndedAt = Date()
        slideRun += 1
        let run = slideRun
        if !cancelled && (slide >= COMMIT_AT || velocityX >= FLICK_VX) {
            Haptics.impactLight()
            withAnimation(.rn(.cardSettle, COMMIT_MS), completionCriteria: .logicallyComplete) {
                slide = 1
            } completion: { [weak self] in
                guard let self, run == slideRun else { return }
                afterSlide(hasBank: hasBank)
            }
        } else {
            withAnimation(.rn(.easeOut, RETURN_MS)) { slide = 0 }
        }
    }

    /// The pill's Button action (RN onPillPress): a tap, unless it is a drag's own touch-up.
    func tapPill(hasBank: Bool) {
        if dragStart != nil || Date().timeIntervalSince(dragEndedAt) < 0.3 { return }
        handlePrimaryTap(hasBank: hasBank)
    }

    func finishReveal(onClose: () -> Void) {
        CardDesignStore.markSpendingPowerRevealSeen()
        onClose()
    }
}

/// The always-mounted half of the RN component: owns the state and presents the Modal.
struct SpendingPowerSheet: View {
    let visible: Bool
    /** True only for the "Join the early-access list" entry point — joins the
     *  waitlist for real (POST, not local state) if not already joined. */
    var viaJoin = false
    let onClose: () -> Void

    init(visible: Bool, viaJoin: Bool = false, onClose: @escaping () -> Void) {
        self.visible = visible
        self.viaJoin = viaJoin
        self.onClose = onClose
    }

    // Whether ANY bank is already linked — drives "Use connected bank" vs
    // "Connect a new bank" (Patch 2).
    @Environment(DataStore.self) private var data
    @State private var model = PayIn4SpendingPowerModel()
    @State private var wasVisible = false

    var body: some View {
        let hasBank = !data.instruments.isEmpty || !data.subscriptions.isEmpty
        Color.clear
            .frame(width: 0, height: 0)
            .rnModal(isPresented: visible, animationType: .slide, onRequestClose: onClose) {
                PayIn4SheetContent(model: model, hasBank: hasBank, onClose: onClose)
            }
            .onChange(of: visible, initial: true) { _, v in
                if v && !wasVisible {
                    let join = viaJoin
                    Task { await model.openFresh(viaJoin: join) }
                }
                wasVisible = v
            }
    }
}

private struct PayIn4SheetContent: View {
    let model: PayIn4SpendingPowerModel
    let hasBank: Bool
    let onClose: () -> Void

    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win
    @State private var contentHeight: CGFloat = 0
    /// True while a drag holds the primary pill; SwiftUI resets it on cancel too.
    @GestureState private var pillTouching = false

    var body: some View {
        let colors = theme.colors
        // maxHeight: '86%' of the sheet's box; the ScrollView gets what the paddings and grabber leave.
        let maxScroll = max(0, win.height * 0.86 - 12 - (34 + insets.bottom) - 4 - 28)

        ZStack(alignment: .bottom) {
            // Backdrop: tap to close (not while busy).
            colors.scrim
                .contentShape(Rectangle())
                .onTapGesture { if !model.busy { onClose() } }

            // sheetWrap: flex 1, justifyContent flex-end, pointerEvents box-none
            VStack(spacing: 0) {
                rnRect(2)
                    .fill(colors.line2)
                    .frame(width: 40, height: 4)
                    .padding(.bottom, 28)

                if !model.loaded {
                    RNActivityIndicator(color: colors.gold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                } else {
                    ScrollView(.vertical) {
                        phaseContent
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                    }
                    .scrollIndicators(.hidden)
                    .frame(height: min(contentHeight, maxScroll))
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            // The fixed paddingBottom: 34 sat flush against a gesture-nav bar on
            // devices with one; the inset keeps the last line clear of it.
            .padding(.bottom, 34 + insets.bottom)
            .frame(maxWidth: .infinity)
            .background(rnRect(topLeading: 28, topTrailing: 28).fill(colors.card))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        // DEBUG builds: Documents/screens/payin4-sheet-<phase>-<mode>.png, one per phase shown.
        .debugScreenCapture("payin4-sheet-\(model.loaded ? String(describing: model.phase) : "loading")", active: true)
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch model.phase {
        case .ask: askPhase
        case .assessing: assessingPhase
        case .reveal:
            if let limit = model.limitCents { revealPhase(limit) }
        case .status: statusPhase
        }
    }

    // MARK: - Shared pieces

    @ViewBuilder
    private var errorBanner: some View {
        let colors = theme.colors
        if model.assessmentError {
            HStack(alignment: .center, spacing: 8) {
                Ionicon("alert-circle-outline", size: 16, color: colors.red)
                Text("Couldn't check your spending power just now. Try again.")
                    .font(.ezer(FontFamily.semibold, 12.5))
                    .foregroundStyle(colors.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .rnBox(bg: colors.card, radius: Radius.chip, border: colors.red, borderWidth: 1)
            .padding(.top, 18)
        }
    }

    private func eyebrow(_ s: String) -> some View {
        Text(s)
            .font(.ezer(FontFamily.semibold, 11))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(theme.colors.mut)
    }

    private func headline(_ s: String) -> some View {
        Text(s)
            .font(.ezer(FontFamily.serif, 36))
            .tracking(-0.4)
            .rnLineHeight(40, family: FontFamily.serif, size: 36)
            .foregroundStyle(theme.colors.ink)
    }

    private func finePrint(_ s: String) -> some View {
        Text(s)
            .font(.ezer(FontFamily.regular, 11))
            .rnLineHeight(16, family: FontFamily.regular, size: 11)
            .foregroundStyle(theme.colors.mut3)
            .padding(.top, 16)
    }

    private func laterButton(_ label: String) -> some View {
        Button(action: onClose) {
            Text(label)
                .font(.ezer(FontFamily.semibold, 14))
                .foregroundStyle(theme.colors.mut)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PlainPressStyle())
        .disabled(model.busy)
        .padding(.top, 4)
    }

    private func donePill(action: @escaping () -> Void) -> some View {
        PressScale(scaleTo: Motion.pressScale, action: action) {
            Text("Done")
                .font(.ezer(FontFamily.bold, 15))
                .foregroundStyle(theme.colors.bg)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Capsule().fill(theme.colors.ink))
        }
    }

    /**
     * The primary pill, shared between the 'ask' and no-limit 'status' phases.
     * A single pill until tapped; if a bank is already linked, that tap swaps it
     * for the "Use connected bank" / "Connect a new bank" split (Patch 2).
     */
    @ViewBuilder
    private func primaryCta(_ idleLabel: String, _ busyLabel: String) -> some View {
        let colors = theme.colors
        if model.showChoice {
            HStack(spacing: 8) {
                PressScale(scaleTo: Motion.pressScale, disabled: model.busy, action: { model.handleUseConnected() }) {
                    Text("Use connected bank")
                        .font(.ezer(FontFamily.bold, 13.5))
                        .foregroundStyle(colors.bg)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Capsule().fill(colors.ink))
                }
                .frame(maxWidth: .infinity)
                PressScale(scaleTo: Motion.pressScale, disabled: model.busy, action: { model.handleConnect() }) {
                    Text("Connect a new bank")
                        .font(.ezer(FontFamily.bold, 13.5))
                        .foregroundStyle(colors.ink)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .overlay(Capsule().strokeBorder(colors.ink, lineWidth: 1.5))
                        .contentShape(Capsule())
                }
                .frame(maxWidth: .infinity)
            }
            .frame(height: 56)
        } else {
            PressScale(scaleTo: Motion.pressScale, disabled: model.busy, action: { model.tapPill(hasBank: hasBank) }) {
                PayIn4PillContent(
                    slide: model.slide,
                    label: model.opening ? "Opening your bank…" : model.busy ? busyLabel : idleLabel,
                    labelPinned: model.opening || model.busy,
                    distance: model.slideDistance,
                    ink: colors.bg,
                    circle: colors.gold
                )
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(Capsule().fill(colors.ink))
                .clipShape(Capsule())
                .opacity(model.busy && !model.opening ? 0.6 : 1)
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { model.pillWidth = $0 }
            }
            // Simultaneous, not high-priority: the sheet's ScrollView must keep vertical drags
            // (dragPill drops those itself), and the Button keeps its tap.
            .simultaneousGesture(pillDrag)
            // A drag the system cancels never reaches onEnded (RN onEnd with success = false):
            // send the circle home. After a normal end this is a no-op.
            .onChange(of: pillTouching) { _, t in
                if !t { model.releasePill(velocityX: 0, hasBank: hasBank, cancelled: true) }
            }
        }
    }

    private var pillDrag: some Gesture {
        DragGesture(minimumDistance: DRAG_SLOP)
            .updating($pillTouching) { _, s, _ in s = true }
            .onChanged { v in model.dragPill(v.translation) }
            .onEnded { v in model.releasePill(velocityX: v.velocity.width, hasBank: hasBank) }
    }

    // MARK: - Ask

    private var askPhase: some View {
        let colors = theme.colors
        return VStack(alignment: .leading, spacing: 0) {
            if model.justJoined {
                Ionicon("checkmark", size: 24, color: Color(css: "#FFFFFF"))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(colors.success))
            } else {
                eyebrow("SPENDING POWER")
            }
            headline(model.justJoined ? "You’re on the early\u{2011}access list." : "Your number is still a blank.")
                .padding(.top, model.justJoined ? 20 : 10)
            BodyText(
                model.justJoined
                    ? "Your spending power is still a blank. Connect a bank, read\u{2011}only, and we’ll fill it in before you close this sheet."
                    : "Connect a bank, read\u{2011}only, and we’ll fill it in before you close this sheet. It also puts you on the early\u{2011}access list, at the front."
            )
            .rnLineHeight(22, TypeScale.body)
            .padding(.top, 16)

            VStack(alignment: .leading, spacing: 10) {
                factRow("lock-closed-outline", "Read\u{2011}only · we can’t move money")
                factRow("shield-checkmark-outline", "Soft check · no effect on your credit score")
            }
            .padding(.top, 22)

            errorBanner
            primaryCta("Find out my spending power", "Opening…")
                .padding(.top, model.assessmentError ? 14 : 30)
            laterButton("Later")
        }
    }

    private func factRow(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Ionicon(icon, size: 16, color: theme.colors.gold)
            Text(text)
                .font(.ezer(FontFamily.regular, 13))
                .foregroundStyle(theme.colors.ink)
        }
    }

    // MARK: - Assessing

    private var assessingPhase: some View {
        let colors = theme.colors
        return VStack(alignment: .leading, spacing: 0) {
            headline("Working out your number")
            VStack(alignment: .leading, spacing: 0) {
                ForEach(CHECK_STEPS.indices, id: \.self) { i in
                    let complete = i < model.stepIndex
                    let current = i == model.stepIndex
                    HStack(alignment: .center, spacing: 10) {
                        if complete {
                            Ionicon("checkmark-circle", size: 18, color: colors.success)
                        } else if current {
                            RNActivityIndicator(color: colors.accInk)
                        } else {
                            Ionicon("ellipse-outline", size: 18, color: colors.mut3)
                        }
                        Text(CHECK_STEPS[i])
                            .font(.ezer(FontFamily.semibold, 13.5))
                            .foregroundStyle(complete || current ? colors.ink : colors.mut3)
                    }
                    .padding(.vertical, 8)
                }
            }
            .padding(.top, 18)
        }
    }

    // MARK: - Reveal (once)

    private func revealPhase(_ limitCents: Int) -> some View {
        let colors = theme.colors
        let cols: [(label: String, tint: Color)] = [
            ("TODAY", colors.gold),
            ("+2 WK", colors.mut2),
            ("+4 WK", colors.mut2),
            ("+6 WK", colors.mut2),
        ]
        return VStack(alignment: .leading, spacing: 0) {
            Text("PRIORITY ACCESS")
                .font(.ezer(FontFamily.semibold, 10))
                .tracking(0.5)
                .foregroundStyle(colors.gold)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(colors.goldSoft))
            eyebrow("YOUR STARTING SPENDING POWER")
                .padding(.top, 26)
            Text(fmtDollars(limitCents))
                .font(.ezer(FontFamily.serif, 80))
                .tracking(-1.5)
                .foregroundStyle(colors.gold)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .padding(.top, 8)

            HStack(spacing: 0) {
                ForEach(cols.indices, id: \.self) { i in
                    VStack(alignment: .center, spacing: 0) {
                        Text(fmtDollars(Int(jsRound(Double(limitCents) / 4))))
                            .font(.ezer(FontFamily.serif, 20))
                            .foregroundStyle(colors.ink)
                        Text(cols[i].label)
                            .font(.ezer(FontFamily.semibold, 10))
                            .tracking(0.5)
                            .foregroundStyle(cols[i].tint)
                            .padding(.top, 3)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.leading, i > 0 ? 1 : 0)
                    .overlay(alignment: .leading) {
                        if i > 0 { Rectangle().fill(colors.line).frame(width: 1) }
                    }
                }
            }
            .padding(.vertical, 14)
            .padding(.vertical, 1)
            .overlay(alignment: .top) { Rectangle().fill(colors.line).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(colors.line).frame(height: 1) }
            .padding(.top, 24)

            finePrint("Indication only. Card issuance is subject to approval and the limit may change before your card is issued.")

            donePill { model.finishReveal(onClose: onClose) }
                .padding(.top, 26)
        }
    }

    // MARK: - Status

    private var statusPhase: some View {
        let colors = theme.colors
        let suspended = model.suspended
        let hasLimit = (model.limitCents ?? 0) > 0 && !suspended
        return VStack(alignment: .leading, spacing: 0) {
            eyebrow(hasLimit ? "PAY IN 4 · PRIORITY ACCESS" : "PAY IN 4 · EARLY ACCESS")
            headline("Your status")
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 0) {
                PayIn4StatusRow(label: "Early-access list", value: "Joined", valueColor: colors.success, icon: "checkmark-circle", lineColor: colors.line)
                PayIn4StatusRow(label: "Card design", value: model.designSaved ? "Saved" : "Not yet", valueColor: colors.ink, lineColor: colors.line)
                if suspended {
                    PayIn4StatusRow(label: "Priority", value: "Paused", valueColor: colors.red, lineColor: colors.line)
                } else {
                    PayIn4StatusRow(
                        label: "Priority",
                        value: hasLimit ? "Front of the list" : "Standard",
                        valueColor: hasLimit ? colors.gold : colors.mut2,
                        lineColor: colors.line
                    )
                }

                if hasLimit {
                    PayIn4SpendingPowerRow(cents: model.limitCents ?? 0)
                } else {
                    Button(action: { model.handlePrimaryTap(hasBank: hasBank) }) {
                        PayIn4StatusRow(
                            label: "Spending power",
                            value: suspended ? "Check again ›" : "Check now ›",
                            valueColor: colors.gold,
                            lineColor: colors.line
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PlainPressStyle())
                    .disabled(model.busy)
                }

                if hasLimit {
                    PayIn4StatusRow(
                        label: "Per installment",
                        value: "up to \(fmtDollars(Int(jsRound(Double(model.limitCents ?? 0) / 4))))",
                        valueColor: colors.ink,
                        lineColor: colors.line
                    )
                }
                PayIn4StatusRow(label: "Launch", value: "We’ll notify you", valueColor: colors.mut2, lineColor: colors.line, last: true)
            }
            .padding(.top, 18)

            if !hasLimit && !suspended {
                BodyText(
                    "Checking your spending power connects a bank read-only, sets a starting limit, and moves you to Priority. Everything else stays as it is.",
                    size: 12.5
                )
                .rnLineHeight(18, family: FontFamily.regular, size: 12.5)
                .padding(.top, 16)
            }
            if suspended {
                BodyText(
                    "A Pay in 4 payment didn’t go through, so new spending power is paused until it’s resolved. Nothing else on your account is affected.",
                    size: 12.5
                )
                .rnLineHeight(18, family: FontFamily.regular, size: 12.5)
                .padding(.top, 16)
            }
            if hasLimit {
                finePrint("Card issuance is subject to approval. Any limit shown is an indication based on the information available now and may change before your card is issued.")
            }

            if !hasLimit {
                errorBanner
                primaryCta(suspended ? "Check again" : "Check spending power", "Checking…")
                    .padding(.top, model.assessmentError ? 14 : 22)
            } else {
                donePill(action: onClose)
                    .padding(.top, 22)
            }
            if !hasLimit {
                laterButton("Done")
            }
        }
    }
}

/// The idle pill's inside: the label (left 56, right 8, vertically centred) fading out over the
/// first 35% of the slide, then the gold circle drawn AFTER it so sliding right covers the label.
/// Animatable so the opacity follows RN's interpolate([0, .35] → [1, 0], clamp) of the slide value
/// exactly, frame by frame.
private struct PayIn4PillContent: View, Animatable {
    var slide: Double
    let label: String
    /// `opening || busy`: the post-slide labels show at full opacity with the circle parked right.
    let labelPinned: Bool
    let distance: CGFloat
    let ink: Color
    let circle: Color

    var animatableData: Double {
        get { slide }
        set { slide = newValue }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Text(label)
                .font(.ezer(FontFamily.bold, 15))
                .foregroundStyle(ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(.leading, 56)
                .padding(.trailing, 8)
                .opacity(labelPinned ? 1 : min(1, max(0, 1 - slide / 0.35)))
            Ionicon("arrow-forward", size: 18, color: Color(css: "#FFFFFF"))
                .frame(width: CIRCLE, height: CIRCLE)
                .background(Circle().fill(circle))
                .offset(x: CIRCLE_MARGIN + CGFloat(slide) * distance, y: CIRCLE_MARGIN)
        }
    }
}

/// StatusRow: label (regular 14, '#8A7F6B') and value (bold 14) split across the row,
/// paddingVertical 15, a hairline×2 top border (and bottom on the last row).
private struct PayIn4StatusRow: View {
    let label: String
    let value: String
    let valueColor: Color
    var icon: String?
    let lineColor: Color
    var last = false

    @Environment(\.displayScale) private var scale

    init(label: String, value: String, valueColor: Color, icon: String? = nil, lineColor: Color, last: Bool = false) {
        self.label = label
        self.value = value
        self.valueColor = valueColor
        self.icon = icon
        self.lineColor = lineColor
        self.last = last
    }

    var body: some View {
        // StyleSheet.hairlineWidth * 2
        let line = 2 / max(scale, 1)
        HStack(alignment: .center, spacing: 0) {
            Text(label)
                .font(.ezer(FontFamily.regular, 14))
                .foregroundStyle(Color(css: "#8A7F6B"))
            Spacer(minLength: 0)
            HStack(alignment: .center, spacing: 6) {
                if let icon { Ionicon(icon, size: 16, color: valueColor) }
                Text(value)
                    .font(.ezer(FontFamily.bold, 14))
                    .foregroundStyle(valueColor)
            }
        }
        .padding(.vertical, 15)
        .padding(.top, line)
        .padding(.bottom, last ? line : 0)
        .overlay(alignment: .top) { Rectangle().fill(lineColor).frame(height: line) }
        .overlay(alignment: .bottom) {
            if last { Rectangle().fill(lineColor).frame(height: line) }
        }
    }
}

/// The 'Spending power' row when a limit exists: rowBase with paddingVertical 12, label in `mut`,
/// the amount in Instrument Serif 30 gold.
private struct PayIn4SpendingPowerRow: View {
    let cents: Int
    @Environment(ThemeStore.self) private var theme
    @Environment(\.displayScale) private var scale

    var body: some View {
        let colors = theme.colors
        let line = 2 / max(scale, 1)
        HStack(alignment: .center, spacing: 0) {
            Text("Spending power")
                .font(.ezer(FontFamily.regular, 14))
                .foregroundStyle(colors.mut)
            Spacer(minLength: 0)
            Text(fmtDollars(cents))
                .font(.ezer(FontFamily.serif, 30))
                .foregroundStyle(colors.gold)
        }
        .padding(.vertical, 12)
        .padding(.top, line)
        .overlay(alignment: .top) { Rectangle().fill(colors.line).frame(height: line) }
    }
}
