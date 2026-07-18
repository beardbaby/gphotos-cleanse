#!/usr/bin/env bash
# Package the local helper into public/duplicate-finder-helper.zip — the file
# users download from the site, unzip, and launch by double-clicking
# start-helper.command (Mac) or start-helper.bat (Windows).
#
#   bash pack-helper.sh
#
# The zip INCLUDES credentials.json (your Google "Desktop app" OAuth client, which
# every user needs to sign in) but EXCLUDES token.json (your personal login), the
# virtual environment, and caches.
#
# SECURITY: because the zip ships credentials.json, keep the GitHub repo PRIVATE
# (or host this zip via a GitHub Release instead of committing it). See DEPLOY.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/code"
DEST="$HERE/public/duplicate-finder-helper.zip"
TMP="$(mktemp -d)"
STAGE="$TMP/duplicate-finder-helper"
mkdir -p "$STAGE"

if [ ! -f "$SRC/credentials.json" ]; then
  echo "ERROR: $SRC/credentials.json is missing."
  echo "Download your Google 'Desktop app' OAuth client and save it there first."
  echo "(See DEPLOY.md, step 'Google Cloud setup'.)"
  exit 1
fi

# Ship exactly the files the helper needs to run.
for f in main.py test_main.py dino_stage.py auth2.py requirements.txt \
         credentials.json start-helper.command start-helper.bat SETUP.md; do
  cp "$SRC/$f" "$STAGE/$f"
done
chmod +x "$STAGE/start-helper.command"

rm -f "$DEST"
( cd "$TMP" && zip -r -X "$DEST" "duplicate-finder-helper" \
    -x '*.DS_Store' '*__pycache__*' '*token.json*' '*.venv*' >/dev/null )
rm -rf "$TMP"
echo "Packed helper -> $DEST"
