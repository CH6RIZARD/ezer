#!/bin/bash
# Runs ON the Vast box (installed as /root/ezer/build.sh by scripts/remote-build.sh). Reads
# `git archive HEAD apps/ios` on stdin, stamps the commit into Resources/build-version.txt, and builds an
# UNSIGNED .ipa with xtool (the PC signs it on install with the owner's Apple ID, which never leaves the PC).
# Keeps .build between runs so only changed sources recompile. Usage: build.sh <short-sha>
set -eo pipefail
SHA=${1:-unknown}
. ~/.local/share/swiftly/env.sh
cd /root/ezer
rm -rf stage && mkdir stage && tar -x -C stage
[ -d src/.build ] && mv src/.build stage/apps/ios/
rm -rf src && mv stage/apps/ios src && rm -rf stage
cd src
mkdir -p Sources/Ezer/Resources && echo "$SHA" > Sources/Ezer/Resources/build-version.txt
start=$(date +%s)
xtool dev build --ipa 2>&1 | tail -25
IPA=$(ls -t xtool/*.ipa | head -1)
cp "$IPA" /root/ezer/Ezer.ipa
echo "IPA_READY /root/ezer/Ezer.ipa $(du -h /root/ezer/Ezer.ipa | cut -f1) in $(( $(date +%s) - start ))s @ $SHA"
