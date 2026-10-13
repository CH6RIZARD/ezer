// AsyncStorage -> UserDefaults, with the SAME key strings as the RN app (port map §8).
// Large values (the dashboard snapshot) go to files in Application Support named by the key.
//
//   KV.get("@ezer_onboarding_complete") == "true"
//   KV.set("@ezer_onboarding_complete", "true")
//   KV.setJSON("@ezer_card_design", record)      // Codable, same JSON shape as RN
//   FileStore.set("@ezer_data_snapshot", jsonString)

import Foundation

enum KV {
    private static var d: UserDefaults { .standard }

    static func get(_ key: String) -> String? { d.string(forKey: key) }

    static func set(_ key: String, _ value: String) { d.set(value, forKey: key) }

    static func remove(_ key: String) { d.removeObject(forKey: key) }

    /// AsyncStorage.getAllKeys(): every key this app wrote (UserDefaults also lists system keys;
    /// callers filter by their own prefix, as RN's callers do).
    static func allKeys() -> [String] { Array(d.dictionaryRepresentation().keys) }

    static func multiRemove(_ keys: [String]) { keys.forEach { d.removeObject(forKey: $0) } }

    /// JSON.parse(await AsyncStorage.getItem(key)) — nil when missing or unparsable.
    static func getJSON<T: Decodable>(_ key: String, as type: T.Type) -> T? {
        guard let raw = get(key), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    /// AsyncStorage.setItem(key, JSON.stringify(value)).
    static func setJSON<T: Encodable>(_ key: String, _ value: T) {
        guard let data = try? JSONEncoder().encode(value), let s = String(data: data, encoding: .utf8) else { return }
        set(key, s)
    }
}

/// Values too large for UserDefaults, as files in Application Support/EzerStore/<key>.
enum FileStore {
    private static var dir: URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let url = base.appendingPathComponent("EzerStore", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func url(_ key: String) -> URL? {
        // Keys like "@ezer_data_snapshot" are safe file names; anything else is escaped.
        let safe = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "@._-"))) ?? key
        return dir?.appendingPathComponent(safe)
    }

    static func get(_ key: String) -> String? {
        guard let u = url(key), let data = try? Data(contentsOf: u) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String) {
        guard let u = url(key) else { return }
        try? Data(value.utf8).write(to: u, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func remove(_ key: String) {
        guard let u = url(key) else { return }
        try? FileManager.default.removeItem(at: u)
    }
}
