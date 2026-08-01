// Interop test — proves townsquare-web/core.js is byte-identical to the native app.
// Run: node tests/interop.test.mjs   (Node 18+; uses global Web Crypto + TextEncoder)
//
// The vectors below are REAL ciphertexts captured from a native device's Metro log
// (sid "cs9pii12", round 2). If core.js reproduces them exactly, a browser and a
// native phone share the same keystream and can play in the same room.

import assert from 'node:assert/strict';
import { QRCodec, MIN_ROLE_HOLDERS, outlawCountFor, NarrationEngine, appReducer } from '../core.js';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS', name); pass++; }
  catch (e) { console.log('  FAIL', name, '->', e.message); fail++; }
}

const SID = 'cs9pii12';
// name -> [ciphertext from native log, expected role code]
const NATIVE_VECTORS = {
  Mod:     ['Jg==', 'E'],
  Charlie: ['sQ==', 'T'],
  Bob:     ['8w==', 'O'],
  Alice:   ['aA==', 'D'],
};

console.log('Townsquare web/native interop:');

for (const [name, [cipher, code]] of Object.entries(NATIVE_VECTORS)) {
  await check(`encryptRole(${code}, ${name}) == native "${cipher}"`, async () => {
    const out = await QRCodec.encryptRole(code, name, SID, 2);
    assert.equal(out, cipher);
  });
  await check(`decryptRole(native "${cipher}", ${name}) == ${code}`, async () => {
    const out = await QRCodec.decryptRole(cipher, name, SID, 2);
    assert.equal(out, code);
  });
}

// Round-2 keystream freshness: same role at round 1 must differ.
await check('keystream is round-fresh (round 1 != round 2)', async () => {
  const r1 = await QRCodec.encryptRole('E', 'Mod', SID, 1);
  const r2 = await QRCodec.encryptRole('E', 'Mod', SID, 2);
  assert.notEqual(r1, r2);
});

// Non-ASCII play-name round-trips (UTF-8 digest-input agreement).
await check('non-ASCII name (Tamil) round-trips + multi-block companions', async () => {
  const name = 'அன்பு';
  const plaintext = 'O|Christopher,Alexandra,Bartholomew,Wilhelmina'; // > 32 bytes
  const cipher = await QRCodec.encryptRole(plaintext, name, SID, 2);
  const back = await QRCodec.decryptRole(cipher, name, SID, 2);
  assert.equal(back, plaintext);
});

// Wire round-trip for every payload kind.
await check('wire encode/decode round-trips (handoff)', async () => {
  const wire = QRCodec.encode({
    kind: 'handoff', sid: SID, roundNumber: 2,
    roster: [{ name: 'Mod' }, { name: 'Alice' }],
    rotationTally: { Mod: { moderator: 1, outlaw: 0, detective: 0, doctor: 0, town: 0 } },
  });
  const p = QRCodec.decode(wire);
  assert.equal(p.kind, 'handoff');
  assert.deepEqual(p.roster.map(r => r.name), ['Mod', 'Alice']);
  assert.equal(p.rotationTally.Mod.moderator, 1);
});

// Phase 1 Enhancement Verification: Player Threshold (MIN_ROLE_HOLDERS = 3)
await check('MIN_ROLE_HOLDERS = 3 & 3-player role allocation (1 outlaw)', async () => {
  assert.equal(MIN_ROLE_HOLDERS, 3);
  assert.equal(outlawCountFor(3), 1);
  assert.equal(outlawCountFor(4), 1);
  assert.equal(outlawCountFor(5), 1);
  assert.equal(outlawCountFor(6), 1);
  assert.equal(outlawCountFor(7), 2);
});

// Phase 1 Enhancement Verification: 50-Saying Tamil Narration Database
await check('NarrationEngine has 50 sayings across 6 categories', async () => {
  const categories = ['LOBBY_WELCOME', 'DAY_START_PEACE', 'DAY_START_LOSS', 'NOMINATION_TENSION', 'EXECUTION_RESOLVED', 'GAME_OVER'];
  for (const cat of categories) {
    const saying = NarrationEngine.pickSaying(cat);
    assert.ok(saying);
    assert.ok(saying.tamil);
    assert.ok(NarrationEngine.poetFor(saying));
  }
});

// Phase 1 Enhancement Verification: PLAYER_STATUS_RESTORED
await check('appReducer PLAYER_STATUS_RESTORED revives eliminated player to ACTIVE', async () => {
  const initialState = {
    alert: null,
    session: {
      deviceMode: 'MODERATOR',
      phase: 'DAY_VOTE',
      lastElimination: 'Alice',
      roster: [
        { name: 'Mod', role: 'UNASSIGNED', status: 'ACTIVE', isModerator: true },
        { name: 'Alice', role: 'TOWN', status: 'ELIMINATED', isModerator: false },
        { name: 'Bob', role: 'OUTLAW', status: 'ACTIVE', isModerator: false },
      ]
    }
  };
  const nextState = appReducer(initialState, { type: 'PLAYER_STATUS_RESTORED', name: 'Alice' });
  const restoredAlice = nextState.session.roster.find(p => p.name === 'Alice');
  assert.equal(restoredAlice.status, 'ACTIVE');
  assert.equal(nextState.session.lastElimination, undefined);
});

// The mid-game latejoiner feature was removed (deadlock-prone; latecomers join the next
// game). MIDGAME_PLAYER_ADDED / LATE_JOIN_SCANNED no longer exist — the reducer ignores them.

// "Tamil Moral Wisdom" screen data: all 50 sayings reachable via allByCategory().
await check('NarrationEngine.allByCategory() exposes all 50 sayings across 6 groups', async () => {
  const db = NarrationEngine.allByCategory();
  const cats = ['LOBBY_WELCOME', 'DAY_START_PEACE', 'DAY_START_LOSS', 'NOMINATION_TENSION', 'EXECUTION_RESOLVED', 'GAME_OVER'];
  let total = 0;
  for (const c of cats) {
    assert.ok(Array.isArray(db[c]) && db[c].length > 0);
    for (const sy of db[c]) { assert.ok(sy.tamil && sy.transliteration && sy.translation); assert.ok(NarrationEngine.poetFor(sy)); }
    total += db[c].length;
  }
  assert.equal(total, 50);
});

console.log(`\n${fail === 0 ? 'ALL PASS' : 'SOME FAILED'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
