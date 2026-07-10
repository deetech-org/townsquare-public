/**
 * Flow tests: drive the reducer through COMPLETE sequences the way the UI does,
 * rather than teleporting state into position. Two bugs escaped the unit suite
 * by hiding between correctly-tested units:
 *  - work item 18: handoff wire dropped player identity (v3 tokens, now names);
 *    handoff and encryption were each tested alone, never as a sequence;
 *  - 4-AVD run-01 TC-6: night resolution unreachable because no UI path advanced
 *    the v2 night sub-phases (the reducer guard was only ever tested from a
 *    hand-set phase).
 * These flows replay those exact arcs.
 */
import { AppState, appReducer, AppAction } from '../src/state/dispatch';
import { QRCodec } from '../src/services/QRCodec';
import type { JoinAckPayload, SessionState } from '../src/types';

jest.mock('expo-crypto', () => {
  const crypto = require('crypto');
  return {
    digestStringAsync: jest.fn((_alg: string, data: string) =>
      Promise.resolve(crypto.createHash('sha256').update(data).digest('hex'))
    ),
    getRandomBytes: jest.fn((size: number) => new Uint8Array(crypto.randomBytes(size))),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
  };
});

const run = (start: AppState, actions: AppAction[]): AppState =>
  actions.reduce((s, a) => appReducer(s, a), start);

const joinAck = (sid: string, name: string): JoinAckPayload => ({
  kind: 'joinAck', sid, name,
});

/** Lobby arc shared by both flows: profile -> create session -> 3 players join. */
function buildLobby(): AppState {
  let s = run({ session: null, alert: null }, [
    { type: 'PROFILE_CREATED', name: 'Mod' },
    { type: 'SESSION_CREATED' },
  ]);
  const sid = s.session!.sessionId;
  for (const name of ['Alice', 'Bob', 'Charlie'] as const) {
    s = appReducer(s, { type: 'JOIN_ACK_SCANNED', payload: joinAck(sid, name) });
  }
  expect(s.session?.roster).toHaveLength(4);
  return s;
}

describe('Flow: TC-6 replay — lobby to resolved night', () => {
  it('start round -> enter night -> log three actions -> resolve succeeds', () => {
    let s = buildLobby();

    s = appReducer(s, { type: 'ROUND_STARTED' });
    expect(s.session?.phase).toBe('ROLE_ASSIGNMENT');
    expect(s.alert).toBeNull();

    // The UI's single button: Enter Night Phase.
    s = appReducer(s, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    expect(s.session?.phase).toBe('NIGHT');

    const holders = s.session!.roster!.filter(p => !p.isModerator);
    const outlaw = holders.find(p => p.role === 'OUTLAW')!;
    const doctor = holders.find(p => p.role === 'DOCTOR')!;
    const town = holders.find(p => p.name !== outlaw.name && p.name !== doctor.name)!;

    // The console's three pickers, in ritual order — kill the non-doctor, save someone else.
    s = run(s, [
      { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: town.name },
      { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: doctor.name },
      { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: outlaw.name },
    ]);
    expect(s.session?.pendingActions).toHaveLength(3);

    // The exact step that failed in 4-AVD run-01:
    s = appReducer(s, { type: 'NIGHT_RESOLVED' });
    expect(s.alert).toBeNull();
    expect(s.session?.phase).toBe('DAY_NARRATION');
    expect(s.session?.lastOutcome?.victim).toBe(town.name);
    expect(s.session?.lastOutcome?.investigation).toEqual({ target: outlaw.name, isOutlaw: true });
    expect(s.session?.roster?.find(p => p.name === town.name)?.status).toBe('DECEASED');
  });
});

describe('Flow: full round to handoff — the work-item-18 arc at reducer level', () => {
  it('vote, eliminate, end round, hand off through the real wire, start round 2', () => {
    let s = buildLobby();
    s = run(s, [
      { type: 'ROUND_STARTED' },
      { type: 'PHASE_ADVANCED', to: 'NIGHT' },
    ]);
    const sid = s.session!.sessionId;
    const holders = s.session!.roster!.filter(p => !p.isModerator);
    const outlaw = holders.find(p => p.role === 'OUTLAW')!;
    const doctor = holders.find(p => p.role === 'DOCTOR')!;
    const town = holders.find(p => p.name !== outlaw.name && p.name !== doctor.name)!;

    // Peaceful night (save == kill), then walk the day to the vote.
    s = run(s, [
      { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: town.name },
      { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: town.name },
      { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: outlaw.name },
      { type: 'NIGHT_RESOLVED' },
      { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' },
      { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' },
    ]);
    expect(s.session?.lastOutcome?.saved).toBe(true);
    expect(s.session?.phase).toBe('DAY_VOTE');

    // Two ballots against the outlaw, then the town votes them out -> TOWN win.
    s = run(s, [
      { type: 'BALLOT_SCANNED', payload: { kind: 'ballot', sid, roundNumber: 1, voter: doctor.name, target: outlaw.name } },
      { type: 'BALLOT_SCANNED', payload: { kind: 'ballot', sid, roundNumber: 1, voter: town.name, target: outlaw.name } },
      { type: 'PLAYER_ELIMINATED', name: outlaw.name },
      { type: 'ROUND_ENDED' },
    ]);
    expect(s.session?.phase).toBe('ROUND_OVER');
    expect(s.session?.rotationTally['Mod'].moderator).toBe(1);

    // Handoff through the REAL wire format, exactly as ModeratorScreen builds it.
    const wire = QRCodec.encode({
      kind: 'handoff',
      sid,
      roundNumber: s.session!.roundNumber + 1,
      roster: s.session!.roster!,
      rotationTally: s.session!.rotationTally,
    });
    const payload = QRCodec.decode(wire);
    expect(payload?.kind).toBe('handoff');
    if (payload?.kind !== 'handoff') return;

    // Bob (the doctor's device) scans it and becomes round-2 Moderator.
    const bobSession: SessionState = {
      sessionId: sid,
      deviceMode: 'PLAYER',
      roundNumber: 1,
      phase: 'DAY_VOTE',
      self: { name: doctor.name, role: 'DOCTOR', status: 'ACTIVE', isModerator: false },
      rotationTally: {},
    };
    let s2 = appReducer({ session: bobSession, alert: null }, { type: 'HANDOFF_SCANNED', payload });
    expect(s2.session?.deviceMode).toBe('MODERATOR');
    expect(s2.session?.roundNumber).toBe(2);
    // The work-item-18 regression (v3.2): every wire-carried roster entry keeps its name.
    expect(s2.session?.roster?.every(p => !!p.name)).toBe(true);

    // And round 2 starts cleanly with the inherited roster.
    s2 = appReducer(s2, { type: 'ROUND_STARTED' });
    expect(s2.alert).toBeNull();
    expect(s2.session?.phase).toBe('ROLE_ASSIGNMENT');
    const round2Holders = s2.session!.roster!.filter(p => !p.isModerator);
    expect(round2Holders.filter(p => p.role === 'OUTLAW')).toHaveLength(1);

    // Run-02 Finding 1: a player still holding round-1 gameplay state (old role,
    // even DECEASED) must be able to receive a round-2 role via the new
    // "Scan Roles QR (new round)" path — ROLES_SCANNED resets round/role/status.
    const stalePlayer: SessionState = {
      sessionId: sid,
      deviceMode: 'PLAYER',
      roundNumber: 1,
      phase: 'DAY_VOTE',
      self: { name: town.name, role: 'TOWN', status: 'DECEASED', isModerator: false },
      companions: undefined,
      rotationTally: {},
    };
    const s3 = appReducer({ session: stalePlayer, alert: null }, {
      type: 'ROLES_SCANNED', role: 'DETECTIVE', roundNumber: 2,
    });
    expect(s3.alert).toBeNull();
    expect(s3.session?.roundNumber).toBe(2);
    expect(s3.session?.self.role).toBe('DETECTIVE');
    expect(s3.session?.self.status).toBe('ACTIVE'); // back in play for the new round
    expect(s3.session?.phase).toBe('ROLE_ASSIGNMENT');

    // The OUTGOING moderator's arc (item 27): their device sits at ROUND_OVER in
    // MODERATOR mode; scanning the successor's round-2 roles QR steps them down
    // to a player seat with moderator state cleared.
    const s4 = appReducer(s, { type: 'ROLES_SCANNED', role: 'TOWN', roundNumber: 2 });
    expect(s4.alert).toBeNull();
    expect(s4.session?.deviceMode).toBe('PLAYER');
    expect(s4.session?.self.isModerator).toBe(false);
    expect(s4.session?.self.role).toBe('TOWN');
    expect(s4.session?.roundNumber).toBe(2);
    expect(s4.session?.roster).toBeUndefined();
    expect(s4.session?.ballots).toBeUndefined();
  });
});
