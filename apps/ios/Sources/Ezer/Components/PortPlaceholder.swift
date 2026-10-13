// Stand-in body for a feature entry view that has not been ported yet, so the shell compiles and
// runs. It shows only the RN source path it stands for — no invented UI. Feature porters replace
// the whole view file; nothing else should use this.

import SwiftUI

struct PortPlaceholder: View {
    @Environment(ThemeStore.self) private var theme
    let source: String

    init(_ source: String) { self.source = source }

    var body: some View {
        let c = theme.colors
        ZStack {
            c.bg
            Text(source)
                .font(.custom(FontFamily.medium, size: 13))
                .foregroundStyle(c.mut)
                .multilineTextAlignment(.center)
                .padding(24)
        }
        .rnScreen()
    }
}
