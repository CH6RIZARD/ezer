// Port of apps/mobile/app/auth/signup.tsx
//
// Email sign-up. System font + legacy colour aliases (no fontFamily anywhere in the original).
// KeyboardAvoidingView (behavior 'padding' on iOS) -> `.rnScreen()`, which keeps SwiftUI's own
// keyboard avoidance.
//
// Compliance (CLAUDE.md "Compliance-critical"): nothing about consent is sent. The terms checkbox
// must be ticked before the call, and a successful POST /auth/signup IS the acceptance — the server
// writes User.consentedAt = now and User.consentVersion = CONSENT_VERSION. Age gate: 18+, by the
// same rule as packages/shared (`ageFromDateOfBirth`, UTC); the server re-checks with its own clock.

import SwiftUI

struct SignupView: View {
    /// Onboarding collects the email on its auth step and hands it over, so nobody types it twice.
    let email: String?

    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var name = ""
    @State private var emailText: String
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showPassword = false
    @State private var isLoading = false
    @State private var acceptedTerms = false
    // Age gate: EZER links banks and extends credit, so 18+. The server re-checks with its own
    // clock; this only gives a clear message early.
    @State private var dateOfBirth = ""

    init(email: String?) {
        self.email = email
        _emailText = State(initialValue: email ?? "")
    }

    /// JS `password === confirmPassword` (UTF-16 code units, not Swift's canonical equivalence).
    private var passwordsMatch: Bool { password.utf16.elementsEqual(confirmPassword.utf16) }
    /// JS `password.length >= 8` (UTF-16 units, as the server's zod min(8) counts).
    private var longEnough: Bool { password.utf16.count >= 8 }

    private func handleSignup() async {
        if name.isEmpty || emailText.isEmpty || password.isEmpty || confirmPassword.isEmpty || dateOfBirth.isEmpty {
            AppAlert.alert("Error", "Please fill in all fields")
            return
        }

        guard let dob = OnboardingAuthDOB.parse(dateOfBirth) else {
            AppAlert.alert("Error", "Enter your date of birth as YYYY-MM-DD")
            return
        }
        if OnboardingAuthDOB.age(dob) < 18 {
            AppAlert.alert("Error", "You must be 18 or older to use EZER")
            return
        }

        if !passwordsMatch {
            AppAlert.alert("Error", "Passwords do not match")
            return
        }

        if !longEnough {
            AppAlert.alert("Error", "Password must be at least 8 characters")
            return
        }

        if !acceptedTerms {
            AppAlert.alert("Error", "Please accept the Terms of Service and Privacy Policy")
            return
        }

        isLoading = true
        // Lowercased + trimmed: the server does the same, and the email unique index is case-sensitive.
        let result = await auth.signup(onboardingAuthNormalizeEmail(emailText), password, name, dateOfBirth)
        isLoading = false

        if result.ok {
            // See login: back to the onboarding this came from, whose last step sets the passcode.
            router.onboardingAuthDismissToOnboarding()
        } else {
            // Was a generic "An error occurred", so "Email already registered" and "cannot reach the
            // server" looked identical — and an account that was never created looked the same as
            // one that was.
            AppAlert.alert("Could not create account", result.error ?? "")
        }
    }

    var body: some View {
        let c = theme.colors

        // contentContainerStyle flexGrow 1 + the form's flex 1 only pin the "Sign In" link to the
        // bottom when the content is shorter than the screen; this form is taller than any iPhone's,
        // so the content simply stacks.
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 0) {
                // Back Button
                Button(action: { router.back() }) {
                    Ionicon("arrow-back", size: 24, color: c.text)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(c.card))
                        .shadow(color: c.shadow.opacity(0.08), radius: 8, x: 0, y: 2)
                        .contentShape(Circle())
                }
                .buttonStyle(PlainPressStyle())
                .padding(.bottom, 20)

                // Logo
                OnboardingAuthLogoMark(size: 64, radius: 16, fontSize: 32)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 24)

                // Signup Form
                VStack(alignment: .leading, spacing: 0) {
                    Text("Create Account")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(c.text)
                        .padding(.bottom, 8)
                    Text("Start saving money on forgotten subscriptions")
                        .font(.system(size: 14))
                        .foregroundStyle(c.textSecondary)
                        .padding(.bottom, 24)

                    OnboardingAuthInputRow(
                        icon: "person-outline",
                        input: OnboardingAuthTextInput(
                            text: $name,
                            placeholder: "Full Name",
                            placeholderColor: c.textSecondary,
                            textColor: c.text,
                            capitalization: .words
                        )
                    )

                    OnboardingAuthInputRow(
                        icon: "calendar-outline",
                        input: OnboardingAuthTextInput(
                            text: $dateOfBirth,
                            placeholder: "Date of birth (YYYY-MM-DD)",
                            placeholderColor: c.textSecondary,
                            textColor: c.text,
                            keyboard: .numbersAndPunctuation,
                            contentType: .birthdate,     // autoComplete "birthdate-full"
                            maxLength: 10
                        )
                    )

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

                    OnboardingAuthInputRow(
                        icon: "lock-closed-outline",
                        input: OnboardingAuthTextInput(
                            text: $confirmPassword,
                            placeholder: "Confirm Password",
                            placeholderColor: c.textSecondary,
                            textColor: c.text,
                            secure: !showPassword,
                            capitalization: .none
                        )
                    )

                    // Password Requirements
                    VStack(alignment: .leading, spacing: 0) {
                        requirement("At least 8 characters", met: longEnough, c)
                        requirement("Passwords match", met: passwordsMatch && !password.isEmpty, c)
                    }
                    .padding(.bottom, 20)

                    // Terms Checkbox
                    Button(action: { acceptedTerms.toggle() }) {
                        HStack(alignment: .top, spacing: 0) {
                            ZStack {
                                if acceptedTerms {
                                    Ionicon("checkmark", size: 16, color: Color(css: "#FFFFFF"))
                                }
                            }
                            .frame(width: 22, height: 22)
                            .rnBox(
                                bg: acceptedTerms ? c.primary : Color.clear,
                                radius: 6,
                                border: acceptedTerms ? c.primary : c.border,
                                borderWidth: 2
                            )
                            .padding(.trailing, 12)

                            Text("I agree to the \(Text("Terms of Service").foregroundStyle(c.primary).fontWeight(.semibold)) and \(Text("Privacy Policy").foregroundStyle(c.primary).fontWeight(.semibold))")
                                .font(.system(size: 14))
                                .foregroundStyle(c.textSecondary)
                                .rnLineHeight(20, family: nil, size: 14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PlainPressStyle())
                    .padding(.bottom, 24)

                    OnboardingAuthPrimaryButton(title: "Create Account", isLoading: isLoading) {
                        Task { await handleSignup() }
                    }

                    // Divider
                    OnboardingAuthDivider(label: "or sign up with")

                    // Social Signup
                    OnboardingAuthSocialRow()
                }

                // Login Link
                OnboardingAuthFooterLink(prompt: "Already have an account? ", link: "Sign In") {
                    router.push("/auth/login")
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, insets.top + 20)
            .padding(.bottom, insets.bottom + 20)
        }
        .scrollIndicators(.hidden)
        .rnScreen()
        .background(c.background.ignoresSafeArea())
        .onAppear {
            #if DEBUG
            _ = OnboardingAuthDOB.selfCheck
            #endif
        }
    }

    /// Row, center, marginBottom 8: checkmark-circle / ellipse-outline 16, label 13 marginLeft 8 —
    /// success when met, textSecondary otherwise.
    private func requirement(_ label: String, met: Bool, _ c: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 0) {
            Ionicon(met ? "checkmark-circle" : "ellipse-outline", size: 16, color: met ? c.success : c.textSecondary)
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(met ? c.success : c.textSecondary)
                .padding(.leading, 8)
        }
        .padding(.bottom, 8)
    }
}
