// Port of apps/mobile/app/(tabs)/alerts.tsx
//
// EZER Redesign — Alerts (handoff §5)
//
// "Next 30 days · stay ahead of every charge".
// Trials expiring: red "Ends in Nd", "$X/mo after trial", gold Manage button.
// Upcoming renewals: purple Act button. Both open Subscription Detail.
//
// Hidden route: no tab-bar item; only the legacy RiskDetail/TrialDecision links reach it.

import SwiftUI

struct AlertsView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    var body: some View {
        let c = theme.colors
        let risks = data.risks
        let trials = risks.filter { $0.type == "trial" }
        let renewals = risks.filter { $0.type == "renewal" }

        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Alerts")
                        .typeStyle(TypeScale.screenTitle)
                        .foregroundStyle(c.ink)
                    BodyText("Next 30 days · stay ahead of every charge")
                        .padding(.top, 6)

                    if !trials.isEmpty {
                        SectionHeader("Trials expiring")
                            .padding(.top, 24)
                            .padding(.bottom, 10)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(trials) { t in row(t, isTrial: true, c) }
                        }
                    }

                    if !renewals.isEmpty {
                        SectionHeader("Upcoming renewals")
                            .padding(.top, 24)
                            .padding(.bottom, 10)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(renewals) { r in row(r, isTrial: false, c) }
                        }
                    }

                    if risks.isEmpty {
                        Surface {
                            BodyText("Nothing due in the next 30 days. You're ahead of it.")
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(22 + 1)
                        }
                        .padding(.top, 20)
                    }
                }
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, insets.bottom + Layout.tabBottom)
            .tabMark()
        }
        .scrollIndicators(.hidden)
        // bounces={false}: SwiftUI can only drop the bounce when the content fits.
        .scrollBounceBehavior(.basedOnSize)
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
        .premiumGate()
    }

    private func row(_ r: RiskItem, isTrial: Bool, _ c: ThemeColors) -> some View {
        // dueDate is a calendar day at UTC midnight; parsing it as UTC would show the previous day
        // west of UTC. JS prints "Invalid Date" for an unparsable one.
        let due = parseLocalDay(r.dueDate).map(savingsMonthDay) ?? "Invalid Date"

        return Surface {
            HStack(alignment: .center, spacing: 12) {
                // `logo` is what Plaid returns on an enriched merchant; without it the mark can only
                // fall back to the bundled/initial path.
                MerchantMark(name: r.merchantName, merchantId: r.subscriptionId, size: 42, logoUrl: r.logo)

                VStack(alignment: .leading, spacing: 0) {
                    Text(r.merchantName)
                        .font(.ezer(FontFamily.bold, 14.5))
                        .foregroundStyle(c.ink)
                        .lineLimit(1)
                    Text(isTrial ? "Ends in \(r.daysUntilDue)d" : "Renews in \(r.daysUntilDue)d · \(due)")
                        .font(.ezer(FontFamily.bold, 11.5))
                        .foregroundStyle(isTrial ? c.red : c.mut)
                        .lineLimit(1)
                        .padding(.top, 3)
                    Text(isTrial ? "\(formatCents(r.amountCents))/mo after trial" : formatCents(r.amountCents))
                        .font(.ezer(FontFamily.regular, 11.5))
                        .foregroundStyle(c.mut2)
                        .lineLimit(1)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                PressScale(scaleTo: 0.94, action: { router.push("/screens/SubscriptionDetail", ["id": r.subscriptionId]) }) {
                    Text(isTrial ? "Manage" : "Act")
                        .font(.ezer(FontFamily.bold, 12.5))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                        .padding(.horizontal, 15)
                        .padding(.vertical, 9)
                        .frame(minHeight: 36)
                        .background(rnRect(Radius.buttonSm).fill(isTrial ? c.goldBg : c.accent))
                }
            }
            .padding(12 + 1)
        }
    }
}
