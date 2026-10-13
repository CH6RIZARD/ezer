// Port of apps/mobile/utils/passcodeCore.ts — the pure rules (tests: utils/passcodeCore.test.ts,
// ported as FoundationSelfCheck).

import CryptoKit
import Foundation

let PASSCODE_MIN = 4
let PASSCODE_MAX = 6
/** Coming back to the app within this long of leaving it skips the passcode. */
let LOCK_GRACE_MS: Double = 60_000
/** Wrong guesses allowed before the first lockout. */
let FREE_ATTEMPTS = 5
private let FIRST_LOCKOUT_MS: Double = 30_000
private let MAX_LOCKOUT_MS: Double = 60 * 60_000

func isValidPasscode(_ code: String) -> Bool {
    code.count >= PASSCODE_MIN && code.count <= PASSCODE_MAX && !code.isEmpty && code.allSatisfy { $0 >= "0" && $0 <= "9" }
}

/**
 * When the keypad unlocks again after `failures` wrong guesses in a row: free for the first
 * FREE_ATTEMPTS, then 30s, doubling with every further wrong guess, capped at an hour. 0 = not locked.
 */
func lockedUntilAfter(_ failures: Int, _ now: Double) -> Double {
    let over = failures - FREE_ATTEMPTS
    if over < 0 { return 0 }
    return now + min(FIRST_LOCKOUT_MS * pow(2, Double(over)), MAX_LOCKOUT_MS)
}

/**
 * Whether reopening at `now` is close enough to leaving at `leftAt` to skip the passcode.
 * A clock that moved backwards (now < leftAt) does not count.
 */
func withinGrace(_ leftAt: Double?, _ now: Double) -> Bool {
    guard let leftAt else { return false }
    return now >= leftAt && now - leftAt < LOCK_GRACE_MS
}

/** SHA-256 of an ASCII string, as lowercase hex (CryptoKit; identical output to the JS version). */
func sha256Hex(_ ascii: String) -> String {
    SHA256.hash(data: Data(ascii.utf8)).map { String(format: "%02x", $0) }.joined()
}

func hashPasscode(_ salt: String, _ code: String) -> String { sha256Hex("\(salt):\(code)") }
