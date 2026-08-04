#!/usr/bin/env bash
# Writes Google OAuth client IDs into /workspace/.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
WEB=""
IOS=""
ANDROID=""
SECRET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web) WEB="$2"; shift 2 ;;
    --ios) IOS="$2"; shift 2 ;;
    --android) ANDROID="$2"; shift 2 ;;
    --secret) SECRET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$WEB" || -z "$IOS" ]]; then
  echo "Usage: $0 --web WEB_ID --ios IOS_ID [--android ANDROID_ID] [--secret WEB_SECRET]" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
fi

upsert() {
  local key="$1" value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[&|]/\\&/g')"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=\"${escaped}\"|" "$ENV_FILE"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

upsert GOOGLE_CLIENT_ID "$WEB"
upsert GOOGLE_WEB_CLIENT_ID "$WEB"
upsert EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID "$WEB"
upsert EXPO_PUBLIC_GOOGLE_CLIENT_ID "$WEB"
upsert GOOGLE_IOS_CLIENT_ID "$IOS"
upsert EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID "$IOS"
if [[ -n "$ANDROID" ]]; then
  upsert GOOGLE_ANDROID_CLIENT_ID "$ANDROID"
fi
if [[ -n "$SECRET" ]]; then
  upsert GOOGLE_CLIENT_SECRET "$SECRET"
fi
upsert DEV_OAUTH_BYPASS false

echo "Wrote Google client IDs to $ENV_FILE"
