#!/usr/bin/env bash
# Creates Google Auth Platform OAuth clients for EZER (Web + iOS + Android)
# and writes Client IDs into /workspace/.env + apps/mobile env.
#
# Prerequisites:
#   gcloud auth login   (or application-default login)
#   A GCP project with the OAuth client API available
#
# Usage:
#   ./scripts/setup-google-oauth-clients.sh [PROJECT_ID]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
GCLOUD="${GCLOUD:-$HOME/google-cloud-sdk/bin/gcloud}"
PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-ezer-app}}"
BUNDLE_ID="com.ezer.app"
ANDROID_SHA1="${ANDROID_SHA1:-70:F2:45:F4:77:A4:A6:7E:5E:93:7F:EB:87:69:FB:03:DF:E7:C9:F7}"

if [[ ! -x "$GCLOUD" ]]; then
  GCLOUD="$(command -v gcloud || true)"
fi
if [[ -z "$GCLOUD" ]]; then
  echo "gcloud not found. Install Google Cloud SDK first." >&2
  exit 1
fi

echo "==> Using gcloud: $GCLOUD"
echo "==> Project: $PROJECT_ID"
echo "==> Android SHA-1: $ANDROID_SHA1"

ACCOUNT="$("$GCLOUD" auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1 || true)"
if [[ -z "$ACCOUNT" ]]; then
  echo "No active gcloud account. Starting login..."
  "$GCLOUD" auth login --brief
  ACCOUNT="$("$GCLOUD" auth list --filter=status:ACTIVE --format='value(account)' | head -1)"
fi
echo "==> Account: $ACCOUNT"

# Ensure project exists / is selected
if ! "$GCLOUD" projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Creating project $PROJECT_ID"
  "$GCLOUD" projects create "$PROJECT_ID" --name="EZER" || true
fi
"$GCLOUD" config set project "$PROJECT_ID"

# Enable required APIs
echo "==> Enabling APIs"
"$GCLOUD" services enable \
  gmail.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iap.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$PROJECT_ID" || true

# Prefer Google Cloud Client Auth Config / Firebase-style creation via REST.
# OAuth brand (consent) must exist for External apps.
ACCESS_TOKEN="$("$GCLOUD" auth print-access-token)"

upsert_env() {
  local key="$1"
  local value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ROOT/.env.example" "$ENV_FILE"
  fi
  if grep -q "^${key}=" "$ENV_FILE"; then
    # Escape for sed
    local escaped
    escaped="$(printf '%s' "$value" | sed 's/[&|]/\\&/g')"
    sed -i "s|^${key}=.*|${key}=\"${escaped}\"|" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

echo "==> Creating OAuth clients via Google API (clientauthconfig)"

# Discover support email
SUPPORT_EMAIL="$ACCOUNT"

create_client() {
  local client_type="$1" # web | ios | android
  local display_name="$2"
  local body="$3"

  # Google’s clientauthconfig endpoint used by Cloud Console
  local url="https://clientauthconfig.googleapis.com/v1/projects/${PROJECT_ID}/clients"
  local response
  response="$(curl -sS -X POST "$url" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    -d "$body" || true)"

  echo "$response"
}

# Brand / consent configuration (best-effort; Auth Platform wizard may still be required once)
curl -sS -X POST "https://iap.googleapis.com/v1/projects/${PROJECT_ID}/brands" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"applicationTitle\":\"EZER\",\"supportEmail\":\"${SUPPORT_EMAIL}\"}" >/tmp/ezer-oauth-brand.json || true

WEB_BODY=$(cat <<JSON
{
  "clientType": "CLIENT_TYPE_WEB",
  "displayName": "EZER Web",
  "web": {
    "redirectUris": [
      "http://localhost:3001/auth/oauth/google/callback",
      "http://localhost:3001/auth/oauth/google/callback/gmail",
      "ezer://auth/google"
    ],
    "javascriptOrigins": [
      "http://localhost:3001",
      "http://localhost:8081",
      "http://localhost:8082"
    ]
  }
}
JSON
)

IOS_BODY=$(cat <<JSON
{
  "clientType": "CLIENT_TYPE_IOS",
  "displayName": "EZER iOS",
  "ios": {
    "bundleId": "${BUNDLE_ID}"
  }
}
JSON
)

ANDROID_BODY=$(cat <<JSON
{
  "clientType": "CLIENT_TYPE_ANDROID",
  "displayName": "EZER Android",
  "android": {
    "packageName": "${BUNDLE_ID}",
    "certificateHash": "$(echo "$ANDROID_SHA1" | tr -d ':' | tr 'A-F' 'a-f')"
  }
}
JSON
)

echo "==> Web client"
WEB_RESP="$(create_client web "EZER Web" "$WEB_BODY")"
echo "$WEB_RESP" | tee /tmp/ezer-oauth-web.json

echo "==> iOS client"
IOS_RESP="$(create_client ios "EZER iOS" "$IOS_BODY")"
echo "$IOS_RESP" | tee /tmp/ezer-oauth-ios.json

echo "==> Android client"
ANDROID_RESP="$(create_client android "EZER Android" "$ANDROID_BODY")"
echo "$ANDROID_RESP" | tee /tmp/ezer-oauth-android.json

extract_client_id() {
  python3 - "$1" <<'PY'
import json,sys
p=sys.argv[1]
try:
  data=json.load(open(p))
except Exception as e:
  print("")
  sys.exit(0)
for key in ("clientId","client_id","name"):
  if key in data and data[key]:
    val=data[key]
    if key=="name" and "/clients/" in val:
      val=val.split("/clients/")[-1]
    print(val)
    break
else:
  # nested
  for k in ("client","oauthClient","data"):
    if isinstance(data.get(k), dict):
      cid=data[k].get("clientId") or data[k].get("client_id")
      if cid:
        print(cid); break
PY
}

WEB_ID="$(extract_client_id /tmp/ezer-oauth-web.json)"
IOS_ID="$(extract_client_id /tmp/ezer-oauth-ios.json)"
ANDROID_ID="$(extract_client_id /tmp/ezer-oauth-android.json)"
WEB_SECRET="$(python3 - <<'PY'
import json
try:
  d=json.load(open("/tmp/ezer-oauth-web.json"))
  print(d.get("clientSecret") or d.get("client_secret") or (d.get("web") or {}).get("clientSecret") or "")
except Exception:
  print("")
PY
)"

if [[ -z "$WEB_ID$IOS_ID$ANDROID_ID" ]]; then
  cat <<'EOF' >&2

ERROR: Could not create OAuth clients via API (Google often requires the
Auth Platform UI / brand wizard first, or a different privileged API).

Do this once in the browser, then re-run with IDs:

  1) https://console.cloud.google.com/auth/clients
  2) Create Web + iOS (com.ezer.app) + Android (com.ezer.app + SHA-1)
  3) Paste IDs:

     ./scripts/write-google-env.sh \
       --web WEB_CLIENT_ID \
       --ios IOS_CLIENT_ID \
       --android ANDROID_CLIENT_ID \
       --secret WEB_CLIENT_SECRET

Android debug SHA-1 for this environment:
EOF
  echo "  $ANDROID_SHA1" >&2
  exit 2
fi

"$ROOT/scripts/write-google-env.sh" \
  --web "$WEB_ID" \
  --ios "$IOS_ID" \
  --android "$ANDROID_ID" \
  --secret "${WEB_SECRET:-}"

echo "==> Done. Client IDs written to .env"
echo "    WEB=$WEB_ID"
echo "    IOS=$IOS_ID"
echo "    ANDROID=$ANDROID_ID"
