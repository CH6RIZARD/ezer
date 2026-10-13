// Port of apps/mobile/utils/microsoftAuth.ts
//
// TODO(config): portable with ASWebAuthenticationSession + PKCE against
// login.microsoftonline.com/common/oauth2/v2.0 (redirect ezer://auth/microsoft, scopes openid
// profile email), but EXPO_PUBLIC_MICROSOFT_CLIENT_ID is unset in every build and production
// returns "Microsoft OAuth is not configured". Throws the RN message (-> `unavailable`).

import Foundation

enum MicrosoftSignInResult: Sendable {
    case cancelled
    case success(idToken: String)
}

let MICROSOFT_DISCOVERY = (
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
)

@MainActor
func signInWithMicrosoft() async throws -> MicrosoftSignInResult {
    throw APIError(
        message: "Missing EXPO_PUBLIC_MICROSOFT_CLIENT_ID. Create a Microsoft Entra app registration and set it in .env.",
        status: nil
    )
}
