#!/usr/bin/env bash
set -euo pipefail

# Fetch MapLibre glyph fonts + sprite sheets for @protomaps/basemaps from
# protomaps/basemaps-assets into apps/web/public.
#
# Font directory names MUST match the text-font stacks emitted by
# @protomaps/basemaps exactly (note the "Regular v1" suffix), otherwise
# label rendering 404s. Sprite version v4 pairs with @protomaps/basemaps v5.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/apps/web/public"
SRC="https://github.com/protomaps/basemaps-assets"
SPRITE_VER="${SPRITE_VER:-v4}"

FONTS=(
  "Noto Sans Regular"
  "Noto Sans Medium"
  "Noto Sans Italic"
  "Noto Sans Devanagari Regular v1"
)

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v tar >/dev/null || { echo "tar is required"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading basemaps-assets..."
curl -sL "$SRC/archive/refs/heads/main.tar.gz" -o "$TMP/assets.tar.gz"
tar -xzf "$TMP/assets.tar.gz" -C "$TMP"
ASSETS="$TMP/basemaps-assets-main"

mkdir -p "$DEST/fonts" "$DEST/sprites/$SPRITE_VER"

for font in "${FONTS[@]}"; do
  if [ ! -d "$ASSETS/fonts/$font" ]; then
    echo "Font '$font' not found upstream; check the name against @protomaps/basemaps output" >&2
    exit 1
  fi
  rm -rf "$DEST/fonts/$font"
  cp -r "$ASSETS/fonts/$font" "$DEST/fonts/$font"
  echo "fonts/$font: $(find "$DEST/fonts/$font" -type f | wc -l) files"
done

cp "$ASSETS/sprites/$SPRITE_VER/"* "$DEST/sprites/$SPRITE_VER/"
echo "sprites/$SPRITE_VER: $(find "$DEST/sprites/$SPRITE_VER" -type f | wc -l) files"
echo "Done."
