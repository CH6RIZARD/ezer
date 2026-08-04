// =============================================================================
// EZER — subscription cancellation deep links
//
// Cancel / "Cut it" must land the user on THAT service's real cancellation
// page. Resolution order:
//
//   1. `cancellationUrl` on the merchant record (API-supplied; 8 demo merchants
//      already carry real ones — netflix.com/cancelplan, account.adobe.com/plans…)
//   2. Curated table for well-known services.
//   3. AUTO-DISCOVERY from the merchant's website. Plaid does not return a
//      cancellation URL, but it does return merchant identity including a
//      `website`. We take that domain and probe a ranked list of the paths
//      cancellation actually lives behind (/account/subscription, /cancel,
//      /settings/billing, …), then use the first one that answers. Results are
//      cached so a merchant is only ever probed once per device.
//   4. Scoped search, so nothing ever dead-ends.
//
// Steps 1–2 are instant. Step 3 is a network call, so callers should treat
// resolution as async and disable the button while it runs.
// =============================================================================

import { Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMerchantById } from './demoData';

const CACHE_KEY = '@ezer_cancel_urls';
/** Per-request budget. Probing must never make a Cancel button feel hung. */
const PROBE_TIMEOUT_MS = 2500;
/** Whole-discovery budget across all candidate paths. */
const DISCOVERY_BUDGET_MS = 6000;

/** Same normalisation the logo resolver uses, so keys stay consistent. */
function normalise(raw?: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[*#]/g, ' ')
    .replace(/\b(inc|llc|ltd|co|corp|usa|com|subscription|sub|monthly|payment|recurring|bill|autopay)\b/g, ' ')
    .replace(/[^a-z0-9+. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Curated destinations, pointing at the ACCOUNT/PLAN page where cancellation
 * actually lives — not a marketing or support page.
 */
const FALLBACK_CANCEL_URL: Record<string, string> = {
  netflix: 'https://www.netflix.com/cancelplan',
  spotify: 'https://www.spotify.com/account/subscription/',
  adobe: 'https://account.adobe.com/plans',
  youtube: 'https://www.youtube.com/paid_memberships',
  disney: 'https://www.disneyplus.com/account/subscription',
  icloud: 'https://support.apple.com/en-us/HT202039',
  apple: 'https://support.apple.com/en-us/HT202039',
  hulu: 'https://secure.hulu.com/account',
  hbomax: 'https://www.max.com/account',
  max: 'https://www.max.com/account',
  chatgpt: 'https://chatgpt.com/#settings/Subscription',
  openai: 'https://chatgpt.com/#settings/Subscription',
  amazon: 'https://www.amazon.com/gp/primecentral',
  dropbox: 'https://www.dropbox.com/account/plan',
  notion: 'https://www.notion.so/my-account',
  audible: 'https://www.audible.com/account/membership',
  paramount: 'https://www.paramountplus.com/account/',
  peacock: 'https://www.peacocktv.com/account/plans',
};

/** Domains for the demo set, so discovery works without Plaid connected. */
const KNOWN_DOMAIN: Record<string, string> = {
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  adobe: 'adobe.com',
  youtube: 'youtube.com',
  hulu: 'hulu.com',
  icloud: 'apple.com',
  apple: 'apple.com',
  chatgpt: 'openai.com',
  openai: 'openai.com',
  fitpass: 'classpass.com',
  hbomax: 'max.com',
  disney: 'disneyplus.com',
};

/**
 * Where cancellation lives, most-specific first. Ordering matters: we take the
 * first path that responds, so `/account/subscription` must be tried before a
 * bare `/account`, which almost always exists but is less useful.
 */
const CANCEL_PATHS = [
  '/account/subscription',
  '/account/subscriptions',
  '/account/plan',
  '/account/membership',
  '/cancel',
  '/cancelplan',
  '/settings/subscription',
  '/settings/billing',
  '/account/billing',
  '/billing',
  '/account',
  '/settings',
];

export interface CancellationTarget {
  url: string;
  /** How we got here — the UI should be honest when this is a guess. */
  source: 'merchant' | 'known' | 'discovered' | 'search';
  merchantName: string;
}

// --- cache -------------------------------------------------------------------

type UrlCache = Record<string, string>;

async function readCache(): Promise<UrlCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as UrlCache) : {};
  } catch {
    return {};
  }
}

async function writeCache(domain: string, url: string): Promise<void> {
  try {
    const cache = await readCache();
    cache[domain] = url;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A cache miss next time is not worth surfacing.
  }
}

// --- discovery ---------------------------------------------------------------

/** Strip a Plaid `website` ("https://www.netflix.com/") down to a bare host. */
export function domainFromWebsite(website?: string): string | undefined {
  const raw = (website ?? '').trim();
  if (!raw) return undefined;
  const host = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0]
    .trim()
    .toLowerCase();
  return host.includes('.') ? host : undefined;
}

async function probe(url: string): Promise<boolean> {
  // AbortController is available in RN's fetch polyfill.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // HEAD keeps it cheap; some hosts reject HEAD, so a 405 still counts as
    // "this path exists". Anything below 400, plus 401/403 (auth-walled
    // account pages, which is exactly what we are looking for), is a hit.
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    return res.status < 400 || res.status === 401 || res.status === 403 || res.status === 405;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk CANCEL_PATHS against a domain and return the first that answers.
 * Bounded by DISCOVERY_BUDGET_MS so a slow host cannot hang the button.
 */
export async function discoverCancellationUrl(domain: string): Promise<string | undefined> {
  const cache = await readCache();
  if (cache[domain]) return cache[domain];

  const deadline = Date.now() + DISCOVERY_BUDGET_MS;

  for (const path of CANCEL_PATHS) {
    if (Date.now() > deadline) break;
    const url = `https://${domain}${path}`;
    if (await probe(url)) {
      await writeCache(domain, url);
      return url;
    }
  }
  return undefined;
}

// --- resolution --------------------------------------------------------------

/** Instant resolution — record and curated table only, no network. */
export function resolveCancellationUrlSync(
  merchantName: string,
  merchantId?: string,
  merchantCancellationUrl?: string
): CancellationTarget | undefined {
  const explicit = merchantCancellationUrl ?? getMerchantById(merchantId ?? '')?.cancellationUrl;
  if (explicit) return { url: explicit, source: 'merchant', merchantName };

  for (const candidate of [normalise(merchantId), normalise(merchantName)]) {
    if (!candidate) continue;
    const head = candidate.split(' ')[0];
    const hit = FALLBACK_CANCEL_URL[candidate] ?? FALLBACK_CANCEL_URL[head];
    if (hit) return { url: hit, source: 'known', merchantName };
  }
  return undefined;
}

/**
 * Full resolution. Falls through to auto-discovery against the merchant's
 * website, then to a scoped search. Never rejects.
 *
 * @param website Plaid merchant `website`, when available.
 */
export async function resolveCancellationUrl(
  merchantName: string,
  merchantId?: string,
  merchantCancellationUrl?: string,
  website?: string
): Promise<CancellationTarget> {
  const quick = resolveCancellationUrlSync(merchantName, merchantId, merchantCancellationUrl);
  if (quick) return quick;

  // Domain from Plaid's website field, else the demo lookup.
  const domain =
    domainFromWebsite(website) ??
    KNOWN_DOMAIN[normalise(merchantId)] ??
    KNOWN_DOMAIN[normalise(merchantName)] ??
    KNOWN_DOMAIN[normalise(merchantName).split(' ')[0]];

  if (domain) {
    const found = await discoverCancellationUrl(domain);
    if (found) return { url: found, source: 'discovered', merchantName };
  }

  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(`cancel ${merchantName} subscription`)}`,
    source: 'search',
    merchantName,
  };
}

// --- opening -----------------------------------------------------------------

export async function openCancellation(target: CancellationTarget): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(target.url);
    if (!supported) {
      Alert.alert('Could not open the page', `Cancel ${target.merchantName} at:\n${target.url}`);
      return false;
    }
    await Linking.openURL(target.url);
    return true;
  } catch {
    Alert.alert('Could not open the page', `Cancel ${target.merchantName} at:\n${target.url}`);
    return false;
  }
}

/** Resolve (discovering if needed) and open. */
export async function cancelSubscription(
  merchantName: string,
  merchantId?: string,
  merchantCancellationUrl?: string,
  website?: string
): Promise<CancellationTarget> {
  const target = await resolveCancellationUrl(
    merchantName,
    merchantId,
    merchantCancellationUrl,
    website
  );
  await openCancellation(target);
  return target;
}
