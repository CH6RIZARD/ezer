// =============================================================================
// Environment loading — MUST be the first import in src/index.ts
//
// Calling dotenv inside index.ts is not enough. `tsx` (esbuild) applies ES
// module semantics, so every `import` in a file is hoisted and evaluated
// BEFORE any statement in that file's body. A `loadEnv()` call sitting between
// the imports therefore runs after `./routes/*` have already been evaluated —
// and any module that reads process.env at module scope has already read
// undefined.
//
// That is not theoretical. It produced two live faults:
//
//   * `routes/processorWebhook.ts` does
//         const SIGNING_SECRET = process.env.PROCESSOR_WEBHOOK_SECRET || ''
//     at module scope, so every settlement webhook was rejected with
//     WEBHOOK_NOT_CONFIGURED and no transfer could ever settle.
//
//   * `utils/jwt.ts` and `utils/encryption.ts` read at module scope too, but
//     with hardcoded DEV FALLBACKS. They did not fail loudly — they silently
//     signed tokens and encrypted Plaid access tokens with a default key
//     committed to the repo. A missing env var producing working-but-insecure
//     behaviour is worse than one that crashes.
//
// Importing this module first works because ES modules are evaluated in
// dependency order, and for sibling imports, in source order. Its side effect
// runs before any other import is evaluated.
//
// It is a no-op on Railway and any other platform that injects real variables:
// dotenv never overwrites something already present in process.env.
// =============================================================================

import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Nearest first. `apps/api/.env` (if anyone adds one) beats the monorepo root,
// and a real platform variable beats both.
loadEnv();
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Secrets that must never fall back to a default.
 *
 * `utils/jwt.ts` and `utils/encryption.ts` both default when unset. In
 * development that is a convenience; in production it means tokens anyone can
 * forge and bank credentials encrypted with a key that is in the git history.
 * Fail at boot instead — a container that will not start is a far better
 * outcome than one that starts insecure.
 */
const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'] as const;

if (process.env.NODE_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: missing required environment variable(s): ${missing.join(', ')}. ` +
        `See DEPLOY-API.md §1.`
    );
  }
}
