// Port of apps/mobile/theme/tokens.ts — generated from the source; do not retype.
// Colour strings are verbatim CSS colours; parse with Color(css:) (see §1.3).
struct ThemeTokens {
    let bg: String
    let bg2: String
    let card: String
    let line: String
    let line2: String
    let ink: String
    let inkDim: String
    let mut: String
    let mut2: String
    let mut3: String
    let accent: String
    let accInk: String
    let accSoft: String
    let gold: String
    let goldBg: String
    let goldLine: String
    let goldSoft: String
    let red: String
    let cellBg: String
    let cellHl: String
    let tabBg: String
    let goldTile: [String]
    let success: String
    let successBg: String
    let scrim: String
}

extension ThemeTokens {
    static let light = ThemeTokens(
        bg: "#F7F3EA",
        bg2: "#F7F3EA",
        card: "#FFFFFF",
        line: "#EEE7D6",
        line2: "#D6CCB4",
        ink: "#241A38",
        inkDim: "rgba(36,26,56,.5)",
        mut: "#8A7F6B",
        mut2: "#B0A68F",
        mut3: "#A99E86",
        accent: "#4C1D95",
        accInk: "#4C1D95",
        accSoft: "#EDE6F9",
        gold: "#A87D2F",
        goldBg: "#A87D2F",
        goldLine: "#E2C892",
        goldSoft: "#F6EBD3",
        red: "#B3402A",
        cellBg: "#FAF7F0",
        cellHl: "#FBF6EA",
        tabBg: "#FFFFFF",
        goldTile: ["#FFFDF7", "#FBF3E2"],
        success: "#348F66",
        successBg: "rgba(52,143,102,.14)",
        scrim: "rgba(20,10,46,.42)"
    )
    static let dark = ThemeTokens(
        bg: "#151021",
        bg2: "#251C3D",
        card: "#1F1834",
        line: "#2C2347",
        line2: "#3B2F5A",
        ink: "#F1EAF9",
        inkDim: "rgba(241,234,249,.5)",
        mut: "#A79BC2",
        mut2: "#6F6390",
        mut3: "#7C7096",
        accent: "#4C1D95",
        accInk: "#C4A9F7",
        accSoft: "rgba(139,92,246,.2)",
        gold: "#D6B36F",
        goldBg: "#8F6B29",
        goldLine: "#6E572B",
        goldSoft: "rgba(214,179,111,.15)",
        red: "#E0705A",
        cellBg: "#211A38",
        cellHl: "#2C2148",
        tabBg: "#1E1732",
        goldTile: ["#2B2245", "#332850"],
        success: "#348F66",
        successBg: "rgba(52,143,102,.14)",
        scrim: "rgba(20,10,46,.42)"
    )
    static let black = ThemeTokens(
        bg: "#000000",
        bg2: "#0C0C0E",
        card: "#121214",
        line: "#1F1F23",
        line2: "#2C2C32",
        ink: "#F1EAF9",
        inkDim: "rgba(241,234,249,.5)",
        mut: "#A79BC2",
        mut2: "#6F6390",
        mut3: "#7C7096",
        accent: "#4C1D95",
        accInk: "#C4A9F7",
        accSoft: "rgba(139,92,246,.2)",
        gold: "#D6B36F",
        goldBg: "#8F6B29",
        goldLine: "#6E572B",
        goldSoft: "rgba(214,179,111,.15)",
        red: "#E0705A",
        cellBg: "#101013",
        cellHl: "#1A1A1F",
        tabBg: "#0A0A0C",
        goldTile: ["#141416", "#1C1A16"],
        success: "#348F66",
        successBg: "rgba(52,143,102,.14)",
        scrim: "rgba(0,0,0,.55)"
    )
}

/// Settings › Theme "raised key" pill (Patch 4, mock 2b).
enum ThemeKeys {
    static let light = ["#FFFDF8", "#F0EADD"]   // lightTokens.bg ±8% L
    static let ezer = ["#6230B8", "#3E1680"]    // accent ±8% L
    static let dark = ["#262038", "#0E0A18"]    // darkTokens.bg ±8% L
    static let trough: [String: String] = ["light": "#ECE6D8", "dark": "#251C3D", "black": "#0C0C0E"]
    /// CSS box-shadow strings (inset). See §1.4 for the CSS→SwiftUI shadow rule.
    static let troughInset: [String: String] = ["light": "inset 0 2px 4px rgba(36,26,56,.22)", "dark": "inset 0 2px 4px rgba(0,0,0,.5)"]
    static let glow: [String: String] = ["light": "rgba(176,166,143,.5)", "ezer": "rgba(76,29,149,.5)", "dark": "rgba(14,10,24,.6)"]
}

/// Theme-independent gradients (do NOT flip with light/dark).
enum Gradients {
    static let cardFront: [String] = ["#5B21B6", "#31136E", "#150A33"]
    static let cardFrontLocations: [Double] = [0, 0.55, 1]
    static let cardBack: [String] = ["#3B1580", "#1E0B45", "#0E0724"]
    static let metalEdge: [String] = ["#E7C77E", "#A87D2F", "#E7C77E"]
    static let metalEdgeLocations: [Double] = [0, 0.55, 1]
    static let chartCard: [String] = ["#31136E", "#1D0B45"]
    static let ctaPrimary: [String] = ["#4C1D95", "#A87D2F"]
    static let bankSapphire: [String] = ["#2C4A8F", "#141F3E"]
    static let bankGold: [String] = ["#E9D9B8", "#C4A15A", "#9A7838"]
    static let bankGoldLocations: [Double] = [0, 0.65, 1]
}

enum CardFinish: String, CaseIterable { case amethyst, onyx, rose, bone }

/// Front finishes (diagonal gradients). Bone is the only light finish.
let cardFinishes: [CardFinish: [String]] = [
    .amethyst: ["#5B21B6", "#31136E", "#150A33"],
    .onyx: ["#33303B", "#17151D", "#0B0A10"],
    .rose: ["#F06BB0", "#C2185B", "#7A1041"],
    .bone: ["#F7F0E1", "#E9DCC2", "#D8C7A6"]
]

/// Back finishes, one shade richer per finish.
let cardBackFinishes: [CardFinish: [String]] = [
    .amethyst: ["#3B1580", "#1E0B45", "#0E0724"],
    .onyx: ["#33303B", "#17151D", "#0B0A10"],
    .rose: ["#D9317F", "#B0134F", "#6B0F3A"],
    .bone: ["#F1E8D4", "#DFD2B6", "#CDBC98"]
]

func isDarkFinish(_ f: CardFinish) -> Bool { f != .bone }

enum ChartColors {
    static let line = "#E7C77E"
    static let subtext = "#C9BCE8"
    static let chipBg = "rgba(231,199,126,.18)"
}
