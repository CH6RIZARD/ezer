// Port of apps/mobile/app/screens/DrainReview.tsx
//
// =============================================================================
// EZER Redesign — Drain Review / "Top tickets"
//
// Reached from Wallet's "Review card drain" and the Home "Top ticket" tile.
// Ranked strictly by cost (highest burn first) so the podium's #1 always
// matches Home's own "Top ticket" figure — both read the same `subscriptions`
// list, sorted the same way.
//
// Two independent interaction models, per the DRAIN_REVIEW_1D_PATCH spec:
//   - Top 3 (podium): tap the card to MARK it (red outline, scissors reveal).
//     Tap the scissors for a confirm sheet; "Cut it" there is what actually
//     opens the merchant's cancellation page. Tapping a marked card again
//     un-marks it — the "changed my mind / it failed" path.
//   - The other N: a plain three-state row (idle → pending → done). "Cut it"
//     opens the Subscription Detail screen and moves to pending; ✓ confirms (row
//     reds out, struck through); ← undoes an accidental tap.
//
// Cancellation itself is unchanged existing logic — resolveCancellationUrlSync
// / resolveCancellationUrl / openCancellation from Core/Cancellation.swift. This
// screen only decides WHEN to call it, never how a link is resolved.
//
// Persistence + auto-clear (logic, not UI): every mark/cut/rest change is
// mirrored to storage (same AsyncStorage keys, same JSON) so leaving the screen
// never loses red state. A row that goes red is snapshotted (its renewalDate at
// that moment); on every data refresh, if that subscription's renewalDate has
// since moved forward (a new charge posted — the merchant is still live), the
// row's state resets so the user sees it's still active. If instead its due
// date has passed by 2+ days with the subscription's renewal date unchanged (no
// new billing cycle started) — or the subscription has vanished from the
// account entirely — the row is treated as a confirmed cancellation and hidden.
// =============================================================================
//
// RN borders take layout space (Yoga puts children inside border + padding) while rnBox/Surface
// only draw theirs, so every padded box with a border pads by `padding + borderWidth` here.

import SwiftUI

/// 'idle' | 'pending' | 'done' (kept as the stored strings).
private let REST_IDLE = "idle"
private let REST_PENDING = "pending"
private let REST_DONE = "done"

private struct HomeDrainRow: Hashable, Identifiable {
    var id: String
    var merchantId: String
    var name: String
    var logo: String?
    var amountCents: Int
    var website: String?
    var cancellationUrl: String?
    var renewalDate: String?
}

/** A row's renewalDate at the moment it went red, so a later refresh can tell
 *  "still hasn't billed" apart from "billed again, still live." */
private struct HomeDrainSnapshot: Codable, Hashable {
    var renewalDate: String?
    var markedAt: String

    init(renewalDate: String?, markedAt: String) {
        self.renewalDate = renewalDate
        self.markedAt = markedAt
    }

    private enum CodingKeys: String, CodingKey { case renewalDate, markedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        renewalDate = try c.decodeIfPresent(String.self, forKey: .renewalDate)
        markedAt = (try? c.decode(String.self, forKey: .markedAt)) ?? ""
    }

    /// JSON.stringify writes `renewalDate: null`, not a missing key.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(renewalDate, forKey: .renewalDate)
        try c.encode(markedAt, forKey: .markedAt)
    }
}

private let MARKED_KEY = "@ezer_drain_marked"
private let CUT_KEY = "@ezer_drain_cut"
private let REST_KEY = "@ezer_drain_rest"
private let SNAPSHOT_KEY = "@ezer_drain_snapshot"
private let HIDDEN_KEY = "@ezer_drain_hidden"

/** Days past a snapshotted due date, with no sign of a new billing cycle,
 *  before a red row is treated as a confirmed cancellation and hidden. */
private let AUTO_CLEAR_DAYS: Double = 2

private func homeDrainLoadJSON<T: Decodable>(_ key: String, _ fallback: T) -> T {
    KV.getJSON(key, as: T.self) ?? fallback
}

private func homeDrainSaveJSON<T: Encodable>(_ key: String, _ value: T) {
    // A missed persist just means this one toggle doesn't survive a restart —
    // not worth surfacing an error for.
    KV.setJSON(key, value)
}

struct DrainReviewView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    // --- persisted state ---------------------------------------------------
    @State private var marked: [String: Bool] = [:]
    @State private var cut: [String: Bool] = [:]
    @State private var rest: [String: String] = [:]
    @State private var snapshot: [String: HomeDrainSnapshot] = [:]
    @State private var hidden: [String: Bool] = [:]
    @State private var hydrated = false

    // --- cancellation opening ---------------------------------------------------
    @State private var busyId: String?

    // --- top-3 podium interactions ------------------------------------------
    @State private var sheetFor: HomeDrainRow?

    var body: some View {
        let colors = theme.colors
        let rows = allRows
        let top3 = Array(rows.prefix(3))
        let restRows = Array(rows.dropFirst(3))
        // Podium display order per the mock: #2 left, #1 centre (tallest), #3
        // right. Degrades gracefully when there are fewer than 3 subscriptions.
        let podiumOrder = top3.count == 3 ? [top3[1], top3[0], top3[2]] : top3
        let podiumMeta: [(h: CGFloat, logo: CGFloat)] = top3.count == 3
            ? [(176, 36), (208, 46), (164, 36)]
            : top3.map { _ in (h: CGFloat(190), logo: CGFloat(40)) }

        // --- summary + hints ------------------------------------------------------
        let counted = rows.filter { r in
            let state = rest[r.id] ?? ""
            return marked[r.id] == true || (!state.isEmpty && state != REST_IDLE)
        }
        let freed = counted.reduce(0) { $0 + $1.amountCents }
        let anyTopMarked = top3.contains { marked[$0.id] == true }
        let podiumHint = anyTopMarked
            ? "Tap the card again if it failed or you decided not to cancel"
            : "Tap a ticket to see where it drains"

        ZStack {
            ScrollView(.vertical) {
                ScreenBody {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .center, spacing: 0) {
                            PressScale(scaleTo: 0.9, action: { router.back() }) {
                                Ionicon("chevron-back", size: 18, color: colors.ink)
                                    .frame(width: 38, height: 38)
                                    .rnBox(bg: colors.card, radius: 19, border: colors.line)
                            }
                            Text("Top tickets")
                                .typeStyle(TypeScale.screenTitle)
                                .foregroundStyle(colors.ink)
                                .padding(.leading, 12)
                        }
                        .padding(.bottom, 18)

                        if !top3.isEmpty {
                            // --- podium -----------------------------------------------
                            HStack(alignment: .bottom, spacing: 8) {
                                ForEach(Array(podiumOrder.enumerated()), id: \.element.id) { i, row in
                                    podiumColumn(row, meta: podiumMeta[i], rows: rows, colors: colors)
                                }
                            }
                            Text(verbatim: podiumHint)
                                .font(.custom(FontFamily.medium, size: 11))
                                .foregroundStyle(anyTopMarked ? colors.red : colors.mut2)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, minHeight: 14)
                                .padding(.top, 10)
                        }

                        Surface(borderColor: colors.goldLine) {
                            HStack(alignment: .center, spacing: 0) {
                                VStack(alignment: .leading, spacing: 0) {
                                    Label("You could free up", color: colors.gold)
                                    // Rolls up and down, digit by digit, as subs are marked or cut.
                                    // 'baseline' doesn't reach into RollingNumber's columns (it put
                                    // /mo at the top), so bottom-align and lift /mo onto the big
                                    // digits' baseline.
                                    HStack(alignment: .bottom, spacing: 0) {
                                        RollingNumber(value: formatCents(freed), style: TypeScale.totalValue, color: colors.red)
                                        Text("/mo")
                                            .typeStyle(TypeScale.totalValue.size(14))
                                            .foregroundStyle(colors.red)
                                            .padding(.bottom, 8)
                                    }
                                    .padding(.top, 4)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text(verbatim: "\(counted.count) of \(rows.count)\nmarked")
                                    .font(.custom(FontFamily.medium, size: 13))
                                    .foregroundStyle(colors.mut)
                                    .multilineTextAlignment(.trailing)
                                    .rnLineHeight(17, family: FontFamily.medium, size: 13)
                            }
                            .padding(16 + 1)
                        }
                        .padding(.top, 16)

                        if !restRows.isEmpty {
                            // No helper text here — the pill/back-arrow/checkmark controls
                            // on each row already say what they do.
                            HStack(alignment: .lastTextBaseline, spacing: 0) {
                                Label("The other \(restRows.count)")
                                Spacer(minLength: 0)
                            }
                            .padding(.top, 22)
                            .padding(.bottom, 8)

                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(restRows) { row in
                                    restRow(row, colors: colors)
                                }
                            }
                        }

                        if rows.isEmpty {
                            BodyText("Nothing left to review — every subscription here has been dealt with.")
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 24)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.top, insets.top + 10)
                .padding(.horizontal, Layout.screenX)
                .padding(.bottom, Layout.contentBottom)
                .rnNoBounce()
            }
            .scrollIndicators(.hidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colors.bg)
        .rnScreen()
        // --- top-3 confirm sheet ---------------------------------------------
        .rnModal(isPresented: sheetFor != nil, animationType: .slide, onRequestClose: { sheetFor = nil }) {
            HomeDrainCutSheet(row: sheetFor, onClose: { sheetFor = nil }, onCutIt: onSheetCutIt)
        }
        .onAppear(perform: hydrate)
        // Persist on every change, but only once the initial load has landed —
        // otherwise the empty initial state would overwrite whatever was saved.
        .onChange(of: marked) { _, v in if hydrated { homeDrainSaveJSON(MARKED_KEY, v) } }
        .onChange(of: cut) { _, v in if hydrated { homeDrainSaveJSON(CUT_KEY, v) } }
        .onChange(of: rest) { _, v in if hydrated { homeDrainSaveJSON(REST_KEY, v) } }
        .onChange(of: snapshot) { _, v in if hydrated { homeDrainSaveJSON(SNAPSHOT_KEY, v) } }
        .onChange(of: hidden) { _, v in if hydrated { homeDrainSaveJSON(HIDDEN_KEY, v) } }
        // Auto-clear: only re-run when the underlying subscription data actually
        // refreshes (or the initial load lands) — not on every local toggle, which
        // would fight the snapshot it just wrote.
        .onChange(of: data.subscriptions) { _, _ in autoClear() }
    }

    // MARK: - hydrate

    private func hydrate() {
        guard !hydrated else { return }
        marked = homeDrainLoadJSON(MARKED_KEY, [String: Bool]())
        cut = homeDrainLoadJSON(CUT_KEY, [String: Bool]())
        rest = homeDrainLoadJSON(REST_KEY, [String: String]())
        snapshot = homeDrainLoadJSON(SNAPSHOT_KEY, [String: HomeDrainSnapshot]())
        hidden = homeDrainLoadJSON(HIDDEN_KEY, [String: Bool]())
        hydrated = true
        // RN: the auto-clear effect's deps include `hydrated`, so it runs once the load lands.
        onNextRunLoop { autoClear() }
    }

    // MARK: - rows, strictly by cost — #1 here must be Home's own "Top ticket"

    private var allRows: [HomeDrainRow] {
        var priceBySubId: [String: Int] = [:]
        for r in data.risks where r.amountCents > 0 {
            priceBySubId[r.subscriptionId] = r.amountCents
        }

        let withNullableName = data.subscriptions.map { sub -> (row: HomeDrainRow, hasName: Bool) in
            let trimmed = sub.merchantName.trimmingCharacters(in: .whitespacesAndNewlines)
            return (
                HomeDrainRow(
                    id: sub.id,
                    merchantId: sub.merchantId,
                    name: trimmed,
                    logo: sub.logo,
                    amountCents: sub.amountCents ?? priceBySubId[sub.id] ?? 0,
                    website: sub.website,
                    cancellationUrl: sub.cancellationUrl,
                    renewalDate: sub.renewalDate
                ),
                !trimmed.isEmpty
            )
        }

        // Same rule as before: no name and no price is a sync artefact, not a
        // subscription the user can act on.
        // Array.prototype.sort is stable: equal amounts keep their list order.
        return withNullableName
            .filter { $0.hasName && $0.row.amountCents > 0 }
            .map { $0.row }
            .filter { hidden[$0.id] != true }
            .enumerated()
            .sorted { a, b in
                a.element.amountCents != b.element.amountCents
                    ? a.element.amountCents > b.element.amountCents
                    : a.offset < b.offset
            }
            .map { $0.element }
    }

    // MARK: - auto-clear + re-charge reset, on every fresh subscriptions load

    private func autoClear() {
        if !hydrated { return }
        let snapIds = Array(snapshot.keys)
        if snapIds.isEmpty { return }

        let now = nowMs()
        var changed = false
        var nextSnap = snapshot
        var nextCut = cut
        var nextRest = rest
        var nextMarked = marked
        var nextHidden = hidden

        for id in snapIds {
            guard let snap = snapshot[id] else { continue }
            guard let sub = data.subscriptions.first(where: { $0.id == id }) else {
                // Gone from the account entirely — the strongest possible signal
                // that it's actually cancelled. Stop tracking it; it's already
                // filtered out of allRows once hidden is set, so hide it too.
                nextSnap.removeValue(forKey: id)
                nextHidden[id] = true
                changed = true
                continue
            }

            let currentRenewal = sub.renewalDate
            if let currentRenewal, !currentRenewal.isEmpty,
               let snapRenewal = snap.renewalDate, !snapRenewal.isEmpty,
               currentRenewal != snapRenewal {
                // Renewal date moved forward since this row went red — a new
                // billing cycle started, so the merchant is still charging. Reset
                // every bit of this row's state rather than leaving it stuck red.
                nextSnap.removeValue(forKey: id)
                nextCut.removeValue(forKey: id)
                nextRest.removeValue(forKey: id)
                nextMarked.removeValue(forKey: id)
                changed = true
                continue
            }

            if let snapRenewal = snap.renewalDate, !snapRenewal.isEmpty,
               let due = parseLocalDay(snapRenewal) {
                // renewalDate is a calendar day at UTC midnight; parse it as a local
                // day so "2+ days past due" doesn't shift by a timezone offset.
                let daysPast = (now - due.timeIntervalSince1970 * 1000) / 86_400_000
                if daysPast >= AUTO_CLEAR_DAYS {
                    // Due date passed with no new cycle — confirmed cancelled.
                    nextSnap.removeValue(forKey: id)
                    nextHidden[id] = true
                    changed = true
                }
            }
        }

        if changed {
            snapshot = nextSnap
            cut = nextCut
            rest = nextRest
            marked = nextMarked
            hidden = nextHidden
        }
    }

    private func snapshotRow(_ row: HomeDrainRow) {
        snapshot[row.id] = HomeDrainSnapshot(renewalDate: row.renewalDate, markedAt: toISOString(Date()))
    }

    // MARK: - cancellation opening (existing logic, unchanged resolution order)

    private func openCancellationFor(_ row: HomeDrainRow) {
        if let quick = resolveCancellationUrlSync(row.name, row.merchantId, row.cancellationUrl) {
            Task { _ = await openCancellation(quick) }
            return
        }
        busyId = row.id
        Task {
            let target = await resolveCancellationUrl(row.name, row.merchantId, row.cancellationUrl, row.website)
            _ = await openCancellation(target)
            busyId = nil
        }
    }

    // MARK: - top-3 podium interactions

    private func onCardTap(_ row: HomeDrainRow) {
        if marked[row.id] == true {
            // Un-mark. The "failed / changed my mind" path — also clears any
            // in-flight cut/snapshot so a re-mark starts clean.
            marked.removeValue(forKey: row.id)
            cut.removeValue(forKey: row.id)
            snapshot.removeValue(forKey: row.id)
        } else {
            marked[row.id] = true
        }
    }

    private func onSheetCutIt() {
        guard let row = sheetFor else { return }
        cut[row.id] = true
        snapshotRow(row)
        openCancellationFor(row)
        sheetFor = nil
    }

    // MARK: - "the other N" row interactions
    //
    // "Cut it" here does NOT open a cancellation link directly — unlike the
    // podium sheet above (that's the confirmed "yes, cut this" moment). These
    // are the rows the user hasn't looked at yet, so it opens the real in-app
    // subscription screen instead — the one with the price-over-time chart and
    // full charge history — and cancellation itself happens from there, via that
    // screen's own existing Cancel action. Marking this row 'pending' here just
    // means "sent to review"; the ✓/← still resolve it on return.

    private func onRestCutIt(_ row: HomeDrainRow) {
        rest[row.id] = REST_PENDING
        router.push("/screens/SubscriptionDetail", ["id": row.id])
    }

    private func onRestBack(_ row: HomeDrainRow) {
        rest[row.id] = REST_IDLE
    }

    private func onRestConfirm(_ row: HomeDrainRow) {
        rest[row.id] = REST_DONE
        snapshotRow(row)
    }

    /** The small X on a "Cancelled" pill — reverts a row confirmed by mistake.
     *  Clears the snapshot too, not just the rest state: leaving a stale one
     *  behind would let the AUTO_CLEAR_DAYS check hide this row again a
     *  couple of days later, silently undoing the very undo the user just did. */
    private func onRestUndo(_ row: HomeDrainRow) {
        rest[row.id] = REST_IDLE
        snapshot.removeValue(forKey: row.id)
    }

    // MARK: - podium column

    private func podiumColumn(_ row: HomeDrainRow, meta: (h: CGFloat, logo: CGFloat), rows: [HomeDrainRow], colors: ThemeColors) -> some View {
        let isMarked = marked[row.id] == true
        let isCut = cut[row.id] == true
        let rank = rows.first?.id == row.id
            ? "#1 · TOP TICKET"
            : "#\((rows.firstIndex(where: { $0.id == row.id }) ?? -1) + 1)"
        let label = isCut
            ? "TAP ✂ AGAIN IF NOT CANCELLED"
            : isMarked
            ? "TAP ✂ TO CUT"
            : "TAP TO SEE"

        return PressScale(scaleTo: 0.97, action: { onCardTap(row) }) {
            VStack(alignment: .center, spacing: 7) {
                Text(verbatim: rank)
                    .font(.custom(FontFamily.bold, size: 9.5))
                    .tracking(0.4)
                    .foregroundStyle(colors.gold)
                    .lineLimit(1)
                MerchantMark(name: row.name, merchantId: row.merchantId, size: meta.logo, logoUrl: row.logo)
                Text(verbatim: row.name)
                    .font(.custom(FontFamily.bold, size: 12))
                    .foregroundStyle(colors.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .rnLineHeight(14, family: FontFamily.bold, size: 12)
                Text(verbatim: formatCents(row.amountCents))
                    .font(.custom(FontFamily.serif, size: 21))
                    .foregroundStyle(colors.red)
                    .lineLimit(1)
                Text(verbatim: label)
                    .font(.custom(FontFamily.bold, size: 9.5))
                    .foregroundStyle(isMarked ? colors.red : colors.mut)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
            }
            .padding(.vertical, 14 + 1.5)
            .padding(.horizontal, 8 + 1.5)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .background(rnRect(20).fill(isMarked ? Color(css: theme.tokens.red + "29") : colors.card))
            .overlay(rnRect(20).strokeBorder(isMarked ? colors.red : colors.line, lineWidth: 1.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .frame(height: meta.h)
        .overlay(alignment: .topTrailing) {
            if isMarked {
                Button {
                    sheetFor = row
                } label: {
                    Ionicon("cut", size: 14, color: isCut ? Color(css: "#FFFFFF") : colors.mut)
                        .frame(width: 28, height: 28)
                        .rnBox(bg: isCut ? colors.red : colors.bg, radius: 9, border: isCut ? colors.red : colors.line2)
                        .padding(6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PlainPressStyle())
                .padding(-6)
                .padding(.top, 8)
                .padding(.trailing, 8)
            }
        }
    }

    // MARK: - rest row

    private func restRow(_ row: HomeDrainRow, colors: ThemeColors) -> some View {
        let state = rest[row.id] ?? REST_IDLE
        let done = state == REST_DONE

        return Surface(
            borderColor: done ? colors.red : Color(css: "transparent"),
            background: done ? Color(css: theme.tokens.red + "29") : nil
        ) {
            HStack(alignment: .center, spacing: 12) {
                MerchantMark(name: row.name, merchantId: row.merchantId, size: 30, logoUrl: row.logo)
                    .opacity(done ? 0.55 : 1)
                Text(verbatim: row.name)
                    .strikethrough(done)
                    .font(.custom(FontFamily.semibold, size: 13.5))
                    .foregroundStyle(colors.ink)
                    .opacity(done ? 0.55 : 1)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: formatCents(row.amountCents))
                    .font(.custom(FontFamily.regular, size: 12.5))
                    .foregroundStyle(colors.mut)
                    .opacity(done ? 0.55 : 1)

                if state == REST_IDLE {
                    PressScale(scaleTo: 0.94, action: { onRestCutIt(row) }) {
                        Text("Cut it")
                            .font(.custom(FontFamily.bold, size: 11))
                            .foregroundStyle(colors.ink)
                            .padding(.horizontal, 12 + 1.5)
                            .frame(minHeight: 30)
                            .rnBox(radius: 10, border: colors.line2, borderWidth: 1.5)
                    }
                }

                if state == REST_PENDING {
                    HStack(alignment: .center, spacing: 6) {
                        Button {
                            onRestBack(row)
                        } label: {
                            Ionicon("arrow-undo", size: 14, color: colors.mut)
                                .frame(width: 30, height: 30)
                                .rnBox(radius: 10, border: colors.line2, borderWidth: 1.5)
                                .padding(6)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PlainPressStyle())
                        .padding(-6)
                        Button {
                            onRestConfirm(row)
                        } label: {
                            Ionicon("checkmark", size: 16, color: Color(css: "#FFFFFF"))
                                .frame(width: 30, height: 30)
                                .rnBox(bg: colors.red, radius: 10, border: colors.red, borderWidth: 1.5)
                                .padding(6)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PlainPressStyle())
                        .padding(-6)
                    }
                }

                if done {
                    Text("Cancelled")
                        .font(.custom(FontFamily.bold, size: 11))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                        .padding(.horizontal, 12 + 1.5)
                        .frame(minHeight: 30)
                        .rnBox(bg: colors.red, radius: 10, border: colors.red, borderWidth: 1.5)
                        // Undo for a mistaken confirm — the auto-revert already handles
                        // "it actually billed again," this is for "I didn't mean to tap ✓."
                        .overlay(alignment: .topTrailing) {
                            Button {
                                onRestUndo(row)
                            } label: {
                                Ionicon("close", size: 10, color: Color(css: "#FFFFFF"))
                                    .frame(width: 16, height: 16)
                                    .rnBox(bg: colors.ink, radius: 8, border: colors.bg, borderWidth: 1.5)
                                    .padding(8)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(PlainPressStyle())
                            .padding(-8)
                            .offset(x: 6, y: -6)
                        }
                }
            }
            .padding(10 + 1)
        }
    }
}

// MARK: - the confirm sheet (RN <Modal transparent animationType="slide">)

private struct HomeDrainCutSheet: View {
    let row: HomeDrainRow?
    let onClose: () -> Void
    let onCutIt: () -> Void

    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets

    var body: some View {
        let colors = theme.colors

        ZStack(alignment: .bottom) {
            Button(action: onClose) {
                colors.scrim
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())

            if let row {
                VStack(alignment: .leading, spacing: 0) {
                    rnRect(Radius.pill)
                        .fill(colors.line2)
                        .frame(width: 38, height: 4)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 12)

                    HStack(alignment: .center, spacing: 0) {
                        MerchantMark(name: row.name, merchantId: row.merchantId, size: 40, logoUrl: row.logo)
                        // flex 1 + minWidth 0: a long name wraps inside the sheet instead
                        // of pushing past its right edge (a raw bank descriptor did).
                        VStack(alignment: .leading, spacing: 0) {
                            Text(verbatim: row.name)
                                .font(.custom(FontFamily.bold, size: 15))
                                .foregroundStyle(colors.ink)
                                .lineLimit(2)
                            Text(verbatim: "\(formatCents(row.amountCents))/mo")
                                .font(.custom(FontFamily.regular, size: 12))
                                .foregroundStyle(colors.mut)
                                .padding(.top, 2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 12)
                    }

                    BodyText("Cut it opens \(row.name)\u{2019}s cancellation right now. Go back if you\u{2019}ve changed your mind.")
                        .rnLineHeight(19, TypeScale.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 14)

                    GeometryReader { g in
                        // flex 1 : flex 1.4 with gap 8
                        let w = max(0, g.size.width - 8)
                        HStack(alignment: .center, spacing: 8) {
                            PressScale(action: onClose) {
                                Text("Go back")
                                    .font(.custom(FontFamily.bold, size: 13))
                                    .foregroundStyle(colors.ink)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 44)
                                    .rnBox(radius: 14, border: colors.line2, borderWidth: 1.5)
                            }
                            .frame(width: w * 1 / 2.4)
                            PressScale(action: onCutIt) {
                                Text("Cut it")
                                    .font(.custom(FontFamily.bold, size: 13))
                                    .foregroundStyle(Color(css: "#FFFFFF"))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 44)
                                    .rnBox(bg: colors.red, radius: 14)
                            }
                            .frame(width: w * 1.4 / 2.4)
                        }
                    }
                    .frame(height: 44)
                    .padding(.top, 16)
                }
                .padding(.horizontal, Layout.screenX + 1)
                .padding(.top, 10 + 1)
                .padding(.bottom, insets.bottom + 20 + 1)
                .background(rnRect(topLeading: 22, topTrailing: 22).fill(colors.card))
                .overlay(rnRect(topLeading: 22, topTrailing: 22).strokeBorder(colors.line, lineWidth: 1))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .debugScreenCapture("drain-cut-sheet")
    }
}
