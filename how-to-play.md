# How to Play Townsquare

Townsquare is an offline, serverless social deduction party game. Unlike traditional games, Townsquare requires **no internet or cellular connection** during gameplay. The game's state is synchronized peer-to-peer using **QR code scans** and **silent physical gestures** within the room.

> 📱 The Player Guide below is also available **inside the app** — tap the gold **?** button on any screen.

This guide is split into two sections:
1. **[Player Guide](#-player-guide-in-person-gameplay):** Instructions for groups playing together in a room with physical phones.
2. **[Developer Testing Guide](#-developer-testing-guide-4-avd-simulation):** Instructions for developers simulating a full 4-device game loop on a single Windows PC using Android Virtual Devices (AVDs) and clipboard sharing.

---

## 📱 Player Guide (In-Person Gameplay)

### Game Objective
* **Outlaws:** Eliminate the Townspeople until the number of Outlaws equals or exceeds the number of remaining Townspeople.
* **Townspeople (Detective, Doctor, Town):** Identify and eliminate all Outlaws through nominations and voting.

---

### Step 1: The Lobby & Join Handshake
To start, one player must act as the **Moderator** (who runs the game and does not receive a role).

> **Room minimum: 7 people** — 6 playing players plus the Moderator. Maximum: 16 players + Moderator. Don't worry about who moderates first: the Moderator role rotates fairly between rounds (Step 6), so everyone gets to play.

```
┌─────────────────┐             ┌─────────────────┐
│ Moderator Phone │             │  Player Phone   │
├─────────────────┤             ├─────────────────┤
│ Displays Join   │ ──(Scan)──> │ Scans Join QR   │
│ QR Code         │             │                 │
│                 │             │ Displays        │
│ Roster updates  │ <──(Scan)── │ joinAck QR      │
│ with name       │             │                 │
└─────────────────┘             └─────────────────┘
```

1. **Moderator:** Tap **Create Game Night**. Your screen will display the session **Join QR**.
2. **Players:** Tap **Join a Game** and scan the Moderator's Join QR. 
3. **Players:** Once scanned, your phone will display your personal **`joinAck` QR** (sharing just your name — the only personal detail the app ever holds).
4. **Moderator:** Tap **Scan Player's joinAck QR** and scan each player's screen one by one. The roster will build itself instantly on your dashboard.
5. **Moderator:** Once at least 6 players have joined, tap **Start Round**.

---

### Step 2: Role Assignment
Once the round starts, the Moderator's console calculates the balanced role distribution.

1. **Moderator:** Your screen will display a single **Roles QR** containing the encrypted role registry.
2. **Players:** Open the scanner on your device and scan the Moderator's Roles QR.
3. **Decrypting Roles:** Your device reveals only *your* assigned role (obfuscated per-name, §6.3 of the spec). All other entries look like noise.
4. **Hold to Reveal:** Your screen will show a blank card. **Press and hold the card** with your thumb to reveal your role. Lift your thumb to instantly hide it again to prevent shoulder-surfing.
5. **Outlaw Companions:** If you are an Outlaw, your card reveal will also list the names of your fellow Outlaws in the room.

---

### Step 3: The Silent Night
During the night, no technology is exchanged. The Moderator runs the classic eyes-closed ritual in the room.

1. **Moderator:** Announce: *"Everyone, close your eyes. Night falls."*
2. **Moderator:** Log actions on your **Silent Night Console** as you call each role:
   * *"Outlaws, open your eyes. Who do you kill?"* -> Outlaws silently point to a target. The Moderator taps the target name under **1. Outlaws (Kill)**.
   * *"Doctor, open your eyes. Who do you save?"* -> Doctor silently points. The Moderator taps the target under **2. Doctor (Save)**.
   * *"Detective, open your eyes. Who do you inspect?"* -> Detective silently points. The Moderator taps the target under **3. Detective (Inspect)**. The app instantly shows the verdict (`GUILTY` or `INNOCENT`) to the Moderator. The Moderator silently nods or shakes their head to the Detective.
3. **Moderator:** Tap **Resolve Night**.

---

### Step 4: Morning Narration & State Sync
1. **Moderator:** Announce: *"Morning has broken."* Your screen shows a classical Tamil narration card — a saying from Avvaiyar's Aathichoodi/Konrai Vendhan or Bharathiyar's Puthia Aathichoodi, chosen to fit the night's outcome. Read the **"Read out loud"** script at the bottom of the card to the room; it names the victim if someone died, or celebrates the Doctor's save if the night was peaceful. Tap **Show Translation** if you want to read the English meaning too.
2. **Moderator:** Your screen will display the **Sync QR**.
3. **Players:** Tap **Scan Sync QR** and scan the Moderator's screen. This updates your device with the latest alive/dead status lists. Deceased players' screens will turn crimson, and they must remain silent for the rest of the round.

---

### Step 5: Day Nominations & Secret Ballots
1. **Discussion:** Players verbally discuss suspects in the room. If a player is nominated, the town moves to a vote.
2. **Players (Alive):** your morning Sync scan already unlocked voting — one scan covers the whole day. Select your target on the target picker, which will generate a secret **`ballot` QR** on your screen. Your choice is never displayed — it lives only inside the code (use **Hold to check your choice** to privately confirm before presenting).
3. **Moderator:** Tap **Scan Player Ballot QR** and scan each alive player's screen. The console will compile and display a live vote tally on your dashboard.
4. **Moderator:** Select the name of the player who received the most votes to banish them.
5. **Looping:** If the game hasn't ended, tap **Night falls again** and repeat Step 3. If a win condition is met, tap **End the round**.

---

### Step 6: Round Over — Handoff & the Next Round
When a round ends, the Moderator duty **rotates** so everyone gets to actually play. The app tracks who has held which role and who has moderated, and biases the next assignments toward whoever has had the fewest turns.

1. **Moderator:** Your screen shows the closing Tamil narration card and a **Suggested next Moderator** — the player who has moderated the fewest times tonight. (It's a suggestion; the room can pick anyone.)
2. **Moderator:** Tap **Hand off Moderator (show QR)**. Your screen displays the **Handoff QR**, carrying the full roster and the fairness history to the next round.
3. **Incoming Moderator:** On your player screen, tap **"I'm the next Moderator — scan handoff QR"** and scan the outgoing Moderator's screen. Your device becomes the Moderator console for the next round; the round counter advances automatically.
4. **Everyone else**: the new Moderator taps **Start Round** and shows a fresh Roles QR. Tap **Scan Roles QR (new round)** on your screen to receive your new role — roles are re-dealt with the fairness bias, so new players get the special roles before anyone repeats them.
5. **Outgoing Moderator**: you play this round! On your round-over screen, tap **"Handed off — join the next round as a player"** and scan the same Roles QR — your device becomes a player seat with your new role.

> ⚠️ **New Game Night** (on the Moderator's round-over screen) **permanently wipes the whole session** — roster, fairness history, everything. Use it only when tonight's group is done playing, not between rounds.

---

### Troubleshooting
- **A QR won't scan**: turn the displaying phone's screen brightness up, hold the phones 15–30 cm apart, and avoid overhead glare. The Roles QR is the densest — it may need a second of steady aim.
- **"Camera access is needed"**: the app uses the camera only for these QR scans. Grant permission in your phone's Settings if you declined the first prompt.
- **"Your name is not registered in this round's role assignment"**: you weren't in the roster when the round started — ask the Moderator to end the round and re-add you via the join handshake.
- **"Failed to decrypt your role"**: your name doesn't match the roster the Moderator dealt roles to (e.g. you rejoined under a different name). Rejoin with the same name, then ask the Moderator to restart the round.
- **Someone left the game night**: they tap **Leave game night** on their phone, and the Moderator taps **remove** next to their name (in the lobby, or on the round-over screen before the handoff) so no role is dealt to an empty chair. If they left mid-round, finish the round first — or vote them out. They can rejoin any time via the join QR.
- **A player can't scan at all** (broken camera, cracked screen): the Moderator's console shows every role — they can quietly tell or show that player their role, exactly as a physical game night would handle it. The app itself never needs a network for anything.

---

## 💻 Developer Testing Guide (4 AVD Simulation)

You can simulate and test this entire multi-device game loop on a single Windows PC using 4 Android Virtual Devices (AVDs) in Android Studio.

### Prerequisites & Setup
1. Open **Android Studio** -> **Virtual Device Manager** and launch 4 emulators (AVDs).
2. Ensure you are running a **Development Build** (`__DEV__ = true`). This triggers two critical overrides:
   * **3-Player Dev Override:** The minimum player requirement is lowered from 6 to 3 players (1 Moderator + 3 Players).
   * **Dev Copy/Paste Payload Path:** Every displayed QR has a **"DEV: show payload"** toggle revealing its wire string, and every scanner screen has a paste box — bypassing the need for cameras entirely.
3. **How the copy actually works**: tap the toggle to *reveal* the payload text, then **long-press the text → Copy** (a plain tap does not copy). Recent Android emulators share the clipboard with Windows automatically — if a paste lands empty, check the emulator's clipboard-sharing setting.

---

### Step-by-Step Simulation Loop

#### 1. Initialize the 4 Devices
* **Device 1 (Moderator):** Create profile (name: "Mod"), then tap **Create Game Night**. The Join QR will display.
* **Device 2 (Player 1):** Create profile (name: "Alice").
* **Device 3 (Player 2):** Create profile (name: "Bob").
* **Device 4 (Player 3):** Create profile (name: "Charlie").

#### 2. Lobby Join Handshake
1. On **Device 1 (Moderator)**, tap **"DEV: show payload"** below the Join QR, then **long-press the revealed text → Copy**.
2. On **Device 2 (Alice)**, tap **Join a Game (scan QR)**. Long-press the scanner's paste box to paste, then tap **Use pasted payload**.
3. **Device 2 (Alice)** will now display its `joinAck` QR. Reveal and long-press-copy the payload below it.
4. On **Device 1 (Moderator)**, tap **Scan Player's joinAck QR**, paste Alice's payload into the box, and tap **Use pasted payload**. Alice is added to the roster!
5. **Repeat** this copy/paste process for **Device 3 (Bob)** and **Device 4 (Charlie)** until all three are in the Moderator's roster.
6. On **Device 1 (Moderator)**, tap **Start Round**.

#### 3. Assign Roles
1. On **Device 1 (Moderator)**, reveal and long-press-copy the payload from the Roles QR.
2. On **Device 2, 3, and 4**, tap **Scan Roles QR**, paste the payload, and tap **Use pasted payload**.
3. Each player device will decrypt its role! Long-press the card on their screen to reveal who is the Outlaw, Detective, and Doctor.

#### 4. Silent Night Log
1. On **Device 1 (Moderator)**, tap targets for the Outlaw, Doctor, and Detective in the three target-picker lists.
2. Tap **Resolve Night**.

#### 5. Day Sync
1. On **Device 1 (Moderator)**, reveal and long-press-copy the Sync QR payload.
2. On **Device 2, 3, and 4**, tap **Scan Sync QR**, paste the payload, and tap **Use pasted payload**. Their phase will advance to `DAY_NARRATION` and show who died.
3. On **Device 1 (Moderator)**, tap **Open nominations**, then tap **Move to the vote**.

#### 6. Secret Ballot Vote Tally
1. On **Device 1 (Moderator)**, copy the Sync QR payload again (long-press) to sync the voting phase to the players.
2. On **Device 2, 3, and 4**, tap **Scan Sync QR**, paste, and tap **Use pasted payload**. The target pickers will appear on their screens.
3. On **Device 2 (Alice)**, select a suspect. Reveal and long-press-copy the generated `ballot` QR payload.
4. On **Device 1 (Moderator)**, tap **Scan Player Ballot QR**, paste Alice's ballot, and tap **Use pasted payload**.
5. **Repeat** for Bob and Charlie. The Moderator dashboard will compile the live votes.
6. On **Device 1 (Moderator)**, select the banished player from the target picker.
7. End the round or loop back to night! To test the handoff (player-guide Step 6), copy the Handoff QR payload from Device 1 and paste it into a player device via **"I'm the next Moderator — scan handoff QR"** — that device becomes the Moderator for round 2, and roles must decrypt correctly after re-dealing (this exact sequence had a real bug once; see the regression tests).
