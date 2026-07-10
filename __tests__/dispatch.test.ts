import { AppState, appReducer, STALE_SESSION_ALERT } from '../src/state/dispatch';
import type { SessionState, PlayerProfile, PlayerStatus } from '../src/types';

const profile = (name: string, over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  name,
  role: 'UNASSIGNED',
  status: 'ACTIVE',
  isModerator: false,
  ...over,
});

const playerSession = (over: Partial<SessionState> = {}): SessionState => ({
  sessionId: 'abc12345',
  deviceMode: 'PLAYER',
  roundNumber: 1,
  phase: 'LOBBY',
  self: profile('Bob'),
  rotationTally: {},
  ...over,
});

const moderatorSession = (names: string[], over: Partial<SessionState> = {}): SessionState => ({
  sessionId: 'abc12345',
  deviceMode: 'MODERATOR',
  roundNumber: 1,
  phase: 'LOBBY',
  self: profile('Mod', { isModerator: true }),
  roster: [profile('Mod', { isModerator: true }), ...names.map(n => profile(n))],
  pendingActions: [],
  rotationTally: {},
  ...over,
});

const st = (session: SessionState | null): AppState => ({ session, alert: null });

describe('PROFILE_CREATED action', () => {
  it('sets self name (names are the only personal data)', () => {
    const next = appReducer(st(null), {
      type: 'PROFILE_CREATED',
      name: 'Bob',
    });
    expect(next.session?.self.name).toBe('Bob');
    expect(next.session?.self.status).toBe('WAITING_FOR_MODERATOR');
  });
});

describe('PROFILE_CLEARED (change name before joining)', () => {
  it('clears a pre-session profile back to setup', () => {
    const next = appReducer(st(playerSession({ sessionId: '' })), { type: 'PROFILE_CLEARED' });
    expect(next.session).toBeNull();
  });

  it('refuses once in a session', () => {
    const next = appReducer(st(playerSession()), { type: 'PROFILE_CLEARED' });
    expect(next.alert).toContain('Leave the game night first');
    expect(next.session).not.toBeNull();
  });
});

describe('SESSION_LEFT (player leaves the game night)', () => {
  it('returns the player to the joinable pre-session state, keeping name + token', () => {
    const next = appReducer(st(playerSession({ self: profile('Bob', { role: 'DOCTOR' }) })), { type: 'SESSION_LEFT' });
    expect(next.alert).toBeNull();
    expect(next.session?.sessionId).toBe('');
    expect(next.session?.self.name).toBe('Bob');
    expect(next.session?.self.role).toBe('UNASSIGNED');
  });

  it('refuses pre-session and on moderator devices', () => {
    expect(appReducer(st(playerSession({ sessionId: '' })), { type: 'SESSION_LEFT' }).alert).toContain('not in a game night');
    expect(appReducer(st(moderatorSession([])), { type: 'SESSION_LEFT' }).alert).toContain('not in a game night');
  });
});

describe('lastElimination (names the card, gates the night)', () => {
  it('PLAYER_ELIMINATED records the name; entering NIGHT clears it', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'DAY_VOTE' }));
    const s1 = appReducer(s0, { type: 'PLAYER_ELIMINATED', name: 'Alice' });
    expect(s1.session?.lastElimination).toBe('Alice');
    const s2 = appReducer(s1, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    expect(s2.session?.lastElimination).toBeUndefined();
  });
});

describe('NIGHT back-edge (re-show the roles QR)', () => {
  it('allows NIGHT -> ROLE_ASSIGNMENT and back, preserving logged actions', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob', 'Charlie'], {
      phase: 'NIGHT',
      pendingActions: [{ actor: 'OUTLAW', action: 'KILL', target: 'Alice' }],
    }));
    const back = appReducer(s0, { type: 'PHASE_ADVANCED', to: 'ROLE_ASSIGNMENT' });
    expect(back.alert).toBeNull();
    expect(back.session?.phase).toBe('ROLE_ASSIGNMENT');
    const again = appReducer(back, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    expect(again.session?.phase).toBe('NIGHT');
    expect(again.session?.pendingActions).toHaveLength(1); // survives the round-trip
  });
});

describe('PLAYER_REMOVED (departed player leaves the roster)', () => {
  it('removes a player in the lobby, keeping their tally entry', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob'], {
      rotationTally: { Alice: { moderator: 1, outlaw: 0, detective: 0, doctor: 0, town: 1 } },
    }));
    const next = appReducer(s0, { type: 'PLAYER_REMOVED', name: 'Alice' });
    expect(next.alert).toBeNull();
    expect(next.session?.roster?.map(p => p.name)).toEqual(['Mod', 'Bob']);
    expect(next.session?.rotationTally['Alice']).toBeDefined(); // fairness survives a rejoin
  });

  it('removes a player at ROUND_OVER so the handoff/next deal excludes them', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob'], { phase: 'ROUND_OVER' }));
    const next = appReducer(s0, { type: 'PLAYER_REMOVED', name: 'Bob' });
    expect(next.session?.roster?.some(p => p.name === 'Bob')).toBe(false);
  });

  it('refuses mid-round', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'NIGHT' }));
    const next = appReducer(s0, { type: 'PLAYER_REMOVED', name: 'Alice' });
    expect(next.alert).toContain('between rounds');
    expect(next.session?.roster).toHaveLength(2);
  });

  it('refuses removing the Moderator themselves and unknown names', () => {
    const s0 = st(moderatorSession(['Alice']));
    expect(appReducer(s0, { type: 'PLAYER_REMOVED', name: 'Mod' }).alert).toContain('cannot remove themselves');
    expect(appReducer(s0, { type: 'PLAYER_REMOVED', name: 'Nobody' }).alert).toContain('not in the roster');
  });
});

describe('SESSION_CANCELLED (undo accidental Create Game Night)', () => {
  it('returns a lobby moderator to the joinable pre-session state, keeping profile + token', () => {
    const s0 = st(moderatorSession(['Alice']));
    const next = appReducer(s0, { type: 'SESSION_CANCELLED' });
    expect(next.alert).toBeNull();
    expect(next.session?.deviceMode).toBe('PLAYER');
    expect(next.session?.sessionId).toBe('');
    expect(next.session?.self.isModerator).toBe(false);
    expect(next.session?.self.status).toBe('WAITING_FOR_MODERATOR');
    expect(next.session?.self.name).toBe('Mod');
    expect(next.session?.roster).toBeUndefined();
  });

  it('refuses once a round has started', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'NIGHT' }));
    const next = appReducer(s0, { type: 'SESSION_CANCELLED' });
    expect(next.alert).toContain('only be cancelled from the lobby');
    expect(next.session?.deviceMode).toBe('MODERATOR');
  });

  it('refuses on a player device', () => {
    const next = appReducer(st(playerSession()), { type: 'SESSION_CANCELLED' });
    expect(next.alert).toContain('only be cancelled from the lobby');
  });
});

describe('JOIN_ACK_SCANNED action (Lobby)', () => {
  it('adds player to roster and stores their token', () => {
    const s0 = st(moderatorSession([]));
    const next = appReducer(s0, {
      type: 'JOIN_ACK_SCANNED',
      payload: { kind: 'joinAck', sid: 'abc12345', name: 'Priya' },
    });
    expect(next.session?.roster?.map(p => p.name)).toEqual(['Mod', 'Priya']);
    const priya = next.session?.roster?.find(p => p.name === 'Priya');
    expect(priya?.status).toBe('ACTIVE');
  });

  it('rejects duplicate names', () => {
    const s0 = st(moderatorSession(['Priya']));
    const next = appReducer(s0, {
      type: 'JOIN_ACK_SCANNED',
      payload: { kind: 'joinAck', sid: 'abc12345', name: 'Priya' },
    });
    expect(next.alert).toContain('already in the roster');
  });
});

describe('ROLES_SCANNED action (Player)', () => {
  it('sets role and round status on player device', () => {
    const s0 = st(playerSession());
    const next = appReducer(s0, {
      type: 'ROLES_SCANNED',
      role: 'DOCTOR',
      roundNumber: 2,
    });
    expect(next.session?.self.role).toBe('DOCTOR');
    expect(next.session?.self.status).toBe('ACTIVE');
    expect(next.session?.roundNumber).toBe(2);
    expect(next.session?.phase).toBe('ROLE_ASSIGNMENT');
  });
});

describe('STATE_SYNC_SCANNED action (Player)', () => {
  it('updates self status and local roster status cache', () => {
    const s0 = st(playerSession({ self: profile('Bob', { status: 'ACTIVE' }) }));
    const next = appReducer(s0, {
      type: 'STATE_SYNC_SCANNED',
      payload: {
        kind: 'sync',
        sid: 'abc12345',
        roundNumber: 2,
        phase: 'DAY_NARRATION',
        statusCodes: [['Bob', 'D'], ['Alice', 'A']],
      },
    });
    expect(next.session?.self.status).toBe('DECEASED');
    expect(next.session?.roundNumber).toBe(2);
    expect(next.session?.phase).toBe('DAY_NARRATION');
    expect(next.session?.roster?.find(p => p.name === 'Alice')?.status).toBe('ACTIVE');
  });
});

describe('outgoing-moderator step-down via ROLES_SCANNED', () => {
  it('demotes a ROUND_OVER moderator to player when a newer round of roles arrives', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'ROUND_OVER', ballots: { Alice: 'Bob' } }));
    const next = appReducer(s0, { type: 'ROLES_SCANNED', role: 'DOCTOR', roundNumber: 2 });
    expect(next.alert).toBeNull();
    expect(next.session?.deviceMode).toBe('PLAYER');
    expect(next.session?.self.isModerator).toBe(false);
    expect(next.session?.self.role).toBe('DOCTOR');
    expect(next.session?.self.status).toBe('ACTIVE');
    expect(next.session?.roundNumber).toBe(2);
    expect(next.session?.roster).toBeUndefined();
    expect(next.session?.pendingActions).toBeUndefined();
    expect(next.session?.ballots).toBeUndefined();
  });

  it('rejects a roles scan on an ACTIVE moderator (not at ROUND_OVER)', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'LOBBY' }));
    const next = appReducer(s0, { type: 'ROLES_SCANNED', role: 'DOCTOR', roundNumber: 2 });
    expect(next.alert).toContain('player devices');
    expect(next.session?.deviceMode).toBe('MODERATOR');
  });

  it('rejects a stale roles scan at ROUND_OVER (same round number)', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'ROUND_OVER' }));
    const next = appReducer(s0, { type: 'ROLES_SCANNED', role: 'DOCTOR', roundNumber: 1 });
    expect(next.alert).toContain('player devices');
    expect(next.session?.deviceMode).toBe('MODERATOR');
  });
});

describe('Moderator is never a votable target (run-03 regression)', () => {
  it("STATE_SYNC_SCANNED maps 'M' to an ACTIVE moderator entry", () => {
    const s0 = st(playerSession());
    const next = appReducer(s0, {
      type: 'STATE_SYNC_SCANNED',
      payload: {
        kind: 'sync', sid: 'abc12345', roundNumber: 1, phase: 'DAY_VOTE',
        statusCodes: [['Mod', 'M'], ['Bob', 'A'], ['Alice', 'D']],
      },
    });
    const mod = next.session?.roster?.find(p => p.name === 'Mod');
    expect(mod?.isModerator).toBe(true);
    expect(mod?.status).toBe('ACTIVE');
    expect(next.session?.roster?.find(p => p.name === 'Bob')?.isModerator).toBe(false);
  });

  it('BALLOT_SCANNED rejects a ballot targeting the Moderator', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob'], { phase: 'DAY_VOTE', ballots: {} }));
    const next = appReducer(s0, {
      type: 'BALLOT_SCANNED',
      payload: { kind: 'ballot', sid: 'abc12345', roundNumber: 1, voter: 'Alice', target: 'Mod' },
    });
    expect(next.alert).toContain('cannot be voted out');
    expect(next.session?.ballots?.['Alice']).toBeUndefined();
  });

  it('PLAYER_ELIMINATED rejects eliminating the Moderator', () => {
    const s0 = st(moderatorSession(['Alice'], { phase: 'DAY_VOTE' }));
    const next = appReducer(s0, { type: 'PLAYER_ELIMINATED', name: 'Mod' });
    expect(next.alert).toContain('cannot be voted out');
    expect(next.session?.roster?.find(p => p.name === 'Mod')?.status).toBe('ACTIVE');
  });
});

describe('BALLOT_SCANNED action (Moderator)', () => {
  it('logs vote for active voters and targets', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob'], { phase: 'DAY_VOTE', ballots: {} }));
    const next = appReducer(s0, {
      type: 'BALLOT_SCANNED',
      payload: { kind: 'ballot', sid: 'abc12345', roundNumber: 1, voter: 'Alice', target: 'Bob' },
    });
    expect(next.session?.ballots?.['Alice']).toBe('Bob');
    expect(next.alert).toBeNull();
  });

  it('rejects vote from inactive voter', () => {
    const s0 = st(moderatorSession(['Alice', 'Bob'], { phase: 'DAY_VOTE', ballots: {} }));
    s0.session!.roster![1].status = 'DECEASED'; // Alice is deceased
    const next = appReducer(s0, {
      type: 'BALLOT_SCANNED',
      payload: { kind: 'ballot', sid: 'abc12345', roundNumber: 1, voter: 'Alice', target: 'Bob' },
    });
    expect(next.alert).toContain('not active');
  });
});

describe('lobby / round lifecycle', () => {
  it('SESSION_CREATED makes this device the Moderator with a fresh sid', () => {
    const next = appReducer(st(playerSession({ sessionId: '' })), { type: 'SESSION_CREATED' });
    expect(next.session?.deviceMode).toBe('MODERATOR');
    expect(next.session?.sessionId).toMatch(/^[a-z0-9]{8}$/);
    expect(next.session?.roster).toHaveLength(1);
  });

  it('JOIN_SCANNED seeds the session id', () => {
    const next = appReducer(st(playerSession({ sessionId: '' })), {
      type: 'JOIN_SCANNED',
      payload: { kind: 'join', sid: 'abc12345', roundNumber: 1, moderatorName: 'Mod' },
    });
    expect(next.session?.sessionId).toBe('abc12345');
  });

  it('ROUND_STARTED refuses below the dev minimum (2 role-holders)', () => {
    const next = appReducer(st(moderatorSession(['A', 'B'])), { type: 'ROUND_STARTED' });
    expect(next.alert).toContain('Need 6-16');
    expect(next.session?.phase).toBe('LOBBY');
  });

  it('ROUND_STARTED allows a dev-minimum round (3 holders -> 1 outlaw, doctor, detective, no town)', () => {
    // __DEV__ is true under jest-expo, so the RoleTable dev override is active.
    const s = appReducer(st(moderatorSession(['A', 'B', 'C'])), { type: 'ROUND_STARTED' });
    expect(s.session?.phase).toBe('ROLE_ASSIGNMENT');
    const holders = s.session!.roster!.filter(p => !p.isModerator);
    expect(holders.filter(p => p.role === 'OUTLAW')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'DETECTIVE')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'DOCTOR')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'TOWN')).toHaveLength(0);
  });

  it('ROUND_STARTED assigns roles per the balance table (6 holders -> 1 outlaw)', () => {
    const s = appReducer(st(moderatorSession(['A', 'B', 'C', 'D', 'E', 'F'])), { type: 'ROUND_STARTED' });
    expect(s.session?.phase).toBe('ROLE_ASSIGNMENT');
    const holders = s.session!.roster!.filter(p => !p.isModerator);
    expect(holders.filter(p => p.role === 'OUTLAW')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'DETECTIVE')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'DOCTOR')).toHaveLength(1);
    expect(holders.filter(p => p.role === 'TOWN')).toHaveLength(3);
  });

  it('PHASE_ADVANCED enforces the FSM transition table', () => {
    const bad = appReducer(st(moderatorSession([])), { type: 'PHASE_ADVANCED', to: 'ROUND_OVER' });
    expect(bad.alert).toContain('Illegal phase transition');

    const good = appReducer(st(moderatorSession([])), { type: 'PHASE_ADVANCED', to: 'ROLE_ASSIGNMENT' });
    expect(good.session?.phase).toBe('ROLE_ASSIGNMENT');
  });

  it('NIGHT_RESOLVED kills the victim, spares the saved, and stores the outcome', () => {
    const roster = [
      profile('Mod', { isModerator: true }),
      profile('Alice', { role: 'OUTLAW' }),
      profile('Bob', { role: 'DOCTOR' }),
      profile('Eve', { role: 'TOWN' }),
    ];
    const s0 = st(moderatorSession([], {
      roster,
      phase: 'NIGHT',
      pendingActions: [
        { actor: 'Alice', action: 'KILL', target: 'Eve' },
        { actor: 'Bob', action: 'SAVE', target: 'Bob' },
      ],
    }));
    const s1 = appReducer(s0, { type: 'NIGHT_RESOLVED' });
    expect(s1.session?.phase).toBe('DAY_NARRATION');
    expect(s1.session?.lastOutcome?.victim).toBe('Eve');
    expect(s1.session?.roster?.find(p => p.name === 'Eve')?.status).toBe('DECEASED');
    expect(s1.session?.pendingActions).toEqual([]);
  });

  it('PLAYER_ELIMINATED only works during DAY_VOTE', () => {
    const wrongPhase = appReducer(st(moderatorSession(['Alice'])), { type: 'PLAYER_ELIMINATED', name: 'Alice' });
    expect(wrongPhase.alert).toContain('day vote');

    const s0 = st(moderatorSession(['Alice'], { phase: 'DAY_VOTE' }));
    const s1 = appReducer(s0, { type: 'PLAYER_ELIMINATED', name: 'Alice' });
    expect(s1.session?.roster?.find(p => p.name === 'Alice')?.status).toBe('ELIMINATED');
  });

  it('ROUND_ENDED bumps the rotation tally for every participant', () => {
    const roster = [
      profile('Mod', { isModerator: true }),
      profile('Alice', { role: 'OUTLAW' }),
      profile('Bob', { role: 'DOCTOR' }),
    ];
    const s1 = appReducer(st(moderatorSession([], { roster, phase: 'DAY_VOTE' })), { type: 'ROUND_ENDED' });
    expect(s1.session?.phase).toBe('ROUND_OVER');
    expect(s1.session?.rotationTally['Mod'].moderator).toBe(1);
    expect(s1.session?.rotationTally['Alice'].outlaw).toBe(1);
    expect(s1.session?.rotationTally['Bob'].doctor).toBe(1);
  });

  it('HANDOFF_SCANNED flips the device to Moderator with roles wiped', () => {
    const s0 = st(playerSession({ self: profile('Bob') }));
    const s1 = appReducer(s0, {
      type: 'HANDOFF_SCANNED',
      payload: {
        kind: 'handoff', sid: 'abc12345', roundNumber: 2,
        roster: [profile('Mod'), profile('Bob'), profile('Alice', { role: 'OUTLAW' })],
        rotationTally: { Mod: { moderator: 1, outlaw: 0, detective: 0, doctor: 0, town: 0 } },
      },
    });
    expect(s1.session?.deviceMode).toBe('MODERATOR');
    expect(s1.session?.roundNumber).toBe(2);
    expect(s1.session?.roster?.every(p => p.role === 'UNASSIGNED')).toBe(true);
    expect(s1.session?.roster?.find(p => p.name === 'Bob')?.isModerator).toBe(true);
    expect(s1.session?.rotationTally['Mod'].moderator).toBe(1);
  });

  it('HANDOFF_SCANNED from a different session is rejected', () => {
    const s1 = appReducer(st(playerSession()), {
      type: 'HANDOFF_SCANNED',
      payload: { kind: 'handoff', sid: 'OTHER111', roundNumber: 2, roster: [], rotationTally: {} },
    });
    expect(s1.alert).toBe(STALE_SESSION_ALERT);
    expect(s1.session?.deviceMode).toBe('PLAYER');
  });

  it('GAME_NIGHT_CLEARED discards everything', () => {
    const s1 = appReducer(st(moderatorSession(['Alice'])), { type: 'GAME_NIGHT_CLEARED' });
    expect(s1.session).toBeNull();
  });
});
