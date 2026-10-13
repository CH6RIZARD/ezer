// Port of apps/mobile/app/auth/login.tsx
//
// Email sign-in. Inline styles with NO fontFamily -> the system font at the given weights, and the
// legacy colour aliases (background, text, textSecondary, card, border, primary).
// KeyboardAvoidingView (behavior 'padding' on iOS) -> `.rnScreen()`, which keeps SwiftUI's own
// keyboard avoidance.

import SwiftUI

struct LoginView: View {
    /// Onboarding collects the email on its auth step and hands it over, so nobody types it twice.
    let email: String?

    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var emailText: String
    @State private var password = ""
    @State private var showPassword = false
    @State private var isLoading = false

    init(email: String?) {
        self.email = email
        _emailText = State(initialValue: email ?? "")
    }

    private func handleLogin() async {
        if emailText.isEmpty || password.isEmpty {
            AppAlert.alert("Error", "Please enter your email and password")
            return
        }

        isLoading = true
        // Lowercased + trimmed: the server does the same, and the email unique index is case-sensitive.
        let result = await auth.login(onboardingAuthNormalizeEmail(emailText), password)
        isLoading = false

        if result.ok {
            // Back to the onboarding screen this was pushed from (a new one only if there is none):
            // its sign-in step decides between home and the passcode step, so the passcode is asked
            // for exactly once.
            router.onboardingAuthDismissToOnboarding()
        } else {
            // The server's actual reason — "invalid email or password" was shown even when the API
            // was unreachable.
            AppAlert.alert("Login failed", result.error ?? "")
        }
    }

    var body: some View {
        let c = theme.colors

        VStack(alignment: .leading, spacing: 0) {
            // Logo
            VStack(alignment: .center, spacing: 0) {
                OnboardingAuthLogoMark(size: 80, radius: 20, fontSize: 40)
                    .padding(.bottom, 16)
                Text("EZER")
                    .font(.system(size: 32, weight: .bold))
                    .kerning(4)
                    .foregroundStyle(c.text)
                Text("Your Subscription Guardian")
                    .font(.system(size: 14))
                    .foregroundStyle(c.textSecondary)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 40)

            // Login Form (flex: 1 — takes what the logo and the sign-up link leave, and like RN's
            // flexShrink it may get LESS than its content: minHeight 0. The content keeps its own
            // height and overflows the box downward, so with the keyboard up the screen's top stays
            // put, as under RN's KeyboardAvoidingView, instead of the whole oversized screen being
            // re-centred.)
            VStack(alignment: .leading, spacing: 0) {
                Text("Welcome Back")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(c.text)
                    .padding(.bottom, 8)
                Text("Sign in to continue managing your subscriptions")
                    .font(.system(size: 14))
                    .foregroundStyle(c.textSecondary)
                    .padding(.bottom, 32)

                OnboardingAuthInputRow(
                    icon: "mail-outline",
                    input: OnboardingAuthTextInput(
                        text: $emailText,
                        placeholder: "Email address",
                        placeholderColor: c.textSecondary,
                        textColor: c.text,
                        keyboard: .emailAddress,
                        capitalization: .none,
                        contentType: .emailAddress
                    )
                )

                OnboardingAuthInputRow(
                    icon: "lock-closed-outline",
                    input: OnboardingAuthTextInput(
                        text: $password,
                        placeholder: "Password",
                        placeholderColor: c.textSecondary,
                        textColor: c.text,
                        secure: !showPassword,
                        capitalization: .none
                    )
                ) {
                    OnboardingAuthEyeButton(showPassword: $showPassword)
                }

                // No onPress in the original: the link does nothing yet.
                Button(action: {}) {
                    Text("Forgot Password?")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(c.primary)
                }
                .buttonStyle(PlainPressStyle())
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.bottom, 24)

                OnboardingAuthPrimaryButton(title: "Sign In", isLoading: isLoading) {
                    Task { await handleLogin() }
                }

                // Divider
                OnboardingAuthDivider(label: "or continue with")

                // Social Login
                OnboardingAuthSocialRow()
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .top)

            // Sign Up Link
            OnboardingAuthFooterLink(prompt: "Don't have an account? ", link: "Sign Up") {
                router.push("/auth/signup")
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, insets.top + 40)
        .padding(.bottom, insets.bottom + 20)
        .rnScreen()
        .background(c.background.ignoresSafeArea())
    }
}
