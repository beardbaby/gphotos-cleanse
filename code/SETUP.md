# Duplicate Finder — helper setup

This little app finds and helps you delete duplicate photos in **your own**
Google Photos. It runs on **your** computer so your photos are compared locally —
nothing about them is sent anywhere except Google.

You set this up once. It takes a few minutes.

---

## 1. Install Python (only if you don't have it)

- **Check:** the app will tell you if Python is missing when you run it.
- **Install:** get Python 3 from https://www.python.org/downloads/.
  - On **Windows**, tick **"Add Python to PATH"** during install.

## 2. Start the helper

Open the `duplicate-finder-helper` folder and double-click:

- **Mac:** run it from **Terminal** — this avoids the macOS security prompt entirely.
  1. Open **Terminal** (press ⌘-Space, type `Terminal`, press Enter).
  2. Paste this and press Enter:

     ```
     bash ~/Downloads/duplicate-finder-helper/start-helper.command
     ```

     (That's the path if you unzipped into **Downloads**. If it's elsewhere, just
     type `bash ` — with a space — then drag the `start-helper.command` file onto
     the Terminal window so its location fills in, and press Enter.)

  *Why Terminal? A double-clicked script gets blocked by macOS as "unverified";
  running it through Terminal doesn't, so there's no scary prompt. The file is
  the same either way.*
- **Windows:** `start-helper.bat`

The **first run installs everything it needs** (a few minutes, ~1 GB — only once).
A terminal/command window opens and stays open. **Leave it open** while you use
the website. To stop later, close that window.

## 3. Sign in with Google

The first time you click **Scan my photos** on the website, a Google sign-in
window opens. Sign in with the Google account whose photos you want to clean.

- You may see an **"unverified app"** screen — that's expected for a small private
  tool. Click **Continue / Advanced → Go to (app)** to proceed.

## 4. Use it

Go to the website, click **Scan my photos**, pick your photos, and go. To delete
duplicates you'll also need the browser extension — the website has a
**Download** button and steps for it.

---

## Good to know

- **Keep the helper window open** while scanning or deleting. If you close it, the
  website can't reach the app ("Backend not reachable").
- **You'll re-sign-in every so often.** Because this is a small unverified tool,
  Google expires the login after a few days. Just start the helper and sign in
  again when prompted.
- **During deletion, don't touch your computer** — a big batch runs by automating
  Google Photos and can take a while. Starting a large delete before bed works well.
- Deleted photos go to your **Google Photos trash** — recoverable for 60 days.

## If something breaks

- **"Backend not reachable"** → the helper window isn't running. Double-click
  `start-helper` again.
- **"We can't reach the deletion helper"** → the browser extension isn't
  installed/enabled, or its folder was moved.
- **Dependency install failed on `torch`** → install the right version for your
  system from https://pytorch.org, then start the helper again.
