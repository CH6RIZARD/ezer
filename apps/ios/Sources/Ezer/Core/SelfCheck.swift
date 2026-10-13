// DEBUG self-checks: the RN unit tests that specify Foundation helpers, ported as runtime checks
// (utils/passcodeCore.test.ts, merchantName.test.ts, merchantDomain.test.ts, cardArt/resolver.test.ts's
// alias checks), plus the CSS colour parser, the SVG parser over every bundled brand mark, and the
// bundled fonts/images. Results: the Xcode-less console and Documents/foundation-selfcheck.txt.

import Foundation
import SwiftUI
import UIKit

enum FoundationSelfCheck {
    static func runInBackground() {
        #if DEBUG
        Task { @MainActor in
            let report = run()
            print(report)
            if let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                try? report.write(to: docs.appendingPathComponent("foundation-selfcheck.txt"), atomically: true, encoding: .utf8)
            }
        }
        #endif
    }

    @MainActor
    static func run() -> String {
        var lines: [String] = []
        var fails = 0
        func eq<T: Equatable>(_ a: T, _ b: T, _ label: String) {
            if a != b { fails += 1; lines.append("FAIL \(label): got \(a), want \(b)") }
        }
        func ok(_ c: Bool, _ label: String) {
            if !c { fails += 1; lines.append("FAIL \(label)") }
        }

        // passcodeCore.test.ts — FIPS 180-2 vectors
        eq(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256 empty")
        eq(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 abc")
        eq(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
           "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1", "sha256 two blocks")
        ok(isValidPasscode("1234") && isValidPasscode("64226") && isValidPasscode("123456"), "isValidPasscode ok")
        ok(!isValidPasscode("123") && !isValidPasscode("1234567") && !isValidPasscode("12a4"), "isValidPasscode rejects")
        eq(lockedUntilAfter(4, 1000), 0, "lockout 4")
        eq(lockedUntilAfter(5, 1000), 1000 + 30_000, "lockout 5")
        eq(lockedUntilAfter(6, 1000), 1000 + 60_000, "lockout 6")
        eq(lockedUntilAfter(30, 1000), 1000 + 3_600_000, "lockout cap")
        ok(withinGrace(10_000, 10_000 + LOCK_GRACE_MS - 1), "grace inside")
        ok(!withinGrace(10_000, 10_000 + LOCK_GRACE_MS), "grace edge")
        ok(!withinGrace(10_000, 9_000), "grace clock back")
        ok(!withinGrace(nil, 10_000), "grace nil")

        // merchantName.test.ts
        eq(prettyMerchantName("acct paymtascent funding recur ascent paymt"), "Ascent Funding", "pretty ascent")
        eq(prettyMerchantName("autopay chase credit crd epay"), "Chase Crd Epay", "pretty chase")
        eq(prettyMerchantName("kikoff lending"), "Kikoff Lending", "pretty kikoff")
        eq(prettyMerchantName("self"), "Self", "pretty self")
        eq(prettyMerchantName("netflix"), "Netflix", "pretty netflix")
        eq(prettyMerchantName("NETFLIX.COM 4532"), "Netflix", "pretty NETFLIX.COM")
        eq(prettyMerchantName("ach 12345"), "ach 12345", "pretty nothing left")

        // merchantDomain.test.ts
        eq(trustedWebsiteDomain("https://www.ascentfunding.com/", "Ascent Funding"), "ascentfunding.com", "domain ascent")
        eq(trustedWebsiteDomain("self.inc", "Self"), "self.inc", "domain self")
        eq(trustedWebsiteDomain("https://www.netflix.com", "Netflix"), "netflix.com", "domain netflix")
        eq(trustedWebsiteDomain("app.netlify.com", "Netlify"), "app.netlify.com", "domain netlify")
        eq(trustedWebsiteDomain("cash.app", "Cash App"), "cash.app", "domain cash app")
        eq(trustedWebsiteDomain("https://www.tiktok.com/", "Cleo"), nil, "domain tiktok/cleo")
        eq(trustedWebsiteDomain("tiktok.com", "Kikoff Lending"), nil, "domain tiktok/kikoff")
        eq(trustedWebsiteDomain(nil, "Netflix"), nil, "domain nil")
        eq(trustedWebsiteDomain("not a url", "Netflix"), nil, "domain junk")

        // cardArt matching (resolver.test.ts): every alias resolves to its own issuer; whole words.
        for issuer in ISSUERS {
            for alias in issuer.aliases {
                eq(matchIssuer(alias)?.id, issuer.id, "alias \(alias)")
            }
        }
        ok(matchIssuer("Citizens Bank")?.id == "citizens", "Citizens != citi")
        ok(matchIssuer("First Citizens Bank")?.id == "first-citizens", "First Citizens")
        ok(matchIssuer("U.S. Bank, N.A.")?.id == "us-bank", "U.S. Bank")

        // CSS colours
        ok(CSSColor.parse("#4C1D95") != nil, "css hex6")
        ok(CSSColor.parse("rgba(36,26,56,.5)")?.a == 0.5, "css rgba .5")
        ok(CSSColor.parse("#B3402A1F") != nil, "css hex8")
        ok(CSSColor.parse("rgba(139,92,246,.2)1F") == nil, "css concatenated rgba -> clear")
        ok(CSSColor.parse("transparent")?.a == 0, "css transparent")

        // SVG: every brand mark parses to a non-empty path inside its 24x24 box.
        for (k, logo) in BRAND_LOGOS {
            let r = SVGPath.parse(logo.d).boundingRect
            ok(!r.isEmpty && r.minX > -1 && r.minY > -1 && r.maxX < 25 && r.maxY < 25, "svg \(k) bounds \(r)")
        }

        // Easing
        ok(abs(RNEasing.easeOut(0.5) - 0.9) < 0.1, "easeOut mid")
        ok(abs(RNEasing.rnDefault(0.5) - 0.5) < 1e-6, "inOut(ease) symmetric")

        // Resources
        for f in EzerFonts.required { ok(UIFont(name: f, size: 12) != nil, "font \(f)") }
        for img in ["dove-sheet", "dove-perch", "wordmark-cinzel"] { ok(EzerImages.ui(img) != nil, "image \(img)") }
        ok(DoveImages.shared[.hover] != nil, "image dove-hover.webp")
        ok(Ionicon.glyph("home-outline") != "?", "ionicon home-outline")
        ok(Ionicon.glyph("logo-whatsapp") != "?", "ionicon full map")

        #if DEBUG
        // utils/inboxScan/extract.test.ts (Settings owns the port and its cases).
        let inbox = SettingsInboxExtractSelfCheck.run()
        fails += inbox.count
        lines += inbox
        #endif

        lines.insert("EZER Foundation self-check: \(fails == 0 ? "ALL PASS" : "\(fails) FAILED") (\(Date()))", at: 0)
        return lines.joined(separator: "\n")
    }
}
