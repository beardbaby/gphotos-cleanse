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

# First-time setup: isolated environment + dependencies.
if [ ! -d ".venv" ]; then
  echo
  echo "First-time setup: installing dependencies (this can take a few minutes"
  echo "and downloads ~1 GB — only happens once). Please wait..."
  echo
  python3 -m venv .venv
  ./.venv/bin/python -m pip install --upgrade pip
  if ! ./.venv/bin/pip install -r requirements.txt; then
    echo
    echo "Dependency install failed. If it failed on 'torch', install the right"
    echo "version for your Mac from https://pytorch.org, then run this again."
    echo
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
  fi
fi

echo
echo "Helper is running. Keep this window OPEN while you use the website."
echo "The first time you scan, a Google sign-in window will open — sign in with"
echo "the account whose photos you want to clean."
echo "To stop the helper later, close this window or press Ctrl+C."
echo
./.venv/bin/python main.py
