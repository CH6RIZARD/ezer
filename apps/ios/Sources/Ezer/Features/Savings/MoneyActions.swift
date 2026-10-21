// Port of apps/mobile/components/redesign/MoneyActions.tsx
//
// EZER Redesign — the Add / Withdraw / Move row ("SavingsTab" handoff, the TOTAL SAVED card)
//
// ONE row for both places money is moved from: the Savings tab's hero (every goal) and the goal
// screen (that goal). Each button opens the shared MoveMoneySheet in its mode; the caller owns the
// sheet and the enable rules. With `dim` (the goal screen) a disabled button also dims, so it does
// not read as a dead tap; the Savings tab's never dimmed and still doesn't.

import SwiftUI

struct MoneyActions: View {
    var addDisabled = false
    /// RN `dim`: disabled buttons also dim (the goal screen).
    var dim = false
    let withdrawDisabled: Bool
    let moveDisabled: Bool
    let onPick: (SavingsMoveMode) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            button("add", 16, "Add", primary: true, disabled: addDisabled, .add)
            button("arrow-up", 15, "Withdraw", disabled: withdrawDisabled, .withdraw)
            button("swap-horizontal", 15, "Move", disabled: moveDisabled, .move)
        }
    }

    private func button(_ icon: String, _ size: CGFloat, _ title: String, primary: Bool = false, disabled: Bool, _ mode: SavingsMoveMode) -> some View {
        SavingsActionButton(icon: icon, iconSize: size, title: title, primary: primary, disabled: disabled) { onPick(mode) }
            .opacity(dim && disabled ? 0.45 : 1)
    }
}
