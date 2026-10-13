// RN `<Modal transparent visible animationType="slide" | "fade" | "none">` on iOS, the way RN itself
// implements it: a UIHostingController presented .overFullScreen from the top view controller,
// transition .coverVertical for "slide" (the scrim slides WITH the sheet), .crossDissolve for
// "fade", no animation for "none". The content gets the same stores, safe insets and
// lock/focus values as the presenting screen.
//
//   .rnModal(isPresented: showSheet, animationType: .slide, onRequestClose: { showSheet = false }) {
//       MoveMoneySheet(...)
//   }

import SwiftUI
import UIKit

enum RNModalAnimation { case slide, fade, none }

extension View {
    func rnModal<Content: View>(
        isPresented: Bool,
        animationType: RNModalAnimation = .none,
        onRequestClose: @escaping () -> Void = {},
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        modifier(RNModalModifier(isPresented: isPresented, animationType: animationType, modalContent: content))
    }
}

private struct RNModalModifier<ModalContent: View>: ViewModifier {
    let isPresented: Bool
    let animationType: RNModalAnimation
    let modalContent: () -> ModalContent

    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(PremiumStore.self) private var premium
    @Environment(DataStore.self) private var data
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(LockGateModel.self) private var lock
    @Environment(\.isScreenFocused) private var focused
    @Environment(\.lockOpen) private var lockOpen
    @Environment(\.lockWarm) private var lockWarm

    func body(content: Content) -> some View {
        let env = AppEnvironment(theme: theme, auth: auth, premium: premium, data: data, savings: savings, router: router, lock: lock)
        let isDark = theme.isDark
        let wrapped = AnyView(
            RNRoot { modalContent() }
                .environment(\.isScreenFocused, focused)
                .environment(\.lockOpen, lockOpen)
                .environment(\.lockWarm, lockWarm)
                .appEnvironment(env)
                .preferredColorScheme(isDark ? .dark : .light)
        )
        content.background(
            ModalPresenter(isPresented: isPresented, animationType: animationType, content: wrapped)
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)
        )
    }
}

private struct ModalPresenter: UIViewControllerRepresentable {
    let isPresented: Bool
    let animationType: RNModalAnimation
    let content: AnyView

    final class Coordinator {
        var host: OverlayHostingController<AnyView>?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        vc.view.isUserInteractionEnabled = false
        vc.view.backgroundColor = .clear
        return vc
    }

    func updateUIViewController(_ anchor: UIViewController, context: Context) {
        let coord = context.coordinator
        if isPresented {
            if let host = coord.host {
                host.rootView = content
            } else {
                let host = OverlayHostingController(rootView: content)
                host.modalPresentationStyle = .overFullScreen
                host.modalTransitionStyle = animationType == .fade ? .crossDissolve : .coverVertical
                coord.host = host
                let animated = animationType != .none
                onNextRunLoop {
                    guard coord.host === host, let top = Self.topController(from: anchor) else { return }
                    top.present(host, animated: animated)
                }
            }
        } else if let host = coord.host {
            coord.host = nil
            let animated = animationType != .none
            onNextRunLoop {
                host.presentingViewController?.dismiss(animated: animated)
            }
        }
    }

    static func dismantleUIViewController(_ anchor: UIViewController, coordinator: Coordinator) {
        if let host = coordinator.host {
            coordinator.host = nil
            host.presentingViewController?.dismiss(animated: false)
        }
    }

    private static func topController(from anchor: UIViewController) -> UIViewController? {
        var top = anchor.view.window?.rootViewController
        while let p = top?.presentedViewController, !p.isBeingDismissed { top = p }
        return top
    }
}
