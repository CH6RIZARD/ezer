// Pure, on-device extraction of subscription signals from ONE email.
// No network, no storage, no React Native imports — so it runs under Node's
// test runner (extract.test.ts) and nothing here can leak a message anywhere.
// The caller drops the message text as soon as this returns.

export type Cadence = 'monthly' | 'yearly' | 'weekly' | 'unknown';

export interface EmailInput {
  /** Raw From header, e.g. `Netflix <info@account.netflix.com>` */
  from: string;
  subject: string;
  /** Plain-text body (HTML already stripped by the caller). */
  text: string;
  /** href targets found in the HTML body, if any. */
  links?: string[];
  /** When the email was received — anchors dates written without a year. */
  receivedAt: Date;
}

/** Exactly the fields the server accepts (packages/shared detectedSubscriptionSchema). */
export interface Detected {
  merchant: string;
  amountCents: number | null;
  currency: string | null;
  cadence: Cadence;
  nextChargeDate: string | null;
  trialEndsAt: string | null;
  cancelUrl: string | null;
  confidence: number;
}

// Sender domain → merchant. Only needed where the domain doesn't already read
// as the brand; anything else falls back to the From display name.
const DOMAIN_MERCHANTS: Record<string, string> = {
  'netflix.com': 'Netflix',
  'spotify.com': 'Spotify',
  'apple.com': 'Apple',
  'itunes.com': 'Apple',
  'adobe.com': 'Adobe',
  'openai.com': 'ChatGPT',
  'hulu.com': 'Hulu',
  'disneyplus.com': 'Disney+',
  'hbomax.com': 'Max',
  'max.com': 'Max',
  'youtube.com': 'YouTube Premium',
  'amazon.com': 'Amazon',
  'audible.com': 'Audible',
  'dropbox.com': 'Dropbox',
  'microsoft.com': 'Microsoft',
  'planetfitness.com': 'Planet Fitness',
  'peacocktv.com': 'Peacock',
  'paramountplus.com': 'Paramount+',
  'nytimes.com': 'New York Times',
};

// Mail hosts and payment platforms say nothing about the merchant.
const NOT_A_MERCHANT = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|paypal|stripe|squareup|gumroad|paddle)\.(com|me|net)$/;

const SUBSCRIPTION_SIGNAL =
  /\b(subscription|subscribed|membership|renew(s|al|ed)?|recurring|free trial|trial (ends|will end|period)|your plan|billing (period|cycle)|auto-?renew|next (payment|billing|charge))\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

function senderDomain(from: string): string {
  const m = from.match(/@([a-z0-9.-]+)/i);
  if (!m) return '';
  const parts = m[1].toLowerCase().split('.');
  // account.netflix.com → netflix.com; ignores 2-level TLDs like co.uk on purpose
  // (good enough for brand lookup; a wrong label only lowers confidence).
  return parts.slice(-2).join('.');
}

function merchantFor(from: string): { name: string; known: boolean } | null {
  const domain = senderDomain(from);
  if (DOMAIN_MERCHANTS[domain]) return { name: DOMAIN_MERCHANTS[domain], known: true };
  if (!domain || NOT_A_MERCHANT.test(domain)) {
    // Fall back to the display name only when the domain told us nothing.
    const display = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
    return display && !display.includes('@') ? { name: display.slice(0, 80), known: false } : null;
  }
  const display = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  const label = domain.split('.')[0];
  // Prefer a display name that actually contains the domain's brand ("Spotify" over "no-reply").
  if (display && display.toLowerCase().replace(/[^a-z0-9]/g, '').includes(label)) {
    return { name: display.replace(/\s+(team|support|billing|no-?reply)$/i, '').slice(0, 80), known: false };
  }
  return { name: label.charAt(0).toUpperCase() + label.slice(1), known: false };
}

const CURRENCY_SYMBOL: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };

// Both separator conventions, with a trailing digit boundary: without the
// (?!\d) lookahead "€1.234,56" parsed as 1.23 — the match stopped after two
// decimal-looking digits with more digits still to come.
const AMOUNT_NUM = '\\d{1,5}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?';

/** '1,234.56' and '1.234,56' → cents. The last separator followed by 1-2
 *  digits is the decimal mark; every other separator groups thousands. */
function amountToCents(raw: string): number {
  const m = raw.match(/^(.+)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : raw).replace(/[.,]/g, '');
  const frac = m ? m[2].padEnd(2, '0') : '00';
  return parseInt(whole, 10) * 100 + parseInt(frac, 10);
}

function findAmount(text: string): { cents: number; currency: string } | null {
  const re = new RegExp(
    `(?:(US|CA|A)?([$€£])\\s?(${AMOUNT_NUM})(?!\\d))|(?:\\b(USD|EUR|GBP|CAD|AUD)\\s?(${AMOUNT_NUM})(?!\\d))`,
    'g'
  );
  const hits: { cents: number; currency: string; index: number }[] = [];
  for (let m; (m = re.exec(text)); ) {
    // A credit is not a price: skip "-$9.99" and amounts in refund context,
    // or a refund receipt reads as what the subscription costs.
    if (/[-−]\s*$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
    if (/\brefund(ed|s)?\b/i.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
    const raw = m[3] ?? m[5];
    let currency = m[4] ?? CURRENCY_SYMBOL[m[2]] ?? 'USD';
    if (m[1] === 'CA') currency = 'CAD';
    if (m[1] === 'A') currency = 'AUD';
    const cents = amountToCents(raw);
    if (cents > 0) hits.push({ cents, currency, index: m.index });
  }
  if (!hits.length) return null;
  // The charged figure usually sits right after "total"/"charged"/"price";
  // otherwise the first amount in the email is the best guess.
  // \b before the cue: "Subtotal" must not count as "total".
  const near = hits.find(h => /\b(total|charged|amount|price|billed|paid|pay)\W{0,40}$/i.test(text.slice(Math.max(0, h.index - 45), h.index)));
  const pick = near ?? hits[0];
  return { cents: pick.cents, currency: pick.currency };
}

function findCadence(text: string): Cadence {
  if (/\b(per|a|each|every|\/)\s?(month|mo)\b|\bmonthly\b/i.test(text)) return 'monthly';
  if (/\b(per|a|each|every|\/)\s?(year|yr)\b|\b(annual|annually|yearly)\b/i.test(text)) return 'yearly';
  if (/\b(per|a|each|every|\/)\s?week\b|\bweekly\b/i.test(text)) return 'weekly';
  return 'unknown';
}

function toDate(y: number, monthIdx: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, monthIdx, d, 12));
  return dt.getUTCMonth() === monthIdx && d >= 1 ? dt : null;
}

/** First date in `s`, inferring the year from `ref` when it's missing. */
function parseDate(s: string, ref: Date): Date | null {
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toDate(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/); // US style M/D/Y
  if (m) return toDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
  // \b after the day, or "15 October 2026" reads as "October 20".
  m = s.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'));
  let monthIdx: number, day: number, year: number | undefined;
  if (m) {
    monthIdx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    day = +m[2];
    year = m[3] ? +m[3] : undefined;
  } else {
    m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:,?\\s+(\\d{4}))?`, 'i'));
    if (!m) return null;
    monthIdx = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    day = +m[1];
    year = m[3] ? +m[3] : undefined;
  }
  if (year) return toDate(year, monthIdx, day);
  // No year written: the next occurrence on or after the email's date.
  const y = ref.getUTCFullYear();
  const guess = toDate(y, monthIdx, day);
  if (guess && guess.getTime() >= ref.getTime() - 86_400_000) return guess;
  return toDate(y + 1, monthIdx, day);
}

function dateAfter(text: string, cue: RegExp, ref: Date): Date | null {
  const m = cue.exec(text);
  if (!m) return null;
  return parseDate(text.slice(m.index + m[0].length, m.index + m[0].length + 60), ref);
}

const TRIAL_CUE = /\b(trial (ends|will end|expires|is over)( on)?|free (trial )?(until|through|ends)|you('ll| will) (be|first be) (charged|billed)( on)?|first (payment|charge|bill)( date)?( is| will be)?( on)?)\b/i;
const NEXT_CUE = /\b(renews?( automatically)? on|will renew( on)?|next (billing|payment|charge|renewal)( date)?( is| will be)?( on)?|(billed|charged) (again )?on|renewal date( is)?)\b/i;

function findCancelUrl(links: string[] | undefined): string | null {
  const url = links?.find(l => /^https:\/\//i.test(l) && /cancel|unsubscribe-plan|manage|membership|subscription|account\/plan|billing/i.test(l) && !/unsubscribe(?!-plan)|email-preferences|privacy/i.test(l));
  return url ? url.slice(0, 500) : null;
}

export function extractSubscription(email: EmailInput): Detected | null {
  const haystack = `${email.subject}\n${email.text}`;
  if (!SUBSCRIPTION_SIGNAL.test(haystack)) return null;

  const merchant = merchantFor(email.from);
  if (!merchant) return null;

  const amount = findAmount(haystack);
  const cadence = findCadence(haystack);
  const trialEnd = /trial/i.test(haystack) ? dateAfter(haystack, TRIAL_CUE, email.receivedAt) : null;
  const next = dateAfter(haystack, NEXT_CUE, email.receivedAt);

  // A subscription signal with nothing concrete (no price, cycle or date) is
  // noise — a newsletter "manage your subscription" footer, say.
  if (!amount && cadence === 'unknown' && !trialEnd && !next) return null;

  let confidence = 0.35;
  if (amount) confidence += 0.2;
  if (cadence !== 'unknown') confidence += 0.2;
  if (trialEnd || next) confidence += 0.15;
  if (merchant.known) confidence += 0.1;

  return {
    merchant: merchant.name,
    amountCents: amount?.cents ?? null,
    currency: amount?.currency ?? null,
    cadence,
    nextChargeDate: next ? next.toISOString() : null,
    trialEndsAt: trialEnd ? trialEnd.toISOString() : null,
    cancelUrl: findCancelUrl(email.links),
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
  };
}

/** Collapse several emails from one merchant into its newest, most complete record. */
export function mergeByMerchant(items: (Detected & { receivedAt: number })[]): Detected[] {
  const byKey = new Map<string, Detected & { receivedAt: number }>();
  for (const it of [...items].sort((a, b) => a.receivedAt - b.receivedAt)) {
    const key = it.merchant.toLowerCase();
    const prev = byKey.get(key);
    byKey.set(key, prev ? {
      ...it,
      amountCents: it.amountCents ?? prev.amountCents,
      currency: it.currency ?? prev.currency,
      cadence: it.cadence !== 'unknown' ? it.cadence : prev.cadence,
      nextChargeDate: it.nextChargeDate ?? prev.nextChargeDate,
      trialEndsAt: it.trialEndsAt ?? prev.trialEndsAt,
      cancelUrl: it.cancelUrl ?? prev.cancelUrl,
      confidence: Math.max(it.confidence, prev.confidence),
    } : it);
  }
  return [...byKey.values()].map(({ receivedAt, ...d }) => d);
}

/** HTML → plain text plus href list. Deliberately crude; good enough for receipts. */
export function htmlToText(html: string): { text: string; links: string[] } {
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    // Numeric entities BEFORE &amp;, so "&amp;#8364;" (literal text) is not
    // double-decoded into €. Covers &#8364; / &#163; / &#36; and friends.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&euro;/g, '€')
    .replace(/&pound;/g, '£')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return { text, links };
}
