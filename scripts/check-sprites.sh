#!/bin/bash
# Fails the iPhone build if a dove sprite could inherit an animation again: the doubled / "rolling" dove
# (iPhone only; Oct 14-16 2026, and again Oct 20 2026 when the fix lived only on an unmerged branch).
# Every sprite sheet is drawn through SpriteCell (Lock/DoveReveal.swift); see CLAUDE.md "Swift sprite
# windows". Run by scripts/remote-build.sh before every iPhone build.
set -e
cd "$(dirname "$0")/.."
SRC=apps/ios/Sources/Ezer
MOD='transaction { $0.animation = nil }'
fail=0

# 1. SpriteCell itself never animates a cell step.
if ! awk '/^struct SpriteCell: View/{f=1} f&&/^}/{exit} f' "$SRC/Lock/DoveReveal.swift" | grep -qF "$MOD"; then
  echo "check-sprites: SpriteCell lost .$MOD" >&2; fail=1
fi

# 2. Every TimelineView in a file that draws SpriteCells also drops inherited animation
#    (one modifier per TimelineView; SpriteCell's own one in DoveReveal.swift doesn't count).
for f in $(grep -rlF 'SpriteCell(' "$SRC"); do
  t=$(grep -cF 'TimelineView(' "$f" || true)
  n=$(grep -cF "$MOD" "$f" || true)
  [ "$f" = "$SRC/Lock/DoveReveal.swift" ] && n=$((n - 1))
  if [ "$n" -lt "$t" ]; then
    echo "check-sprites: $f has $t TimelineView(s) but only $n .$MOD" >&2; fail=1
  fi
done

[ $fail = 0 ] && echo "check-sprites: ok"
exit $fail
