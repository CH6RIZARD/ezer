import SwiftUI
import UIKit

/// Bundled images. No asset catalogs on this toolchain (actool is macOS-only), so
/// images are loose PNGs under Sources/Ezer/Resources/ (e.g. dove/), copied flat into
/// Bundle.module: look them up by file name only, never by folder.
enum EzerImages {
    /// Name without extension. UIImage picks name@3x.png / name@2x.png when present.
    static func ui(_ name: String) -> UIImage? {
        UIImage(named: name, in: .module, with: nil)
    }
}

extension Image {
    /// SwiftUI image from a loose PNG in Bundle.module.
    init(ezer name: String) {
        if let image = EzerImages.ui(name) {
            self.init(uiImage: image)
        } else {
            self.init(systemName: "questionmark.square.dashed")
        }
    }
}
