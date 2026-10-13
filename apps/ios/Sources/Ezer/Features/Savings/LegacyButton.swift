// Port of apps/mobile/components/Button.tsx (reached through apps/mobile/components/index.ts)
//
// EZER Mobile App - Button Component. Primary CTA button with Dave-like styling.
// Legacy: SYSTEM font (no fontFamily in its styles), legacy colour aliases. Only Reallocate renders
// it. The barrel's other exports (Card, CreditCard, MerchantLogo, CustomDateRangeModal, TrialBanner)
// are bundled but never rendered, so they have no Swift port. RN's `style`/`textStyle` overrides
// are not ported: the one call site passes neither.

import SwiftUI

/// RN `ButtonVariant`.
enum SavingsButtonVariant: Sendable { case primary, secondary, danger, success, gold }

/// RN `Button` (renamed: `Button` is SwiftUI's).
struct SavingsLegacyButton: View {
    @Environment(ThemeStore.self) private var theme
    let title: String
    var variant: SavingsButtonVariant = .primary
    var disabled = false
    var loading = false
    var fullWidth = true
    let onPress: () -> Void

    init(title: String, variant: SavingsButtonVariant = .primary, disabled: Bool = false, loading: Bool = false, fullWidth: Bool = true, onPress: @escaping () -> Void) {
        self.title = title
        self.variant = variant
        self.disabled = disabled
        self.loading = loading
        self.fullWidth = fullWidth
        self.onPress = onPress
    }

    var body: some View {
        let c = theme.colors
        let goldInk = Color(css: theme.isDark ? "#1A1A1A" : "#1F2933")
        let white = Color(css: "#FFFFFF")

        // getButtonStyle()
        let (bg, border): (Color, Color?) = {
            switch variant {
            case .primary: return (c.primary, nil)
            case .secondary: return (Color(css: "transparent"), c.text)
            case .danger: return (c.danger, nil)
            case .success: return (c.success, nil)
            case .gold: return (c.accent, nil)
            }
        }()
        // getTextStyle()
        let fg: Color = {
            switch variant {
            case .primary, .danger, .success: return white
            case .secondary: return c.text
            case .gold: return goldInk
            }
        }()
        let spinner: Color = variant == .secondary ? c.text : (variant == .gold ? goldInk : white)
        let bw: CGFloat = border == nil ? 0 : 1

        Button(action: onPress) {
            ZStack {
                if loading {
                    RNActivityIndicator(color: spinner)
                } else {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(fg)
                }
            }
            // button { paddingV 16, paddingH 24, radius 12, centre, minHeight 52 }; fullWidth { width: '100%' }
            .padding(.vertical, 16 + bw)
            .padding(.horizontal, 24 + bw)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 52)
            .background(rnRect(12).fill(bg))
            .overlay {
                if let border { rnRect(12).strokeBorder(border, lineWidth: 1) }
            }
            .opacity(disabled ? 0.5 : 1)   // disabled { opacity: 0.5 }
            .contentShape(Rectangle())
        }
        .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.8))
        .disabled(disabled || loading)
    }
}
