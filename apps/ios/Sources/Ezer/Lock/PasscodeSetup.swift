// Port of apps/mobile/components/PasscodeSetup.tsx
//
// Choose a passcode: enter 4–6 digits, then the same again. Used as onboarding's last step and by
// LockGate for a signed-in account that has none.
//
//   PasscodeSetup(palette: PadPalette(colors), header: AnyView(mark)) { /* done */ }

import SwiftUI

struct PasscodeSetup: View {
    enum Stage { case create, confirm }

    let palette: PadPalette
    var header: AnyView?
    let onDone: () -> Void

    init(palette: PadPalette, header: AnyView? = nil, onDone: @escaping () -> Void) {
        self.palette = palette
        self.header = header
        self.onDone = onDone
    }

    @State private var stage: Stage = .create
    @State private var message: String?
    @State private var first = ""

    private func submit(_ code: String) async -> Bool {
        if stage == .create {
            first = code
            message = nil
            stage = .confirm
            return true
        }
        if code != first {
            first = ""
            stage = .create
            message = "Those didn't match. Choose a passcode again."
            return false
        }
        do {
            try setPasscode(code)
        } catch {
            let m = error.localizedDescription
            message = m.isEmpty ? "Could not save your passcode. Try again." : m
            first = ""
            stage = .create
            return false
        }
        onDone()
        return true
    }

    var body: some View {
        // A fresh pad per stage, so the confirm step starts with no digits and knows the length.
        PasscodePad(
            palette: palette,
            title: stage == .create ? "Set a passcode" : "Confirm your passcode",
            subtitle: stage == .create
                ? "4 to 6 digits. You will enter it each time you open EZER."
                : "Enter the same digits again.",
            length: stage == .confirm ? first.count : nil,
            message: message,
            header: header,
            onSubmit: submit
        )
        .id(stage)
    }
}
