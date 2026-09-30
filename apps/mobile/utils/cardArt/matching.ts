// Matches a linked account's bank name to a catalog issuer.

import { ISSUERS } from './catalog';
import type { Issuer } from './types';

/** Lowercase words only: "U.S. Bank, N.A." -> ["us", "bank", "n", "a"]. */
export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\./g, '') // "U.S." -> "us"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** True when `needle` appears in `hay` as a run of whole words. */
function containsWordRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// Longest alias first, so "bank of america" is tried before any shorter alias
// could claim the same words.
const ALIAS_INDEX: { tokens: string[]; issuer: Issuer }[] = ISSUERS.flatMap(issuer =>
  issuer.aliases.map(alias => ({ tokens: tokenize(alias), issuer })),
).sort((a, b) => b.tokens.length - a.tokens.length);

/**
 * Finds the catalog issuer for a bank name, or undefined.
 *
 * Whole-word matching is deliberate: "Citizens Bank" must not match "citi",
 * and "Regions" must not match inside another word.
 */
export function matchIssuer(institutionName: string | undefined | null): Issuer | undefined {
  if (!institutionName) return undefined;
  const hay = tokenize(institutionName);
  if (hay.length === 0) return undefined;
  return ALIAS_INDEX.find(entry => containsWordRun(hay, entry.tokens))?.issuer;
}
