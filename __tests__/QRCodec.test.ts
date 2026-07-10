import { QRCodec } from '../src/services/QRCodec';
import type {
  JoinSessionPayload,
  JoinAckPayload,
  RolesPayload,
  SyncPayload,
  BallotPayload,
  ModeratorHandoffPayload
} from '../src/types';

// Mock expo-crypto using Node's standard crypto module lazily inside the factory
jest.mock('expo-crypto', () => {
  const crypto = require('crypto');
  return {
    digestStringAsync: jest.fn((algorithm, data) => {
      return Promise.resolve(
        crypto.createHash('sha256').update(data).digest('hex')
      );
    }),
    getRandomBytes: jest.fn((size) => {
      return new Uint8Array(crypto.randomBytes(size));
    }),
    CryptoDigestAlgorithm: {
      SHA256: 'SHA-256',
    },
    CryptoEncoding: {
      HEX: 'hex',
    },
  };
});

describe('QRCodec v3 formats round-trip', () => {
  const sid = 'abc12345';
  const roundNumber = 1;

  it('round-trips join payload', () => {
    const payload: JoinSessionPayload = {
      kind: 'join', sid, roundNumber, moderatorName: 'Priya',
    };
    expect(QRCodec.decode(QRCodec.encode(payload))).toEqual(payload);
  });

  it('round-trips joinAck payload', () => {
    const payload: JoinAckPayload = {
      kind: 'joinAck', sid, name: 'Bob',
    };
    expect(QRCodec.decode(QRCodec.encode(payload))).toEqual(payload);
  });

  it('round-trips roles payload', () => {
    const payload: RolesPayload = {
      kind: 'roles', sid, roundNumber, encryptedRoles: { Bob: 'base64ciphertext...', Alice: 'othercipher...' },
    };
    expect(QRCodec.decode(QRCodec.encode(payload))).toEqual(payload);
  });

  it('round-trips sync payload', () => {
    const payload: SyncPayload = {
      kind: 'sync', sid, roundNumber, phase: 'DAY_VOTE', statusCodes: [['Bob', 'A'], ['Alice', 'D']],
    };
    expect(QRCodec.decode(QRCodec.encode(payload))).toEqual(payload);
  });

  it('round-trips ballot payload', () => {
    const payload: BallotPayload = {
      kind: 'ballot', sid, roundNumber, voter: 'Bob', target: 'Alice',
    };
    expect(QRCodec.decode(QRCodec.encode(payload))).toEqual(payload);
  });

  it('round-trips handoff payload', () => {
    const payload: ModeratorHandoffPayload = {
      kind: 'handoff', sid, roundNumber: 2,
      roster: [{ name: 'Bob', role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false }],
      rotationTally: { Bob: { moderator: 0, outlaw: 1, detective: 0, doctor: 0, town: 0 } },
    };
    const decoded = QRCodec.decode(QRCodec.encode({
      ...payload,
      roster: [{ name: 'Bob', role: 'OUTLAW', status: 'DECEASED', isModerator: true }],
    }));
    expect(decoded).toEqual(payload); // normalized back by design on decode
  });

  it('rejects invalid inputs and returns null', () => {
    expect(QRCodec.decode('invalid_string')).toBeNull();
    expect(QRCodec.decode('{"hello":"world"}')).toBeNull();
    expect(QRCodec.decode(JSON.stringify({ k: 'j', s: 'x' }))).toBeNull(); // missing round/name
    expect(QRCodec.decode(JSON.stringify({ k: 'a', s: 'x' }))).toBeNull(); // joinAck missing name
    expect(QRCodec.decode(JSON.stringify({ k: 'unknown' }))).toBeNull();
  });
});

describe('QRCodec role encryption and decryption', () => {
  const name = 'Bob'; // v3.2: the key IS the player's public name, not a secret token
  const sid = 'abc12345';
  const roundNumber = 1;

  it('encrypts and decrypts a role correctly (round-trip)', async () => {
    const plaintext = 'O|Alice,Dave';
    const ciphertext = await QRCodec.encryptRole(plaintext, name, sid, roundNumber);
    expect(typeof ciphertext).toBe('string');
    expect(ciphertext).not.toEqual(plaintext);

    const decrypted = await QRCodec.decryptRole(ciphertext, name, sid, roundNumber);
    expect(decrypted).toEqual(plaintext);
  });

  it('decrypts with correct Unicode/Tamil character support', async () => {
    const plaintext = 'T|வீரியம்';
    const ciphertext = await QRCodec.encryptRole(plaintext, name, sid, roundNumber);
    const decrypted = await QRCodec.decryptRole(ciphertext, name, sid, roundNumber);
    expect(decrypted).toEqual(plaintext);
  });

  it('produces different ciphertexts for different rounds', async () => {
    const plaintext = 'T';
    const cipher1 = await QRCodec.encryptRole(plaintext, name, sid, 1);
    const cipher2 = await QRCodec.encryptRole(plaintext, name, sid, 2);
    expect(cipher1).not.toEqual(cipher2);
  });

  it('different players (keys) get different ciphertexts for the same role', async () => {
    const a = await QRCodec.encryptRole('T', 'Alice', sid, 1);
    const b = await QRCodec.encryptRole('T', 'Bob', sid, 1);
    expect(a).not.toEqual(b);
  });

  it('round-trips a role string longer than one 32-byte keystream block', async () => {
    // An Outlaw in a big game can carry many long companion names — well past 32 bytes.
    const plaintext = 'O|' + Array.from({ length: 12 }, (_, i) => `Companion${i}`).join(',');
    expect(plaintext.length).toBeGreaterThan(32);
    const ciphertext = await QRCodec.encryptRole(plaintext, name, sid, roundNumber);
    const decrypted = await QRCodec.decryptRole(ciphertext, name, sid, roundNumber);
    expect(decrypted).toEqual(plaintext);
  });

  it('extends the keystream without repeating, keeping block 0 backward-compatible', async () => {
    const ks = await QRCodec.generateKeystream(name, sid, roundNumber, 64);
    expect(ks).toHaveLength(64);
    // A repeating 32-byte key would make the two halves identical; CTR extension must not.
    expect(ks.slice(32, 64)).not.toEqual(ks.slice(0, 32));
    // Block 0 is still the bare-input digest, so ciphertexts ≤ 32 bytes are unchanged.
    const singleBlock = await QRCodec.generateKeystream(name, sid, roundNumber, 32);
    expect(ks.slice(0, 32)).toEqual(singleBlock);
  });
});

describe('handoff carries player names (regression: round 2+ role assignment)', () => {
  const sid = 'abc12345';

  it('round-trips player names through the handoff wire', () => {
    const payload: ModeratorHandoffPayload = {
      kind: 'handoff', sid, roundNumber: 2,
      roster: [
        { name: 'Bob', role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false },
        { name: 'Alice', role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false },
      ],
      rotationTally: {},
    };
    const decoded = QRCodec.decode(QRCodec.encode(payload));
    expect(decoded?.kind).toBe('handoff');
    if (decoded?.kind !== 'handoff') return;
    expect(decoded.roster.map(p => p.name)).toEqual(['Bob', 'Alice']);
  });

  it('a player can decrypt a role encrypted by the post-handoff moderator (the broken sequence, v3.2)', async () => {
    // Round 1 moderator hands off; Bob's NAME travels the wire (the key).
    const handoff: ModeratorHandoffPayload = {
      kind: 'handoff', sid, roundNumber: 2,
      roster: [{ name: 'Bob', role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false }],
      rotationTally: {},
    };
    const received = QRCodec.decode(QRCodec.encode(handoff));
    expect(received?.kind).toBe('handoff');
    if (received?.kind !== 'handoff') return;

    // New moderator encrypts round-2 roles keyed on the wire-carried name...
    const wireName = received.roster[0].name;
    const ciphertext = await QRCodec.encryptRole('O|Alice', wireName, sid, received.roundNumber);

    // ...and Bob decrypts with his own name.
    const decrypted = await QRCodec.decryptRole(ciphertext, 'Bob', sid, received.roundNumber);
    expect(decrypted).toBe('O|Alice');
  });

  it('rejects a handoff whose ro contains a non-string name', () => {
    expect(QRCodec.decode(JSON.stringify({ k: 'h', s: sid, r: 2, ro: [123], t: {} }))).toBeNull();
  });
});

describe('QRCodec capacity guard', () => {
  it('a 16-player handoff stays safely under 2KB (spec §6)', () => {
    const baseHandoff: ModeratorHandoffPayload = {
      kind: 'handoff', sid: 'abc12345', roundNumber: 2, roster: [], rotationTally: {},
    };
    const big: ModeratorHandoffPayload = {
      ...baseHandoff,
      roster: Array.from({ length: 16 }, (_, i) => ({
        name: `Playername${i + 1}`,
        role: 'UNASSIGNED' as const, status: 'ACTIVE' as const, isModerator: false,
      })),
      rotationTally: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [
        `Playername${i + 1}`, { moderator: 2, outlaw: 3, detective: 1, doctor: 1, town: 4 },
      ])),
    };
    expect(QRCodec.encode(big).length).toBeLessThan(2048);
  });
});
