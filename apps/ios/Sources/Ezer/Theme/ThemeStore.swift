// Port of apps/mobile/utils/ThemeContext.tsx
//
// Three modes, not two: 'light' | 'dark' | 'black' (CLAUDE.md). 'dark' is the purple-tinted
// dark ("EZER" in Settings), 'black' the true-black variant ("Dark"). isDark is TRUE FOR BOTH
// dark modes. Persisted under `@ezer_theme_preference`; a missing or unknown stored value falls
// back to the system scheme, read once at load (as the RN provider did); 'black' until then.
//
// `colors` = { ...legacyAliases, ...tokens }: aliases first, tokens WIN on any collision
// (`accent`, `card`, `success` are the tokens). Un-migrated screens read the alias names
// (background, text, textSecondary, border, primary, danger, shadow, tabBar, statusBar).
//
//   @Environment(ThemeStore.self) private var theme
//   theme.colors.bg  /  theme.isDark  /  theme.mode == .light  /  theme.setMode(.black)
//   Color(css: theme.colors.tokens.red + "1F")   // RN string concatenation

import SwiftUI
import UIKit

enum ThemeMode: String, CaseIterable, Sendable {
    case light, dark, black
}

/// The merged RN `colors` object, parsed once. Raw CSS strings stay available in `tokens` /
/// `css(_:)` for call sites that concatenate (`colors.red + '40'`).
struct ThemeColors {
    /// The verbatim token strings for this mode.
    let tokens: ThemeTokens

    // --- tokens ---
    let bg: Color
    let bg2: Color
    let card: Color
    let line: Color
    let line2: Color
    let ink: Color
    let inkDim: Color
    let mut: Color
    let mut2: Color
    let mut3: Color
    let accent: Color
    let accInk: Color
    let accSoft: Color
    let gold: Color
    let goldBg: Color
    let goldLine: Color
    let goldSoft: Color
    let red: Color
    let cellBg: Color
    let cellHl: Color
    let tabBg: Color
    let goldTile: [Color]
    let success: Color
    let successBg: Color
    let scrim: Color

    // --- legacy aliases (ThemeContext.tsx) ---
    let background: Color
    let text: Color
    let textSecondary: Color
    let border: Color
    let primary: Color
    let danger: Color
    let shadow: Color
    let tabBar: Color
    /// 'dark' | 'light' — the StatusBar style string.
    let statusBar: String

    private let aliasCSS: [String: String]

    /// The CSS string for any key of the RN `colors` object (token or alias), e.g. `css("primary")`.
    func css(_ key: String) -> String? {
        if let v = tokenCSS[key] { return v }
        return aliasCSS[key]
    }

    private var tokenCSS: [String: String] {
        let t = tokens
        return [
            "bg": t.bg, "bg2": t.bg2, "card": t.card, "line": t.line, "line2": t.line2, "ink": t.ink,
            "inkDim": t.inkDim, "mut": t.mut, "mut2": t.mut2, "mut3": t.mut3, "accent": t.accent,
            "accInk": t.accInk, "accSoft": t.accSoft, "gold": t.gold, "goldBg": t.goldBg,
            "goldLine": t.goldLine, "goldSoft": t.goldSoft, "red": t.red, "cellBg": t.cellBg,
            "cellHl": t.cellHl, "tabBg": t.tabBg, "success": t.success, "successBg": t.successBg,
            "scrim": t.scrim,
        ]
    }

    private init(tokens t: ThemeTokens, aliases a: [String: String], statusBar: String) {
        tokens = t
        bg = Color(css: t.bg); bg2 = Color(css: t.bg2); card = Color(css: t.card)
        line = Color(css: t.line); line2 = Color(css: t.line2); ink = Color(css: t.ink)
        inkDim = Color(css: t.inkDim); mut = Color(css: t.mut); mut2 = Color(css: t.mut2)
        mut3 = Color(css: t.mut3); accent = Color(css: t.accent); accInk = Color(css: t.accInk)
        accSoft = Color(css: t.accSoft); gold = Color(css: t.gold); goldBg = Color(css: t.goldBg)
        goldLine = Color(css: t.goldLine); goldSoft = Color(css: t.goldSoft); red = Color(css: t.red)
        cellBg = Color(css: t.cellBg); cellHl = Color(css: t.cellHl); tabBg = Color(css: t.tabBg)
        goldTile = t.goldTile.map { Color(css: $0) }
        success = Color(css: t.success); successBg = Color(css: t.successBg); scrim = Color(css: t.scrim)
        aliasCSS = a
        background = Color(css: a["background"]!)
        text = Color(css: a["text"]!)
        textSecondary = Color(css: a["textSecondary"]!)
        border = Color(css: a["border"]!)
        primary = Color(css: a["primary"]!)
        danger = Color(css: a["danger"]!)
        shadow = Color(css: a["shadow"]!)
        tabBar = Color(css: a["tabBar"]!)
        self.statusBar = statusBar
    }

    // ORDER MATTERS (ThemeContext.tsx): legacy aliases first, tokens override on collision — so
    // the alias table below simply never names `card`, `accent` or `success`.
    static let light = ThemeColors(
        tokens: .light,
        aliases: [
            "background": ThemeTokens.light.bg,
            "text": ThemeTokens.light.ink,
            "textSecondary": ThemeTokens.light.mut,
            "border": ThemeTokens.light.line,
            "primary": ThemeTokens.light.accent,
            "danger": ThemeTokens.light.red,
            "shadow": "rgba(36,26,56,0.10)",
            "tabBar": ThemeTokens.light.tabBg,
        ],
        statusBar: "dark"
    )

    static let dark = ThemeColors(
        tokens: .dark,
        aliases: [
            "background": ThemeTokens.dark.bg,
            "text": ThemeTokens.dark.ink,
            "textSecondary": ThemeTokens.dark.mut,
            "border": ThemeTokens.dark.line,
            // Legacy `primary` is used for text and icons as well as fills, so it maps to
            // accInk — plain #4C1D95 is unreadable on the dark background.
            "primary": ThemeTokens.dark.accInk,
            "danger": ThemeTokens.dark.red,
            "shadow": "rgba(0,0,0,0.5)",
            "tabBar": ThemeTokens.dark.tabBg,
        ],
        statusBar: "light"
    )

    // True black: the dark palette's text/accent/gold on neutral black surfaces.
    static let black = ThemeColors(
        tokens: .black,
        aliases: [
            "background": ThemeTokens.black.bg,
            "text": ThemeTokens.dark.ink,
            "textSecondary": ThemeTokens.dark.mut,
            "border": ThemeTokens.black.line,
            "primary": ThemeTokens.dark.accInk,
            "danger": ThemeTokens.dark.red,
            "shadow": "rgba(0,0,0,0.7)",
            "tabBar": ThemeTokens.black.tabBg,
        ],
        statusBar: "light"
    )

    static func `for`(_ mode: ThemeMode) -> ThemeColors {
        switch mode {
        case .light: return .light
        case .dark: return .dark
        case .black: return .black
        }
    }
}

@Observable
@MainActor
final class ThemeStore {
    static let storageKey = "@ezer_theme_preference"

    private(set) var mode: ThemeMode

    /// True for BOTH dark modes ('dark' and 'black').
    var isDark: Bool { mode != .light }
    var colors: ThemeColors { ThemeColors.for(mode) }
    var tokens: ThemeTokens { colors.tokens }

    /// True until the system-scheme fallback has been read (no valid stored value).
    private var awaitingSystemScheme = false

    init() {
        // UserDefaults is synchronous, so a stored mode is known before the first frame. With
        // nothing (valid) stored, RN falls back to the system scheme — but the system's trait is
        // only reliable once the scene exists, so until then this shows RN's pre-load 'black'
        // (208bf3f: the colour of the splash, so a cold start never flashes cream), and
        // `adoptSystemScheme` (root onAppear) settles it.
        if let saved = KV.get(Self.storageKey), let m = ThemeMode(rawValue: saved) {
            mode = m
        } else {
            mode = .black
            awaitingSystemScheme = true
        }
    }

    /// RN `setModeState(systemColorScheme === 'dark' ? 'dark' : 'light')` when nothing is stored.
    /// Not persisted, like RN. A no-op once a mode was stored or chosen.
    func adoptSystemScheme(dark: Bool) {
        guard awaitingSystemScheme else { return }
        awaitingSystemScheme = false
        mode = dark ? .dark : .light
    }

    func setMode(_ next: ThemeMode) {
        awaitingSystemScheme = false
        mode = next
        KV.set(Self.storageKey, next.rawValue)
    }

    func toggleTheme() { setMode(mode == .light ? .dark : .light) }

    /** Legacy boolean setter — true picks 'dark', not 'black'. */
    func setTheme(_ dark: Bool) { setMode(dark ? .dark : .light) }
}
