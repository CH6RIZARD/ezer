// Port of apps/mobile/utils/revenueCatConfig.ts
//
// TODO(native SDK): RevenueCat purchases-ios is not linked, there is no iOS RevenueCat key in any
// build (EXPO_PUBLIC_RC_IOS_KEY is unset), and a free Apple ID cannot create App Store products.
// The RN dev-only test key is deliberately NOT carried over: a release build configured with a
// test key is force-closed by the SDK ("Wrong API Key") — never ship it.

import Foundation

enum RevenueCatConfig {
    /// nil: no SDK is configured; PremiumStore uses the local trial + server dev-unlock only.
    static let REVENUECAT_API_KEY: String? = nil

    static let ENTITLEMENT_ID = "premium"

    /**
     * Pricing — DISPLAY ONLY. The amount actually charged comes from the store package; a mismatch
     * between these strings and the real store price is a rejection at review.
     */
    static let FOUNDING_PRICE_LABEL = "$7.99"
    static let LIST_PRICE_LABEL = "$14"
    static let BILLING_PERIOD_LABEL = "month"

    /** Not read by the purchase path; kept so the catalogue and this file can be checked by eye. */
    static let PRODUCT_ID = "ezer_premium_monthly"

    static let TRIAL_DURATION_DAYS = 7

    enum ASYNC_STORAGE_KEYS {
        static let TRIAL_START_DATE = "@ezer_trial_start_date"
    }
}
