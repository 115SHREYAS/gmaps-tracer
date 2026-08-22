#!/usr/bin/env bash
set -euo pipefail

DATE="${1:-$(date -u +%Y-%m-%d)}"
BBOX="${BBOX:-77.25,12.75,77.95,13.35}"
OUT="${OUT:-tiles/bangalore.pmtiles}"

mkdir -p "$(dirname "$OUT")"

find_cli() {
  if command -v pmtiles >/dev/null 2>&1; then echo "pmtiles"; return; fi
  echo ""
}

CLI="$(find_cli)"
if [ -z "$CLI" ]; then
  echo "go-pmtiles CLI not found, downloading latest release..."
  TMP="$(mktemp -d)"
  case "$(uname -s)/$(uname -m)" in
    Linux/x86_64)        ASSET="Linux_x86_64.tar.gz" ;;
    Linux/aarch64)       ASSET="Linux_aarch64.tar.gz" ;;
    Darwin/arm64)        ASSET="Darwin_arm64.tar.gz" ;;
    Darwin/x86_64)       ASSET="Darwin_x86_64.tar.gz" ;;
    MINGW*/x86_64|MSYS*/x86_64) ASSET="Windows_x86_64.zip" ;;
    *) echo "Unsupported platform: $(uname -s)/$(uname -m)"; exit 1 ;;
  esac
  URL="$(curl -s https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | grep -o "https://[^\"]*$ASSET" | head -n1)"
  [ -n "$URL" ] || { echo "Could not locate release asset"; exit 1; }
  curl -sL "$URL" -o "$TMP/dl"
  case "$ASSET" in
    *.zip) unzip -q "$TMP/dl" -d "$TMP" ;;
    *.tar.gz) tar -xzf "$TMP/dl" -C "$TMP" ;;
  esac
  CLI="$TMP/pmtiles$(uname -s | grep -qi 'MINGW\|MSYS' && echo .exe)"
fi

"$CLI" extract "https://build.protomaps.com/${DATE}.pmtiles" "$OUT" --bbox="$BBOX"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
