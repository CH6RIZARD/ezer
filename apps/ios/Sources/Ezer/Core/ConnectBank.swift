// Port of apps/mobile/utils/useConnectBank.ts
//
// The one bank-connect flow, shared by every entry point (Home's connect tile, Settings ›
// Linked banks, the Pay in 4 account picker):
//   1. create a Link token  2. open Plaid Link  3. exchange the public token
//   4. SYNC, then REFRESH (POST /plaid/sync, then DataStore.refresh) — the step easy to forget.
//
//   @State private var connect = ConnectBank()
//   @Environment(DataStore.self) private var data
//   Button { Task { await connect.connect(data: data) } } ...
//   connect.busy / connect.label / connect.error / ConnectBank.connected(data)

import Foundation
import Observation

enum ConnectStage: String, Sendable { case idle, linking, syncing, done, error }

@Observable
@MainActor
final class ConnectBank {
    private(set) var stage: ConnectStage = .idle
    private(set) var error: String?
    private let plaid = PlaidLinkModel()

    var busy: Bool { stage == .linking || stage == .syncing }

    var label: String? {
        switch stage {
        case .linking: return "Opening your bank…"
        case .syncing: return "Finding subscriptions…"
        default: return nil
        }
    }

    /// `connected` in the hook: anything linked or detected yet.
    static func connected(_ data: DataStore) -> Bool {
        !data.instruments.isEmpty || !data.subscriptions.isEmpty
    }

    func connect(data: DataStore, onDone: (() -> Void)? = nil) async {
        error = nil
        stage = .linking

        // openPlaidLink can return WITHOUT ever firing onSuccess or onExit (Link never opened).
        // This guarantees a terminal state instead of "Opening your bank…" forever.
        var settled = false
        let finish = { (next: ConnectStage, message: String?) in
            settled = true
            if let message { self.error = message }
            self.stage = next
        }

        await plaid.openPlaidLink(
            // --- success: exchange already happened inside PlaidLinkModel ---
            onSuccess: { _ in
                self.stage = .syncing
                do {
                    // Pull transactions and run recurring detection.
                    try await api.post("/plaid/sync", timeout: PLAID_TIMEOUT)
                } catch {
                    // Recoverable — the item IS linked; a later sync picks the transactions up.
                    print("[useConnectBank] sync failed:", error.message)
                }
                await data.refresh()
                finish(.done, nil)
                onDone?()
            },
            // --- exit: user closed Link, or Plaid errored ---
            onExit: { exit in
                if let msg = exit.error?.errorMessage, !msg.isEmpty {
                    finish(.error, msg)
                } else {
                    // Plain dismissal is not an error state.
                    finish(.idle, nil)
                }
            }
        )

        // If neither callback ran, Link never opened: back to idle, never a stuck spinner.
        if !settled { stage = .idle }
    }
}
