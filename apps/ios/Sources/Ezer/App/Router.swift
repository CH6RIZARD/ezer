// expo-router -> one Router store (port map §1.9), plus the legacy redirect routes:
// apps/mobile/app/(tabs)/saved.tsx, app/savings.tsx, app/screens/CancelFlow.tsx,
// app/screens/CardDetail.tsx, app/screens/ConfirmCancel.tsx, app/screens/MonthlyBurn.tsx,
// app/screens/RiskDetail.tsx, app/screens/SilentSubscriptions.tsx, app/screens/TrialDecision.tsx.
//
// Takes the SAME path strings as the TS, so call sites port 1:1:
//   router.push("/screens/SubscriptionDetail", ["id": id])
//   router.push("/(tabs)/payin4", ["sheet": "spending", "t": String(Int(nowMs()))])
//   router.replace("/(tabs)/home")      router.replace("/onboarding")      router.back()
//   router.params(.payin4)["sheet"]     // useLocalSearchParams() inside a tab
//
// push(tab) from a pushed screen selects the tab and pops back to the tabs (expo-router navigates to
// the existing (tabs) route). replace(screen) replaces the top of the stack. The Paywall is a
// fullScreenCover; back() from it dismisses it.

import Foundation
import Observation
import SwiftUI

enum Tab: String, CaseIterable, Hashable, Sendable {
    case home, payin4, wallet, savings
    /// Hidden route (no bar item): reachable by the legacy RiskDetail/TrialDecision links only.
    case alerts
}

/// Screens pushed on the root stack (headerShown: false everywhere, slide_from_right).
enum Route: Hashable, Sendable {
    case login(email: String?)
    case signup(email: String?)
    case settings
    case settingsAccount
    case settingsLinkedBanks
    case settingsInbox
    case settingsHelp
    case settingsNotifications
    case subscriptionDetail(id: String?)
    case drainReview
    case goalDetail(id: String)
    case bankDetail(itemId: String)
    case physicalCard
    case physicalCardApproval
    case physicalCardReview
    case reallocate(merchantId: String?, amountCents: String?, billingInterval: String?)

    /// For debug captures and logs.
    var name: String {
        switch self {
        case .login: return "login"
        case .signup: return "signup"
        case .settings: return "settings"
        case .settingsAccount: return "settings-account"
        case .settingsLinkedBanks: return "settings-linked-banks"
        case .settingsInbox: return "settings-inbox"
        case .settingsHelp: return "settings-help"
        case .settingsNotifications: return "settings-notifications"
        case .subscriptionDetail: return "subscription-detail"
        case .drainReview: return "drain-review"
        case .goalDetail: return "goal-detail"
        case .bankDetail: return "bank-detail"
        case .physicalCard: return "physical-card"
        case .physicalCardApproval: return "physical-card-approval"
        case .physicalCardReview: return "physical-card-review"
        case .reallocate: return "reallocate"
        }
    }
}

@Observable
@MainActor
final class Router {
    /// The root of the stack: app/index.tsx (gate), app/onboarding.tsx, or (tabs).
    enum Root: Hashable, Sendable { case index, onboarding, tabs }

    enum Destination: Hashable {
        case root(Root)
        case tab(Tab)
        case screen(Route)
        case paywall
    }

    var root: Root = .index
    var path: [Route] = []
    var tab: Tab = .home
    var paywallPresented = false
    private(set) var tabParams: [Tab: [String: String]] = [:]

    /// useLocalSearchParams() for a tab screen.
    func params(_ tab: Tab) -> [String: String] { tabParams[tab] ?? [:] }

    var canGoBack: Bool { paywallPresented || !path.isEmpty }

    /// useIsFocused() for a tab: its tab is selected and nothing covers the tabs.
    func isTabFocused(_ t: Tab) -> Bool {
        root == .tabs && tab == t && path.isEmpty && !paywallPresented
    }

    /// useIsFocused() for a pushed screen: it is the top of the stack and nothing covers it.
    func isRouteFocused(_ r: Route) -> Bool {
        path.last == r && !paywallPresented
    }

    // MARK: path resolution (same strings as the TS)

    static func resolve(_ href: String, _ params: [String: String]) -> Destination? {
        var p = href
        if let q = p.firstIndex(of: "?") { p = String(p[..<q]) }
        if p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        switch p {
        case "/": return .root(.index)
        case "/onboarding": return .root(.onboarding)
        case "/(tabs)", "/(tabs)/home", "/home": return .tab(.home)
        case "/(tabs)/payin4", "/payin4": return .tab(.payin4)
        // app/(tabs)/saved.tsx: legacy, superseded by the Pay in 4 tab.
        case "/(tabs)/saved", "/saved": return .tab(.payin4)
        case "/(tabs)/wallet", "/wallet": return .tab(.wallet)
        // app/savings.tsx: legacy root file, redirects to the Savings tab.
        case "/(tabs)/savings", "/savings": return .tab(.savings)
        case "/(tabs)/alerts", "/alerts": return .tab(.alerts)
        // Legacy redirect screens.
        case "/screens/CardDetail": return .tab(.wallet)
        case "/screens/MonthlyBurn": return .tab(.home)
        case "/screens/RiskDetail", "/screens/TrialDecision": return .tab(.alerts)
        case "/screens/CancelFlow", "/screens/ConfirmCancel", "/screens/SilentSubscriptions", "/screens/DrainReview":
            return .screen(.drainReview)
        case "/screens/Paywall": return .paywall
        case "/auth/login": return .screen(.login(email: params["email"]))
        case "/auth/signup": return .screen(.signup(email: params["email"]))
        case "/settings": return .screen(.settings)
        case "/settings/account": return .screen(.settingsAccount)
        case "/settings/linked-banks": return .screen(.settingsLinkedBanks)
        case "/settings/inbox": return .screen(.settingsInbox)
        case "/settings/help": return .screen(.settingsHelp)
        case "/settings/notifications": return .screen(.settingsNotifications)
        case "/screens/SubscriptionDetail": return .screen(.subscriptionDetail(id: params["id"]))
        case "/screens/GoalDetail": return .screen(.goalDetail(id: params["id"] ?? ""))
        case "/screens/BankDetail": return .screen(.bankDetail(itemId: params["itemId"] ?? ""))
        case "/screens/PhysicalCard": return .screen(.physicalCard)
        case "/screens/PhysicalCardApproval": return .screen(.physicalCardApproval)
        case "/screens/PhysicalCardReview": return .screen(.physicalCardReview)
        case "/screens/Reallocate":
            return .screen(.reallocate(merchantId: params["merchantId"], amountCents: params["amountCents"], billingInterval: params["billingInterval"]))
        default: return nil
        }
    }

    // MARK: expo-router API

    func push(_ href: String, _ params: [String: String] = [:]) {
        guard let d = Self.resolve(href, params) else { return unknown(href) }
        go(d, params, replace: false)
    }

    func replace(_ href: String, _ params: [String: String] = [:]) {
        guard let d = Self.resolve(href, params) else { return unknown(href) }
        go(d, params, replace: true)
    }

    /// router.navigate — behaves like push for this app's routes.
    func navigate(_ href: String, _ params: [String: String] = [:]) { push(href, params) }

    func push(_ route: Route) { go(.screen(route), [:], replace: false) }
    func replace(_ route: Route) { go(.screen(route), [:], replace: true) }

    /// Tab bar taps (TabTrigger).
    func selectTab(_ t: Tab) {
        tab = t
    }

    func back() {
        if paywallPresented {
            paywallPresented = false
        } else if !path.isEmpty {
            path.removeLast()
        }
    }

    private func unknown(_ href: String) {
        print("[Router] unknown route:", href)
    }

    private func go(_ d: Destination, _ params: [String: String], replace: Bool) {
        switch d {
        case let .root(r):
            paywallPresented = false
            path = []
            // Native-stack `replace` runs the push animation (slide_from_right) for these roots.
            withAnimation(.easeInOut(duration: 0.35)) { root = r }
        case let .tab(t):
            paywallPresented = false
            path = []
            root = .tabs
            tabParams[t] = params
            tab = t
        case let .screen(r):
            if replace && !path.isEmpty {
                path[path.count - 1] = r
            } else {
                path.append(r)
            }
        case .paywall:
            paywallPresented = true
        }
    }

    /// Deep links: ezer://<path>?<query> (scheme from app.json; not yet in Info.plist).
    func open(url: URL) {
        let p = "/" + ((url.host.map { $0 + url.path } ?? url.path).trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var params: [String: String] = [:]
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.forEach { params[$0.name] = $0.value ?? "" }
        push(p, params)
    }
}
