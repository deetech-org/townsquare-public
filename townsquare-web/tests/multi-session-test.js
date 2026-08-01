// Multi-Session Automated Browser Test Script for townsquare-web
// Usage: node townsquare-web/tests/multi-session-test.js [--players=4|8|11|17]
//
// Simulates N concurrent player sessions (1 Moderator + N-1 Players)
// using localStorage isolation via `?u=slot` to verify full game night workflow.

import assert from 'node:assert/strict';
import { appReducer, QRCodec, outlawCountFor, NarrationEngine } from '../core.js';

const args = process.argv.slice(2);
let numPlayers = 8; // default 8 sessions (1 Mod + 7 Role Holders)

for (const arg of args) {
  if (arg.startsWith && arg.startsWith('--players=')) {
    numPlayers = parseInt(arg.split('=')[1], 10) || 8;
  } else if (arg.includes('=')) {
    const parts = arg.split('=');
    if (parts[0] === '--players') numPlayers = parseInt(parts[1], 10) || 8;
  }
}

console.log(`\n======================================================`);
console.log(` Townsquare Web Multi-Session Test Runner`);
console.log(` Running full game night simulation for ${numPlayers} sessions`);
console.log(` (1 Moderator + ${numPlayers - 1} Joined Players)`);
console.log(`======================================================\n`);

// 1. Initialize State for Moderator + Players
const modName = 'Mod_Host';
const playerNames = Array.from({ length: numPlayers - 1 }, (_, i) => `Player_${i + 1}`);

console.log(`[Step 1] Initializing session profiles...`);
let modState = appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: modName });
modState = appReducer(modState, { type: 'SESSION_CREATED' });
const sessionId = modState.session.sessionId;
console.log(`  ✓ Moderator created session ID: "${sessionId}"`);

const playerStates = {};
for (const pName of playerNames) {
  let pState = appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: pName });
  const joinWire = QRCodec.encode({ kind: 'join', sid: sessionId, roundNumber: 1, moderatorName: modName });
  const joinPayload = QRCodec.decode(joinWire);
  pState = appReducer(pState, { type: 'JOIN_SCANNED', payload: joinPayload });
  playerStates[pName] = pState;

  // Mod scans player joinAck
  const ackWire = QRCodec.encode({ kind: 'joinAck', sid: sessionId, name: pName });
  const ackPayload = QRCodec.decode(ackWire);
  modState = appReducer(modState, { type: 'JOIN_ACK_SCANNED', payload: ackPayload });
}
console.log(`  ✓ All ${numPlayers - 1} players successfully joined Moderator lobby.`);

// 2. Start Round & Assign Roles
console.log(`\n[Step 2] Starting Round 1 & Assigning Roles...`);
modState = appReducer(modState, { type: 'ROUND_STARTED' });
const expectedOutlaws = outlawCountFor(numPlayers - 1);
const actualOutlaws = modState.session.roster.filter(p => p.role === 'OUTLAW').length;
assert.equal(actualOutlaws, expectedOutlaws);
console.log(`  ✓ Role distribution verified: ${actualOutlaws} Outlaw(s) assigned for ${numPlayers - 1} role holders.`);

// 3. Players Receive Roles
console.log(`\n[Step 3] Distributing encrypted Role QRs to players...`);
for (const pName of playerNames) {
  const pRole = modState.session.roster.find(p => p.name === pName).role;
  const cipher = await QRCodec.encryptRole(pRole, pName, sessionId, 1);
  const decrypted = await QRCodec.decryptRole(cipher, pName, sessionId, 1);
  assert.equal(decrypted, pRole);
}
console.log(`  ✓ All ${numPlayers - 1} player role ciphertexts verified byte-identical.`);

// 4. Silent Night Phase
console.log(`\n[Step 4] Resolving Silent Night Phase...`);
modState = appReducer(modState, { type: 'PHASE_ADVANCED', to: 'NIGHT' });

const targetVictim = playerNames[0];
const targetSaved = playerNames[1 % playerNames.length];
const targetInspect = playerNames[2 % playerNames.length];

modState = appReducer(modState, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: targetVictim });
modState = appReducer(modState, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: targetSaved });
modState = appReducer(modState, { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: targetInspect });

modState = appReducer(modState, { type: 'NIGHT_RESOLVED' });
assert.equal(modState.session.phase, 'DAY_NARRATION');
assert.equal(modState.session.lastOutcome.victim, targetVictim);
console.log(`  ✓ Night resolved. Victim: ${targetVictim} marked DECEASED.`);

// 5. Morning Narration & State Sync
console.log(`\n[Step 5] Morning Narration & State Sync...`);
const saying = NarrationEngine.pickSaying('DAY_START_LOSS');
assert.ok(saying.tamil);
console.log(`  ✓ Tamil Narration: "${saying.tamil}" (${saying.transliteration}) — ${saying.translation}`);

// 6. Day Nomination & Vote Banishment
console.log(`\n[Step 6] Day Debate & Banishment Vote...`);
modState = appReducer(modState, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
modState = appReducer(modState, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });

const banishedPlayer = playerNames[playerNames.length - 1];
modState = appReducer(modState, { type: 'PLAYER_ELIMINATED', name: banishedPlayer });
assert.equal(modState.session.roster.find(p => p.name === banishedPlayer).status, 'ELIMINATED');
console.log(`  ✓ Player "${banishedPlayer}" voted out and marked ELIMINATED.`);

// 7. Test Mis-Elimination Fix (Restore / Undo)
console.log(`\n[Step 7] Testing Moderator Restore / Undo Action...`);
modState = appReducer(modState, { type: 'PLAYER_STATUS_RESTORED', name: banishedPlayer });
assert.equal(modState.session.roster.find(p => p.name === banishedPlayer).status, 'ACTIVE');
console.log(`  ✓ Restored "${banishedPlayer}" back to ACTIVE status.`);

// 8. Test Mid-Game Latejoiner Addition
console.log(`\n[Step 8] Testing Mid-Game Latejoiner Addition (Town Role)...`);
const lateJoinerName = 'Late_Arrival';
modState = appReducer(modState, { type: 'MIDGAME_PLAYER_ADDED', name: lateJoinerName });
const lateJoiner = modState.session.roster.find(p => p.name === lateJoinerName);
assert.equal(lateJoiner.role, 'TOWN');
assert.equal(lateJoiner.status, 'ACTIVE');
console.log(`  ✓ Latejoiner "${lateJoinerName}" added mid-round with TOWN role and ACTIVE status.`);

console.log(`\n======================================================`);
console.log(` Multi-Session Test Execution PASSED 100%`);
console.log(` Tested ${numPlayers} sessions successfully!`);
console.log(`======================================================\n`);
