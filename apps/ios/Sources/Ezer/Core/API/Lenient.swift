// Lenient decoding, so one odd row (a null where a number was expected, a missing key, a
// string id where an int was) can never blank a screen. The RN app is JavaScript: it read
// whatever arrived and carried on. These helpers give Swift the same tolerance:
//
//   extension RiskItem {
//       init(from decoder: Decoder) throws {
//           let c = try decoder.container(keyedBy: AnyKey.self)
//           id = c.str("id"); amountCents = c.int("amountCents"); logo = c.strOpt("logo")
//           ...
//       }
//   }
//
// Arrays decode element by element and SKIP an element that fails (LossyArray / c.list).
// Put `init(from:)` in an extension so the memberwise init survives; Encodable stays
// synthesized (CodingKeys = property names = the RN JSON keys), so cached JSON keeps the RN shape.

import Foundation

struct AnyKey: CodingKey {
    let stringValue: String
    let intValue: Int?
    init(_ s: String) { stringValue = s; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { stringValue = String(intValue); self.intValue = intValue }
}

extension KeyedDecodingContainer where K == AnyKey {
    private func k(_ s: String) -> AnyKey { AnyKey(s) }

    /// The value as JSON, or nil when missing.
    func raw(_ key: String) -> JSON? { (try? decodeIfPresent(JSON.self, forKey: k(key))) ?? nil }

    func strOpt(_ key: String) -> String? {
        switch raw(key) {
        case let .string(s)?: return s
        case let .int(i)?: return String(i)
        case let .double(d)?: return String(d)
        case let .bool(b)?: return b ? "true" : "false"
        default: return nil
        }
    }
    func str(_ key: String, _ fallback: String = "") -> String { strOpt(key) ?? fallback }

    func dblOpt(_ key: String) -> Double? {
        switch raw(key) {
        case let .int(i)?: return Double(i)
        case let .double(d)?: return d
        case let .string(s)?: return Double(s)
        default: return nil
        }
    }
    func dbl(_ key: String, _ fallback: Double = 0) -> Double { dblOpt(key) ?? fallback }

    func intOpt(_ key: String) -> Int? {
        // Int(_:) traps outside Int's range; an absurd number is "missing", never a crash.
        guard let d = dblOpt(key), d.isFinite, abs(d) < 9e18 else { return nil }
        return Int(d.rounded())
    }
    func int(_ key: String, _ fallback: Int = 0) -> Int { intOpt(key) ?? fallback }

    func boolOpt(_ key: String) -> Bool? {
        switch raw(key) {
        case let .bool(b)?: return b
        case let .int(i)?: return i != 0
        case let .string(s)?: return s == "true" ? true : s == "false" ? false : nil
        default: return nil
        }
    }
    func bool(_ key: String, _ fallback: Bool = false) -> Bool { boolOpt(key) ?? fallback }

    /// A nested object, or nil when missing / null / undecodable.
    func obj<T: Decodable>(_ key: String, _ type: T.Type = T.self) -> T? {
        (try? decodeIfPresent(T.self, forKey: k(key))) ?? nil
    }

    /// An array, skipping elements that fail. Missing / null / not-an-array -> [].
    func list<T: Decodable>(_ key: String, _ type: T.Type = T.self) -> [T] {
        ((try? decodeIfPresent(LossyArray<T>.self, forKey: k(key))) ?? nil)?.items ?? []
    }

    func strList(_ key: String) -> [String] {
        guard case let .array(a)? = raw(key) else { return [] }
        return a.compactMap { $0.stringValue }
    }
}

/// `[T]` that drops undecodable elements instead of failing the whole array.
struct LossyArray<T: Decodable>: Decodable {
    var items: [T]

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [T] = []
        if let n = c.count { out.reserveCapacity(n) }
        while !c.isAtEnd {
            if let v = try? c.decode(T.self) {
                out.append(v)
            } else {
                _ = try? c.decode(JSON.self) // consume the bad element
            }
        }
        items = out
    }
}

/// `{ success, data }` — every EZER route's envelope. `data` decodes leniently: a malformed
/// payload is nil, never a thrown error.
struct Envelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        success = c.boolOpt("success")
        data = c.obj("data", T.self)
    }
}

/// `{ success, data: [...] }` with a lossy array.
struct ListEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: [T]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        success = c.boolOpt("success")
        data = c.list("data", T.self)
    }
}
