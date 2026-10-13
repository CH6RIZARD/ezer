// Port of apps/mobile/utils/linkedBanks.ts
//
// Settings' "Linked banks" data, shared between settings/linked-banks.tsx, screens/BankDetail.tsx
// and PayIn4AccountPicker.tsx so all three read the exact same shape GET /plaid/linked-banks
// returns (apps/api/src/routes/plaid.ts).
//
// The TYPES (LinkedBankAccount / LinkedBankItem / LinkedBanksData) live in Core/API/Models.swift;
// this file ports only the functions, namespaced so their RN names cannot collide module-wide.

import Foundation

enum SettingsLinkedBanks {
    static func fetchLinkedBanks() async -> LinkedBanksData? {
        do {
            return try await api.linkedBanks()
        } catch {
            return nil
        }
    }

    /** The one FundingInstrument.id a bank's row holds that funds Pay in 4, if any. */
    static func payIn4AccountFor(_ item: LinkedBankItem) -> LinkedBankAccount? {
        item.accounts.first { $0.isPayIn4 }
    }

    /// `(name || '?').trim().charAt(0).toUpperCase() || '?'`
    static func initialFor(_ name: String?) -> String {
        let base = (name?.isEmpty == false) ? name! : "?"
        guard let ch = base.trimmingCharacters(in: .whitespacesAndNewlines).first else { return "?" }
        let up = String(ch).uppercased()
        return up.isEmpty ? "?" : up
    }

    /**
     * The bank's own brand color for its initial tile, from the SAME catalog `utils/cardArt` already
     * uses to tint a linked card's art (`matchIssuer`) — not an invented per-bank palette. nil for a
     * bank not in the catalog; callers fall back to a neutral theme color (`colors.accInk`).
     */
    static func tintFor(_ institutionName: String?) -> String? {
        matchIssuer(institutionName)?.primary
    }
}

private let settingsMonthYearFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMMyyyy")
    return f
}()

/// `new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })` -> "October 2026"
/// (settings.tsx "Member since", BankDetail.tsx "Connected via Plaid · …"). JS prints
/// "Invalid Date" for a string it cannot parse; so does this.
func settingsMonthYear(_ iso: String) -> String {
    guard let d = parseISODate(iso) else { return "Invalid Date" }
    return settingsMonthYearFormatter.string(from: d)
}
