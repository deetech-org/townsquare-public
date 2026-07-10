import { appReducer, AppState, AppAction } from '../src/state/dispatch';
import { QRCodec } from '../src/services/QRCodec';
import { scanRolesPayload } from '../src/services/rolesScan';
import type {
  JoinSessionPayload,
  JoinAckPayload,
  SyncPayload,
  BallotPayload,
  ModeratorHandoffPayload,
  PlayerProfile,
  TownsquareRole
} from '../src/types';

// Mock expo-crypto using Node's standard crypto module
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

// Helper: Generates role encryption mapping matching ModeratorScreen.tsx useEffect
async function generateEncryptedRoles(
  roster: PlayerProfile[],
  sessionId: string,
  roundNumber: number
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const outlaws = roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
  const roleCodes: Record<string, string> = { OUTLAW: 'O', DETECTIVE: 'E', DOCTOR: 'D', TOWN: 'T' };

  for (const p of roster) {
    if (p.isModerator) continue;
    const code = roleCodes[p.role] ?? 'T';
    let plaintext = code;
    if (p.role === 'OUTLAW') {
      const companions = outlaws.filter(name => name !== p.name);
      if (companions.length > 0) {
        plaintext += `|${companions.join(',')}`;
      }
    }
    const ciphertext = await QRCodec.encryptRole(plaintext, p.name, sessionId, roundNumber);
    map[p.name] = ciphertext;
  }
  return map;
}

describe('Townsquare Log-Based and Headless E2E Game Simulator', () => {
  
  // --- Test Case 1: Replaying real QR code logs from user ---
  it('Test Case 1: Replays a 4-player game night from logs', async () => {
    console.log('\n=== TEST CASE 1: REPLAYING 4-PLAYER GAME FROM METRO LOGS ===');
    
    // Roster profiles matching the logs
    // Instantiate states (v3.2: no session tokens — roles are keyed on player name)
    let states: Record<string, AppState> = {
      Mod: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Mod' }),
      Alice: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Alice' }),
      Bob: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Bob' }),
      Charlie: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Charlie' })
    };

    // Moderator creates session
    states.Mod = appReducer(states.Mod, { type: 'SESSION_CREATED' });
    const sessionId = states.Mod.session?.sessionId;
    console.log(`[Lobby] Moderator initialized session with ID: ${sessionId}`);

    // Log trace to replay
    const rawLogs = [
      'LOG  [QR encode] {"k":"s","s":"h8wjn1d7","r":1,"ph":"LOBBY","st":[["Mod","M"]]}',
      'LOG  [QR encode] {"k":"j","s":"h8wjn1d7","r":1,"m":"Mod"}',
      'LOG  [QR encode] {"k":"h","s":"h8wjn1d7","r":2,"ro":["Mod"],"t":{}}',
      'LOG  [QR decode] {"k":"j","s":"h8wjn1d7","r":1,"m":"Mod"}',
      'LOG  [QR encode] {"k":"a","s":"h8wjn1d7","n":"Alice"}',
      'LOG  [QR decode] {"k":"j","s":"h8wjn1d7","r":1,"m":"Mod"}',
      'LOG  [QR encode] {"k":"a","s":"h8wjn1d7","n":"Bob"}',
      'LOG  [QR decode] {"k":"j","s":"h8wjn1d7","r":1,"m":"Mod"}',
      'LOG  [QR encode] {"k":"a","s":"h8wjn1d7","n":"Charlie"}',
      'LOG  [QR decode] {"k":"a","s":"h8wjn1d7","n":"Alice"}',
      'LOG  [QR decode] {"k":"a","s":"h8wjn1d7","n":"Bob"}',
      'LOG  [QR decode] {"k":"a","s":"h8wjn1d7","n":"Charlie"}',
      'LOG  [QR encode] {"k":"r","s":"h8wjn1d7","r":1,"e":{"Alice":"QQ==","Bob":"2Q==","Charlie":"nQ=="}}',
      'LOG  [QR decode] {"k":"r","s":"h8wjn1d7","r":1,"e":{"Alice":"QQ==","Bob":"2Q==","Charlie":"nQ=="}}',
      'LOG  [QR decode] {"k":"r","s":"h8wjn1d7","r":1,"e":{"Alice":"QQ==","Bob":"2Q==","Charlie":"nQ=="}}',
      'LOG  [QR decode] {"k":"r","s":"h8wjn1d7","r":1,"e":{"Alice":"QQ==","Bob":"2Q==","Charlie":"nQ=="}}',
      'LOG  [QR encode] {"k":"s","s":"h8wjn1d7","r":1,"ph":"DAY_NARRATION","st":[["Mod","M"],["Alice","D"],["Bob","A"],["Charlie","A"]]}',
      'LOG  [QR decode] {"k":"s","s":"h8wjn1d7","r":1,"ph":"DAY_NARRATION","st":[["Mod","M"],["Alice","D"],["Bob","A"],["Charlie","A"]]}',
      'LOG  [QR decode] {"k":"s","s":"h8wjn1d7","r":1,"ph":"DAY_NARRATION","st":[["Mod","M"],["Alice","D"],["Bob","A"],["Charlie","A"]]',
      'LOG  [QR decode] {"k":"s","s":"h8wjn1d7","r":1,"ph":"DAY_NARRATION","st":[["Mod","M"],["Alice","D"],["Bob","A"],["Charlie","A"]]}'
    ];

    for (const log of rawLogs) {
      const match = log.match(/QR (?:encode|decode)\]\s*(\{.*\})/);
      if (!match) continue;
      const payload = QRCodec.decode(match[1]);
      if (!payload) continue;
      
      if (payload.kind === 'join') {
        const action = { type: 'JOIN_SCANNED', payload } as const;
        states.Alice = appReducer(states.Alice, action);
        states.Bob = appReducer(states.Bob, action);
        states.Charlie = appReducer(states.Charlie, action);
      } else if (payload.kind === 'joinAck') {
        const action = { type: 'JOIN_ACK_SCANNED', payload } as const;
        states.Mod = appReducer(states.Mod, action);
        console.log(`  - Joined roster confirmation: ${payload.name}`);
      } else if (payload.kind === 'roles') {
        for (const name of ['Alice', 'Bob', 'Charlie']) {
          const session = states[name].session;
          if (session) {
            await scanRolesPayload(
              match[1],
              session,
              (action: AppAction) => { states[name] = appReducer(states[name], action); }
            );
          }
        }
      } else if (payload.kind === 'sync') {
        const action = { type: 'STATE_SYNC_SCANNED', payload } as const;
        states.Alice = appReducer(states.Alice, action);
        states.Bob = appReducer(states.Bob, action);
        states.Charlie = appReducer(states.Charlie, action);
      }
    }

    console.log(`[Decryption] Decrypting roles from roles QR payload...`);
    console.log(`  - Bob decrypted role: ${states.Bob.session?.self.role}`);
    console.log(`  - Charlie decrypted role: ${states.Charlie.session?.self.role}`);
    
    // Verify Bob and Charlie's roles decrypted successfully
    expect(states.Bob.session?.self.role).toBe('DETECTIVE');
    expect(states.Charlie.session?.self.role).toBe('DOCTOR');

    console.log(`[Status Sync] Day narration sync loaded:`);
    console.log(`  - Alice status: ${states.Alice.session?.self.status}`);
    console.log(`  - Bob status: ${states.Bob.session?.self.status}`);
    console.log(`  - Charlie status: ${states.Charlie.session?.self.status}`);

    // Verify day status sync has processed correctly
    expect(states.Alice.session?.self.status).toBe('DECEASED');
    expect(states.Bob.session?.self.status).toBe('ACTIVE');
    expect(states.Charlie.session?.self.status).toBe('ACTIVE');
    expect(states.Alice.session?.roster?.find(p => p.name === 'Alice')?.status).toBe('DECEASED');
  });

  // --- Test Case 2: Full 8-Player Game Night Simulation ---
  it('Test Case 2: Simulates 8-player E2E validation run (Round 1: Outlaws Win, Round 2: Town Wins)', async () => {
    console.log('\n=== TEST CASE 2: 8-PLAYER SIMULATED GAME NIGHT (1 MOD + 7 PLAYERS) ===');
    const players = ['Alice', 'Bob', 'Charlie', 'Dave', 'Emma', 'Frank', 'Grace'];
    
    // 1. Initialize Profiles & Session
    let states: Record<string, AppState> = {
      Mod: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Mod' }),
    };
    for (const p of players) {
      states[p] = appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: p });
    }

    states.Mod = appReducer(states.Mod, { type: 'SESSION_CREATED' });
    const sessionId = states.Mod.session?.sessionId ?? '';
    console.log(`[Round 1] Lobby created. Session ID: ${sessionId}. Moderator: Mod`);

    // 2. Join Handshake
    const joinPayload: JoinSessionPayload = {
      kind: 'join',
      sid: sessionId,
      roundNumber: 1,
      moderatorName: 'Mod'
    };
    const joinAction = { type: 'JOIN_SCANNED', payload: joinPayload } as const;

    for (const p of players) {
      states[p] = appReducer(states[p], joinAction);
      const ackPayload: JoinAckPayload = {
        kind: 'joinAck',
        sid: sessionId,
        name: p,
      };
      states.Mod = appReducer(states.Mod, { type: 'JOIN_ACK_SCANNED', payload: ackPayload });
      console.log(`  - Player registered: ${p}`);
    }

    expect(states.Mod.session?.roster?.length).toBe(8);

    // 3. Start Round 1 (Role Assignment)
    states.Mod = appReducer(states.Mod, { type: 'ROUND_STARTED' });
    
    // Verify Role Counts
    const r1Roster = states.Mod.session?.roster ?? [];
    const r1Roles = r1Roster.filter(p => !p.isModerator).map(p => p.role);
    expect(r1Roles.filter(r => r === 'OUTLAW').length).toBe(2);
    expect(r1Roles.filter(r => r === 'TOWN').length).toBe(3);

    // Encrypt and Scan roles on player devices
    const r1Ciphers = await generateEncryptedRoles(r1Roster, sessionId, 1);
    const r1RolesPayload = QRCodec.encode({ kind: 'roles', sid: sessionId, roundNumber: 1, encryptedRoles: r1Ciphers });

    console.log(`[Round 1] Roles distributed and decrypted:`);
    for (const p of players) {
      await scanRolesPayload(
        r1RolesPayload,
        states[p].session!,
        (action: AppAction) => { states[p] = appReducer(states[p], action); }
      );
      console.log(`  - Player ${p} role: ${states[p].session?.self.role}`);
      expect(states[p].session?.self.role).toBe(r1Roster.find(u => u.name === p)?.role);
    }

    // Identify factions
    const outlawNames = r1Roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
    const townNames = r1Roster.filter(p => !p.isModerator && p.role !== 'OUTLAW').map(p => p.name);

    // 4. Night 1 resolution
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    
    const victim1 = townNames[0];
    console.log(`[Round 1 / Night 1] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim1}`);
    console.log(`  - Doctor saves: ${outlawNames[0]}`);
    console.log(`  - Detective investigates: ${outlawNames[1]}`);

    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim1 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: outlawNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: outlawNames[1] });
    
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 1] Resolved. Night victim: ${victim1} is now DECEASED.`);
    expect(states.Mod.session?.roster?.find(p => p.name === victim1)?.status).toBe('DECEASED');

    // Sync players
    const sync1Payload: SyncPayload = {
      kind: 'sync',
      sid: sessionId,
      roundNumber: 1,
      phase: 'DAY_NARRATION',
      statusCodes: states.Mod.session!.roster!.map(p => [p.name, p.isModerator ? 'M' : (p.status === 'DECEASED' ? 'D' : 'A')])
    };
    const sync1Action = { type: 'STATE_SYNC_SCANNED', payload: sync1Payload } as const;
    for (const p of players) {
      states[p] = appReducer(states[p], sync1Action);
    }

    // 5. Day 1 Voting - banish another Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });

    const victim2 = townNames[1];
    console.log(`[Round 1 / Day 1] Banishment Vote. Nominating and voting out: ${victim2}`);
    const activeVoters = players.filter(p => p !== victim1);

    for (const p of activeVoters) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim2 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim2 });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });

    // 6. Night 2 resolution - kill another Town player to trigger Outlaw win
    const victim3 = townNames[2];
    console.log(`[Round 1 / Night 2] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim3}`);

    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim3 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: outlawNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });

    // Active Town = 2 (Town remaining: townNames[3], townNames[4])
    // Active Outlaws = 2
    // Factions match Outlaws win! Mod ends round.
    states.Mod = appReducer(states.Mod, { type: 'ROUND_ENDED' });
    console.log(`[Round 1 End] Outlaws Win! Phase advanced to: ${states.Mod.session?.phase}`);
    expect(states.Mod.session?.phase).toBe('ROUND_OVER');

    // 7. Moderator Handoff to Alice
    const handoffPayload: ModeratorHandoffPayload = {
      kind: 'handoff',
      sid: sessionId,
      roundNumber: 2,
      roster: states.Mod.session!.roster!,
      rotationTally: states.Mod.session!.rotationTally
    };
    
    // Alice scans handoff
    states.Alice = appReducer(states.Alice, { type: 'HANDOFF_SCANNED', payload: handoffPayload });
    console.log(`[Round 2 Setup] Handoff completed. Successor Moderator: Alice (Round 2)`);
    expect(states.Alice.session?.deviceMode).toBe('MODERATOR');
    expect(states.Alice.session?.roundNumber).toBe(2);

    // Outgoing Mod steps down to join Round 2 as a player — through the REAL roles-QR
    // scan pipeline (decode -> sid check -> decrypt this device's own entry -> dispatch
    // ROLES_SCANNED), the exact path ModeratorScreen's "Handed off — join the next round
    // as a player" button uses. Regression for the field report where the previous
    // moderator could not rejoin after a handoff: the round-2 roles QR must contain the
    // outgoing moderator's own name-keyed entry, and their device must decrypt it.
    states.Alice = appReducer(states.Alice, { type: 'ROUND_STARTED' });
    const r2Roster = states.Alice.session?.roster ?? [];
    const r2Ciphers = await generateEncryptedRoles(r2Roster, sessionId, 2);
    const r2RolesPayload = QRCodec.encode({ kind: 'roles', sid: sessionId, roundNumber: 2, encryptedRoles: r2Ciphers });

    // The round-2 roles QR must carry an entry for the outgoing moderator (now a player).
    expect(Object.keys(r2Ciphers)).toContain('Mod');

    const stepDown = await scanRolesPayload(
      r2RolesPayload,
      states.Mod.session!,
      (action) => { states.Mod = appReducer(states.Mod, action); }
    );
    console.log(`  - Outgoing Mod step-down scan: ${stepDown.ok ? 'OK -> ' + states.Mod.session?.self.role : 'FAILED: ' + stepDown.message}`);
    expect(stepDown.ok).toBe(true);
    expect(states.Mod.session?.deviceMode).toBe('PLAYER');
    expect(states.Mod.session?.self.isModerator).toBe(false);
    expect(states.Mod.session?.roundNumber).toBe(2);
    expect(states.Mod.session?.self.role).not.toBe('UNASSIGNED');
  });

  // --- Test Case 3: Full 11-Player Game Night Simulation ---
  it('Test Case 3: Simulates 11-player E2E validation run (1 Moderator + 10 Players)', async () => {
    console.log('\n=== TEST CASE 3: 11-PLAYER SIMULATED GAME NIGHT (1 MOD + 10 PLAYERS) ===');
    const players = ['Alice', 'Bob', 'Charlie', 'Dave', 'Emma', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];
    
    // Initialize Profiles & Session
    let states: Record<string, AppState> = {
      Mod: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Mod' }),
    };
    for (const p of players) {
      states[p] = appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: p });
    }

    states.Mod = appReducer(states.Mod, { type: 'SESSION_CREATED' });
    const sessionId = states.Mod.session?.sessionId ?? '';
    console.log(`[Lobby] Session ID: ${sessionId}. Moderator: Mod`);

    // Join Handshake
    const joinPayload: JoinSessionPayload = {
      kind: 'join',
      sid: sessionId,
      roundNumber: 1,
      moderatorName: 'Mod'
    };
    const joinAction = { type: 'JOIN_SCANNED', payload: joinPayload } as const;

    for (const p of players) {
      states[p] = appReducer(states[p], joinAction);
      const ackPayload: JoinAckPayload = {
        kind: 'joinAck',
        sid: sessionId,
        name: p,
      };
      states.Mod = appReducer(states.Mod, { type: 'JOIN_ACK_SCANNED', payload: ackPayload });
      console.log(`  - Player registered: ${p}`);
    }

    expect(states.Mod.session?.roster?.length).toBe(11);

    // Start Round 1
    states.Mod = appReducer(states.Mod, { type: 'ROUND_STARTED' });
    
    // Verify Roster Balance (10 players -> 2 Outlaws, 1 Doctor, 1 Detective, 6 Town)
    const r1Roster = states.Mod.session?.roster ?? [];
    const r1Roles = r1Roster.filter(p => !p.isModerator).map(p => p.role);
    expect(r1Roles.filter(r => r === 'OUTLAW').length).toBe(2);
    expect(r1Roles.filter(r => r === 'DOCTOR').length).toBe(1);
    expect(r1Roles.filter(r => r === 'DETECTIVE').length).toBe(1);
    expect(r1Roles.filter(r => r === 'TOWN').length).toBe(6);

    const outlawNames = r1Roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
    const doctorNames = r1Roster.filter(p => p.role === 'DOCTOR').map(p => p.name);
    const detectiveNames = r1Roster.filter(p => p.role === 'DETECTIVE').map(p => p.name);
    const townNames = r1Roster.filter(p => !p.isModerator && p.role === 'TOWN').map(p => p.name);

    // Encrypt and Scan roles
    const r1Ciphers = await generateEncryptedRoles(r1Roster, sessionId, 1);
    const r1RolesPayload = QRCodec.encode({ kind: 'roles', sid: sessionId, roundNumber: 1, encryptedRoles: r1Ciphers });

    console.log(`[Round 1] Roles distributed and decrypted:`);
    for (const p of players) {
      await scanRolesPayload(
        r1RolesPayload,
        states[p].session!,
        (action: AppAction) => { states[p] = appReducer(states[p], action); }
      );
      console.log(`  - Player ${p} role: ${states[p].session?.self.role}`);
    }

    // Night 1
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim1 = townNames[0];
    console.log(`[Round 1 / Night 1] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim1}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim1 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: doctorNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: outlawNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 1] Resolved. Night victim: ${victim1} is DECEASED.`);

    // Day 1 voting - eliminate Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim2 = townNames[1];
    console.log(`[Round 1 / Day 1] Banishment Vote. Nominating and voting out: ${victim2}`);
    const activeVoters = players.filter(p => p !== victim1);
    for (const p of activeVoters) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim2 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim2 });

    // Night 2 - kill Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim3 = townNames[2];
    console.log(`[Round 1 / Night 2] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim3}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim3 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: detectiveNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 2] Resolved. Night victim: ${victim3} is DECEASED.`);

    // Day 2 voting - eliminate Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim4 = townNames[3];
    console.log(`[Round 1 / Day 2] Banishment Vote. Nominating and voting out: ${victim4}`);
    const activeVoters2 = activeVoters.filter(p => p !== victim2 && p !== victim3);
    for (const p of activeVoters2) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim4 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim4 });

    // Night 3 - kill Town player -> triggers Outlaw win
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim5 = townNames[4];
    console.log(`[Round 1 / Night 3] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim5}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim5 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 3] Resolved. Night victim: ${victim5} is DECEASED.`);

    // Day 3 vote to banish another Town player (victim 6)
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim6 = townNames[5];
    console.log(`[Round 1 / Day 3] Banishment Vote. Nominating and voting out: ${victim6}`);
    const activeVoters3 = activeVoters2.filter(p => p !== victim4 && p !== victim5);
    for (const p of activeVoters3) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim6 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim6 });
    
    // Now active Town = 2 (Detective, Doctor)
    // Active Outlaws = 2
    // Outlaws count >= Town count. Outlaws win! Mod ends round.
    states.Mod = appReducer(states.Mod, { type: 'ROUND_ENDED' });
    console.log(`[Round 1 End] Outlaws Win! Phase advanced to: ${states.Mod.session?.phase}`);
    expect(states.Mod.session?.phase).toBe('ROUND_OVER');
  });

  // --- Test Case 4: Full 16-Player Game Night Simulation ---
  it('Test Case 4: Simulates 16-player E2E validation run (1 Moderator + 15 Players)', async () => {
    console.log('\n=== TEST CASE 4: 16-PLAYER SIMULATED GAME NIGHT (1 MOD + 15 PLAYERS) ===');
    const players = [
      'Alice', 'Bob', 'Charlie', 'Dave', 'Emma', 'Frank', 'Grace', 'Heidi',
      'Ivan', 'Judy', 'Mallory', 'Najeeb', 'Oscar', 'Peggy', 'Quentin'
    ];
    
    // Initialize Profiles & Session
    let states: Record<string, AppState> = {
      Mod: appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: 'Mod' }),
    };
    for (const p of players) {
      states[p] = appReducer({ session: null, alert: null }, { type: 'PROFILE_CREATED', name: p });
    }

    states.Mod = appReducer(states.Mod, { type: 'SESSION_CREATED' });
    const sessionId = states.Mod.session?.sessionId ?? '';
    console.log(`[Lobby] Session ID: ${sessionId}. Moderator: Mod`);

    // Join Handshake
    const joinPayload: JoinSessionPayload = {
      kind: 'join',
      sid: sessionId,
      roundNumber: 1,
      moderatorName: 'Mod'
    };
    const joinAction = { type: 'JOIN_SCANNED', payload: joinPayload } as const;

    for (const p of players) {
      states[p] = appReducer(states[p], joinAction);
      const ackPayload: JoinAckPayload = {
        kind: 'joinAck',
        sid: sessionId,
        name: p,
      };
      states.Mod = appReducer(states.Mod, { type: 'JOIN_ACK_SCANNED', payload: ackPayload });
      console.log(`  - Player registered: ${p}`);
    }

    expect(states.Mod.session?.roster?.length).toBe(16);

    // Start Round 1
    states.Mod = appReducer(states.Mod, { type: 'ROUND_STARTED' });
    
    // Verify Roster Balance (15 players -> 4 Outlaws, 1 Doctor, 1 Detective, 9 Town)
    const r1Roster = states.Mod.session?.roster ?? [];
    const r1Roles = r1Roster.filter(p => !p.isModerator).map(p => p.role);
    expect(r1Roles.filter(r => r === 'OUTLAW').length).toBe(4);
    expect(r1Roles.filter(r => r === 'DOCTOR').length).toBe(1);
    expect(r1Roles.filter(r => r === 'DETECTIVE').length).toBe(1);
    expect(r1Roles.filter(r => r === 'TOWN').length).toBe(9);

    const outlawNames = r1Roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
    const doctorNames = r1Roster.filter(p => p.role === 'DOCTOR').map(p => p.name);
    const detectiveNames = r1Roster.filter(p => p.role === 'DETECTIVE').map(p => p.name);
    const townNames = r1Roster.filter(p => !p.isModerator && p.role === 'TOWN').map(p => p.name);

    console.log(`[Roster Balance] 16 players session. Outlaws: ${outlawNames.join(', ')}`);

    // Encrypt and Scan roles
    const r1Ciphers = await generateEncryptedRoles(r1Roster, sessionId, 1);
    const r1RolesPayload = QRCodec.encode({ kind: 'roles', sid: sessionId, roundNumber: 1, encryptedRoles: r1Ciphers });

    console.log(`[Round 1] Roles distributed and decrypted:`);
    for (const p of players) {
      await scanRolesPayload(
        r1RolesPayload,
        states[p].session!,
        (action: AppAction) => { states[p] = appReducer(states[p], action); }
      );
    }
    console.log(`  - Decryptions verified for all 15 player devices.`);

    // Night 1
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim1 = townNames[0];
    console.log(`[Round 1 / Night 1] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim1}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim1 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: doctorNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DETECTIVE', action: 'INVESTIGATE', target: outlawNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 1] Resolved. Night victim: ${victim1} is DECEASED.`);

    // Day 1 voting - eliminate Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim2 = townNames[1];
    console.log(`[Round 1 / Day 1] Banishment Vote. Nominating and voting out: ${victim2}`);
    const activeVoters = players.filter(p => p !== victim1);
    for (const p of activeVoters) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim2 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim2 });

    // Night 2 - kill Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim3 = townNames[2];
    console.log(`[Round 1 / Night 2] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim3}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim3 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'DOCTOR', action: 'SAVE', target: detectiveNames[0] });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 2] Resolved. Night victim: ${victim3} is DECEASED.`);

    // Day 2 voting - eliminate Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim4 = townNames[3];
    console.log(`[Round 1 / Day 2] Banishment Vote. Nominating and voting out: ${victim4}`);
    const activeVoters2 = activeVoters.filter(p => p !== victim2 && p !== victim3);
    for (const p of activeVoters2) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim4 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim4 });

    // Night 3 - kill Town player
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim5 = townNames[4];
    console.log(`[Round 1 / Night 3] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim5}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim5 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 3] Resolved. Night victim: ${victim5} is DECEASED.`);

    // Day 3 vote to banish another Town player (victim 6)
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' });
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'DAY_VOTE' });
    const victim6 = townNames[5];
    console.log(`[Round 1 / Day 3] Banishment Vote. Nominating and voting out: ${victim6}`);
    const activeVoters3 = activeVoters2.filter(p => p !== victim4 && p !== victim5);
    for (const p of activeVoters3) {
      const ballot: BallotPayload = { kind: 'ballot', sid: sessionId, roundNumber: 1, voter: p, target: victim6 };
      states.Mod = appReducer(states.Mod, { type: 'BALLOT_SCANNED', payload: ballot });
    }
    states.Mod = appReducer(states.Mod, { type: 'PLAYER_ELIMINATED', name: victim6 });

    // Night 4 - kill Town player -> triggers Outlaw win
    states.Mod = appReducer(states.Mod, { type: 'PHASE_ADVANCED', to: 'NIGHT' });
    const victim7 = townNames[6];
    console.log(`[Round 1 / Night 4] Logging actions...`);
    console.log(`  - Outlaws target/kill: ${victim7}`);
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_ACTION_LOGGED', actor: 'OUTLAW', action: 'KILL', target: victim7 });
    states.Mod = appReducer(states.Mod, { type: 'NIGHT_RESOLVED' });
    console.log(`[Round 1 / Night 4] Resolved. Night victim: ${victim7} is DECEASED.`);

    // Now active Town = 4 (Detective, Doctor, townNames[7], townNames[8])
    // Active Outlaws = 4
    // Outlaws count >= Town count. Outlaws win! Mod ends round.
    states.Mod = appReducer(states.Mod, { type: 'ROUND_ENDED' });
    console.log(`[Round 1 End] Outlaws Win! Phase advanced to: ${states.Mod.session?.phase}`);
    expect(states.Mod.session?.phase).toBe('ROUND_OVER');
  });

});
