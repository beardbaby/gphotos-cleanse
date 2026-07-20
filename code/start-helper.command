#!/usr/bin/env bash
# Duplicate Finder — helper launcher (macOS)
# Start the helper by running this from Terminal (this avoids the macOS security
# prompt that a double-click would trigger):
#
#   bash ~/Downloads/duplicate-finder-helper/start-helper.command
#
# (Adjust the path if you unzipped somewhere other than Downloads.)
# The first run installs everything it needs (a few minutes, ~1 GB); later runs
# start quickly.

set -euo pipefail
cd "$(dirname "$0")"

echo "=============================================="
echo "  Duplicate Finder — starting the helper"
echo "=============================================="

if ! command -v python3 >/dev/null 2>&1; then
  echo
  echo "Python 3 is not installed. Please install it from:"
  echo "  https://www.python.org/downloads/"
  echo "Then double-click this file again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

# Create the isolated environment on first run.
if [ ! -d ".venv" ]; then
  echo
  echo "First-time setup: creating environment and installing dependencies (this"
  echo "can take a few minutes and downloads ~1 GB — only happens once). Please wait..."
  echo
  python3 -m venv .venv
  ./.venv/bin/python -m pip install --upgrade pip
else
  echo
  echo "Checking dependencies…"
fi

# Always make sure the listed dependencies are present. This is fast when nothing
# is missing, and self-heals when a new version adds a package (e.g. torchvision).
if ! ./.venv/bin/pip install -r requirements.txt; then
  echo
  echo "Dependency install failed. If it failed on 'torch', install the right"
  echo "version for your Mac from https://pytorch.org, then run this again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo
echo "Helper is running. Keep this window OPEN while you use the website."
echo "The first time you scan, a Google sign-in window will open — sign in with"
echo "the account whose photos you want to clean."
echo "To stop the helper later, close this window or press Ctrl+C."
echo
./.venv/bin/python main.py
