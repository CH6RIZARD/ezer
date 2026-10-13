// Port of apps/mobile/utils/passcode.ts
//
// The record {salt, hash, len, failures, lockedUntil} lives in the Keychain under `ezer_passcode`
// (RN SecureStore key), same JSON shape. Every wrong guess is written back, so killing the app does
// not reset the count. The passcode belongs to the session: LockGate clears it whenever auth
// settles on "signed out" — NOT inside logout() (that dropped the lock while still signed in).

import Foundation
import Security

// SecureStore keys may only contain [A-Za-z0-9._-].
private let KEY = "ezer_passcode"

private struct PasscodeRecord: Codable {
    var salt: String
    var hash: String
    var len: Int
    var failures: Int
    var lockedUntil: Double
}

struct PasscodeInfo: Equatable, Sendable {
    var len: Int
    var lockedUntil: Double
}

struct PasscodeCorruptError: Error, LocalizedError {
    var errorDescription: String? { "Unreadable passcode record" }
}

struct PasscodeInvalidError: Error, LocalizedError {
    var errorDescription: String? { "A passcode is 4 to 6 digits." }
}

/// Only a MISSING record means "no passcode". A corrupt one throws, so the gate fails closed
/// instead of offering to set a new code over it. A keychain error throws too (it is not "missing").
private func read() throws -> PasscodeRecord? {
    guard let raw = try Keychain.read(KEY), !raw.isEmpty else { return nil }
    guard let data = raw.data(using: .utf8),
          let j = try? JSONDecoder().decode(JSON.self, from: data),
          let hash = j["hash"]?.stringValue, let salt = j["salt"]?.stringValue
    else { throw PasscodeCorruptError() }
    return PasscodeRecord(
        salt: salt, hash: hash,
        len: j["len"]?.intValue ?? 4,
        failures: j["failures"]?.intValue ?? 0,
        lockedUntil: j["lockedUntil"]?.doubleValue ?? 0
    )
}

private func write(_ r: PasscodeRecord) throws {
    let data = try JSONEncoder().encode(r)
    try Keychain.set(KEY, String(data: data, encoding: .utf8) ?? "")
}

// Onboarding sets the passcode while LockGate is mounted above it; this is how the gate hears about
// it. The new state is handed over synchronously (re-reading storage left a window where the gate
// flashed its own "set a passcode" prompt).
@MainActor private var listeners: [Int: (PasscodeInfo?) -> Void] = [:]
@MainActor private var listenerSeq = 0

/// Returns the unsubscribe function, like RN.
@MainActor
func onPasscodeChange(_ fn: @escaping (PasscodeInfo?) -> Void) -> () -> Void {
    listenerSeq += 1
    let id = listenerSeq
    listeners[id] = fn
    return { listeners.removeValue(forKey: id) }
}

@MainActor private func notify(_ info: PasscodeInfo?) {
    listeners.values.forEach { $0(info) }
}

/** The passcode's length and any lockout, or nil when none is set. Throws on a corrupt record. */
func getPasscodeInfo() throws -> PasscodeInfo? {
    guard let r = try read() else { return nil }
    return PasscodeInfo(len: r.len, lockedUntil: r.lockedUntil)
}

@MainActor
func setPasscode(_ code: String) throws {
    if !isValidPasscode(code) { throw PasscodeInvalidError() }
    var bytes = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    let salt = bytes.map { String(format: "%02x", $0) }.joined()
    try write(PasscodeRecord(salt: salt, hash: hashPasscode(salt, code), len: code.count, failures: 0, lockedUntil: 0))
    notify(PasscodeInfo(len: code.count, lockedUntil: 0))
}

enum VerifyResult: Sendable {
    case ok
    case failed(lockedUntil: Double, attemptsLeft: Int)
}

func verifyPasscode(_ code: String) -> VerifyResult {
    let now = nowMs()
    // Fail closed: no record (or an unreadable one) here means it was cleared mid-entry.
    guard let r = try? read() else { return .failed(lockedUntil: 0, attemptsLeft: 0) }
    if r.lockedUntil > now { return .failed(lockedUntil: r.lockedUntil, attemptsLeft: 0) }

    if hashPasscode(r.salt, code) == r.hash {
        if r.failures != 0 || r.lockedUntil != 0 {
            var next = r
            next.failures = 0
            next.lockedUntil = 0
            try? write(next)
        }
        return .ok
    }
    let failures = r.failures + 1
    // ponytail: the lockout trusts the device clock, so moving it forward ends one early.
    let lockedUntil = lockedUntilAfter(failures, now)
    var next = r
    next.failures = failures
    next.lockedUntil = lockedUntil
    try? write(next)
    return .failed(lockedUntil: lockedUntil, attemptsLeft: max(0, FREE_ATTEMPTS - failures))
}

@MainActor
func clearPasscode() {
    Keychain.delete(KEY)
    notify(nil)
}

// On Android, Plaid Link and the photo picker leave the app while the user is still inside our
// own flow; LockGate gives those a longer grace. On iOS these flows stay in-process, so leaving
// during one is a real exit: these are kept (no-ops) so call sites port 1:1.
@MainActor private var inAppFlows = 0
@MainActor func beginInAppFlow() { /* Android only */ }
@MainActor func endInAppFlow() { inAppFlows = max(0, inAppFlows - 1) }
@MainActor func inAppFlowActive() -> Bool { inAppFlows > 0 }
