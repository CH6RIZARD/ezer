// A JSON value with literal syntax, so request bodies read like the TS object literals they port:
//
//   try await api.post("/cards/access-list", ["mode": "plaid", "designId": nil])
//   try await api.patch("/savings/goals/\(id)", ["status": "PAUSED"])
//
// Also decodes ANY JSON (opaque payloads such as /account/export, and lossy array skipping).

import Foundation

enum JSON: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSON].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSON].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .int(i): try c.encode(i)
        case let .double(d): try c.encode(d)
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    /// Any Encodable value as JSON (e.g. a typed request struct, or `[CardStroke]`).
    init<T: Encodable>(encoding value: T) {
        guard let data = try? JSONEncoder().encode(value),
              let j = try? JSONDecoder().decode(JSON.self, from: data)
        else { self = .null; return }
        self = j
    }

    subscript(key: String) -> JSON? {
        if case let .object(o) = self { return o[key] }
        return nil
    }

    var stringValue: String? { if case let .string(s) = self { return s }; return nil }
    var intValue: Int? {
        switch self {
        case let .int(i): return i
        case let .double(d): return d.isFinite && abs(d) < 9e18 ? Int(d) : nil // Int(_:) traps out of range
        default: return nil
        }
    }
    var doubleValue: Double? {
        switch self {
        case let .int(i): return Double(i)
        case let .double(d): return d
        default: return nil
        }
    }
    var boolValue: Bool? { if case let .bool(b) = self { return b }; return nil }
    var isNull: Bool { self == .null }

    /// Pretty-printed text (RN `JSON.stringify(x, null, 2)`).
    func prettyString() -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? enc.encode(self) else { return "null" }
        return String(data: data, encoding: .utf8) ?? "null"
    }
}

extension JSON: ExpressibleByNilLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral,
    ExpressibleByFloatLiteral, ExpressibleByStringLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral
{
    init(nilLiteral: ()) { self = .null }
    init(booleanLiteral value: Bool) { self = .bool(value) }
    init(integerLiteral value: Int) { self = .int(value) }
    init(floatLiteral value: Double) { self = .double(value) }
    init(stringLiteral value: String) { self = .string(value) }
    init(arrayLiteral elements: JSON...) { self = .array(elements) }
    init(dictionaryLiteral elements: (String, JSON)...) {
        var o: [String: JSON] = [:]
        for (k, v) in elements { o[k] = v }
        self = .object(o)
    }
}

extension JSON {
    /// Optional -> JSON, so `["designId": .from(designId)]` sends null for nil (JSON.stringify keeps nulls).
    static func from(_ s: String?) -> JSON { s.map { .string($0) } ?? .null }
    static func from(_ i: Int?) -> JSON { i.map { .int($0) } ?? .null }
    static func from(_ d: Double?) -> JSON { d.map { .double($0) } ?? .null }
    static func from(_ b: Bool?) -> JSON { b.map { .bool($0) } ?? .null }
}
