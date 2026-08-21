#!/usr/bin/env bash
set -euo pipefail

DATE="${1:-$(date -u +%Y-%m-%d)}"
BBOX="${BBOX:-77.25,12.75,77.95,13.35}"
OUT="${OUT:-tiles/bangalore.pmtiles}"

mkdir -p "$(dirname "$OUT")"
npx --yes pmtiles extract "https://build.protomaps.com/${DATE}.pmtiles" "$OUT" --bbox="$BBOX"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
