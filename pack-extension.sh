#!/usr/bin/env bash
# Re-pack the Chrome extension into public/duplicate-finder-extension.zip.
# Run this after editing the extension — e.g. after adding your hosted site's URL
# to "externally_connectable" in the extension's manifest.json.
#
#   bash pack-extension.sh
#
set -euo pipefail

# Path to the extension source folder. Override with:  EXT_SRC=/path bash pack-extension.sh
EXT_SRC="${EXT_SRC:-/Users/sanju/extension_test copy}"

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/public/duplicate-finder-extension.zip"
TMP="$(mktemp -d)"
STAGE="$TMP/duplicate-finder-extension"
mkdir -p "$STAGE"

for f in manifest.json background.js content.js popup.html popup.js; do
  cp "$EXT_SRC/$f" "$STAGE/$f"
done

rm -f "$DEST"
( cd "$TMP" && zip -r -X "$DEST" "duplicate-finder-extension" -x '*.DS_Store' >/dev/null )
rm -rf "$TMP"
echo "Packed extension -> $DEST"
