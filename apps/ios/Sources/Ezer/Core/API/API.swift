// Port of apps/mobile/utils/api.ts
//
// HTTP client: request(method, path, body?) against BASE_URL with the session JWT as
// `Authorization: Bearer`, `Content-Type: application/json` ONLY when there is a body (Fastify
// rejects a bodyless request that carries it: FST_ERR_CTP_EMPTY_JSON_BODY), a 15 000ms timeout,
// JSON decode, and the RN error mapping (thrown APIError carries `status`, so callers can tell a
// dead session — 401/403/404 — from an outage).
//
//   let res: Envelope<HomeSummary> = try await api.get("/home/summary")
//   try await api.post("/plaid/sync", timeout: 60)
//   try await api.post("/auth/login", ["email": .string(email), "password": .string(password)])
//   catch let e as APIError { e.status == 401 ... e.message }
//
// Typed wrappers for every endpoint live in Endpoints.swift.

import Foundation

/// The error api.ts throws: `message` is what the user may read, `status` the HTTP status
/// (nil when the server was never reached).
struct APIError: Error, LocalizedError, Sendable {
    let message: String
    let status: Int?
    var errorDescription: String? { message }
}

extension Error {
    /// `err?.message` for any error (APIError's message, else localizedDescription).
    var message: String {
        if let e = self as? APIError { return e.message }
        return (self as NSError).localizedDescription
    }

    /// `err?.status` (nil unless an APIError from an HTTP response).
    var httpStatus: Int? { (self as? APIError)?.status }
}

final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    /// The deployed API. No path prefix, no versioning. iOS hardcodes it (api.md §1): the RN
    /// app's other branches (EXPO_PUBLIC_API_URL, Metro's LAN host, emulator loopbacks) only
    /// exist for Expo development.
    static let productionURL = "https://ezer-api-production-fca5.up.railway.app"
    let baseURL = APIClient.productionURL

    /// RN's legacy AsyncStorage key, kept for the name only: a new app has no plain-storage
    /// token to migrate, so api.ts's one-shot migration is not ported.
    static let TOKEN_KEY = "@ezer_jwt"
    /// SecureStore keys may only contain [A-Za-z0-9._-], so the native key drops the '@'.
    static let SECURE_TOKEN_KEY = "ezer_jwt"
    /** No response at all within this window reads the same as "network down". */
    static let REQUEST_TIMEOUT_MS: Double = 15_000

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.urlCache = nil
        return URLSession(configuration: cfg)
    }()

    // MARK: token (Keychain)

    func getToken() -> String? { Keychain.get(Self.SECURE_TOKEN_KEY) }

    /// RN's setToken rejects when SecureStore refuses the write, which fails the sign-in; this
    /// returns false instead (discardable, so existing call sites compile unchanged).
    @discardableResult
    func setToken(_ token: String) -> Bool {
        (try? Keychain.set(Self.SECURE_TOKEN_KEY, token)) != nil
    }

    func clearToken() {
        // Both, as RN did, so a stale legacy copy can never resurrect a logged-out session.
        Keychain.delete(Self.SECURE_TOKEN_KEY)
        KV.remove(Self.TOKEN_KEY)
    }

    // MARK: requests

    /// The raw response body of a successful (2xx) JSON response. Throws APIError exactly as
    /// api.ts does otherwise.
    func requestData(_ method: String, _ path: String, body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw APIError(message: "Cannot reach the server at \(baseURL). Check your connection.", status: nil)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        let limit = timeout ?? Self.REQUEST_TIMEOUT_MS / 1000
        req.timeoutInterval = limit
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(body)
        }
        if let token = getToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await withThrowingTaskGroup(of: (Data, URLResponse).self) { group in
                group.addTask { try await self.session.data(for: req) }
                group.addTask {
                    try await Task.sleep(nanoseconds: UInt64(limit * 1_000_000_000))
                    throw URLError(.timedOut)
                }
                let first = try await group.next()!
                group.cancelAll()
                return first
            }
        } catch {
            // The request never reached a server (a timeout lands here too, which is the same
            // situation from the caller's seat). Never reported as "invalid password".
            throw APIError(message: "Cannot reach the server at \(baseURL). Check your connection.", status: nil)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let json = try? JSONDecoder().decode(JSON.self, from: data) else {
            throw APIError(message: "Server returned a non-JSON response (\(status)).", status: status)
        }

        if !(200...299).contains(status) {
            // Our own routes put the specific problem in `error`; Fastify's framework-level
            // rejections put only the HTTP reason phrase there and the detail in `message`.
            // Prefer whichever one isn't just that generic phrase.
            let error = json["error"]?.stringValue
            let message = json["message"]?.stringValue
            let generic: Set<String> = ["Bad Request", "Not Found", "Internal Server Error"]
            let detail: String?
            if let error, !error.isEmpty, error != message, !generic.contains(error) {
                detail = error
            } else {
                detail = (message?.isEmpty == false ? message : nil) ?? (error?.isEmpty == false ? error : nil)
            }
            throw APIError(message: detail ?? "API \(status)", status: status)
        }
        return data
    }

    /// Decode the whole response body as T (usually `Envelope<X>` / `ListEnvelope<X>`).
    func request<T: Decodable>(_ method: String, _ path: String, body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> T {
        let data = try await requestData(method, path, body: body, timeout: timeout)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            // Only reachable for a top-level shape mismatch; the models themselves are lenient.
            throw APIError(message: "Server returned an unexpected response.", status: nil)
        }
    }

    func get<T: Decodable>(_ path: String, timeout: TimeInterval? = nil) async throws -> T {
        try await request("GET", path, timeout: timeout)
    }

    func post<T: Decodable>(_ path: String, _ body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> T {
        try await request("POST", path, body: body, timeout: timeout)
    }

    func patch<T: Decodable>(_ path: String, _ body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> T {
        try await request("PATCH", path, body: body, timeout: timeout)
    }

    /// Account deletion and bank disconnect are the only DELETEs the app makes.
    func del<T: Decodable>(_ path: String, timeout: TimeInterval? = nil) async throws -> T {
        try await request("DELETE", path, timeout: timeout)
    }

    // Untyped variants for calls whose reply the RN code ignores (`await api.post('/plaid/sync')`).
    @discardableResult
    func post(_ path: String, _ body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> JSON {
        try await request("POST", path, body: body, timeout: timeout)
    }

    @discardableResult
    func patch(_ path: String, _ body: JSON? = nil, timeout: TimeInterval? = nil) async throws -> JSON {
        try await request("PATCH", path, body: body, timeout: timeout)
    }

    @discardableResult
    func del(_ path: String, timeout: TimeInterval? = nil) async throws -> JSON {
        try await request("DELETE", path, timeout: timeout)
    }

    func getJSON(_ path: String, timeout: TimeInterval? = nil) async throws -> JSON {
        try await request("GET", path, timeout: timeout)
    }
}

/// RN's module-level `api` object.
let api = APIClient.shared

/// Plaid-backed calls that run Plaid synchronously on the server (exchange-public-token, sync,
/// read-for-subscriptions {enabled:true}, access-list {mode:'plaid'}): api.md §0.6 recommends
/// ~60s instead of the RN client's blanket 15s.
let PLAID_TIMEOUT: TimeInterval = 60

/// Promise.allSettled for one call: never throws, the failure is kept with its status.
func settle<T>(_ op: () async throws -> T) async -> Result<T, Error> {
    do { return .success(try await op()) } catch { return .failure(error) }
}

/// URL query component encoding (encodeURIComponent).
func encodeURIComponent(_ s: String) -> String {
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
    return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
}
