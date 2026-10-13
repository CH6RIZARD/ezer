// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Ezer",
    platforms: [
        // MinimumOSVersion in the built Info.plist comes from this line.
        .iOS(.v17),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "Ezer",
            targets: ["Ezer"]
        ),
    ],
    targets: [
        .target(
            name: "Ezer",
            // Everything under Sources/Ezer/Resources is copied, flattened, into
            // Ezer_Ezer.bundle at the root of Ezer.app. Load it with Bundle.module.
            // File names must therefore be unique across Fonts/ and Images/.
            resources: [
                .process("Resources"),
            ],
            // Swift 5 language mode (Foundation port decision, see spec/foundation.md):
            // the RN app is single-threaded by nature; every store and view here is
            // @MainActor, and Swift 6's strict data-race checking on module-level
            // tables (brand logos, catalogs, formatters) only slows porting down.
            swiftSettings: [
                .swiftLanguageMode(.v5),
            ]
        ),
    ]
)
