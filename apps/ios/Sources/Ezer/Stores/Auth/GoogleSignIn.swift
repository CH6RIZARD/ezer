// Port of apps/mobile/utils/googleAuth.ts
//
// TODO(native SDK / config): no Google client is configured for this build, and production has
// no Google audience set (api.md §3.7: "Google OAuth is not configured"). Keeps the API shape and
// throws the same 'Missing …' message, which AuthStore maps to `unavailable`. Once the server is
// fixed, the no-SDK route is ASWebAuthenticationSession + PKCE against accounts.google.com with the
// iOS client (api.md §3.7), returning the id_token here.

import Foundation

enum GoogleSignInResult: Sendable {
    case cancelled
    case success(idToken: String)
}

@MainActor
func signInWithGoogle() async throws -> GoogleSignInResult {
    throw APIError(
        message: "Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Create a Web client in Google Auth Platform (used to obtain an ID token) and set it in .env.",
        status: nil
    )
}
