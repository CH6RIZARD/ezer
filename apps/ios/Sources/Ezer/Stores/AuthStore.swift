// Port of apps/mobile/utils/AuthContext.tsx
//
// Session state. At launch: restore `@ezer_user` + `@ezer_onboarding_complete` + the Keychain
// token, then ASK THE SERVER (POST /auth/session): a stored user is a CLAIM, not a session.
// 401/403/404 -> sign out; offline / 5xx -> keep the session (being offline does not log you out);
// no token -> drop the stored user.
//
//   @Environment(AuthStore.self) private var auth
//   let res = await auth.login(email, password)
//   switch res { case .success(let done): ...; case .failure(let error): AppAlert.alert(...) }

import Foundation
import Observation

struct User: Codable, Hashable, Sendable {
    var id: String
    var email: String
    var name: String
    var phone: String?
    var avatarUrl: String?
    var createdAt: String
}

/** Outcome of an email sign-in or sign-up, carrying the server's reason. */
enum AuthResult: Sendable {
    case success(hasCompletedOnboarding: Bool)
    case failure(error: String)

    var ok: Bool { if case .success = self { return true }; return false }
    var error: String? { if case let .failure(e) = self { return e }; return nil }
    var hasCompletedOnboarding: Bool { if case let .success(h) = self { return h }; return false }
}

/// { ok: true, hasCompletedOnboarding } | { ok: false, reason: 'cancelled' } |
/// { ok: false, reason: 'unavailable' | 'failed', error? }
enum ProviderLoginResult: Sendable {
    case success(hasCompletedOnboarding: Bool)
    case cancelled
    case unavailable(error: String?)
    case failed(error: String?)

    var ok: Bool { if case .success = self { return true }; return false }
}

enum AuthProvider: String, Sendable { case google, apple, microsoft }

@Observable
@MainActor
final class AuthStore {
    private static let USER_KEY = "@ezer_user"
    private static let ONBOARDING_KEY = "@ezer_onboarding_complete"

    private(set) var user: User?
    private(set) var isLoading = true
    private(set) var hasCompletedOnboarding = false

    var isAuthenticated: Bool { user != nil }

    init() {
        Task { await restore() }
    }

    private func restore() async {
        defer { isLoading = false }
        let savedUser = KV.get(Self.USER_KEY)
        let onboarding = KV.get(Self.ONBOARDING_KEY)
        let token = api.getToken()
        hasCompletedOnboarding = onboarding == "true"

        guard let savedUser else { return }

        // Parse ONCE, before the server check. A value that does not parse is not a stored user.
        guard let data = savedUser.data(using: .utf8), let storedUser = try? JSONDecoder().decode(User.self, from: data) else {
            KV.remove(Self.USER_KEY)
            return
        }

        if token == nil {
            KV.remove(Self.USER_KEY)
            return
        }

        do {
            // Sliding session (routes/auth.ts): keep the renewed token.
            if let fresh = try await api.session()?.token { api.setToken(fresh) }
            user = storedUser
        } catch {
            let status = error.httpStatus
            if status == 401 || status == 403 || status == 404 {
                print("[Auth] stored session rejected by server; signing out")
                KV.remove(Self.USER_KEY)
                api.clearToken()
            } else {
                // Unreachable or 5xx — keep the session and let the app retry.
                user = storedUser
            }
        }
    }

    private func persistUser(_ u: User) {
        KV.setJSON(Self.USER_KEY, u)
        user = u
    }

    private static func emailLocal(_ email: String) -> String {
        String(email.split(separator: "@", omittingEmptySubsequences: false).first ?? "")
    }

    func login(_ email: String, _ password: String) async -> AuthResult {
        do {
            // RN: a missing token made SecureStore.setItemAsync throw, failing the sign-in. Lenient
            // decoding turns it into "", so check it — and the Keychain write — explicitly.
            guard let d = try await api.login(email: email, password: password), !d.token.isEmpty, api.setToken(d.token) else {
                return .failure(error: "Could not sign in.")
            }
            persistUser(User(
                id: d.userId,
                email: d.email,
                name: (d.name?.isEmpty == false ? d.name! : Self.emailLocal(email)),
                createdAt: toISOString(Date())
            ))
            return .success(hasCompletedOnboarding: KV.get(Self.ONBOARDING_KEY) == "true")
        } catch {
            // The server's own words. "Invalid email or password" for an unreachable API sends
            // people to reset a password that was correct.
            print("[Auth] login error:", error.message)
            return .failure(error: error.message.isEmpty ? "Could not sign in." : error.message)
        }
    }

    func signup(_ email: String, _ password: String, _ name: String, _ dateOfBirth: String) async -> AuthResult {
        do {
            guard let d = try await api.signup(email: email, password: password, name: name, dateOfBirth: dateOfBirth),
                  !d.token.isEmpty, api.setToken(d.token) else {
                return .failure(error: "Could not create your account.")
            }
            persistUser(User(
                id: d.userId,
                email: d.email,
                name: (d.name?.isEmpty == false ? d.name! : name),
                createdAt: toISOString(Date())
            ))
            return .success(hasCompletedOnboarding: false)
        } catch {
            print("[Auth] signup error:", error.message)
            return .failure(error: error.message.isEmpty ? "Could not create your account." : error.message)
        }
    }

    /**
     * Real provider sign-in: the device runs the provider's flow and the ID token goes to
     * /auth/oauth/<provider>/complete, where the SERVER verifies it before minting a session.
     */
    func loginWithProvider(_ provider: AuthProvider) async -> ProviderLoginResult {
        do {
            let path: String
            let payload: JSON
            switch provider {
            case .google:
                switch try await signInWithGoogle() {
                case .cancelled: return .cancelled
                case let .success(idToken):
                    path = "google"
                    payload = ["idToken": .string(idToken)]
                }
            case .apple:
                switch try await signInWithApple() {
                case .cancelled: return .cancelled
                case let .success(identityToken, email, givenName, familyName):
                    path = "apple"
                    var p: [String: JSON] = ["identityToken": .string(identityToken)]
                    if let email { p["email"] = .string(email) }
                    if givenName != nil || familyName != nil {
                        var fn: [String: JSON] = [:]
                        if let givenName { fn["givenName"] = .string(givenName) }
                        if let familyName { fn["familyName"] = .string(familyName) }
                        p["fullName"] = .object(fn)
                    }
                    payload = .object(p)
                }
            case .microsoft:
                switch try await signInWithMicrosoft() {
                case .cancelled: return .cancelled
                case let .success(idToken):
                    path = "microsoft"
                    payload = ["idToken": .string(idToken)]
                }
            }

            guard let out = try await api.oauthComplete(provider: path, payload: payload), !out.token.isEmpty, api.setToken(out.token) else {
                return .failed(error: nil)
            }
            persistUser(User(
                id: out.userId,
                email: out.email,
                name: (out.name?.isEmpty == false ? out.name! : Self.emailLocal(out.email)),
                createdAt: toISOString(Date())
            ))
            return .success(hasCompletedOnboarding: KV.get(Self.ONBOARDING_KEY) == "true")
        } catch {
            let message = error.message
            print("[Auth] provider login error:", message)
            // A missing native module or client ID is "not available here", which is a different
            // thing to "your credentials were rejected".
            let unavailable = message.range(
                of: "Missing EXPO_PUBLIC_|not available|only available on iOS|native module|RNGoogleSignin|Cannot find module",
                options: [.regularExpression, .caseInsensitive]) != nil
            let err: String? = message.isEmpty ? nil : message
            return unavailable ? .unavailable(error: err) : .failed(error: err)
        }
    }

    func logout() async {
        KV.remove(Self.USER_KEY)
        api.clearToken()
        // Photos of the user's own cards are stored on this device only; they must not outlive
        // the session (this also covers account deletion, which ends in logout()).
        clearAllCardArtPrefs()
        // The cached Spending Power outcome and the card design are this account's, not the
        // device's: left behind, the next account to sign in here would see them.
        CardDesignStore.clearSpendingPowerOutcome()
        CardDesignStore.clearCardDesign()
        // NOT the passcode: LockGate clears it once the session has really ended.
        user = nil
    }

    func updateUser(_ update: (inout User) -> Void) {
        guard var u = user else { return }
        update(&u)
        persistUser(u)
    }

    func completeOnboarding() {
        KV.set(Self.ONBOARDING_KEY, "true")
        hasCompletedOnboarding = true
    }
}
