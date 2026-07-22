# Townsquare Web

A **self-contained, offline-first PWA** build of Townsquare. Plain static files — no build
step, no `node_modules`, no framework. Runs in any modern mobile browser with a camera and
shares the **v3.2 QR wire format** with the native app, so web and native phones can play in
the same room.

## What's here
```
core.js              game brain (crypto/wire, reducer, FSM, roles, fairness, narration)
ui.js                UI controller (screens, camera loop, QR rendering)
index.html           app shell + design tokens
sw.js                service worker (offline)
manifest.webmanifest PWA manifest
icons/               app icons (from the brand mark)
vendor/              drop in jsQR.js + qrcode.js here — see vendor/README.md
tests/interop.test.mjs  proves core.js == native ciphertext
```

## Before it runs: add the two vendor libs
The app needs two single-file MIT libraries dropped into `vendor/` (a QR **decoder** and a
QR **generator**). See [`vendor/README.md`](vendor/README.md). Without them the app still
loads, but scanning/QR display are disabled with a clear message.

## Run locally
Camera **and** `crypto.subtle` require a **secure context** — `localhost` counts, but a raw
LAN IP over plain HTTP does **not** (it will block the camera on a phone).

```bash
# desktop dev (localhost is secure):
python -m http.server 8000      # then open http://localhost:8000

# testing on a physical phone needs HTTPS — use one of:
#   npx http-server -S -C cert.pem -K key.pem     (self-signed)
#   cloudflared tunnel / ngrok   (tunnels an HTTPS URL to the local server)
#   or just deploy to the HTTPS staging site
```
Add `?dev=1` to the URL to lower the minimum players from 6 to 3 for solo testing.

## Multi-session testing (simulate many players in one browser)
`localStorage` is shared across tabs of the same origin, so plain tabs would all be the
*same* player. Use the **`?u=` param to namespace storage** — each distinct value is an
independent "device":

```
http://localhost:8000/?u=mod&dev=1     # the Moderator
http://localhost:8000/?u=1&dev=1        # player 1
http://localhost:8000/?u=2&dev=1        # player 2
...
http://localhost:8000/?u=7&dev=1        # player 7   (1 Mod + 7 players = 8 sessions)
```
Each tab shows its slot + name + role in the **tab title** and a small badge (top-left) so
you can tell them apart. `dev=1` lowers the minimum to 3 players so you don't need all 8.

Because desktop tabs have no camera, exchange payloads with the **DEV copy/paste path**
(the analog of the AVD clipboard flow):
1. In the tab showing a QR, click **"DEV: copy payload"** under it.
2. In the target tab, open the matching scanner and **paste** into the box → *Use pasted payload*.

Walkthrough: name each tab (Mod, Alice, …) → Mod *Create Game Night* → copy the join
payload into each player tab's *Join a Game* → copy each player's joinAck back into Mod's
*Scan joinAck* → *Start Round* → copy the roles payload into every player's *Scan Roles QR*
→ run the silent-night console on Mod → copy the sync payload out, ballots back in →
handoff. It's the full 8-player loop, entirely in one browser.

> Tip: open the 8 tabs across two windows side by side, or use separate browser **profiles**
> if you'd rather test real camera scans between two physical screens.

## Test the core (interop with native)
```bash
node tests/interop.test.mjs
```
Verifies `core.js` reproduces real native-generated ciphertexts byte-for-byte.

## Deploy
Copy the whole `townsquare-web/` folder to any static **HTTPS** host (the company website).
No server code, no build. All asset paths are **relative**, so it works at the site root or
any subpath (e.g. `company.com/townsquare/`). Bump `CACHE` in `sw.js` on each deploy (the
service worker is network-first, so clients also pick up changes automatically when online).

### Security posture (reviewed 2026-07-21)
- **No external requests, no tracking, no secrets.** Everything is same-origin and offline;
  the only stored data is a self-chosen play-name in `localStorage`.
- **XSS-safe.** All rendered names/scanned-QR data are HTML-escaped; no `eval`, no
  `innerHTML` of unescaped input.
- **CSP.** `index.html` ships a strict same-origin Content-Security-Policy (`default-src
  'self'`). Third-party libs are MIT and vendored locally (`vendor/LICENSES.md`).

### Recommended server headers (defense-in-depth — a meta tag can't set these)
```
X-Frame-Options: DENY                 # or CSP: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(self)     # the app needs the camera; scope it to this origin
Referrer-Policy: no-referrer
Cache-Control: no-cache               # on index.html and sw.js, so updates propagate
```
Also ensure the host serves `manifest.webmanifest` (as `application/manifest+json` or
`text/plain`) and `.js` with a JS MIME type — most static hosts do this by default.

### Note on `?dev=1`
The `?dev=1` URL param is a harmless testing affordance (lowers the min players to 3, shows
per-QR "copy payload" buttons, and logs wire strings to the console). It exposes only the
user's own game data and carries no risk, but it is user-toggleable in production. Say the
word if you'd prefer it stripped from the deployed build.

## Privacy
Same as the native app: **collects nothing.** Only a self-chosen play-name in
`localStorage`; no network calls, accounts, analytics, or identifiers.
