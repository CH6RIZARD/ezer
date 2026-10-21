#!/bin/bash
# Phone builds without this PC's memory (owner, Oct 14 2026: "phone builds go through the box"). Committed code
# only: streams `git archive HEAD apps/ios` to the Vast box, which builds an UNSIGNED .ipa with xtool
# (/root/ezer/build.sh = scripts/box-ezer-build.sh; one-time toolchain + SDK setup: scripts/box-ezer-setup.sh), then
# downloads it to E:\tmp\Ezer.ipa. Installing signs it here with the saved Apple ID (never sent to the box).
# Android keeps building on GitHub Actions (scripts/build-both.sh starts it).
#   bash scripts/remote-build.sh ios        (VAST_SSH="-p <port> root@<ip>")
set -e
cd "$(dirname "$0")/.."
[ "${1:-ios}" = ios ] || { echo "only ios builds on the box; Android builds on GitHub (scripts/build-both.sh)" >&2; exit 1; }
SSH=${VAST_SSH:-"-p 40531 root@76.69.5.231"}  # Vast 56970625 "ezer-build" (Oct 20 2026)
PORT=$(echo $SSH | awk '{print $2}'); HOST=$(echo $SSH | awk '{print $3}')
KEY=~/.ssh/vast_ed25519
SHA=$(git rev-parse --short HEAD)
git log --oneline -1
scp -q -i $KEY -o StrictHostKeyChecking=no -P $PORT scripts/box-ezer-build.sh $HOST:/root/ezer/build.sh
git archive --format=tar HEAD apps/ios | ssh -T -i $KEY -p $PORT $HOST "bash /root/ezer/build.sh $SHA" 2>&1 \
  | grep -vE "Welcome to vast|Have fun"
mkdir -p /e/tmp
scp -q -i $KEY -P $PORT $HOST:/root/ezer/Ezer.ipa /e/tmp/Ezer.ipa
ls -la /e/tmp/Ezer.ipa
echo 'Install: wsl -d Ubuntu -- bash -lic "mkdir -p ~/apps/ipa && cp /mnt/e/tmp/Ezer.ipa ~/apps/ipa/Ezer.ipa && cd ~/apps/ipa && timeout 1800 xtool install Ezer.ipa"'
