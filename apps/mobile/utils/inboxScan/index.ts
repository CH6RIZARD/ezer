// On-device inbox scanning. Gmail/Outlook messages are fetched straight from
// Google/Microsoft to THIS phone, reduced to subscription fields by
// extract.ts, and only those fields are POSTed to /subscriptions/detected.
// Message text lives in local variables for one loop iteration and is never
// written to storage or sent anywhere. Tokens: Gmail's are held by the Google
// Sign-In SDK (Play Services / Keychain), Outlook's only in memory for one
// scan — neither is ever sent to our server. See SCOPES.md before changing
// any of that; Google's restricted-scope verification relies on it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { api } from '../api';
import { configureGoogleSignIn } from '../googleAuth';
import { discovery as msDiscovery } from '../microsoftAuth';
import { extractSubscription, htmlToText, mergeByMerchant, type Detected } from './extract';

export type InboxProvider = 'gmail' | 'outlook';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GRAPH_SCOPE = 'Mail.Read';
const MAX_MESSAGES = 300;
// Only the scan cursor and "is connected" are stored — never message content.
const lastScanKey = (p: InboxProvider) => `@ezer_inbox_last_scan_${p}`;

const SUBJECT_TERMS = ['receipt', 'invoice', 'subscription', '"free trial"', '"trial ends"', 'renewal', '"your plan"', 'billing', 'membership'];

export async function isInboxScanEnabled(): Promise<boolean> {
  try {
    const res = await api.get<{ data: { enabled: boolean } }>('/inbox-scan/enabled');
    return !!res.data?.enabled;
  } catch {
    return false;
  }
}

export async function lastScanAt(p: InboxProvider): Promise<Date | null> {
  const v = await AsyncStorage.getItem(lastScanKey(p));
  return v ? new Date(v) : null;
}

type Found = Detected & { receivedAt: number };

// ---------------------------------------------------------------- Gmail ----

async function gmailAccessToken(): Promise<string | null> {
  configureGoogleSignIn();
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  if (!GoogleSignin.getCurrentUser()) {
    const silent = await GoogleSignin.signInSilently();
    if (silent.type !== 'success') {
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return null;
    }
  }
  // Incremental authorization: gmail.readonly is asked for here, on "Connect
  // inbox", never at app sign-in.
  if (!GoogleSignin.getCurrentUser()?.scopes?.includes(GMAIL_SCOPE)) {
    const granted = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
    if (!granted || !isSuccessResponse(granted)) return null;
  }
  return (await GoogleSignin.getTokens()).accessToken;
}

function b64urlToUtf8(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  try {
    return decodeURIComponent(Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  } catch {
    return bin;
  }
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

function gmailBody(part: GmailPart): { plain: string; html: string } {
  let plain = '';
  let html = '';
  const walk = (p: GmailPart) => {
    if (p.body?.data && p.mimeType === 'text/plain' && !plain) plain = b64urlToUtf8(p.body.data);
    if (p.body?.data && p.mimeType === 'text/html' && !html) html = b64urlToUtf8(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return { plain, html };
}

async function scanGmail(token: string, since: Date | null): Promise<Found[]> {
  const g = async (path: string) => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  };
  const window = since ? `after:${Math.floor(since.getTime() / 1000)}` : 'newer_than:400d';
  const q = `${window} subject:(${SUBJECT_TERMS.join(' OR ')})`;

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await g(`messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`);
    ids.push(...(page.messages ?? []).map((m: { id: string }) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES);

  const found: Found[] = [];
  for (const id of ids.slice(0, MAX_MESSAGES)) {
    const msg = await g(`messages/${id}?format=full`);
    const header = (n: string) => msg.payload?.headers?.find((h: { name: string }) => h.name.toLowerCase() === n)?.value ?? '';
    const { plain, html } = gmailBody(msg.payload ?? {});
    const fromHtml = html ? htmlToText(html) : { text: '', links: [] };
    const receivedAt = new Date(Number(msg.internalDate) || Date.now());
    const hit = extractSubscription({
      from: header('from'),
      subject: header('subject'),
      text: plain || fromHtml.text,
      links: fromHtml.links,
      receivedAt,
    });
    if (hit) found.push({ ...hit, receivedAt: receivedAt.getTime() });
  }
  return found;
}

// -------------------------------------------------------------- Outlook ----

async function outlookAccessToken(): Promise<string | null> {
  const clientId = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) throw new Error('Missing EXPO_PUBLIC_MICROSOFT_CLIENT_ID.');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ezer', path: 'auth/microsoft' });
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    // No offline_access: nothing to refresh, because nothing is stored. Each
    // scan re-asks, which Microsoft's browser session usually makes one tap.
    scopes: [GRAPH_SCOPE],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });
  const result = await request.promptAsync(msDiscovery);
  if (result.type !== 'success' || !result.params.code) return null;
  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    msDiscovery
  );
  return tokens.accessToken;
}

async function scanOutlook(token: string, since: Date | null): Promise<Found[]> {
  const cutoff = since ?? new Date(Date.now() - 400 * 86_400_000);
  // Graph's $search value is itself one quoted KQL string, so no nested
  // phrases — single words only ("trial" covers "free trial"/"trial ends").
  const search = ['receipt', 'invoice', 'subscription', 'trial', 'renewal', 'billing', 'membership', 'plan']
    .map(t => `subject:${t}`)
    .join(' OR ');
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/me/messages?$search=${encodeURIComponent(`"${search}"`)}` +
    `&$select=from,subject,body,receivedDateTime&$top=50`;
  const found: Found[] = [];
  let seen = 0;
  while (url && seen < MAX_MESSAGES) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Outlook ${r.status}`);
    const page: any = await r.json();
    for (const m of page.value ?? []) {
      seen++;
      const receivedAt = new Date(m.receivedDateTime);
      // $search can't be combined with a $filter, so the date window is applied here.
      if (receivedAt < cutoff) continue;
      const addr = m.from?.emailAddress ?? {};
      const body = m.body?.contentType === 'html' ? htmlToText(m.body.content ?? '') : { text: m.body?.content ?? '', links: [] };
      const hit = extractSubscription({
        from: `${addr.name ?? ''} <${addr.address ?? ''}>`,
        subject: m.subject ?? '',
        text: body.text,
        links: body.links,
        receivedAt,
      });
      if (hit) found.push({ ...hit, receivedAt: receivedAt.getTime() });
    }
    url = page['@odata.nextLink'];
  }
  return found;
}

// ------------------------------------------------------------- Public ----

export type ScanResult = { cancelled: true } | { cancelled: false; found: number; created: number; updated: number };

/** Connect (if needed) and scan one inbox. Safe to call repeatedly; it is incremental. */
export async function scanInbox(provider: InboxProvider): Promise<ScanResult> {
  const startedAt = new Date();
  const token = provider === 'gmail' ? await gmailAccessToken() : await outlookAccessToken();
  if (!token) return { cancelled: true };

  const since = await lastScanAt(provider);
  const raw = provider === 'gmail' ? await scanGmail(token, since) : await scanOutlook(token, since);
  const items = mergeByMerchant(raw).map(d => ({ ...d, source: provider }));

  let created = 0;
  let updated = 0;
  if (items.length) {
    const res = await api.post<{ data: { created: number; updated: number } }>('/subscriptions/detected', { items });
    created = res.data?.created ?? 0;
    updated = res.data?.updated ?? 0;
  }
  await AsyncStorage.setItem(lastScanKey(provider), startedAt.toISOString());
  return { cancelled: false, found: items.length, created, updated };
}

/** Revoke our access and forget the scan cursor. Subscriptions already found stay. */
export async function disconnectInbox(provider: InboxProvider): Promise<void> {
  if (provider === 'gmail') {
    try {
      configureGoogleSignIn();
      const { accessToken } = await GoogleSignin.getTokens();
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch {
      // Not signed in to Google on this device — nothing to revoke.
    }
  }
  // Outlook: the token was never stored, so there is nothing to revoke here;
  // the user can also remove EZER at https://account.live.com/consent/Manage.
  await AsyncStorage.removeItem(lastScanKey(provider));
}
