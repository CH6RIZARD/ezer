// Port of apps/mobile/app/auth/login.tsx + apps/mobile/app/auth/signup.tsx (the pieces both screens
// inline identically: the input row, the divider, the Apple/Google squares, `router.dismissTo`),
// plus the age rule of packages/shared/src/schemas.ts (`emailSignupSchema.dateOfBirth`).

import SwiftUI
import UIKit

// MARK: - router.dismissTo('/onboarding')

extension Router {
    /// expo-router `router.dismissTo('/onboarding')`: back to the onboarding screen this was pushed
    /// from (a new one only if there is none). Its sign-in step then decides between home and the
    /// passcode step, so the passcode is asked for exactly once.
    func onboardingAuthDismissToOnboarding() {
        if root == .onboarding {
            path = []
        } else {
            replace("/onboarding")
        }
    }
}

// MARK: - Email (CLAUDE.md: the email unique index is case-sensitive)

/// Lowercased + trimmed, the same normalisation `routes/auth.ts` applies on signup and login.
func onboardingAuthNormalizeEmail(_ email: String) -> String {
    email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

// MARK: - Date of birth (packages/shared emailSignupSchema.dateOfBirth)

enum OnboardingAuthDOB {
    /// `/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime())`, with JS's date-only
    /// rules: month 01–12 and day 01–31 parse; a day past the month's end rolls into the next month
    /// ("2023-02-30" is March 2, as `new Date` gives); anything else is NaN (nil here).
    /// Checked against V8 for every YYYY-00..13-00..32 from 1890 to 2030: identical.
    static func parse(_ s: String) -> (y: Int, m: Int, d: Int)? {
        let u = Array(s.utf8)
        guard u.count == 10, u[4] == UInt8(ascii: "-"), u[7] == UInt8(ascii: "-") else { return nil }
        for i in [0, 1, 2, 3, 5, 6, 8, 9] where !(48...57).contains(u[i]) { return nil }
        func num(_ a: Int, _ b: Int) -> Int { u[a..<b].reduce(0) { $0 * 10 + Int($1 - 48) } }
        let y = num(0, 4), m = num(5, 7), d = num(8, 10)
        guard (1...12).contains(m), (1...31).contains(d) else { return nil }
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
        let dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
        return d > dim ? (y, m + 1, d - dim) : (y, m, d)
    }

    /// packages/shared `ageFromDateOfBirth`: whole years between the date and now, by UTC — the
    /// server's rule (it re-checks with its own clock; this only gives a clear message early).
    static func age(_ dob: (y: Int, m: Int, d: Int), now: Date = Date()) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        let n = cal.dateComponents([.year, .month, .day], from: now)
        var age = n.year! - dob.y
        if n.month! < dob.m || (n.month! == dob.m && n.day! < dob.d) { age -= 1 }
        return age
    }

    #if DEBUG
    /// Runs once (first signup screen in a DEBUG build): the cases the V8 comparison covered.
    static let selfCheck: Void = {
        assert(parse("2008-10-12") != nil)
        assert(parse("2023-02-30")! == (2023, 3, 2))
        assert(parse("2001-02-29")! == (2001, 3, 1))
        assert(parse("2000-02-29")! == (2000, 2, 29))
        assert(parse("2023-02-32") == nil && parse("2023-13-01") == nil && parse("2023-00-10") == nil)
        assert(parse("2023-1-01") == nil && parse("12/01/2000") == nil && parse("２０００-01-01") == nil)
        let now = ISO8601DateFormatter().date(from: "2026-10-12T03:00:00Z")!
        assert(age(parse("2008-10-12")!, now: now) == 18)
        assert(age(parse("2008-10-13")!, now: now) == 17)
        assert(age(parse("1990-05-01")!, now: now) == 36)
    }()
    #endif
}

// MARK: - TextInput

/// RN `<TextInput>` on iOS IS a UITextField, so this is one: same system font at fontSize, same
/// placeholderTextColor, `secureTextEntry` toggled on the live field (the keyboard stays up when the
/// eye is tapped, as in RN), `maxLength` counted in UTF-16 units like RN.
struct OnboardingAuthTextInput: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let placeholderColor: Color
    let textColor: Color
    var fontSize: CGFloat = 16
    var secure = false
    var keyboard: UIKeyboardType = .default
    /// RN autoCapitalize: default 'sentences'.
    var capitalization: UITextAutocapitalizationType = .sentences
    var contentType: UITextContentType? = nil
    var maxLength: Int? = nil

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: OnboardingAuthTextInput
        init(_ p: OnboardingAuthTextInput) { parent = p }

        @objc func changed(_ f: UITextField) { parent.text = f.text ?? "" }

        func textField(_ f: UITextField, shouldChangeCharactersIn range: NSRange, replacementString s: String) -> Bool {
            guard let max = parent.maxLength else { return true }
            let next = ((f.text ?? "") as NSString).replacingCharacters(in: range, with: s)
            return (next as NSString).length <= max
        }

        /// RN single-line TextInput: Return blurs (submitBehavior 'blurAndSubmit'). It is the only
        /// way to drop the keyboard on these screens; a bare UITextField keeps it up, leaving the
        /// login's Sign In button under it.
        func textFieldShouldReturn(_ f: UITextField) -> Bool {
            f.resignFirstResponder()
            return true
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextField {
        let f = UITextField()
        f.delegate = context.coordinator
        f.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
        // flex: 1 — take the row's remaining width, never push the icons out.
        f.setContentHuggingPriority(.defaultLow, for: .horizontal)
        f.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return f
    }

    func updateUIView(_ f: UITextField, context: Context) {
        context.coordinator.parent = self
        if f.text != text { f.text = text }
        let font = UIFont.systemFont(ofSize: fontSize)
        f.font = font
        f.textColor = UIColor(textColor)
        f.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(placeholderColor), .font: font]
        )
        f.keyboardType = keyboard
        f.autocapitalizationType = capitalization
        f.textContentType = contentType
        if f.isSecureTextEntry != secure {
            f.isSecureTextEntry = secure
            // RCTUITextField re-sets the text after the toggle, or UIKit draws it with stale widths.
            let t = f.text
            f.text = nil
            f.text = t
        }
    }
}

/// The input box both screens use (signup.tsx `inputStyle`; login.tsx inline): row, center, card bg,
/// r12, 1px border, marginBottom 16, paddingHorizontal 16; Ionicon 20 textSecondary marginRight 12;
/// TextInput flex 1, paddingVertical 16, fontSize 16, color text.
struct OnboardingAuthInputRow<Trailing: View>: View {
    @Environment(ThemeStore.self) private var theme
    let icon: String
    let input: OnboardingAuthTextInput
    @ViewBuilder var trailing: Trailing

    var body: some View {
        let c = theme.colors
        HStack(alignment: .center, spacing: 0) {
            Ionicon(icon, size: 20, color: c.textSecondary)
                .padding(.trailing, 12)
            input
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity)
            trailing
        }
        // RN draws the 1px border inside the padding box.
        .padding(.horizontal, 16 + 1)
        .padding(.vertical, 1)
        .rnBox(bg: c.card, radius: 12, border: c.border)
        .padding(.bottom, 16)
    }
}

extension OnboardingAuthInputRow where Trailing == EmptyView {
    init(icon: String, input: OnboardingAuthTextInput) {
        self.init(icon: icon, input: input) { EmptyView() }
    }
}

/// `<Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>` + the eye icon.
struct OnboardingAuthEyeButton: View {
    @Environment(ThemeStore.self) private var theme
    @Binding var showPassword: Bool

    var body: some View {
        Button(action: { showPassword.toggle() }) {
            Ionicon(showPassword ? "eye-off-outline" : "eye-outline", size: 20, color: theme.colors.textSecondary)
                .padding(4)
                .contentShape(Rectangle())
        }
        .buttonStyle(PlainPressStyle())
    }
}

// MARK: - Primary button, divider, social squares, footer link

/// The Sign In / Create Account button: primary bg, paddingVertical 16, r12, centred; shadow
/// primary (0,4) 0.3 r8; opacity 0.7 and disabled while busy; white ActivityIndicator while busy,
/// else the title 16/700 white.
struct OnboardingAuthPrimaryButton: View {
    @Environment(ThemeStore.self) private var theme
    let title: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        let c = theme.colors
        Button(action: action) {
            Group {
                Group {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color.white)
                }
                .cameraDove(isLoading)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(rnRect(12).fill(c.primary))
            .shadow(color: c.primary.opacity(0.3), radius: 8, x: 0, y: 4)
            .opacity(isLoading ? 0.7 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainPressStyle())
        .disabled(isLoading)
    }
}

/// Row, center, marginVertical 24: 1px border lines either side of a 14 textSecondary label
/// (marginHorizontal 16).
struct OnboardingAuthDivider: View {
    @Environment(ThemeStore.self) private var theme
    let label: String

    var body: some View {
        let c = theme.colors
        HStack(alignment: .center, spacing: 0) {
            Rectangle().fill(c.border).frame(height: 1).frame(maxWidth: .infinity)
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(c.textSecondary)
                .padding(.horizontal, 16)
            Rectangle().fill(c.border).frame(height: 1).frame(maxWidth: .infinity)
        }
        .padding(.vertical, 24)
    }
}

/// Row, justify center, gap 16: two 56×56 r12 card squares with a 1px border, logo-apple /
/// logo-google 24 text. The RN Pressables have NO onPress: these squares do nothing (the real
/// provider sign-in lives on onboarding's auth step), so the port does nothing either.
struct OnboardingAuthSocialRow: View {
    @Environment(ThemeStore.self) private var theme

    var body: some View {
        let c = theme.colors
        HStack(alignment: .center, spacing: 16) {
            ForEach(["logo-apple", "logo-google"], id: \.self) { logo in
                Button(action: {}) {
                    Ionicon(logo, size: 24, color: c.text)
                        .frame(width: 56, height: 56)
                        .rnBox(bg: c.card, radius: 12, border: c.border)
                }
                .buttonStyle(PlainPressStyle())
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// Row, justify center, paddingVertical 20: prompt 14 textSecondary + a 14/700 primary link.
struct OnboardingAuthFooterLink: View {
    @Environment(ThemeStore.self) private var theme
    let prompt: String
    let link: String
    let action: () -> Void

    var body: some View {
        let c = theme.colors
        HStack(alignment: .center, spacing: 0) {
            Text(prompt)
                .font(.system(size: 14))
                .foregroundStyle(c.textSecondary)
            Button(action: action) {
                Text(link)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(c.primary)
            }
            .buttonStyle(PlainPressStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }
}

/// The logo square: LinearGradient [colors.primary, '#7C3AED'] (expo default: top -> bottom), with
/// a centred white bold "E".
struct OnboardingAuthLogoMark: View {
    @Environment(ThemeStore.self) private var theme
    let size: CGFloat
    let radius: CGFloat
    let fontSize: CGFloat

    var body: some View {
        LinearGradient.rn([theme.colors.primary, Color(css: "#7C3AED")])
            .frame(width: size, height: size)
            .clipShape(rnRect(radius))
            .overlay {
                Text("E")
                    .font(.system(size: fontSize, weight: .bold))
                    .foregroundStyle(Color(css: "#FFFFFF"))
            }
    }
}
