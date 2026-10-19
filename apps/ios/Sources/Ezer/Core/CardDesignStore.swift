// Port of apps/mobile/utils/cardDesignStore.ts
//
// Local-first store for the ONE physical card design, plus the Card Studio access outcome, the
// Spending Power outcome (its OWN key — CLAUDE.md) and the reveal-seen flag:
//   · UserDefaults is written FIRST and is the source of truth for the UI.
//   · The API POST is best-effort. A failure never throws, never loses data, never blocks
//     navigation — the record is left unsynced and retried on the next save / syncPendingCardDesign().
// Same keys and JSON shapes as RN: `@ezer_card_design`, `@ezer_spending_power_access`,
// `@ezer_spending_power_reveal_seen`.
//
//   let saved = await CardDesignStore.saveCardDesign(design)        // { id }
//   let outcome = await CardDesignStore.loadSpendingPowerOutcome()
//
// Type names: the physical design is `CardDesign` / `CardStroke`; the Wallet card-art look is
// `CardArtDesign` (Core/CardArt) — the two TS modules both said "CardDesign".

import Foundation

struct CardStroke: Codable, Hashable, Sendable {
    var d: String
    var color: String
    var width: Double
}

struct CardDesign: Codable, Hashable, Sendable {
    var finish: String
    var strokes: [CardStroke]
    /** ISO timestamp of when the user last edited the artwork. */
    var updatedAt: String
}

/**
 * Result of going through PhysicalCardApproval once — decides whether "Get your physical card"
 * reopens the raw designer or shows the finished design.
 */
struct CardAccessOutcome: Codable, Hashable, Sendable {
    /// 'suspended' = an uncured missed Pay in 4 payment (restricted tightly).
    enum Status: String, Codable, Sendable { case approved, review, waitlist, suspended }
    var status: Status
    var limitCents: Int?
    var joinedAt: String

    /// JSON.stringify keeps `limitCents: null`; so does this.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.encode(status, forKey: AnyKey("status"))
        try c.encode(limitCents, forKey: AnyKey("limitCents"))
        try c.encode(joinedAt, forKey: AnyKey("joinedAt"))
    }
}

enum CardDesignStore {
    private static let STORAGE_KEY = "@ezer_card_design"

    private struct StoredRecord: Codable {
        /// Server id once synced, otherwise a locally-generated `local_…` id.
        var id: String
        var design: CardDesign
        /// False while the design still owes the server a POST.
        var synced: Bool
        /// Set once the user has been through the approval flow to a terminal state.
        var access: CardAccessOutcome?
    }

    /** Locally-minted id. Prefixed so unsynced ids are never mistaken for server ids. */
    private static func localId() -> String {
        let t = String(Int(nowMs()), radix: 36)
        let r = String(UInt64.random(in: 0..<2_176_782_336), radix: 36) // 6 base-36 chars
        return "local_\(t)_\(r)"
    }

    static func isLocalId(_ id: String) -> Bool { id.hasPrefix("local_") }

    private static func parseOutcome(_ j: JSON?) -> CardAccessOutcome? {
        guard let j, case .object = j,
              let s = j["status"]?.stringValue, let status = CardAccessOutcome.Status(rawValue: s),
              let joinedAt = j["joinedAt"]?.stringValue
        else { return nil }
        let lc = j["limitCents"]
        // RN accepts null or a number; a missing key is tolerated here too.
        if let lc, !lc.isNull, lc.doubleValue == nil { return nil }
        return CardAccessOutcome(status: status, limitCents: lc?.intValue, joinedAt: joinedAt)
    }

    private static func readRecord() -> StoredRecord? {
        guard let raw = KV.get(STORAGE_KEY), let data = raw.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(JSON.self, from: data)
        else { return nil }
        // Defensive: a shape change from an older build degrades to "no saved design".
        guard let design = parsed["design"],
              let finish = design["finish"]?.stringValue,
              case let .array(strokesJSON)? = design["strokes"],
              let updatedAt = design["updatedAt"]?.stringValue,
              let id = parsed["id"]?.stringValue
        else { return nil }
        let strokes: [CardStroke] = strokesJSON.compactMap { s in
            guard let d = s["d"]?.stringValue, let color = s["color"]?.stringValue, let w = s["width"]?.doubleValue else { return nil }
            return CardStroke(d: d, color: color, width: w)
        }
        return StoredRecord(
            id: id,
            design: CardDesign(finish: finish, strokes: strokes, updatedAt: updatedAt),
            synced: parsed["synced"]?.boolValue == true,
            access: parseOutcome(parsed["access"])
        )
    }

    private static func writeRecord(_ r: StoredRecord) {
        KV.setJSON(STORAGE_KEY, r)
    }

    /**
     * Best-effort upload. The server id, or nil on any failure — callers treat nil as
     * "still queued", never as an error to surface.
     */
    private static func pushToApi(_ design: CardDesign) async -> String? {
        do {
            let r = try await api.getOrPostDesign(design)
            return (r?.isEmpty == false) ? r : nil
        } catch {
            return nil
        }
    }

    // -------------------------------------------------------------------------

    /**
     * Persist the design: the local write must not fail; the network call is opportunistic.
     * Returns a server id when the POST succeeded, a `local_…` id otherwise. Never throws.
     */
    /// RN returned `{ id }`; this returns the id itself.
    @discardableResult
    static func saveCardDesign(_ design: CardDesign) async -> String {
        // Redrawing the artwork does not change a bank-approval outcome the user already has.
        let access = readRecord()?.access
        let pending = localId()
        // Write locally FIRST and unsynced, so a crash mid-request still leaves the artwork.
        writeRecord(StoredRecord(id: pending, design: design, synced: false, access: access))

        guard let serverId = await pushToApi(design) else { return pending }
        writeRecord(StoredRecord(id: serverId, design: design, synced: true, access: access))
        return serverId
    }

    /** The saved design, or nil if nothing has ever been saved. Never throws. */
    static func loadCardDesign() -> CardDesign? { readRecord()?.design }

    /**
     * Port of RN's readOrRestore: the local design, else the signed-in user's latest one from
     * GET /cards/designs/latest, written locally once found. Without it a reinstall, the other
     * phone or a sign-out reopened a blank canvas ("I've designed it many times"). The readers
     * above are sync, so screens await this first. Never throws.
     */
    @discardableResult
    static func restoreFromServerIfMissing() async -> CardDesign? {
        if let local = readRecord() { return local.design }
        guard let d = try? await api.latestDesign(), let id = d.id, let finish = d.finish, let strokes = d.strokes
        else { return nil }
        // A save made while the request was in flight wins.
        if let local = readRecord() { return local.design }
        let design = CardDesign(finish: finish, strokes: strokes, updatedAt: d.updatedAt ?? toISOString(Date()))
        writeRecord(StoredRecord(id: id, design: design, synced: true, access: nil))
        return design
    }

    /** Id of the saved design, or nil. A `local_…` id means the server has not seen it yet. */
    static func getCardDesignId() -> String? { readRecord()?.id }

    /** Retry a queued upload. Server id on success, else nil. Never throws. */
    static func syncPendingCardDesign() async -> String? {
        guard let record = readRecord() else { return nil }
        if record.synced && !isLocalId(record.id) { return record.id }
        guard let serverId = await pushToApi(record.design) else { return nil }
        writeRecord(StoredRecord(id: serverId, design: record.design, synced: true, access: record.access))
        return serverId
    }

    /** The saved approval outcome, or nil. Never throws. */
    static func getCardAccessOutcome() -> CardAccessOutcome? { readRecord()?.access }

    /** Record a terminal approval outcome against the current design; no-op without a saved design. */
    static func saveCardAccessOutcome(_ access: CardAccessOutcome) {
        guard var record = readRecord() else { return }
        record.access = access
        writeRecord(record)
    }

    static func mapServerStatus(_ status: String?) -> CardAccessOutcome.Status? {
        switch status {
        case "approved_pending_issuance": return .approved
        case "manual_review": return .review
        case "waitlist": return .waitlist
        case "suspended": return .suspended
        default: return nil
        }
    }

    /**
     * Read the decision back from GET /cards/access-list — the fallback when the local mirror is
     * empty (reinstall, second device). nil = nothing to find or the request failed.
     */
    static func fetchServerAccessOutcome() async -> CardAccessOutcome? {
        do {
            guard let payload = try await api.accessListRecord(),
                  let status = mapServerStatus(payload.status)
            else { return nil }
            return CardAccessOutcome(status: status, limitCents: payload.limitCents, joinedAt: payload.joinedAt ?? toISOString(Date()))
        } catch {
            return nil
        }
    }

    /**
     * Mirror a server-recovered outcome onto local storage ONLY when a local design record already
     * exists — never invent a blank placeholder design (PhysicalCardReview would render it as
     * "your design").
     */
    static func mirrorServerAccessOutcome(_ access: CardAccessOutcome) {
        guard var existing = readRecord() else { return }
        existing.access = access
        writeRecord(existing)
    }

    /** Wipe the saved design. Used by "start over" and sign-out. */
    static func clearCardDesign() { KV.remove(STORAGE_KEY) }

    // ---------------------------------------------------------------------------
    // Spending Power outcome — INTENTIONALLY its own key, separate from the design record.

    private static let SPENDING_POWER_KEY = "@ezer_spending_power_access"

    /** The locally-cached Spending Power outcome, or nil. */
    static func getSpendingPowerOutcome() -> CardAccessOutcome? {
        guard let raw = KV.get(SPENDING_POWER_KEY), let data = raw.data(using: .utf8),
              let j = try? JSONDecoder().decode(JSON.self, from: data)
        else { return nil }
        return parseOutcome(j)
    }

    /**
     * The Spending Power outcome: the local cache, else the server's decision (cached here once
     * found), else nil. Never throws.
     *
     * The server fallback is load-bearing (CLAUDE.md). The key is only a mirror; a reinstall,
     * another phone, or a Card Studio assessment leaves it empty while GET /cards/access-list
     * has the decision. Without it Home (HomeCardFlowStatus, which always fell back) said $25.00
     * and the sheet said "Your number is still a blank", and the Pay in 4 CTA POSTed a waitlist
     * join that buried the approval. RN's getSpendingPowerOutcome does this itself; here it is
     * a separate async function because SpendingPowerSheet reads the sync cache above, so
     * PayIn4View awaits this before opening the sheet (which fills the key the sheet reads).
     * Every other reader (Pay in 4 CTA label, Linked banks, Card Studio's carry-over) calls
     * this, not the cache. Keep it.
     */
    static func loadSpendingPowerOutcome() async -> CardAccessOutcome? {
        if let local = getSpendingPowerOutcome() { return local }
        let server = await fetchServerAccessOutcome()
        if let server { saveSpendingPowerOutcome(server) }
        return server
    }

    /** Wipe the cached outcome and its reveal flag. Sign-out (AuthStore.logout) uses it, so one
     *  account's limit never shows for the next account on this device. */
    static func clearSpendingPowerOutcome() {
        KV.remove(SPENDING_POWER_KEY)
        KV.remove(REVEAL_SEEN_KEY)
    }

    /** Persist a fresh Spending Power outcome — after EVERY successful POST /cards/access-list. */
    static func saveSpendingPowerOutcome(_ access: CardAccessOutcome) {
        KV.setJSON(SPENDING_POWER_KEY, access)
    }

    /** Whether the one-time "reveal" (the big serif $ number) has played on this device. */
    private static let REVEAL_SEEN_KEY = "@ezer_spending_power_reveal_seen"

    static func getSpendingPowerRevealSeen() -> Bool { KV.get(REVEAL_SEEN_KEY) == "1" }

    static func markSpendingPowerRevealSeen() { KV.set(REVEAL_SEEN_KEY, "1") }
}

/// GET /cards/designs/latest's `data`: every field optional, checked by the caller.
private struct LatestDesignPayload: Decodable {
    let id: String?
    let finish: String?
    let strokes: [CardStroke]?
    let updatedAt: String?
}

private extension APIClient {
    /// The signed-in user's newest saved design, or nil.
    func latestDesign() async throws -> LatestDesignPayload? {
        let r: Envelope<LatestDesignPayload> = try await get("/cards/designs/latest")
        return r.data
    }

    /// POST /cards/designs, tolerating both `{ data: { id } }` and a bare `{ id }`.
    func getOrPostDesign(_ design: CardDesign) async throws -> String? {
        var body: [String: JSON] = ["finish": .string(design.finish), "strokes": JSON(encoding: design.strokes)]
        body["updatedAt"] = .string(design.updatedAt)
        let r = try await post("/cards/designs", .object(body))
        return r["data"]?["id"]?.stringValue ?? r["id"]?.stringValue
    }
}
