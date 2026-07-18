@echo off
REM Duplicate Finder - helper launcher (Windows)
REM Double-click this file to start the local helper. The first run installs
REM everything it needs (a few minutes, ~1 GB); later runs start quickly.

cd /d "%~dp0"

echo ==============================================
echo   Duplicate Finder - starting the helper
echo ==============================================

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python 3 is not installed. Please install it from:
  echo   https://www.python.org/downloads/
  echo During install, tick "Add Python to PATH". Then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM First-time setup: isolated environment + dependencies.
if not exist ".venv" (
  echo.
  echo First-time setup: installing dependencies ^(this can take a few minutes
  echo and downloads ~1 GB - only happens once^). Please wait...
  echo.
  python -m venv .venv
  ".venv\Scripts\python" -m pip install --upgrade pip
  ".venv\Scripts\pip" install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo Dependency install failed. If it failed on "torch", install the right
    echo version from https://pytorch.org, then run this again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Helper is running. Keep this window OPEN while you use the website.
echo The first time you scan, a Google sign-in window will open - sign in with
echo the account whose photos you want to clean.
echo To stop the helper later, close this window.
echo.
".venv\Scripts\python" main.py
