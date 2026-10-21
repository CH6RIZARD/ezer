#!/bin/bash
# Phone builds without this PC's memory (owner, Oct 14 2026: "phone builds go through the box"). Committed code
# only: streams `git archive HEAD apps/ios` to the Vast box, which builds an UNSIGNED .ipa with xtool
# (/root/ezer/build.sh = scripts/box-ezer-build.sh; one-time toolchain + SDK setup: scripts/box-ezer-setup.sh), then
# downloads it to E:\tmp\Ezer.ipa. Installing signs it here with the saved Apple ID (never sent to the box).
# Android builds on GitHub Actions from the same commit. Every step: BUILD-AND-INSTALL.md.
#   bash scripts/remote-build.sh ios        (VAST_SSH="-p <port> root@<ip>")
set -e
cd "$(dirname "$0")/.."
[ "${1:-ios}" = ios ] || { echo "only ios builds on the box; Android builds on GitHub (BUILD-AND-INSTALL.md)" >&2; exit 1; }
SSH=${VAST_SSH:-"-p 40531 root@76.69.5.231"}  # Vast 56970625 "ezer-build" (Oct 20 2026)
PORT=$(echo $SSH | awk '{print $2}'); HOST=$(echo $SSH | awk '{print $3}')
KEY=~/.ssh/vast_ed25519
SHA=$(git rev-parse --short HEAD)
git log --oneline -1

# Never build while an app fix sits on an unmerged branch: the Oct 20 2026 iPhone build brought the doubled dove
# back because its fix lived only on claude/one-dove. Debug-only branches are listed in scripts/unmerged-ok.txt.
# ALLOW_UNMERGED=1 overrides; say why in the handoff if you use it.
git fetch -q origin 2>/dev/null || echo "warning: git fetch failed; the unmerged-branch check uses old refs" >&2
UNMERGED=""
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/claude/); do
  grep -qxF "${b#origin/}" scripts/unmerged-ok.txt 2>/dev/null && continue
  [ -n "$(git log --oneline HEAD..$b -- apps/ | head -1)" ] && UNMERGED="$UNMERGED $b"
done
if [ -n "$UNMERGED" ] && [ -z "$ALLOW_UNMERGED" ]; then
  echo "ERROR: app commits on these branches are not in HEAD:$UNMERGED" >&2
  echo "Merge them first (debug-only branches go in scripts/unmerged-ok.txt), or set ALLOW_UNMERGED=1." >&2
  exit 1
fi
# The doubled-dove guard (CLAUDE.md "Swift sprite windows").
bash scripts/check-sprites.sh

# tr: a Windows checkout (core.autocrlf) gives the script CRLF endings, and on the box `set -eo pipefail\r`
# dies with "pipefail: invalid option name" (Oct 16 2026). grep -v exits 1 when only the banner printed, so
# `|| true`: set -e must not stop there.
tr -d '\r' < scripts/box-ezer-build.sh | ssh -T -i $KEY -o StrictHostKeyChecking=no -p $PORT $HOST \
  'cat > /root/ezer/build.sh && chmod +x /root/ezer/build.sh && bash -n /root/ezer/build.sh' 2>&1 \
  | { grep -vE "Welcome to vast|Have fun" || true; }
LOG=$(mktemp)
git archive --format=tar HEAD apps/ios | ssh -T -i $KEY -p $PORT $HOST "bash /root/ezer/build.sh $SHA" 2>&1 \
  | grep -vE "Welcome to vast|Have fun" | tee "$LOG"
# Only a build that reports THIS commit counts. A box build that dies early leaves the previous Ezer.ipa
# behind, and it must never pass as a fresh one (Oct 16 2026).
grep -q "IPA_READY .* @ $SHA" "$LOG" || { echo "ERROR: the box did not build $SHA; nothing downloaded" >&2; exit 1; }
mkdir -p /e/tmp
scp -q -i $KEY -P $PORT $HOST:/root/ezer/Ezer.ipa /e/tmp/Ezer.ipa
ls -la /e/tmp/Ezer.ipa
echo 'Install (iPhone stays on Windows; BUILD-AND-INSTALL.md): wsl -d Ubuntu -- bash -lic "mkdir -p ~/apps/ipa && cp /mnt/e/tmp/Ezer.ipa ~/apps/ipa/Ezer.ipa && cd ~/apps/ipa && USBMUXD_SOCKET_ADDRESS=172.17.0.1:27015 timeout 1800 xtool install Ezer.ipa"'
