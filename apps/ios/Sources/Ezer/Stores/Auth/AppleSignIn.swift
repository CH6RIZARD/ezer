// Port of apps/mobile/utils/appleAuth.ts
//
// TODO(capability): Sign in with Apple needs the com.apple.developer.applesignin entitlement,
// which a free (Personal) Apple ID team cannot get, and the server only accepts the
// com.ezersaves.app / com.ezer.app audiences (api.md §3.7). The call therefore fails on the
// 'unavailable' path with the RN message. With a paid team: ASAuthorizationAppleIDProvider,
// requestedScopes [.fullName, .email], identityToken as a UTF-8 string.

import Foundation

enum AppleSignInResult: Sendable {
    case cancelled
    case success(identityToken: String, email: String?, givenName: String?, familyName: String?)
}

@MainActor
func signInWithApple() async throws -> AppleSignInResult {
    throw APIError(message: "Sign in with Apple is not available on this device.", status: nil)
}
