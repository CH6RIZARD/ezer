#!/usr/bin/env bash
# =============================================================================
# Build EZER for BOTH platforms from ONE commit (owner's rule, Oct 12 2026:
# "anytime a build is created it has to build both the iOS and the Android
# build at once so that neither are differing in version").
#
#   1. Snapshot the SwiftUI port (WSL ~/apps/Ezer, where it builds fast) into
#      apps/ios in this repo, so the commit records the iOS sources too.
#   2. Commit that snapshot (only apps/ios; commit app changes yourself first)
#      and push the branch.
#   3. Start the Android build (GitHub "EAS local Android build") for that SHA.
#   4. Stamp the SHA into the iOS bundle, build it and install it on the iPhone
#      (xtool dev; the Void's Ollama is paused for the build and restarted).
#
# Android install stays a separate step: the phone must be idle first (see
# CLAUDE.md / HANDOFF). This prints the run id to wait on.
#
# Usage (Git Bash, repo root):  bash scripts/build-both.sh [--no-install]
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
INSTALL=1; [ "${1:-}" = "--no-install" ] && INSTALL=0
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ -n "$(git status --porcelain -- apps/mobile packages apps/api)" ]; then
  echo "apps/mobile, apps/api or packages has uncommitted changes: commit them first so both builds share one version." >&2
  exit 1
fi

echo "== 1. snapshot the iOS port into apps/ios"
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -lc \
  "rsync -a --delete --exclude .build --exclude xtool --exclude '*.ipa' ~/apps/Ezer/ /mnt/e/ezer/apps/ios/" 2>/dev/null
git add apps/ios
if ! git diff --cached --quiet -- apps/ios; then
  git commit -q -m "iOS port snapshot for $(git rev-parse --short HEAD)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi
SHA=$(git rev-parse HEAD); SHORT=${SHA:0:7}

echo "== 2. push $BRANCH @ $SHORT"
git -c http.postBuffer=524288000 push -q origin "$BRANCH"

echo "== 3. Android build for $SHORT"
gh workflow run "EAS local Android build" --repo CH6RIZARD/ezer --ref "$BRANCH" -f profile=preview
sleep 8
RUN=$(gh run list --repo CH6RIZARD/ezer --workflow "EAS local Android build" --limit 5 \
  --json databaseId,headSha -q ".[] | select(.headSha==\"$SHA\") | .databaseId" | head -1)
echo "Android run: $RUN  (gh run view $RUN --repo CH6RIZARD/ezer)"

echo "== 4. iOS build${INSTALL:+ + install} for $SHORT"
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -lc \
  "mkdir -p ~/apps/Ezer/Sources/Ezer/Resources && echo $SHORT > ~/apps/Ezer/Sources/Ezer/Resources/build-version.txt" 2>/dev/null
powershell -NoProfile -Command "Stop-ScheduledTask VoidCurator; Stop-ScheduledTask VoidOllama; Get-Process ollama,llama-server -EA 0 | Stop-Process -Force" || true
set +e
if [ "$INSTALL" = 1 ]; then
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -lic "cd ~/apps/Ezer && timeout 1200 xtool dev 2>&1 | tr '\r' '\n' | grep -vE '^\s*$' | tail -6" 2>/dev/null
else
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -lc "bash ~/ezer-ios/build.sh | tail -3" 2>/dev/null
fi
IOS=$?
set -e
powershell -NoProfile -Command "Start-ScheduledTask VoidOllama; Start-ScheduledTask VoidCurator" || true
echo "iOS step exit=$IOS; Android run $RUN; both at $SHORT"
