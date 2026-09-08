#!/usr/bin/env bash
# =============================================================================
# EZER — create the Play subscription and wire it into RevenueCat
#
# Replaces the console click-path for the two billing objects the app needs:
#
#   1. a Google Play subscription with one monthly base plan
#   2. a RevenueCat entitlement `premium` with that product attached
#
# `premium` is the ONLY string the app cares about. PremiumContext.native.tsx
# calls getOfferings() then purchasePackage(), and gates on
# entitlements.active['premium'] — the product id is free choice.
#
# NOTE: unlike scripts/setup-google-oauth-clients.sh, both APIs used here are
# public and documented. That script targets clientauthconfig.googleapis.com,
# which is Google-internal and returns 404 for everyone; OAuth clients can only
# be made in the console. Billing objects genuinely can be scripted.
#
# Usage:
#   RC_SECRET_KEY=sk_xxx RC_PROJECT_ID=proj_xxx RC_APP_ID=app_xxx \
#     ./scripts/setup-billing.sh
#
# Prerequisites:
#   * gcloud authenticated as an account with Play access, OR
#     GOOGLE_APPLICATION_CREDENTIALS pointing at the service-account JSON
#   * the app's first .aab already uploaded — Play does not know a package
#     name until a bundle carries it, and every call below 404s before that
# =============================================================================

set -euo pipefail

PACKAGE="${PACKAGE:-com.ezersaves.app}"
PRODUCT_ID="${PRODUCT_ID:-ezer_premium_monthly}"
BASE_PLAN_ID="${BASE_PLAN_ID:-monthly}"
PRICE_MICROS="${PRICE_MICROS:-4990000}"   # $4.99
CURRENCY="${CURRENCY:-USD}"
REGION="${REGION:-US}"
ENTITLEMENT="${ENTITLEMENT:-premium}"

GCLOUD="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

# --- 1. Google Play subscription --------------------------------------------

say "Google Play — subscription $PRODUCT_ID on $PACKAGE"

if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  TOKEN="$("$GCLOUD" auth application-default print-access-token 2>/dev/null)" || true
fi
TOKEN="${TOKEN:-$("$GCLOUD" auth print-access-token)}"
[[ -n "$TOKEN" ]] || die "no access token — run: gcloud auth login"

API="https://androidpublisher.googleapis.com/androidpublisher/v3/applications/$PACKAGE"

# One base plan, auto-renewing monthly, priced for the US. Other regions are
# added in the console — enumerating every country here would be noise.
read -r -d '' BODY <<JSON || true
{
  "productId": "$PRODUCT_ID",
  "basePlans": [{
    "basePlanId": "$BASE_PLAN_ID",
    "state": "DRAFT",
    "autoRenewingBasePlanType": {
      "billingPeriodDuration": "P1M",
      "gracePeriodDuration": "P7D",
      "accountHoldDuration": "P30D",
      "resubscribeState": "RESUBSCRIBE_STATE_ACTIVE"
    },
    "regionalConfigs": [{
      "regionCode": "$REGION",
      "newSubscriberAvailability": true,
      "price": { "currencyCode": "$CURRENCY", "units": "4", "nanos": 990000000 }
    }]
  }],
  "listings": [{
    "languageCode": "en-US",
    "title": "EZER Premium",
    "benefits": ["Track every subscription", "Price-increase alerts", "Automated savings goals"]
  }]
}
JSON

HTTP=$(curl -sS -o /tmp/ezer-play.json -w '%{http_code}' \
  -X POST "$API/monetization/subscriptions?productId=$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BODY" 2>/dev/null || echo 000)

case "$HTTP" in
  200|201) echo "    created" ;;
  409)     echo "    already exists — continuing" ;;
  404)     die "Play does not know $PACKAGE yet. Upload the first .aab to Internal testing, then re-run." ;;
  403)     die "Service account lacks Play permissions, or they have not propagated yet (can take hours)." ;;
  *)       echo "    HTTP $HTTP"; cat /tmp/ezer-play.json 2>/dev/null; die "Play API call failed" ;;
esac

echo "    NOTE: the base plan is created in DRAFT. Activate it in Play Console"
echo "          (Monetize > Subscriptions > $PRODUCT_ID > $BASE_PLAN_ID > Activate)."
echo "          Activation is deliberately not scriptable — it makes the plan sellable."

# --- 2. RevenueCat -----------------------------------------------------------

say "RevenueCat — entitlement '$ENTITLEMENT'"

[[ -n "${RC_SECRET_KEY:-}" ]] || die "RC_SECRET_KEY not set (RevenueCat > Project settings > API keys > secret key, starts sk_)"
[[ -n "${RC_PROJECT_ID:-}" ]] || die "RC_PROJECT_ID not set (it is in the dashboard URL: /projects/<id>/)"
[[ -n "${RC_APP_ID:-}" ]] || die "RC_APP_ID not set (Project settings > Apps > your Play app, starts app)"

RC="https://api.revenuecat.com/v2/projects/$RC_PROJECT_ID"
rc_post() {
  curl -sS -X POST "$RC$1" \
    -H "Authorization: Bearer $RC_SECRET_KEY" \
    -H 'Content-Type: application/json' \
    -d "$2"
}

echo "    entitlement"
rc_post "/entitlements" "{\"lookup_key\":\"$ENTITLEMENT\",\"display_name\":\"Premium\"}" | head -c 300; echo

echo "    product"
PROD_JSON=$(rc_post "/products" "{\"store_identifier\":\"$PRODUCT_ID:$BASE_PLAN_ID\",\"type\":\"subscription\",\"app_id\":\"$RC_APP_ID\"}")
echo "$PROD_JSON" | head -c 300; echo

# The store identifier for a Play subscription is productId:basePlanId, not the
# product id alone. Getting this wrong is the usual reason a package resolves in
# the dashboard but returns nothing to the SDK at runtime.
PROD_ID=$(printf '%s' "$PROD_JSON" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$PROD_ID" ]]; then
  echo "    attaching product $PROD_ID to '$ENTITLEMENT'"
  ENT_ID=$(curl -sS "$RC/entitlements" -H "Authorization: Bearer $RC_SECRET_KEY" \
    | tr ',' '\n' | grep -B2 "\"lookup_key\": *\"$ENTITLEMENT\"" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)
  [[ -n "$ENT_ID" ]] && rc_post "/entitlements/$ENT_ID/actions/attach_products" "{\"product_ids\":[\"$PROD_ID\"]}" | head -c 200 && echo
fi

say "Done"
cat <<'NEXT'
Remaining, in the console — neither is scriptable:

  1. Play Console: activate the base plan (it is created as DRAFT)
  2. RevenueCat:   add the product to a package in the `default` offering

Then the app resolves an offering and purchasePackage() has something to sell.
NEXT
