# Google Auth Platform setup (EZER iOS + Android)

EZER uses **native** Google Sign-In for Samsung/Android and iPhone — not the old “OAuth consent screen” web-only flow.

## 1. Project + API

1. Open [Google Cloud Console](https://console.cloud.google.com) and select the correct project.
2. Enable **Gmail API** if you will connect inboxes later (login itself only needs OpenID).

## 2. Branding

**Menu → Google Auth Platform → Branding** (Get Started if prompted):

- App name: `EZER`
- User support email + contact email
- **Audience: External**
- Accept User Data Policy → Create

## 3. Data Access (scopes)

- Sign-in: `openid`, `email`, `profile` (no verification)
- Inbox (later): `https://www.googleapis.com/auth/gmail.readonly` (sensitive)

## 4. Test users

**Audience → Add users** while the app is in Testing (required until verification).

## 5. Create three clients

**Clients → Create Client**

| Type | Values |
|------|--------|
| **Web application** | Used so the mobile SDK returns an ID token. No redirect needed for native ID-token login. Copy Client ID → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_CLIENT_ID` |
| **iOS** | Bundle ID: `com.ezer.app` → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + `GOOGLE_IOS_CLIENT_ID` |
| **Android** | Package: `com.ezer.app` + SHA-1 of your signing key → `GOOGLE_ANDROID_CLIENT_ID` |

### Android SHA-1

Debug:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

EAS / Play: use the SHA-1 from the keystore that signs the install you are testing.

## 6. App env

Copy `.env.example` → `.env` and fill:

```env
DEV_OAUTH_BYPASS=false
GOOGLE_CLIENT_ID="<web client id>"
GOOGLE_WEB_CLIENT_ID="<web client id>"
GOOGLE_IOS_CLIENT_ID="<ios client id>"
GOOGLE_ANDROID_CLIENT_ID="<android client id>"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="<web client id>"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="<ios client id>"
EXPO_PUBLIC_API_URL="http://<your-lan-ip>:3001"
```

Rebuild the native app after changing iOS client ID (`eas build` / dev client) so the Google URL scheme plugin picks it up.

## Auth flow

1. Mobile Google SDK → Google account picker
2. App receives Google **ID token**
3. `POST /auth/oauth/google/complete` `{ idToken }`
4. API verifies token with `google-auth-library` against configured client IDs
5. Upserts `User` + `AuthAccount`, returns EZER JWT
6. App stores JWT — no demo / bypass path
