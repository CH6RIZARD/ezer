// Port of apps/mobile/utils/usePlaid.ts
//
// Plaid Link: POST /plaid/create-link-token -> open Link -> POST /plaid/exchange-public-token
// (optional purpose 'pay_in_4') ; GET /plaid/accounts ; errors -> AppAlert.
//
//   @State private var plaid = PlaidLinkModel()
//   await plaid.openPlaidLink(onSuccess: { result in ... }, onExit: { exit in ... }, purpose: "pay_in_4")
//
// TODO(native): Plaid LinkKit (https://github.com/plaid/plaid-link-ios-spm) is NOT linked in this
// build. toolchain.md §6 verified it links and embeds with xtool (runtime untested). Until it is
// wired, openPlaidLink fails VISIBLY through AppAlert after the link token is created, exactly where
// the RN app reported a missing native module — it never fakes success. Wiring it means replacing
// `openLinkKit` below with:
//     var config = LinkTokenConfiguration(token: linkToken) { success in ... }
//     config.onExit = { exit in ... }
//     let handler = try Plaid.create(config).get(); handler.open(presentUsing: .viewController(topVC))
// and mapping success.metadata (institution id/name, accounts) into PlaidLinkSuccess.

import Foundation
import Observation

struct PlaidAccount: Hashable, Sendable {
    var id: String
    var name: String
    var mask: String
    /// 'checking' | 'savings' | 'credit' | 'investment' | 'other'
    var type: String
    var subtype: String
    var institutionId: String
    var institutionName: String
}

struct PlaidLinkSuccess: Sendable {
    var publicToken: String
    var accounts: [PlaidAccount]
    var institutionId: String
    var institutionName: String
}

struct PlaidLinkExit: Sendable {
    struct LinkError: Sendable {
        var errorCode: String
        var errorMessage: String
    }
    var error: LinkError?
}

@Observable
@MainActor
final class PlaidLinkModel {
    private(set) var isLoading = false
    private(set) var linkedAccounts: [PlaidAccount] = []
    private(set) var error: String?

    /// - purpose: UI grouping label only, e.g. 'pay_in_4' — see FundingInstrument.purpose. nil for a general link.
    func openPlaidLink(
        onSuccess: ((PlaidLinkSuccess) async -> Void)? = nil,
        onExit: ((PlaidLinkExit) -> Void)? = nil,
        purpose: String? = nil
    ) async {
        isLoading = true
        error = nil
        do {
            guard let linkToken = try await api.createLinkToken() else {
                throw APIError(message: "Could not start bank linking. Please try again.", status: nil)
            }
            try await openLinkKit(linkToken: linkToken, onSuccess: onSuccess, onExit: onExit, purpose: purpose)
        } catch {
            // Thrown here means the link-token request failed before Plaid Link ever had a chance
            // to open. Without this Alert, tapping "Connect Bank" against a misconfigured or
            // unreachable API silently does nothing.
            AppAlert.alert("Bank Linking Unavailable", error.message.isEmpty ? "Could not start bank linking. Please try again." : error.message)
            isLoading = false
            self.error = error.message
        }
    }

    /// The native Link step. Without LinkKit this reports, as RN did for a missing native module,
    /// and returns WITHOUT firing onSuccess/onExit (useConnectBank relies on that).
    private func openLinkKit(
        linkToken: String,
        onSuccess: ((PlaidLinkSuccess) async -> Void)?,
        onExit: ((PlaidLinkExit) -> Void)?,
        purpose: String?
    ) async throws {
        _ = linkToken
        // TODO(native): Plaid LinkKit. RN's copy here ("requires a development build (not Expo Go).
        // Run `eas build --profile development`") is Expo-specific and would mislead on iOS.
        AppAlert.alert("Bank Linking", "Bank linking needs Plaid Link, which this iOS build does not include yet.", [AlertButton("OK")])
        isLoading = false
    }

    /// Runs after LinkKit's onSuccess: exchange, record accounts, then the caller's onSuccess.
    /// (Kept so wiring LinkKit is a one-function change.)
    func handleLinkSuccess(_ success: PlaidLinkSuccess, purpose: String?, onSuccess: ((PlaidLinkSuccess) async -> Void)?) async {
        endInAppFlow()
        do {
            let accountsJSON: JSON = .array(success.accounts.map {
                [
                    "id": .string($0.id), "name": .string($0.name), "mask": .string($0.mask), "type": .string($0.type),
                    "subtype": .string($0.subtype), "institutionId": .string($0.institutionId), "institutionName": .string($0.institutionName),
                ]
            })
            _ = try await api.exchangePublicToken(
                publicToken: success.publicToken,
                institutionId: success.institutionId,
                institutionName: success.institutionName,
                accounts: accountsJSON,
                purpose: purpose
            )
            isLoading = false
            linkedAccounts += success.accounts
            await onSuccess?(success)
        } catch {
            isLoading = false
            self.error = error.message
        }
    }

    func handleLinkExit(_ exit: PlaidLinkExit, onExit: ((PlaidLinkExit) -> Void)?) {
        endInAppFlow()
        isLoading = false
        onExit?(exit)
    }

    func syncAccounts() async {
        do { try await api.post("/plaid/sync", timeout: PLAID_TIMEOUT) } catch {
            print("[usePlaid] sync error:", error.message)
        }
    }

    func fetchLinkedAccounts() async {
        do {
            let items = try await api.plaidAccounts()
            linkedAccounts = items.flatMap { item in
                item.accounts.map {
                    PlaidAccount(
                        id: $0.id, name: $0.name, mask: $0.mask ?? "", type: $0.type, subtype: $0.subtype ?? "",
                        institutionId: item.institutionId ?? "", institutionName: item.institutionName ?? ""
                    )
                }
            }
        } catch {
            print("[usePlaid] fetch accounts error:", error.message)
        }
    }

    func clearError() { error = nil }
}
