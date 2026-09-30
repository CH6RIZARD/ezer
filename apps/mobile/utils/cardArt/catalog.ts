// =============================================================================
// Card art catalog — our own renderings, keyed by issuer
//
// These are style tokens (colours + a pattern), NOT copies of any bank's card
// artwork. Real issuer card art is copyrighted and carries trademarks (and, for
// affinity cards, third-party marks such as sports teams and universities), so
// it is deliberately not reproduced here. The colours below are approximate
// brand hues used to identify the bank — tune them, or replace an issuer's
// designs with licensed assets if a bank ever grants permission.
//
// Each issuer gets three generated looks (classic / night / light) so the
// picker always has a few options that read as "this bank", plus any curated
// extras. Add an issuer by appending one entry to ISSUERS.
// =============================================================================

import { darken, lighten } from './color';
import type { CardDesign, Issuer } from './types';

export const ISSUERS: readonly Issuer[] = [
  { id: 'pnc', name: 'PNC', aliases: ['pnc'], primary: '#F58025', secondary: '#1B365D' },
  { id: 'chase', name: 'Chase', aliases: ['chase', 'jpmorgan chase', 'jpmorgan'], primary: '#117ACA', secondary: '#0B2E59' },
  { id: 'bofa', name: 'Bank of America', aliases: ['bank of america', 'bofa', 'merrill'], primary: '#E31837', secondary: '#012169' },
  { id: 'wells-fargo', name: 'Wells Fargo', aliases: ['wells fargo'], primary: '#D71E28', secondary: '#7A1015' },
  { id: 'citi', name: 'Citi', aliases: ['citibank', 'citi'], primary: '#056DAE', secondary: '#1B2B50' },
  { id: 'capital-one', name: 'Capital One', aliases: ['capital one'], primary: '#D03027', secondary: '#004977' },
  { id: 'us-bank', name: 'U.S. Bank', aliases: ['us bank', 'u s bank'], primary: '#0C2074', secondary: '#D9272E' },
  { id: 'td', name: 'TD Bank', aliases: ['td bank', 'td'], primary: '#2E9B3D', secondary: '#1C5E2A' },
  { id: 'truist', name: 'Truist', aliases: ['truist', 'suntrust', 'bb t'], primary: '#2E1A47', secondary: '#6C3F9E' },
  { id: 'regions', name: 'Regions', aliases: ['regions'], primary: '#3C8D2F', secondary: '#1F4D18' },
  { id: 'fifth-third', name: 'Fifth Third', aliases: ['fifth third'], primary: '#1C3F94', secondary: '#0D2258' },
  { id: 'keybank', name: 'KeyBank', aliases: ['keybank', 'key bank'], primary: '#D2202F', secondary: '#6E1019' },
  // "First Citizens" is a different bank from "Citizens"; its longer alias is
  // tried first (see matching.ts), so it wins for its own name.
  { id: 'first-citizens', name: 'First Citizens', aliases: ['first citizens'], primary: '#0066A1', secondary: '#00375A' },
  { id: 'citizens', name: 'Citizens', aliases: ['citizens'], primary: '#00A651', secondary: '#005C2E' },
  { id: 'mt', name: 'M&T Bank', aliases: ['m t bank', 'm and t bank', 'mt bank'], primary: '#00543C', secondary: '#002D20' },
  { id: 'huntington', name: 'Huntington', aliases: ['huntington'], primary: '#00794B', secondary: '#00402A' },
  { id: 'bmo', name: 'BMO', aliases: ['bmo', 'bmo harris'], primary: '#0079C1', secondary: '#004A78' },
  { id: 'santander', name: 'Santander', aliases: ['santander'], primary: '#EC0000', secondary: '#7A0000' },
  { id: 'hsbc', name: 'HSBC', aliases: ['hsbc'], primary: '#DB0011', secondary: '#6E0009' },
  { id: 'ally', name: 'Ally', aliases: ['ally'], primary: '#650298', secondary: '#3A0160' },
  { id: 'discover', name: 'Discover', aliases: ['discover'], primary: '#FF6000', secondary: '#1F1F1F' },
  { id: 'amex', name: 'American Express', aliases: ['american express', 'amex'], primary: '#006FCF', secondary: '#00175A' },
  { id: 'chime', name: 'Chime', aliases: ['chime'], primary: '#1EC677', secondary: '#0B6B45' },
  { id: 'sofi', name: 'SoFi', aliases: ['sofi'], primary: '#00A8E1', secondary: '#004E6B' },
  { id: 'navy-federal', name: 'Navy Federal', aliases: ['navy federal'], primary: '#00205B', secondary: '#B8860B' },
  { id: 'usaa', name: 'USAA', aliases: ['usaa'], primary: '#00355F', secondary: '#001C33' },
  { id: 'schwab', name: 'Charles Schwab', aliases: ['charles schwab', 'schwab'], primary: '#00A0DF', secondary: '#005A80' },
  { id: 'fidelity', name: 'Fidelity', aliases: ['fidelity'], primary: '#4E8542', secondary: '#2A4D24' },
  { id: 'cash-app', name: 'Cash App', aliases: ['cash app'], primary: '#00D64F', secondary: '#007A2D' },
  { id: 'paypal', name: 'PayPal', aliases: ['paypal'], primary: '#003087', secondary: '#009CDE' },
  { id: 'venmo', name: 'Venmo', aliases: ['venmo'], primary: '#3D95CE', secondary: '#1F5A85' },
  { id: 'apple-card', name: 'Apple Card', aliases: ['apple card', 'goldman sachs'], primary: '#F2F2F2', secondary: '#1D1D1F' },
];

/** Neutral looks offered for any bank, including ones we have no entry for. */
export const GENERIC_ISSUER_ID = 'generic';

export const GENERIC_DESIGNS: readonly CardDesign[] = [
  { id: 'generic-graphite', issuerId: GENERIC_ISSUER_ID, variant: 'generic', label: 'Graphite', gradient: ['#3A3D45', '#15171C'], pattern: 'diagonal', isDefault: true },
  { id: 'generic-midnight', issuerId: GENERIC_ISSUER_ID, variant: 'generic', label: 'Midnight', gradient: ['#1E2A55', '#0B1230'], pattern: 'wave' },
  { id: 'generic-sand', issuerId: GENERIC_ISSUER_ID, variant: 'generic', label: 'Sand', gradient: ['#EFE7D8', '#CDBFA5'], pattern: 'dots' },
];

/** The generated + curated designs for one issuer. */
function designsFor(issuer: Issuer): CardDesign[] {
  const { id, primary, secondary } = issuer;
  return [
    {
      id: `${id}-classic`,
      issuerId: id,
      variant: 'classic',
      label: 'Classic',
      gradient: [primary, darken(primary, 0.45)],
      pattern: 'wave',
      isDefault: true,
    },
    {
      id: `${id}-night`,
      issuerId: id,
      variant: 'night',
      label: 'Night',
      gradient: [secondary, darken(secondary, 0.55)],
      pattern: 'diagonal',
    },
    {
      id: `${id}-light`,
      issuerId: id,
      variant: 'light',
      label: 'Light',
      gradient: [lighten(primary, 0.88), lighten(primary, 0.62)],
      pattern: 'dots',
    },
  ];
}

const DESIGNS: readonly CardDesign[] = [
  ...ISSUERS.flatMap(designsFor),
  ...GENERIC_DESIGNS,
];

const BY_ID = new Map(DESIGNS.map(d => [d.id, d]));

export function getDesign(id: string | undefined): CardDesign | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function getIssuer(id: string | undefined): Issuer | undefined {
  return id ? ISSUERS.find(i => i.id === id) : undefined;
}

/** All looks to offer for an issuer — always non-empty (falls back to generic). */
export function designsForIssuer(issuerId: string | undefined): readonly CardDesign[] {
  const own = DESIGNS.filter(d => d.issuerId === issuerId);
  return own.length > 0 ? own : GENERIC_DESIGNS;
}

/** The look used automatically for an issuer. */
export function defaultDesignFor(issuerId: string | undefined): CardDesign {
  const list = designsForIssuer(issuerId);
  return list.find(d => d.isDefault) ?? list[0];
}
