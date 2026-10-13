// Port of apps/mobile/utils/lockWarm.ts
// Resolves once the passcode is accepted (or there is none). Background work that nothing on the
// lock screen needs (the hourly Plaid re-sync) waits on it, so it never competes with the keypad.
//
//   await LockWarm.shared.wait()     // RN: await lockWarm
//   LockWarm.shared.mark()           // RN: markLockWarm() — idempotent

import Foundation

@MainActor
final class LockWarm {
    static let shared = LockWarm()

    private(set) var isWarm = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func mark() {
        guard !isWarm else { return }
        isWarm = true
        let w = waiters
        waiters = []
        w.forEach { $0.resume() }
    }

    func wait() async {
        if isWarm { return }
        await withCheckedContinuation { waiters.append($0) }
    }
}

/// RN `markLockWarm()`.
@MainActor func markLockWarm() { LockWarm.shared.mark() }
