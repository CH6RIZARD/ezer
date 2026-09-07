/**
 * Version of the Terms + Privacy Policy a user is agreeing to.
 *
 * Lives in its own module rather than beside the signup handler: routes/auth.ts
 * imports upsertOAuthUser from utils/oauthUser.ts, so exporting it from there
 * and importing it back would close a require cycle — and under CommonJS the
 * second module to load sees `undefined` for the first one's exports.
 *
 * Bump this whenever either document changes materially. Comparing it against
 * User.consentVersion is what tells you who still needs to re-accept; a bare
 * timestamp cannot answer that.
 */
export const CONSENT_VERSION = '2026-09-07';
