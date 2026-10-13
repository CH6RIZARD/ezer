// expo-secure-store -> the iOS Keychain (kSecClassGenericPassword, service = bundle id,
// account = the RN SecureStore key). Used for the session JWT (`ezer_jwt`) and the passcode
// record (`ezer_passcode`). No entitlements file is needed: xtool's signing gives the app its
// own default keychain access group.

import Foundation
import Security

enum Keychain {
    private static var service: String { Bundle.main.bundleIdentifier ?? "com.example.Ezer" }

    private static func base(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    static func get(_ key: String) -> String? {
        var q = base(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Like `get`, but only a MISSING item is nil: any other keychain error (e.g.
    /// errSecInteractionNotAllowed) throws, as SecureStore.getItemAsync rejects. The passcode read
    /// relies on it to fail closed instead of reading "no passcode".
    static func read(_ key: String) throws -> String? {
        var q = base(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = out as? Data else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Keychain read failed (\(status))"])
        }
        return String(data: data, encoding: .utf8)
    }

    /// Throws when the keychain refuses the write (callers that must fail closed rely on it).
    static func set(_ key: String, _ value: String) throws {
        let data = Data(value.utf8)
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(base(key) as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = base(key)
            add.merge(attrs) { $1 }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Keychain write failed (\(status))"])
        }
    }

    static func delete(_ key: String) {
        SecItemDelete(base(key) as CFDictionary)
    }
}
