# Vendored third-party libraries

Townsquare Web depends on exactly **two** small, single-file, MIT-licensed libraries.
They are **not** included in this repo — drop them in here so the app stays fully
self-contained and loads them locally (no CDN, no network at runtime).

The app detects if either is missing and shows a clear message instead of breaking.

## 1. `jsQR.js` — QR **decoder** (camera scanning)
- Project: https://github.com/cozmo/jsQR  (MIT)
- File to place here: the built UMD bundle, saved as **`vendor/jsQR.js`**.
- Must expose a global function **`jsQR(dataArray, width, height, options)`** returning
  `{ data, ... }` or `null`. (`index.html` loads it as a classic `<script>`.)
- Typical source: the `dist/jsQR.js` file from an npm install of `jsqr`, or the release
  build from the GitHub repo.

## 2. `qrcode.js` — QR **generator** (rendering QR codes)
- Project: https://github.com/kazuhikoarase/qrcode-generator  (MIT)
- File to place here: the JS build, saved as **`vendor/qrcode.js`**.
- Must expose a global factory **`qrcode(typeNumber, errorCorrectionLevel)`** whose
  instance supports `.addData(text)`, `.make()`, `.getModuleCount()`, and
  `.isDark(row, col)` — the stable, version-independent module API this app draws from.
- Typical source: the `qrcode.js` file from the `qrcode-generator` npm package.

## How to add them (any one of these)
- `npm pack jsqr` / `npm pack qrcode-generator`, unpack, copy the single JS file here; **or**
- download the raw file from the project's GitHub release; **or**
- copy from an existing project.

After placing both files, bump the `CACHE` version in `../sw.js` so the service worker
picks them up, and reload.

## Why vendored (not a CDN)
Townsquare is offline-first and network-free by design. Loading these from a CDN would
add a runtime network dependency and a third-party origin — contrary to the whole point.
Keeping local copies also means the app keeps working with no connectivity after first load.
