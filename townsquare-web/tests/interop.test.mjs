// Interop test — proves townsquare-web/core.js is byte-identical to the native app.
// Run: node tests/interop.test.mjs   (Node 18+; uses global Web Crypto + TextEncoder)
//
// The vectors below are REAL ciphertexts captured from a native device's Metro log
// (sid "cs9pii12", round 2). If core.js reproduces them exactly, a browser and a
// native phone share the same keystream and can play in the same room.

import assert from 'node:assert/strict';
import { QRCodec } from '../core.js';

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

console.log(`\n${fail === 0 ? 'ALL PASS' : 'SOME FAILED'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
