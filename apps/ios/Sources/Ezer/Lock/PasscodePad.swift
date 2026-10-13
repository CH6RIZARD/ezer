// Port of apps/mobile/components/PasscodePad.tsx
//
// Presentational keypad: dots, a 0–9 keypad, a message line. It owns only the digits being typed;
// what a submitted code MEANS belongs to the caller. Paints no background of its own (it sits on
// onboarding's gradient and on LockGate's themed sheet alike).
//   Unlock: `length` = the code's exact length, submitted as soon as it is reached.
//   Choose: `length` nil — 4 to 6 digits, an arrow "Continue" key once >= 4, auto-submit at 6.
// A rejected code: error haptic, a [10,-10,8,-8,4,0] x 45ms shake, digits cleared.
//
//   PasscodePad(palette: PadPalette(colors), title: "Enter your passcode", length: 4) { code in await check(code) }

import SwiftUI

/// Pick<ThemeTokens, 'ink' | 'mut' | 'gold' | 'line' | 'card' | 'red'>
struct PadPalette {
    var ink: Color
    var mut: Color
    var gold: Color
    var line: Color
    var card: Color
    var red: Color

    init(ink: Color, mut: Color, gold: Color, line: Color, card: Color, red: Color) {
        self.ink = ink; self.mut = mut; self.gold = gold; self.line = line; self.card = card; self.red = red
    }

    init(_ c: ThemeColors) {
        self.init(ink: c.ink, mut: c.mut, gold: c.gold, line: c.line, card: c.card, red: c.red)
    }
}

private let KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"]
private let KEY: CGFloat = 74

@MainActor private func tap() { Haptics.impactLight() }

struct PasscodePad: View {
    enum MessageTone { case error, info }

    let palette: PadPalette
    let title: String
    var subtitle: String?
    /** Unlock: the code's exact length. nil: choosing a new code. */
    var length: Int?
    /** Return false to reject the code: the dots shake and clear. */
    let onSubmit: (String) async -> Bool
    var message: String?
    var messageTone: MessageTone = .error
    var disabled = false
    var footer: AnyView?
    /** Shown above the title — LockGate puts the wordmark here. */
    var header: AnyView?

    init(palette: PadPalette, title: String, subtitle: String? = nil, length: Int? = nil, message: String? = nil,
         messageTone: MessageTone = .error, disabled: Bool = false, footer: AnyView? = nil, header: AnyView? = nil,
         onSubmit: @escaping (String) async -> Bool) {
        self.palette = palette; self.title = title; self.subtitle = subtitle; self.length = length
        self.message = message; self.messageTone = messageTone; self.disabled = disabled
        self.footer = footer; self.header = header; self.onSubmit = onSubmit
    }

    @Environment(\.safeInsets) private var insets
    @State private var code = ""
    @State private var busy = false
    @State private var shake: CGFloat = 0

    private var maxLen: Int { length ?? PASSCODE_MAX }
    private var locked: Bool { disabled || busy }
    private var canContinue: Bool { length == nil && code.count >= PASSCODE_MIN && code.count < PASSCODE_MAX }

    private func submit(_ value: String) async {
        busy = true
        let ok = await onSubmit(value)
        busy = false
        if ok { return }
        Haptics.notifyError()
        Task {
            for v in [10, -10, 8, -8, 4, 0] as [CGFloat] {
                withAnimation(.rn(.rnDefault, 45)) { shake = v }
                try? await Task.sleep(nanoseconds: 45_000_000)
            }
        }
        code = ""
    }

    private func press(_ k: String) {
        if locked || k.isEmpty { return }
        tap()
        if k == "del" {
            if !code.isEmpty { code.removeLast() }
        } else if code.count < maxLen {
            code += k
        }
    }

    var body: some View {
        let P = palette
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                if let header { header }
                Text(title)
                    .font(.custom(FontFamily.semibold, size: 22))
                    .foregroundStyle(P.ink)
                    .multilineTextAlignment(.center)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.custom(FontFamily.regular, size: 14))
                        .foregroundStyle(P.mut)
                        .multilineTextAlignment(.center)
                        .rnLineHeight(20, family: FontFamily.regular, size: 14)
                        .frame(maxWidth: 300)
                }

                HStack(alignment: .top, spacing: 16) {
                    ForEach(0..<maxLen, id: \.self) { i in
                        let filled = i < code.count
                        Circle()
                            .fill(filled ? P.gold : Color.clear)
                            .overlay(Circle().strokeBorder(filled ? P.gold : (i < PASSCODE_MIN || length != nil ? P.gold : P.line), lineWidth: 1.5))
                            .frame(width: 14, height: 14)
                    }
                }
                .frame(height: 16, alignment: .top)
                .offset(x: shake)
                .padding(.top, 22)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(code.count) of \(length.map(String.init) ?? "\(PASSCODE_MIN) to \(PASSCODE_MAX)") digits entered")

                Text(message ?? " ")
                    .font(.custom(FontFamily.medium, size: 13))
                    .foregroundStyle(messageTone == .error ? P.red : P.mut)
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 18)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)

            // Three cells a row: each key plus 28pt of gutter, so the row is 306 wide.
            VStack(spacing: 0) {
                ForEach(0..<4, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(0..<3, id: \.self) { col in
                            cell(KEYS[row * 3 + col])
                                .frame(width: KEY + 28, height: KEY + 14)
                        }
                    }
                }
            }
            .frame(width: (KEY + 28) * 3)

            Spacer(minLength: 0)

            Group {
                if let footer { footer }
            }
            .frame(minHeight: 44)
        }
        .padding(.top, insets.top + 40)
        .padding(.bottom, insets.bottom + 28)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Auto-submit at the exact length (unlock) or at the maximum (choosing).
        .onChange(of: code) { _, c in
            if c.count == maxLen && !busy { Task { await submit(c) } }
        }
    }

    @ViewBuilder
    private func cell(_ k: String) -> some View {
        let P = palette
        if k.isEmpty {
            if canContinue {
                Button { Task { await submit(code) } } label: {
                    Ionicon("arrow-forward", size: 26, color: P.gold)
                        .frame(width: KEY, height: KEY)
                        .contentShape(Circle())
                }
                .buttonStyle(PlainPressStyle())
                .accessibilityLabel("Continue")
            }
        } else {
            Button { press(k) } label: {
                Group {
                    if k == "del" {
                        Ionicon("backspace-outline", size: 26, color: P.mut)
                    } else {
                        Text(k)
                            .font(.custom(FontFamily.medium, size: 28))
                            .foregroundStyle(P.ink)
                    }
                }
                .frame(width: KEY, height: KEY)
                .background {
                    if k != "del" {
                        Circle().fill(P.card).overlay(Circle().strokeBorder(P.line, lineWidth: 1))
                    }
                }
                .contentShape(Circle())
            }
            .buttonStyle(KeyStyle(locked: locked))
            .disabled(locked)
            .accessibilityLabel(k == "del" ? "Delete" : k)
        }
    }
}

/// pressed: opacity .6 + scale .95 (instant, RN style function); locked: opacity .4.
private struct KeyStyle: ButtonStyle {
    let locked: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .opacity(locked ? 0.4 : (configuration.isPressed ? 0.6 : 1))
    }
}
