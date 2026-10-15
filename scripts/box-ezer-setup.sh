#!/bin/bash
# One-time setup of the Vast build box for EZER's iPhone app (runs ON the box, in /root/ezer, apart from The
# Void's /root/void): Swift 6.4 via swiftly and xtool 1.21 (same versions as the PC's WSL), then the Darwin SDK
# from /root/ezer/Xcode.xip once it has been uploaded. Idempotent. Log: /root/ezer/setup.log
set -e
cd /root/ezer
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git libcurl4-openssl-dev libxml2-dev libz3-dev pkg-config \
  libpython3-dev libncurses-dev libedit2 libsqlite3-0 tzdata unzip zstd xz-utils file > /dev/null
if ! command -v swiftly > /dev/null && [ ! -x ~/.local/share/swiftly/bin/swiftly ]; then
  curl -fsSLO "https://download.swift.org/swiftly/linux/swiftly-$(uname -m).tar.gz"
  tar zxf "swiftly-$(uname -m).tar.gz"
  ./swiftly init --quiet-shell-followup --assume-yes --skip-install
fi
. ~/.local/share/swiftly/env.sh
swift --version 2>/dev/null | grep -q '6.4' || { swiftly install 6.4.0 --assume-yes && swiftly use 6.4.0; }
swift --version | head -1
if [ ! -x /root/ezer/xtool/AppRun ]; then
  curl -fsSL -o xtool.AppImage https://github.com/xtool-org/xtool/releases/download/1.21.0/xtool-x86_64.AppImage
  chmod +x xtool.AppImage && ./xtool.AppImage --appimage-extract > /dev/null && rm -rf xtool && mv squashfs-root xtool
fi
ln -sf /root/ezer/xtool/AppRun /usr/local/bin/xtool
xtool --version
if [ -f /root/ezer/Xcode.xip ] && xtool sdk status 2>&1 | grep -qi "not installed"; then
  xtool sdk install /root/ezer/Xcode.xip
fi
xtool sdk status
echo SETUP_DONE
