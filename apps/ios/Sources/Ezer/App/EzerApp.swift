// Port of apps/mobile/app/_layout.tsx — RootLayout, ThemedRoot, AppErrorBoundary, font loading.
//
// Provider order (outer -> inner), kept: Theme -> ThemedRoot (`colors.bg` fill) -> SafeArea ->
// Auth -> Premium -> Data -> SavingsGoals -> ErrorBoundary -> { RootLayoutNav, AppAlertHost }.
// Each RN context is an @Observable store created here once and injected with .environment.
// AppAlertHost and the passcode lock draw in their own windows (Components/OverlayWindows.swift).

import SwiftUI
import UIKit

@main
struct EzerApp: App {
    @State private var theme: ThemeStore
    @State private var auth: AuthStore
    @State private var premium: PremiumStore
    @State private var data: DataStore
    @State private var savings: SavingsGoalsStore
    @State private var router: Router
    @State private var lock: LockGateModel

    init() {
        // Fonts must be registered before the first view asks for one (RN held a plain `colors.bg`
        // view until useFonts resolved; registration here is synchronous).
        EzerFonts.registerAll()
        #if DEBUG
        FoundationSelfCheck.runInBackground()
        #endif

        let theme = ThemeStore()
        let auth = AuthStore()
        let premium = PremiumStore()
        let data = DataStore(auth: auth)
        let savings = SavingsGoalsStore(auth: auth, theme: theme)
        let router = Router()
        let lock = LockGateModel(auth: auth, data: data, router: router)
        _theme = State(initialValue: theme)
        _auth = State(initialValue: auth)
        _premium = State(initialValue: premium)
        _data = State(initialValue: data)
        _savings = State(initialValue: savings)
        _router = State(initialValue: router)
        _lock = State(initialValue: lock)
    }

    var body: some Scene {
        WindowGroup {
            RootLayout(env: AppEnvironment(theme: theme, auth: auth, premium: premium, data: data, savings: savings, router: router, lock: lock))
        }
    }
}

/// RootLayout + ThemedRoot: paints the window behind everything in the theme's background colour
/// (no white bands on overscroll, no dark strip above a light app).
private struct RootLayout: View {
    let env: AppEnvironment

    var body: some View {
        ZStack {
            env.theme.colors.bg.ignoresSafeArea()
            RNRoot {
                AppErrorBoundary {
                    RootLayoutNav()
                }
            }
        }
        .appEnvironment(env)
        .modifier(StoreEffects(env: env))
        // StatusBar style={isDark ? 'light' : 'dark'}. The app's own palette never depends on the
        // system scheme; this also makes system controls (keyboard, pickers) follow the app theme.
        .preferredColorScheme(env.theme.isDark ? .dark : .light)
        .onAppear {
            // ThemeContext's system fallback (nothing stored): the SCREEN's trait is the system
            // scheme; the window's is overridden by preferredColorScheme.
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            env.theme.adoptSystemScheme(dark: scene?.screen.traitCollection.userInterfaceStyle == .dark)
            OverlayWindows.shared.install(env)
            env.lock.start()
        }
    }
}

/// The RN useEffects that tie the providers together, keyed on the same dependencies.
private struct StoreEffects: ViewModifier {
    let env: AppEnvironment

    private struct AuthKey: Equatable {
        let isLoading: Bool
        let isAuthenticated: Bool
        let userId: String?
    }

    private struct LockKey: Equatable {
        let isLoading: Bool
        let isAuthenticated: Bool
        let hasCompletedOnboarding: Bool
        let dataReady: Bool
    }

    func body(content: Content) -> some View {
        let auth = env.auth
        content
            // DataContext: [isAuthenticated, authLoading, userId]; task cancellation = `cancelled`.
            .task(id: AuthKey(isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated, userId: auth.user?.id)) {
                await env.data.authChanged()
            }
            // SavingsGoalsContext: refresh() whenever isAuthenticated changes.
            .task(id: auth.isAuthenticated) {
                await env.savings.refresh()
            }
            // PremiumContext: re-check trial / dev unlock for the signed-in user.
            .onChange(of: auth.user?.id) { _, _ in
                Task { await env.premium.userChanged() }
            }
            // LockGate's auth/data effects.
            .onChange(of: LockKey(isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated,
                                  hasCompletedOnboarding: auth.hasCompletedOnboarding, dataReady: env.data.isReady)) { _, _ in
                env.lock.evaluate()
            }
            .onChange(of: env.theme.isDark, initial: true) { _, dark in
                OverlayWindows.shared.applyStatusBar(isDark: dark)
            }
            // SavingsGoalsContext: AppState 'active' -> refresh, debounced. iOS also posts
            // didBecomeActive at launch, which RN's AppState did not: only after a real leave.
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                LeaveTracker.left = true
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                if LeaveTracker.left {
                    LeaveTracker.left = false
                    env.savings.appBecameActive()
                }
            }
            .onOpenURL { env.router.open(url: $0) }
    }

    @MainActor private enum LeaveTracker { static var left = false }
}

/// RN AppErrorBoundary. SwiftUI has no render-time exceptions to catch, so this only exists for
/// parity (and for any fatal startup state a future caller wants to show). Copy and numbers verbatim;
/// the text has no fontFamily in RN, so it is the SYSTEM font.
struct AppErrorBoundary<Content: View>: View {
    var error: String?
    @ViewBuilder var content: Content

    init(error: String? = nil, @ViewBuilder content: () -> Content) {
        self.error = error
        self.content = content()
    }

    var body: some View {
        if let error {
            VStack(alignment: .leading, spacing: 0) {
                Text("Ezer couldn’t start")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(css: "#FFFFFF"))
                    .padding(.bottom, 12)
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Color(css: "#FCA5A5"))
                    .rnLineHeight(21, family: nil, size: 14)
            }
            .padding(28)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color(css: "#0F0F0F").ignoresSafeArea())
        } else {
            content
        }
    }
}
