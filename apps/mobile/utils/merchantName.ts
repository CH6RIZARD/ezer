// A merchant name fit to show. The API's canonical name is a cleaned bank
// descriptor and is the KEY the server matches charges on, so it must stay
// as it is ("acct paymtascent funding recur ascent paymt" — the `*` between
// PAYMT and ASCENT was stripped without a space). This only changes what the
// user reads; nothing sends the pretty name back.

const NOISE = new Set([
  'acct', 'account', 'paymt', 'pymt', 'pmt', 'payment', 'payments', 'recur', 'recurring',
  'autopay', 'ach', 'web', 'des', 'id', 'ref', 'online', 'debit', 'credit', 'card', 'purchase',
  'pos', 'txn', 'trans', 'transaction', 'chk', 'chkcard', 'visa', 'mastercard', 'www', 'com',
  'inc', 'llc', 'ltd', 'co', 'corp', 'bill', 'billing', 'subscription', 'sub', 'monthly', 'auto',
]);
/** A noise word glued to the front of a real word: "paymtascent" → "ascent". */
const GLUED = ['paymt', 'pymt', 'acct', 'recur'];

export function prettyMerchantName(raw: string): string {
  const words: string[] = [];
  for (let w of raw.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w || /\d/.test(w)) continue;
    const g = GLUED.find(p => w.startsWith(p) && w.length - p.length >= 3);
    if (g) w = w.slice(g.length);
    if (NOISE.has(w) || words.includes(w)) continue;
    words.push(w);
  }
  if (!words.length) return raw;
  return words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
