// Which website really belongs to a merchant. Pure (no React Native), so it
// is testable with Node's runner: utils/merchantDomain.test.ts.
//
// Plaid's per-transaction `website` is usually right but not always: a
// merchant row is shared by every user and keeps the FIRST website any of its
// transactions carried, so one odd transaction can pin an unrelated domain on
// it for good (a "Cancel" button once opened TikTok). A website is only
// trusted when its domain visibly matches the merchant's name.

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

/**
 * The website's host, but only if one of its labels and the merchant's name
 * share a word of 3+ letters ("Ascent Funding" ~ ascentfunding.com,
 * "Self" ~ self.inc). Otherwise undefined, and callers fall back to their
 * curated tables.
 */
export function trustedWebsiteDomain(website: string | undefined, merchantName: string): string | undefined {
  const host = domainFromWebsite(website);
  if (!host) return undefined;
  const labels = host.split('.').slice(0, -1).filter(l => l.length >= 3);
  const name = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const words = name.split(' ').filter(w => w.length >= 3);
  const squashed = name.replace(/ /g, '');
  const ok = labels.some(l => squashed.includes(l) || words.some(w => l.includes(w)));
  return ok ? host : undefined;
}

// merchantId -> Plaid website, filled by DataContext whenever subscriptions
// load, so MerchantMark (rendered from a dozen places that only have the id)
// can use the real domain without every caller threading a prop through.
const websiteByMerchant = new Map<string, string>();

export function rememberMerchantWebsites(subs: { merchantId: string; website?: string }[]): void {
  for (const s of subs) if (s.website) websiteByMerchant.set(s.merchantId, s.website);
}

export function websiteForMerchant(merchantId?: string): string | undefined {
  return merchantId ? websiteByMerchant.get(merchantId) : undefined;
}
