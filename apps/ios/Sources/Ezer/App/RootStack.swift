// Port of RootLayoutNav in apps/mobile/app/_layout.tsx.
//
// A `colors.background` view holding (CardWarmup: Android-only warm-up, intentionally not ported)
// and the LockGate wrapping the Stack. Stack: headerShown false on every screen (interactive
// swipe-back kept), contentStyle `colors.background`, push = slide_from_right (iOS default push);
// `(tabs)` entered with no animation; `screens/Paywall` a fullScreenModal sliding from the bottom.

import SwiftUI
import UIKit

struct RootLayoutNav: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(AuthStore.self) private var auth
    @Environment(PremiumStore.self) private var premium
    @Environment(DataStore.self) private var data
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(LockGateModel.self) private var lock

    /// RN held a plain `colors.bg` view until useFonts resolved. Here the fonts are registered
    /// synchronously in EzerApp.init, so this is true from the first frame; a broken font file falls
    /// back to the system face instead of blanking the app forever (RN's failure mode).
    private let fontsLoaded = true

    var body: some View {
        @Bindable var router = router
        let colors = theme.colors
        if !fontsLoaded {
            colors.bg.ignoresSafeArea()
        } else {
            ZStack {
                colors.background.ignoresSafeArea()
                // CardWarmup: Android-only warm-up, intentionally not ported (it pre-warms Android's
                // per-install shader/JIT caches; iOS has no equivalent first-drag cost).
                LockGate {
                    NavigationStack(path: $router.path) {
                        rootContent
                            .background(colors.background.ignoresSafeArea())
                            .toolbar(.hidden, for: .navigationBar)
                            .navigationDestination(for: Route.self) { route in
                                destination(route)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .background(colors.background.ignoresSafeArea())
                                    .toolbar(.hidden, for: .navigationBar)
                                    .environment(\.isScreenFocused, router.isRouteFocused(route))
                                    .background(PopGestureEnabler())
                                    .debugScreenCapture("route-\(route.name)", active: router.isRouteFocused(route))
                            }
                    }
                }
            }
            .fullScreenCover(isPresented: $router.paywallPresented) {
                RNRoot {
                    PaywallView()
                        .debugScreenCapture("paywall", active: true)
                }
                .appEnvironment(AppEnvironment(theme: theme, auth: auth, premium: premium, data: data, savings: savings, router: router, lock: lock))
                .environment(\.lockOpen, !lock.locked)
                .environment(\.lockWarm, lock.warm)
                .preferredColorScheme(theme.isDark ? .dark : .light)
            }
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        ZStack {
            switch router.root {
            case .index:
                IndexGate()
                    .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .identity))
            case .onboarding:
                OnboardingView()
                    .environment(\.isScreenFocused, router.path.isEmpty && !router.paywallPresented)
                    .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .identity))
                    .debugScreenCapture("onboarding", active: router.path.isEmpty && !router.paywallPresented)
            case .tabs:
                // No slide: the app is entered from behind the lock's EZER fade.
                TabsView()
                    .transition(.identity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PopGestureEnabler())
    }

    @ViewBuilder
    private func destination(_ route: Route) -> some View {
        switch route {
        case let .login(email): LoginView(email: email)
        case let .signup(email): SignupView(email: email)
        case .settings: SettingsView()
        case .settingsAccount: AccountView()
        case .settingsLinkedBanks: LinkedBanksView()
        case .settingsInbox: InboxView()
        case .settingsHelp: HelpView()
        case .settingsNotifications: NotificationsView()
        case let .subscriptionDetail(id): SubscriptionDetailView(id: id)
        case .drainReview: DrainReviewView()
        case let .goalDetail(id): GoalDetailView(id: id)
        case let .bankDetail(itemId): BankDetailView(itemId: itemId)
        case .physicalCard: PhysicalCardView()
        case .physicalCardApproval: PhysicalCardApprovalView()
        case .physicalCardReview: PhysicalCardReviewView()
        case let .reallocate(merchantId, amountCents, billingInterval):
            ReallocateView(merchantId: merchantId, amountCents: amountCents, billingInterval: billingInterval)
        }
    }
}

// MARK: - Interactive swipe-back with hidden navigation bars

/// Native-stack keeps the edge swipe with headerShown: false; UIKit drops it when the bar is
/// hidden unless the gesture gets a delegate that allows it whenever there is something to pop.
private final class PopGestureDelegate: NSObject, UIGestureRecognizerDelegate {
    static let shared = PopGestureDelegate()
    weak var nav: UINavigationController?

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        (nav?.viewControllers.count ?? 0) > 1
    }
}

private struct PopGestureEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Probe { Probe() }
    func updateUIViewController(_ vc: Probe, context: Context) { vc.attach() }

    final class Probe: UIViewController {
        override func viewDidLoad() {
            super.viewDidLoad()
            view.isUserInteractionEnabled = false
            view.backgroundColor = .clear
        }
        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            attach()
        }
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            attach()
        }
        func attach() {
            guard let nav = navigationController, let g = nav.interactivePopGestureRecognizer else { return }
            PopGestureDelegate.shared.nav = nav
            if g.delegate !== PopGestureDelegate.shared { g.delegate = PopGestureDelegate.shared }
            g.isEnabled = true
        }
    }
}
