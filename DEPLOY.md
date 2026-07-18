# Deploying & distributing Duplicate Finder

This is the guide for **you** (the developer) to put the site online so other
people can use it. Architecture: the **website is hosted** (Vercel, free), and
each user runs a small **local helper** that does the scanning and signs into
*their own* Google account. You add users as Google "test users" (up to 100).

The code changes are already done. The steps below are the account-level work
only you can do.

> **Target URL:** `https://gphotos-cleanse.vercel.app` — the code is wired to this.
> If you use a different Vercel project name, that URL changes; see
> **"If your URL is different"** at the bottom.

---

## Step 1 — Google Cloud: OAuth client + test users

Your users sign into Google through *your* OAuth app. You need a "Desktop app"
client and a consent screen.

1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library** → enable the **Photos Picker API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Fill in app name, your email, etc.
   - **Scopes:** add `.../auth/photospicker.mediaitems.readonly`.
   - **Test users:** add the Google address of **every** person who will use it
     (up to 100). Anyone not listed here will be blocked.
   - Leave publishing status as **Testing** (fine for ≤100 users; no Google
     verification needed).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Download the JSON, rename it to **`credentials.json`**, and place it in the
     **`code/`** folder of this project.

> `credentials.json` ships inside the helper download so users can sign in. For a
> **Desktop** OAuth client this is expected — Google does not treat its secret as
> confidential. Still, keep your GitHub repo **private** (see Step 4).

## Step 2 — Build the two downloads

From the project root:

```bash
bash pack-extension.sh    # -> public/duplicate-finder-extension.zip
bash pack-helper.sh       # -> public/duplicate-finder-helper.zip  (needs code/credentials.json)
```

Both zips land in `public/`, so the site serves them at
`/duplicate-finder-extension.zip` and `/duplicate-finder-helper.zip` — which is
what the download buttons point to.

## Step 3 — Deploy the website to Vercel

1. Push this project to GitHub (private — see Step 4).
2. Go to https://vercel.com → **Add New → Project** → import this repo.
3. Vercel auto-detects Create React App. **Name the project `gphotos-cleanse`** so the
   URL becomes `https://gphotos-cleanse.vercel.app`. Deploy.
   - No environment variables needed: the frontend talks to the user's *local*
     helper at `http://localhost:8000` (the built-in default), not to a server.

Every `git push` to your main branch redeploys automatically.

## Step 4 — Keep the repo private

The helper zip in `public/` contains `credentials.json`. Anything in a **public**
repo is world-readable, so make the GitHub repo **Private**
(Settings → General → Danger Zone → Change visibility). Vercel's free "Hobby"
plan works fine with private repos.

*(Alternative if you want public source: don't commit the helper zip — attach it
to a GitHub Release instead and point the "Download the app" button at the release
asset URL. More work; the private-repo route is simpler.)*

## Step 5 — Test the whole flow yourself

1. Open `https://gphotos-cleanse.vercel.app`.
2. Download + unzip the **helper**, run `start-helper` (see `code/SETUP.md`).
3. Download + load the **extension** (`chrome://extensions` → Developer mode →
   Load unpacked).
4. Click **Scan my photos** → sign in → confirm results appear → try a delete.

## Step 6 — Share it

Send people the URL and tell them: *download the app, download the extension, then
scan.* First make sure their Google address is in your **test users** list
(Step 1), or they'll be blocked at sign-in.

---

## Where the live URL lives in the code

If your Vercel URL is **not** `gphotos-cleanse.vercel.app`, change it in these two
places, then re-run `bash pack-extension.sh` and redeploy:

| File | What to change |
|------|----------------|
| `code/main.py` | `_DEFAULT_ORIGINS` — the allowed CORS origin |
| `extension_test/manifest.json` | `externally_connectable.matches` — the site allowed to talk to the extension |

The frontend itself needs no URL change — it always talks to the user's local
helper at `http://localhost:8000`.

## Growing past 100 users

The "test users" cap is 100. To go fully public you'd need Google's **OAuth
verification** (and possibly a security assessment for Photos scopes), plus you'd
likely move to the full cloud-hosted model. That's a bigger project — see the
"Path B" discussion. For friends/small groups, the ≤100 test-user setup above is
all you need.
