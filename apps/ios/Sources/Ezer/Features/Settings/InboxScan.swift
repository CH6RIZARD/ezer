// Port of apps/mobile/utils/inboxScan/index.ts
//
// On-device inbox scanning. Gmail/Outlook messages are fetched straight from
// Google/Microsoft to THIS phone, reduced to subscription fields by
// InboxExtract.swift, and only those fields are POSTed to /subscriptions/detected.
// Message text lives in local variables for one loop iteration and is never
// written to storage or sent anywhere. Tokens: Gmail's are held by the Google
// Sign-In SDK (Keychain), Outlook's only in memory for one scan — neither is
// ever sent to our server. See SCOPES.md before changing any of that; Google's
// restricted-scope verification relies on it (CLAUDE.md "Inbox scanning").
//
// TODO(native): the two OAuth token fetches (gmailAccessToken / outlookAccessToken) need the
// Google Sign-In SDK + Google web/iOS client ids, and a Microsoft client id, none of which exist
// in this build (api.md §6.5). Until then they throw exactly what RN throws without that config,
// so the Inbox screen shows "Scan failed: Missing …". Everything after the token — the Gmail /
// Graph fetches, extraction, merge, POST and scan cursor — is ported and runs once a token exists.
//
// AbortSignal -> Swift task cancellation: cancelling the Task that runs scanInbox cancels the
// in-flight URLSession fetches (and, unlike RN, also the final POST if it is still running).

import Foundation

enum SettingsInboxProvider: String, CaseIterable, Sendable {
    case gmail, outlook
}

enum SettingsScanResult: Sendable {
    case cancelled
    case done(found: Int, created: Int, updated: Int)
}

// MARK: - Public (the RN exports)

/// `GET /inbox-scan/enabled`; any failure is `false` (the Settings row stays hidden).
func isInboxScanEnabled() async -> Bool {
    do {
        return try await api.inboxScanEnabled()
    } catch {
        return false
    }
}

func lastScanAt(_ p: SettingsInboxProvider) -> Date? {
    KV.get(SettingsInboxScan.lastScanKey(p)).flatMap { parseISODate($0) }
}

/// Connect (if needed) and scan one inbox. Safe to call repeatedly; it is
/// incremental. Cancel the calling Task to abort the in-flight fetches — so
/// disconnect/leaving the screen doesn't leave up to 300 requests running.
func scanInbox(_ provider: SettingsInboxProvider) async throws -> SettingsScanResult {
    try await SettingsInboxScan.scanInbox(provider)
}

/// Revoke our access and forget the scan cursor. Subscriptions already found stay.
func disconnectInbox(_ provider: SettingsInboxProvider) async {
    if provider == .gmail {
        // TODO(native): Google Sign-In SDK. RN, inside try/catch:
        //   configureGoogleSignIn(); const { accessToken } = await GoogleSignin.getTokens();
        //   POST https://oauth2.googleapis.com/revoke, Content-Type application/x-www-form-urlencoded,
        //   body `token=${encodeURIComponent(accessToken)}` — the token in the POST body, never the
        //   query string: URLs end up in proxy and server logs;
        //   await GoogleSignin.revokeAccess(); await GoogleSignin.signOut();
        // Without a configured client configureGoogleSignIn() throws, which RN's catch reads as
        // "Not signed in to Google on this device — nothing to revoke." — the path this build takes.
    }
    // Outlook: the token was never stored, so there is nothing to revoke here;
    // the user can also remove EZER at https://account.live.com/consent/Manage.
    // (RN's try/catch around removeItem: a cursor that outlives the disconnect only means the
    // next scan window is wrong — UserDefaults removal cannot fail.)
    KV.remove(SettingsInboxScan.lastScanKey(provider))
}

enum SettingsInboxScan {
    static let GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
    static let GRAPH_SCOPE = "Mail.Read"
    static let MAX_MESSAGES = 300
    // Only the scan cursor and "is connected" are stored — never message content.
    static func lastScanKey(_ p: SettingsInboxProvider) -> String { "@ezer_inbox_last_scan_\(p.rawValue)" }

    static let SUBJECT_TERMS = ["receipt", "invoice", "subscription", "\"free trial\"", "\"trial ends\"", "renewal", "\"your plan\"", "billing", "membership"]

    // MARK: Gmail

    /// TODO(native): Google Sign-In SDK. RN: configureGoogleSignIn(); if no current user,
    /// signInSilently(), else signIn() (nil when not successful); incremental authorization —
    /// gmail.readonly (GMAIL_SCOPE) is asked for here, on "Connect inbox", never at app sign-in —
    /// via addScopes({ scopes: [GMAIL_SCOPE] }) (nil when not granted); then getTokens().accessToken.
    /// With no client id configured, configureGoogleSignIn() throws this, as it does here.
    static func gmailAccessToken() async throws -> String? {
        throw APIError(
            message: "Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Create a Web client in Google Auth Platform (used to obtain an ID token) and set it in .env.",
            status: nil
        )
    }

    static func b64urlToUtf8(_ data: String) -> String {
        // Gmail omits base64 padding; pad back to a multiple of 4 first.
        let b64 = data.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let padded = b64 + String(repeating: "=", count: (4 - b64.count % 4) % 4)
        // RN's atob throws on invalid base64 (failing the scan); Gmail never sends any.
        guard let bytes = Data(base64Encoded: padded) else { return "" }
        // decodeURIComponent over the bytes = UTF-8; on invalid UTF-8 RN kept the raw byte string.
        return String(data: bytes, encoding: .utf8) ?? String(data: bytes, encoding: .isoLatin1) ?? ""
    }

    static func gmailBody(_ part: JSON) -> (plain: String, html: String) {
        var plain = ""
        var html = ""
        func walk(_ p: JSON) {
            let data = p["body"]?["data"]?.stringValue ?? ""
            let mime = p["mimeType"]?.stringValue
            if !data.isEmpty && mime == "text/plain" && plain.isEmpty { plain = b64urlToUtf8(data) }
            if !data.isEmpty && mime == "text/html" && html.isEmpty { html = b64urlToUtf8(data) }
            for child in array(p["parts"]) { walk(child) }
        }
        walk(part)
        return (plain: plain, html: html)
    }

    /// The elements of a JSON array ([] for anything else).
    static func array(_ j: JSON?) -> [JSON] {
        if case let .array(a)? = j { return a }
        return []
    }

    /// GET with the bearer token; a non-2xx throws "<label> <status>" like the TS.
    static func fetch(_ label: String, _ url: String, _ token: String) async throws -> JSON {
        guard let u = URL(string: url) else { throw URLError(.badURL) }
        var req = URLRequest(url: u)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, res) = try await URLSession.shared.data(for: req)
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(message: "\(label) \(status)", status: status) }
        return try JSONDecoder().decode(JSON.self, from: data)
    }

    static func gmailGet(_ token: String, _ path: String) async throws -> JSON {
        try await fetch("Gmail", "https://gmail.googleapis.com/gmail/v1/users/me/\(path)", token)
    }

    static func scanGmail(_ token: String, _ since: Date?) async throws -> [SettingsFound] {
        let window = since.map { "after:\(Int(floor($0.timeIntervalSince1970)))" } ?? "newer_than:400d"
        let q = "\(window) subject:(\(SUBJECT_TERMS.joined(separator: " OR ")))"

        var ids: [String] = []
        var pageToken: String?
        repeat {
            let tokenParam = pageToken.map { "&pageToken=\($0)" } ?? ""
            let page = try await gmailGet(token, "messages?maxResults=100&q=\(encodeURIComponent(q))\(tokenParam)")
            ids += array(page["messages"]).compactMap { $0["id"]?.stringValue }
            pageToken = page["nextPageToken"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
        } while pageToken != nil && ids.count < MAX_MESSAGES

        var found: [SettingsFound] = []
        let queue = Array(ids.prefix(MAX_MESSAGES))
        // Batched, not 300 strictly-sequential round trips.
        // ponytail: fixed batches of 5; a sliding worker pool if Gmail throttling
        // ever shows up in practice.
        for i in stride(from: 0, to: queue.count, by: 5) {
            let batch = Array(queue[i..<min(i + 5, queue.count)])
            // Promise.all: results in batch order; the first failure rejects the batch.
            let msgs: [JSON] = try await withThrowingTaskGroup(of: (Int, JSON).self) { group in
                for (k, id) in batch.enumerated() {
                    group.addTask {
                        let m = try await SettingsInboxScan.gmailGet(token, "messages/\(id)?format=full")
                        return (k, m)
                    }
                }
                var out = [JSON?](repeating: nil, count: batch.count)
                for try await (k, m) in group { out[k] = m }
                return out.compactMap { $0 }
            }
            for msg in msgs {
                let headers = array(msg["payload"]?["headers"])
                func header(_ n: String) -> String {
                    headers.first { ($0["name"]?.stringValue ?? "").lowercased() == n }?["value"]?.stringValue ?? ""
                }
                let body = gmailBody(msg["payload"] ?? .object([:]))
                let fromHtml = body.html.isEmpty ? (text: "", links: [String]()) : htmlToText(body.html)
                // new Date(Number(msg.internalDate) || Date.now())
                let raw = msg["internalDate"]
                let ms = raw?.doubleValue ?? Double(raw?.stringValue ?? "") ?? 0
                let receivedAt = Date(timeIntervalSince1970: (ms.isFinite && ms != 0 ? ms : nowMs()) / 1000)
                let hit = extractSubscription(SettingsEmailInput(
                    from: header("from"),
                    subject: header("subject"),
                    text: body.plain.isEmpty ? fromHtml.text : body.plain,
                    links: fromHtml.links,
                    receivedAt: receivedAt
                ))
                if let hit { found.append(SettingsFound(detected: hit, receivedAt: receivedAt.timeIntervalSince1970 * 1000)) }
            }
        }
        return found
    }

    // MARK: Outlook

    /// TODO(native/config): RN reads EXPO_PUBLIC_MICROSOFT_CLIENT_ID, which is unset in every
    /// build, and throws below. With one: an AuthSession PKCE code request (redirect
    /// ezer://auth/microsoft, scopes [GRAPH_SCOPE] — no offline_access: nothing to refresh, because
    /// nothing is stored; each scan re-asks) against MICROSOFT_DISCOVERY, then exchangeCodeAsync
    /// -> accessToken (ASWebAuthenticationSession on iOS; nil when the prompt is not a success).
    static func outlookAccessToken() async throws -> String? {
        throw APIError(message: "Missing EXPO_PUBLIC_MICROSOFT_CLIENT_ID.", status: nil)
    }

    static func scanOutlook(_ token: String, _ since: Date?) async throws -> [SettingsFound] {
        let cutoff = since ?? Date(timeIntervalSince1970: (nowMs() - 400 * 86_400_000) / 1000)
        // Graph's $search value is itself one quoted KQL string, so no nested
        // phrases — single words only ("trial" covers "free trial"/"trial ends").
        let search = ["receipt", "invoice", "subscription", "trial", "renewal", "billing", "membership", "plan"]
            .map { "subject:\($0)" }
            .joined(separator: " OR ")
        var url: String? =
            "https://graph.microsoft.com/v1.0/me/messages?$search=\(encodeURIComponent("\"\(search)\""))" +
            "&$select=from,subject,body,receivedDateTime&$top=50"
        var found: [SettingsFound] = []
        var seen = 0
        while let next = url, seen < MAX_MESSAGES {
            let page = try await fetch("Outlook", next, token)
            for m in array(page["value"]) {
                seen += 1
                // (An unparsable date was an Invalid Date in RN; such a message is skipped here.)
                guard let receivedAt = parseISODate(m["receivedDateTime"]?.stringValue ?? "") else { continue }
                // $search can't be combined with a $filter, so the date window is applied here.
                if receivedAt < cutoff { continue }
                let addr = m["from"]?["emailAddress"]
                let content = m["body"]?["content"]?.stringValue ?? ""
                let isHtml = m["body"]?["contentType"]?.stringValue == "html"
                let body = isHtml ? htmlToText(content) : (text: content, links: [String]())
                let hit = extractSubscription(SettingsEmailInput(
                    from: "\(addr?["name"]?.stringValue ?? "") <\(addr?["address"]?.stringValue ?? "")>",
                    subject: m["subject"]?.stringValue ?? "",
                    text: body.text,
                    links: body.links,
                    receivedAt: receivedAt
                ))
                if let hit { found.append(SettingsFound(detected: hit, receivedAt: receivedAt.timeIntervalSince1970 * 1000)) }
            }
            url = page["@odata.nextLink"]?.stringValue
        }
        return found
    }

    // MARK: scanInbox

    static func scanInbox(_ provider: SettingsInboxProvider) async throws -> SettingsScanResult {
        let startedAt = Date()
        let token = try await (provider == .gmail ? gmailAccessToken() : outlookAccessToken())
        guard let token, !token.isEmpty else { return .cancelled }   // TS `if (!token)`

        let since = lastScanAt(provider)
        let raw = try await (provider == .gmail ? scanGmail(token, since) : scanOutlook(token, since))
        // ONLY the extracted fields (+ source) leave the phone — never subject, body, sender or token.
        let items = mergeByMerchant(raw).map { d in
            DetectedSubscriptionInput(
                merchant: d.merchant,
                amountCents: d.amountCents,
                currency: d.currency,
                cadence: d.cadence.rawValue,
                nextChargeDate: d.nextChargeDate,
                trialEndsAt: d.trialEndsAt,
                cancelUrl: d.cancelUrl,
                source: provider.rawValue,
                confidence: d.confidence
            )
        }

        var created = 0
        var updated = 0
        if !items.isEmpty {
            let res = try await api.postDetectedSubscriptions(items)
            created = res?.created ?? 0
            updated = res?.updated ?? 0
        }
        KV.set(lastScanKey(provider), toISOString(startedAt))
        return .done(found: items.count, created: created, updated: updated)
    }
}
