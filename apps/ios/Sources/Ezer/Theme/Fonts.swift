// Port of the useFonts() call in apps/mobile/app/_layout.tsx (font registration).
//
// Bundled fonts live in Sources/Ezer/Resources/Fonts and end up in Bundle.module
// (Ezer.app/Ezer_Ezer.bundle). They are registered at runtime rather than through UIAppFonts,
// whose paths are relative to the .app root. Dropping another .ttf into Resources/Fonts needs no
// code change: registerAll() picks up every font file.

import CoreText
import Foundation
import UIKit

enum EzerFonts {
    /// PostScript names (what `Font.custom` / `UIFont(name:)` want), not file names.
    static let instrumentSerifItalic = "InstrumentSerif-Italic"
    static let ionicons = "Ionicons"
    /// The five faces app/_layout.tsx loads, plus the icon font.
    static let required = [
        FontFamily.regular, FontFamily.medium, FontFamily.semibold, FontFamily.bold, FontFamily.serif, ionicons,
    ]

    /// Registers every .ttf/.otf in Bundle.module for this process. Call once from
    /// `EzerApp.init`. Returns the files that failed (already-registered counts as failed
    /// and is harmless).
    @discardableResult
    static func registerAll() -> [String] {
        let urls = ["ttf", "otf"].flatMap {
            Bundle.module.urls(forResourcesWithExtension: $0, subdirectory: nil) ?? []
        }
        var failed: [String] = []
        for url in urls {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                failed.append(url.lastPathComponent)
            }
        }
        return failed
    }

    /// RN's `fontsLoaded`: every face the app asks for resolves by PostScript name.
    static var allLoaded: Bool {
        required.allSatisfy { UIFont(name: $0, size: 12) != nil }
    }
}
