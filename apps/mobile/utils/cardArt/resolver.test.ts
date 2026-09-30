// Run: pnpm --filter @ezer/mobile exec npx tsx --test utils/cardArt/resolver.test.ts
// (Node's built-in runner; the mobile app has no Jest setup and this avoids adding one.)

import test from 'node:test';
import assert from 'node:assert/strict';

import { finishFor, resolveCardArt } from './resolver';
import { matchIssuer } from './matching';
import { designsForIssuer, defaultDesignFor, getDesign, ISSUERS } from './catalog';
import { isHexColor } from './color';

test('matchIssuer: common bank-name spellings', () => {
  assert.equal(matchIssuer('PNC Bank')?.id, 'pnc');
  assert.equal(matchIssuer('PNC Bank, National Association')?.id, 'pnc');
  assert.equal(matchIssuer('JPMorgan Chase Bank, N.A.')?.id, 'chase');
  assert.equal(matchIssuer('Bank of America')?.id, 'bofa');
  assert.equal(matchIssuer('U.S. Bank')?.id, 'us-bank');
  assert.equal(matchIssuer('US Bank')?.id, 'us-bank');
  assert.equal(matchIssuer('M&T Bank')?.id, 'mt');
  assert.equal(matchIssuer('Capital One')?.id, 'capital-one');
  assert.equal(matchIssuer('Wells Fargo')?.id, 'wells-fargo');
});

test('matchIssuer: whole-word matching prevents look-alike collisions', () => {
  assert.equal(matchIssuer('Citizens Bank')?.id, 'citizens');
  assert.equal(matchIssuer('First Citizens Bank')?.id, 'first-citizens');
  assert.equal(matchIssuer('Citibank')?.id, 'citi');
  // "Regions" inside another word must not match.
  assert.equal(matchIssuer('Subregions Credit Union'), undefined);
});

test('matchIssuer: unknown or empty names', () => {
  assert.equal(matchIssuer('Some Tiny Credit Union'), undefined);
  assert.equal(matchIssuer(''), undefined);
  assert.equal(matchIssuer(undefined), undefined);
  assert.equal(matchIssuer(null), undefined);
});

test('every issuer alias resolves back to its own issuer', () => {
  for (const issuer of ISSUERS) {
    for (const alias of issuer.aliases) {
      assert.equal(matchIssuer(alias)?.id, issuer.id, `alias "${alias}" -> ${issuer.id}`);
    }
  }
});

test('catalog: every issuer has a default design and valid colours', () => {
  for (const issuer of ISSUERS) {
    assert.ok(isHexColor(issuer.primary), `${issuer.id} primary`);
    assert.ok(isHexColor(issuer.secondary), `${issuer.id} secondary`);
    const list = designsForIssuer(issuer.id);
    assert.ok(list.length >= 3, `${issuer.id} has designs`);
    assert.equal(list.filter(d => d.isDefault).length, 1, `${issuer.id} exactly one default`);
    for (const d of list) {
      assert.ok(isHexColor(d.gradient[0]) && isHexColor(d.gradient[1]), `${d.id} gradient`);
    }
  }
  // Design ids are globally unique (they are the persisted preference key).
  const ids = ISSUERS.flatMap(i => designsForIssuer(i.id).map(d => d.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('catalog: unknown issuer falls back to generic designs', () => {
  assert.ok(designsForIssuer('nope').length > 0);
  assert.equal(defaultDesignFor(undefined).issuerId, 'generic');
});

test('resolve: PNC debit with no prefs -> catalog tier, PNC default design', () => {
  const r = resolveCardArt({ institutionName: 'PNC Bank', displayName: 'Spend', issuerColorHint: '#f58025' });
  assert.equal(r.tier, 'catalog');
  assert.equal(r.issuerId, 'pnc');
  assert.equal(r.designId, 'pnc-classic');
  assert.equal(r.maskNumberBand, false);
});

test('resolve: precedence photo > picked design > network art > catalog > template', () => {
  const input = {
    institutionName: 'PNC Bank',
    networkTokenArtUri: 'https://example.test/art.png',
  };
  const photo = resolveCardArt(input, { photoUri: 'data:image/jpeg;base64,AAA', designId: 'pnc-night' });
  assert.equal(photo.tier, 'user_photo');
  assert.equal(photo.maskNumberBand, true);

  const picked = resolveCardArt(input, { designId: 'pnc-night' });
  assert.equal(picked.tier, 'user_design');
  assert.equal(picked.designId, 'pnc-night');

  const network = resolveCardArt(input, {});
  assert.equal(network.tier, 'network_token');
  assert.equal(network.imageUri, input.networkTokenArtUri);
  assert.equal(network.maskNumberBand, false, 'network art has no PAN to cover');

  const catalog = resolveCardArt({ institutionName: 'PNC Bank' }, {});
  assert.equal(catalog.tier, 'catalog');

  const template = resolveCardArt({ institutionName: 'Some Tiny Credit Union', issuerColorHint: '#123456' }, {});
  assert.equal(template.tier, 'template');
});

test('resolve: a stale designId is ignored, not an error', () => {
  const r = resolveCardArt({ institutionName: 'Chase' }, { designId: 'removed-design' });
  assert.equal(r.tier, 'catalog');
  assert.equal(getDesign('removed-design'), undefined);
});

test('resolve: template uses the Plaid colour when valid, the fallback otherwise', () => {
  const fallback = { gradient: ['#111111', '#000000'] as const, fg: '#fff', fgDim: 'rgba(255,255,255,.5)' };
  const withColor = resolveCardArt({ institutionName: 'Tiny CU', issuerColorHint: '#00AA55' }, {}, fallback);
  assert.equal(withColor.gradient[0], '#00aa55');
  const badColor = resolveCardArt({ institutionName: 'Tiny CU', issuerColorHint: 'not-a-colour' }, {}, fallback);
  assert.deepEqual(badColor.gradient, fallback.gradient);
  const nothing = resolveCardArt({}, {}, fallback);
  assert.equal(nothing.tier, 'template');
  assert.deepEqual(nothing.gradient, fallback.gradient);
});

test('resolve: text colour stays legible on light designs', () => {
  const light = resolveCardArt({ institutionName: 'PNC Bank' }, { designId: 'pnc-light' });
  assert.equal(light.fg, '#241A38');
  const dark = resolveCardArt({ institutionName: 'PNC Bank' }, { designId: 'pnc-night' });
  assert.equal(dark.fg, '#FFFFFF');
});

test('resolve: the bank logo is passed through on gradient tiers only', () => {
  const logo = 'https://example.test/logo.png';
  assert.equal(resolveCardArt({ institutionName: 'PNC Bank', logoUri: logo }).logoUri, logo);
  assert.equal(
    resolveCardArt({ institutionName: 'PNC Bank', logoUri: logo }, { photoUri: 'data:image/jpeg;base64,AAA' }).logoUri,
    undefined,
    'a photo already contains the real logo',
  );
});

test('resolve: Plaid brand colour replaces our approximate hue in catalog designs', () => {
  const r = resolveCardArt({ institutionName: 'Chase', issuerColorHint: '#123ABC' });
  assert.equal(r.tier, 'catalog');
  assert.equal(r.gradient[0], '#123abc');
  // A bad hint must not break anything: keep the catalog hue.
  const bad = resolveCardArt({ institutionName: 'Chase', issuerColorHint: 'nope' });
  assert.equal(bad.gradient[0].toLowerCase(), '#117aca');
  // "Night" keeps its own dark secondary regardless of the hint.
  const night = resolveCardArt({ institutionName: 'Chase', issuerColorHint: '#123ABC' }, { designId: 'chase-night' });
  assert.equal(night.gradient[0].toLowerCase(), '#0b2e59');
});

test('finishFor: product names imply a finish, whole words only', () => {
  assert.equal(finishFor('Platinum Card'), 'silver');
  assert.equal(finishFor('Sapphire Reserve'), 'obsidian');
  assert.equal(finishFor('Gold Rewards'), 'gold');
  assert.equal(finishFor('Visa Signature Black'), 'obsidian');
  assert.equal(finishFor('Spend'), undefined);
  assert.equal(finishFor('Checking'), undefined);
  assert.equal(finishFor('Goldman Savings'), undefined, '"gold" inside another word must not match');
  assert.equal(finishFor(undefined), undefined);
});

test('resolve: finish beats the bank colour, but a picked design beats the finish', () => {
  const plat = resolveCardArt({ institutionName: 'American Express', displayName: 'Platinum Card', issuerColorHint: '#006FCF' });
  assert.equal(plat.tier, 'catalog');
  assert.equal(plat.finish, 'silver');
  assert.equal(plat.fg, '#241A38', 'dark text on a light silver card');

  const picked = resolveCardArt(
    { institutionName: 'American Express', displayName: 'Platinum Card' },
    { designId: 'amex-night' },
  );
  assert.equal(picked.tier, 'user_design');
  assert.equal(picked.finish, undefined);

  // A photo still outranks everything.
  const photo = resolveCardArt({ institutionName: 'American Express', displayName: 'Platinum Card' }, { photoUri: 'data:image/jpeg;base64,AAA' });
  assert.equal(photo.tier, 'user_photo');
});
