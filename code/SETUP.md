# Duplicate Finder — setup (for you, the user)

The website finds and helps you delete duplicate photos in **your own** Google
Photos. Two small things run on **your** computer: a helper program (this folder)
and a Chrome extension. Nothing about your photos is sent anywhere except Google.

You only set this up once. Takes ~10 minutes.

---

## 1. Install Python (if you don't have it)
- Check: open a terminal and run `python3 --version`. If you see a version, you're set.
- If not, install Python 3 from https://www.python.org/downloads/ (or the Microsoft
  Store on Windows).

## 2. Install the helper's dependencies
In a terminal, `cd` into this folder (the one containing `main.py`), then run:

```bash
pip install -r requirements.txt
```

(This downloads an AI model library, so it may take a few minutes and ~1 GB.)

## 3. Start the helper
```bash
python main.py
```
- The first time, a browser window opens asking you to **sign in with Google**.
  Use the Google account whose photos you want to clean — the one you gave to the
  person who shared this with you (they add you as an allowed tester).
- You may see an "unverified app" screen — that's expected for a small private tool.
  Click **Continue / Advanced → Go to (app)** to proceed.
- Leave this terminal window **open** while you use the site. To stop it later, press
  `Ctrl+C`.

## 4. Install the Chrome extension (needed only for deleting)
- On the website, click **Download the extension** and follow the on-screen steps
  (unzip → `chrome://extensions` → Developer mode → Load unpacked).
- Keep the unzipped folder somewhere permanent.

## 5. Use it
- Open the website, click **Scan my photos**, pick your photos, and go.
- When you're done for the day, close the terminal (`Ctrl+C`) and the extension can
  stay installed for next time.

---

## Good to know
- **You'll re-sign-in about once a week.** Because this is a small private (unverified)
  tool, Google expires the login after a few days. Just run `python main.py` again and
  sign in when prompted.
- **Keep the helper running** while scanning/deleting — if you close the terminal,
  the site can't reach it.
- **During deletion, don't touch your computer** — a big batch can take a while and
  runs by automating Google Photos. Starting a large delete before bed works well.
- Your photos are compared **on your own machine**; only Google ever receives your
  sign-in.

## If something breaks
- "We can't reach the deletion helper" → the extension isn't installed/enabled, or you
  moved its folder.
- "Backend not reachable" → the `python main.py` terminal isn't running.
- `pip install` fails on `torch` → install torch first using the command for your
  system from https://pytorch.org, then re-run `pip install -r requirements.txt`.
