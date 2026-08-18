# Townsquare Mobile v1.1.0 & EAS Update Implementation Plan

This document outlines the roadmap for upgrading the native mobile app (`src/`) to **v1.1.0**, implementing the Phase 2 feature enhancements from `townsquare-enhancements-plan.md`, and integrating **EAS Update (`expo-updates`)** so all future updates ship instantly Over-The-Air (OTA) without App Store review cycles.

---

## 1. Executive Summary

* **Surface**: Native iOS & Android apps (`src/`).
* **Target Version**: `1.1.0` (Native Store Build).
* **Two Core Tracks**:
  1. **Track A — Phase 2 Feature Parity & Gameplay Enhancements**:
     - **#1 3× Logo**: Enlarge `BrandMark` on `SetupScreen.tsx`.
     - **#2 Narration `allByCategory()`**: `NarrationEngine.ts` **already contains all 50 sayings** — the only new work is adding the `allByCategory()` accessor for the reference screen.
     - **#3 Moderator Restore / Undo**: `PLAYER_STATUS_RESTORED` action & restore control on dead/eliminated players.
     - **#5 Lower Floor to `MIN_ROLE_HOLDERS = 3`**: Set 3-player floor with 7-person recommendation badge.
     - **#6 Help Screen Parity**: Update `HowToPlayScreen.tsx` room size and warning.
     - **#7 Tamil Moral Wisdom Screen**: Add `SayingsScreen.tsx` + bottom-left **ழ்** FAB in `App.tsx` with toggle behavior.
     - **#8 Night-Action Correction**: Add "Change / Re-pick" action in `ModeratorScreen.tsx` so the Moderator can correct accidental target selections during the Silent Night Console before resolving the night.
  2. **Track B — EAS Update Integration**: Equip the v1.1 binary with `expo-updates` and configure production channels so all subsequent patches (v1.1.1+) deploy instantly OTA.

---

## 2. Track A: Phase 2 Feature Implementation

### 2.1 File Changes

#### [MODIFY] [src/screens/SetupScreen.tsx](file:///d:/pethuraj/townsquare/src/screens/SetupScreen.tsx)
* **Feature #1 (3× Logo)**: Enlarge `BrandMark` from `size={88}` to `size={264}` on the first name-entry screen, verifying keyboard avoidance under `KeyboardAvoidingView`.

#### [MODIFY] [src/services/NarrationEngine.ts](file:///d:/pethuraj/townsquare/src/services/NarrationEngine.ts)
* **Feature #2 (`allByCategory` accessor)**: The 50-saying database is **already present** in native `NarrationEngine.ts` — do **not** re-paste it. Only add `NarrationEngine.allByCategory()` to expose the existing sayings grouped by the 6 game moments for `SayingsScreen.tsx`.

#### [MODIFY] [src/engine/RoleTable.ts](file:///d:/pethuraj/townsquare/src/engine/RoleTable.ts) & [src/state/dispatch.ts](file:///d:/pethuraj/townsquare/src/state/dispatch.ts)
* **Feature #5 (Threshold Floor = 3)**:
  * Set `MIN_ROLE_HOLDERS = 3`.
  * Update `outlawCountFor` table to map 3, 4, 5, 6 role holders $\rightarrow$ 1 Outlaw.
  * Remove `DEV_MIN_ROLE_HOLDERS` and `effectiveMinRoleHolders()`.
* **Feature #3 (Moderator Restore / Undo)**:
  * Add `PLAYER_STATUS_RESTORED` reducer action:
    * Resets a `DECEASED` or `ELIMINATED` player's status back to `ACTIVE`.
    * Clears `lastElimination` if the restored player was the last eliminated.
* **Feature #8 (Night-Action Clear / Correction)**:
  * Add `NIGHT_ACTION_CLEARED` action (or support re-logging via `NIGHT_ACTION_LOGGED`) to allow clearing/changing logged targets before night resolution.

#### [MODIFY] [src/screens/ModeratorScreen.tsx](file:///d:/pethuraj/townsquare/src/screens/ModeratorScreen.tsx)
* **Feature #3 (Restore Control)**: Add a gold **"Restore / Undo"** button next to each `DECEASED` or `ELIMINATED` row on the Moderator's roster status card.
* **Feature #5 (Recommendation Badge)**:
  * **Repoint the Start-gate** from `effectiveMinRoleHolders()` (being deleted) to `MIN_ROLE_HOLDERS`; enable **Start Round** when role holders $\ge 3$.
  * **Remove the now-moot `__DEV__` "starting with N players" caption.**
  * Display recommendation note when role holders are between 3 and 5:  
    `💡 Recommended: 7+ total people (1 Mod + 6 Players) for optimal balance.`
* **Feature #8 (Night-Action Correction)**:
  * In the Silent Night Console, render a **"Change"** button next to each logged action (Outlaw Kill, Doctor Save, Detective Inspect) so the Moderator can re-pick candidates if an accidental tap occurs before tapping "Resolve Night".

#### [NEW] [src/screens/SayingsScreen.tsx](file:///d:/pethuraj/townsquare/src/screens/SayingsScreen.tsx) & [MODIFY] [src/App.tsx](file:///d:/pethuraj/townsquare/src/App.tsx)
* **Feature #7 (Tamil Moral Wisdom Screen)**:
  * Create `SayingsScreen.tsx` displaying all 50 classical Tamil moral sayings grouped by the 6 game moments in the 4-line format (`SOURCE · POET` / Tamil / transliteration / translation).
  * In `App.tsx`, add the bottom-left **ழ்** FAB (mirroring the **?** Help FAB) with mutually-exclusive toggle behavior.

#### [MODIFY] [src/screens/HowToPlayScreen.tsx](file:///d:/pethuraj/townsquare/src/screens/HowToPlayScreen.tsx)
* **Feature #6 (Help Parity)**: Update room size descriptions to `4–17 total people (1 Moderator + 3 to 16 Players)` with the 7-person recommendation.
* **⚠️ Cross-surface sync:** feature #6 means both help screens must match. When #5 (min = 3) shipped on web, the **web help text may still say "6–16."** Before/with this update, verify the **web** `helpScreen()` and native `HowToPlayScreen.tsx` state the *same* room size — otherwise the two surfaces teach different rules.

---

## 3. Track B: EAS Update (`expo-updates`) Integration

### 3.1 Step-by-Step Configuration

#### 1. Install `expo-updates`
Matched to Expo SDK 54:
```bash
npx expo install expo-updates
```

#### 2. Update [app.json](file:///d:/pethuraj/townsquare/app.json)
> Additive — **keep** the existing `icon`, `ios`, `android`, `plugins`, `extra.eas`, and `splash` keys; only add `version`/`updates`/`runtimeVersion`. Note the interaction: `eas.json`'s `appVersionSource: "remote"` governs the auto-incremented **build number** (iOS `buildNumber` / Android `versionCode`), while the marketing **`version`** and **`runtimeVersion`** come from `app.json`.
```json
{
  "expo": {
    "name": "Townsquare",
    "slug": "townsquare",
    "version": "1.1.0",
    "updates": {
      "url": "https://u.expo.dev/a7a9ee1a-b17f-4d47-ac95-85f27d92a453"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

#### 3. Update [eas.json](file:///d:/pethuraj/townsquare/eas.json)
Add channel mappings for production and preview builds:
```json
{
  "cli": {
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  }
}
```

---

## 4. Post-v1.1 OTA Workflow

Once the **v1.1.0** binary is compiled and approved on the Apple App Store and Google Play Store:

```bash
# Push instant bug fixes, Tamil sayings additions, or UI updates directly to all players:
eas update --channel production --message "Update Tamil sayings and UI polish"
```

* **Instant Delivery**: Users receive updates immediately upon next app launch.
* **No App Store Review Required**: Permitted for interpreted (JS/UI) updates that don't change the app's primary purpose — see **App Store Review Guideline 2.5.2** and **Apple Developer Program License Agreement §3.3.2**.
* **100% Offline Maintained**: Updates are cached locally in SQLite by `expo-updates`, ensuring the app stays 100% offline-capable.

> **⚠️ Runtime-version rule (don't break your own OTA):** with `runtimeVersion.policy: "appVersion"`, an OTA update only reaches builds whose `version` matches. For OTA-only (JS/UI) patches, **keep `version` at `1.1.0` and just `eas update`** — bumping `version` creates a new runtime that existing installs won't match, silently cutting them off. Only bump `version` when you're shipping a **native** change that needs a new store build (new permission/SDK/native module).

---

## 5. Verification & Test Plan

1. **Native Jest Suite**:
   * Update `__tests__/RoleTable.test.ts` (`outlawCountFor(3/4/5)` now = 1; remove `effectiveMinRoleHolders`/undersized-dev cases) and any `"Need 6-16"`/6-floor assertions in `__tests__/dispatch.test.ts` / `flows.test.ts`.
   * **Add reducer cases for the two new actions**: `PLAYER_STATUS_RESTORED` (revives DECEASED/ELIMINATED → ACTIVE; clears matching `lastElimination`) and `NIGHT_ACTION_CLEARED` (clear-then-relog a night action) — mirroring the web tests.
   * Run `npm test` (verify all tests pass).
2. **TypeScript Validation**:
   * Run `npx tsc --noEmit` (0 errors).
3. **Interop preserved (wire untouched)**:
   * v1.1 changes only UI/reducer/local logic — **no `QRCodec`/wire changes** — so web↔native interop is preserved by construction.
   * Confirm native crypto is unchanged: `__tests__/QRCodec.test.ts` green. And that the web core is unchanged: `node townsquare-web/tests/interop.test.mjs` (**16/16 PASS**).
4. **EAS Production Build**:
   ```bash
   eas build --platform all --profile production
   ```
5. **Store Submissions**:
   * Submit to Apple App Store Connect & Google Play Console for v1.1.0 approval.

---

## 6. Note: the two-codebase tradeoff (not a blocker)

This plan **hand-ports** features that already exist in `townsquare-web/core.js` (reducer actions, role table, night logic) into native `src/`. That's the accepted cost of the "keep native + `eas update`" strategy — and it's a valid choice. But it locks in ongoing drift: every future gameplay change is implemented **twice** and guarded by the interop test.

If that duplication ever stings, the pivot is to **share the platform-agnostic core** (`QRCodec`, reducer, FSM, `RoleTable`, fairness, narration) as one module imported by both `src/` and `townsquare-web/`, with the SHA-256 digest injected (`expo-crypto` native / Web Crypto web), leaving only the UI layer per-platform. v1.1 (when you're already in these files) is the natural moment to do it — but it's a larger refactor and out of scope here. Flagged for a future decision.
