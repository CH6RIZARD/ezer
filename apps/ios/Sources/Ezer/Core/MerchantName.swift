// Port of apps/mobile/utils/merchantName.ts
//
// A merchant name fit to show. The API's canonical name is a cleaned bank descriptor and is the
// KEY the server matches charges on, so it must stay as it is ("acct paymtascent funding recur
// ascent paymt"). This only changes what the user reads; nothing sends the pretty name back.

import Foundation

private let NOISE: Set<String> = [
    "acct", "account", "paymt", "pymt", "pmt", "payment", "payments", "recur", "recurring",
    "autopay", "ach", "web", "des", "id", "ref", "online", "debit", "credit", "card", "purchase",
    "pos", "txn", "trans", "transaction", "chk", "chkcard", "visa", "mastercard", "www", "com",
    "inc", "llc", "ltd", "co", "corp", "bill", "billing", "subscription", "sub", "monthly", "auto",
]
/** A noise word glued to the front of a real word: "paymtascent" -> "ascent". */
private let GLUED = ["paymt", "pymt", "acct", "recur"]

func prettyMerchantName(_ raw: String) -> String {
    var words: [String] = []
    // raw.toLowerCase().split(/[^a-z0-9]+/)
    let lower = raw.lowercased()
    var tokens: [String] = []
    var cur = ""
    for ch in lower.unicodeScalars {
        if (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") {
            cur.unicodeScalars.append(ch)
        } else {
            tokens.append(cur)
            cur = ""
        }
    }
    tokens.append(cur)

    for var w in tokens {
        if w.isEmpty || w.contains(where: { $0.isASCII && $0.isNumber }) { continue }
        if let g = GLUED.first(where: { w.hasPrefix($0) && w.count - $0.count >= 3 }) {
            w = String(w.dropFirst(g.count))
        }
        if NOISE.contains(w) || words.contains(w) { continue }
        words.append(w)
    }
    if words.isEmpty { return raw }
    return words.map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
}
