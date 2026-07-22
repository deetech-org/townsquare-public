// Townsquare Web — game core (self-contained, no parent/`../src` dependency).
// This is an independent port of the native app's platform-agnostic modules, kept
// byte-compatible with the frozen v3.2 QR wire format so a browser and a native phone
// can play in the same room. The ONLY change from the native code is that the SHA-256
// keystream digest uses Web Crypto instead of expo-crypto (see sha256Hex).
//
// Ported from: src/services/QRCodec.ts, src/state/dispatch.ts,
// src/engine/GameStateMachine.ts, src/engine/RoleTable.ts,
// src/state/RotationFairness.ts, src/services/NarrationEngine.ts.

// ---- Dev flag (web replacement for __DEV__) --------------------------------
export let DEV = false;
export function setDev(v) { DEV = !!v; }

// ===========================================================================
// QRCodec — crypto + wire format (interop-critical: keep verbatim vs native)
// ===========================================================================

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Percent-encoding based string<->bytes (matches native stringToBytes/bytesToString)
function stringToBytes(str) {
  const encoded = encodeURIComponent(str);
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
  return bytes;
}
function bytesToString(bytes) {
  const chars = bytes.map(b => String.fromCharCode(b)).join('');
  return decodeURIComponent(chars);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Encode(bytes) {
  let result = '';
  const l = bytes.length;
  for (let i = 0; i < l; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < l ? bytes[i + 1] : NaN;
    const b3 = i + 2 < l ? bytes[i + 2] : NaN;
    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (Number.isNaN(b2) ? 0 : b2 >> 4);
    const c3 = Number.isNaN(b2) ? 64 : ((b2 & 15) << 2) | (Number.isNaN(b3) ? 0 : b3 >> 6);
    const c4 = Number.isNaN(b3) ? 64 : b3 & 63;
    result += B64.charAt(c1) + B64.charAt(c2) + (c3 === 64 ? '=' : B64.charAt(c3)) + (c4 === 64 ? '=' : B64.charAt(c4));
  }
  return result;
}
function base64Decode(str) {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const bytes = [];
  const len = str.length;
  for (let i = 0; i < len; i += 4) {
    const c1 = lookup[str.charCodeAt(i)];
    const c2 = lookup[str.charCodeAt(i + 1)];
    const c3 = str.charAt(i + 2) === '=' ? 64 : lookup[str.charCodeAt(i + 2)];
    const c4 = str.charAt(i + 3) === '=' ? 64 : lookup[str.charCodeAt(i + 3)];
    bytes.push((c1 << 2) | (c2 >> 4));
    if (c3 !== 64) {
      bytes.push(((c2 & 15) << 4) | (c3 >> 2));
      if (c4 !== 64) bytes.push(((c3 & 3) << 6) | c4);
    }
  }
  return bytes;
}

function packCounts(c) { return [c.moderator, c.outlaw, c.detective, c.doctor, c.town]; }
function unpackCounts(r) { return { moderator: r[0], outlaw: r[1], detective: r[2], doctor: r[3], town: r[4] }; }
function isTallyRow(v) { return Array.isArray(v) && v.length === 5 && v.every(n => typeof n === 'number'); }

async function digestBytes(input) {
  const hex = await sha256Hex(input);
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

export const QRCodec = {
  // v3.2 keyed obfuscation: key is the player's PUBLIC name, not a secret.
  async generateKeystream(key, sid, roundNumber, byteLength = 32) {
    const base = `${key}${sid}${roundNumber}`;
    const stream = [];
    for (let block = 0; stream.length < byteLength; block++) {
      const chunk = await digestBytes(block === 0 ? base : `${base}${block}`);
      for (const b of chunk) stream.push(b);
    }
    return stream.slice(0, byteLength);
  },

  async encryptRole(roleText, name, sid, roundNumber) {
    const textBytes = stringToBytes(roleText);
    const keystream = await this.generateKeystream(name, sid, roundNumber, textBytes.length);
    const cipherBytes = textBytes.map((b, i) => b ^ keystream[i]);
    return base64Encode(cipherBytes);
  },

  async decryptRole(ciphertextB64, name, sid, roundNumber) {
    const cipherBytes = base64Decode(ciphertextB64);
    const keystream = await this.generateKeystream(name, sid, roundNumber, cipherBytes.length);
    const textBytes = cipherBytes.map((b, i) => b ^ keystream[i]);
    return bytesToString(textBytes);
  },

  _devLog(dir, data) { if (DEV) console.log(`[QR ${dir}]`, data); },

  encode(payload) {
    const wire = this._encodeInner(payload);
    this._devLog('encode', wire);
    return wire;
  },

  _encodeInner(p) {
    switch (p.kind) {
      case 'join':
        return JSON.stringify({ k: 'j', s: p.sid, r: p.roundNumber, m: p.moderatorName });
      case 'joinAck':
        return JSON.stringify({ k: 'a', s: p.sid, n: p.name });
      case 'roles':
        return JSON.stringify({ k: 'r', s: p.sid, r: p.roundNumber, e: p.encryptedRoles });
      case 'sync':
        return JSON.stringify({ k: 's', s: p.sid, r: p.roundNumber, ph: p.phase, st: p.statusCodes });
      case 'ballot':
        return JSON.stringify({ k: 'b', s: p.sid, r: p.roundNumber, x: p.voter, t: p.target });
      case 'handoff':
        return JSON.stringify({
          k: 'h', s: p.sid, r: p.roundNumber, ro: p.roster.map(x => x.name),
          t: Object.fromEntries(Object.entries(p.rotationTally).map(([n, c]) => [n, packCounts(c)])),
        });
    }
  },

  decode(data) {
    this._devLog('decode', data);
    try {
      const w = JSON.parse(data);
      if (!w || typeof w !== 'object' || typeof w.s !== 'string' || !w.s) return null;

      if (w.k === 'j') {
        if (typeof w.r !== 'number' || typeof w.m !== 'string') return null;
        return { kind: 'join', sid: w.s, roundNumber: w.r, moderatorName: w.m };
      }
      if (w.k === 'a') {
        if (typeof w.n !== 'string') return null;
        return { kind: 'joinAck', sid: w.s, name: w.n };
      }
      if (w.k === 'r') {
        if (typeof w.r !== 'number' || !w.e || typeof w.e !== 'object') return null;
        return { kind: 'roles', sid: w.s, roundNumber: w.r, encryptedRoles: w.e };
      }
      if (w.k === 's') {
        if (typeof w.r !== 'number' || typeof w.ph !== 'string' || !Array.isArray(w.st)) return null;
        return { kind: 'sync', sid: w.s, roundNumber: w.r, phase: w.ph, statusCodes: w.st };
      }
      if (w.k === 'b') {
        if (typeof w.r !== 'number' || typeof w.x !== 'string' || typeof w.t !== 'string') return null;
        return { kind: 'ballot', sid: w.s, roundNumber: w.r, voter: w.x, target: w.t };
      }
      if (w.k === 'h') {
        if (typeof w.r !== 'number' || !Array.isArray(w.ro) || !w.t || typeof w.t !== 'object') return null;
        const roster = [];
        for (const name of w.ro) {
          if (typeof name !== 'string') return null;
          roster.push({ name, role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false });
        }
        const rotationTally = {};
        for (const [name, row] of Object.entries(w.t)) {
          if (!isTallyRow(row)) return null;
          rotationTally[name] = unpackCounts(row);
        }
        return { kind: 'handoff', sid: w.s, roundNumber: w.r, roster, rotationTally };
      }
      return null;
    } catch {
      return null;
    }
  },
};

// ===========================================================================
// GameStateMachine — phase transitions
// ===========================================================================

export const ALLOWED_TRANSITIONS = {
  LOBBY: ['ROLE_ASSIGNMENT'],
  ROLE_ASSIGNMENT: ['NIGHT'],
  NIGHT: ['DAY_NARRATION', 'ROLE_ASSIGNMENT'],
  DAY_NARRATION: ['DAY_NOMINATION'],
  DAY_NOMINATION: ['DAY_VOTE'],
  DAY_VOTE: ['NIGHT', 'ROUND_OVER'],
  ROUND_OVER: [],
};

// ===========================================================================
// RoleTable — balance
// ===========================================================================

const OUTLAWS_BY_HOLDERS = { 6:1, 7:2, 8:2, 9:2, 10:2, 11:3, 12:3, 13:3, 14:4, 15:4, 16:4 };
export const MIN_ROLE_HOLDERS = 6;
export const MAX_ROLE_HOLDERS = 16;
export const DEV_MIN_ROLE_HOLDERS = 3;

export function effectiveMinRoleHolders() {
  return DEV ? DEV_MIN_ROLE_HOLDERS : MIN_ROLE_HOLDERS;
}
export function outlawCountFor(roleHolders) {
  const fromTable = OUTLAWS_BY_HOLDERS[roleHolders];
  if (fromTable !== undefined) return fromTable;
  if (DEV && roleHolders >= DEV_MIN_ROLE_HOLDERS && roleHolders < MIN_ROLE_HOLDERS) return 1;
  return null;
}

// ===========================================================================
// RotationFairness — shuffle-bag over the session tally
// ===========================================================================

function pickFair(candidates, tally, bucket) {
  const counts = candidates.map(name => (tally[name]?.[bucket]) ?? 0);
  const minCount = Math.min(...counts);
  const pool = candidates.filter((_, i) => counts[i] === minCount);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function assignRolesForRound(players, roleCounts, tally) {
  const remaining = [...players];
  const assignment = {};
  const takeFair = (bucket, count, role) => {
    for (let i = 0; i < count; i++) {
      const pick = pickFair(remaining, tally, bucket);
      assignment[pick] = role;
      remaining.splice(remaining.indexOf(pick), 1);
    }
  };
  takeFair('outlaw', roleCounts.outlaws, 'OUTLAW');
  takeFair('detective', 1, 'DETECTIVE');
  takeFair('doctor', 1, 'DOCTOR');
  remaining.forEach(name => { assignment[name] = 'TOWN'; });
  return assignment;
}

export function pickNextModerator(players, tally, currentModerator) {
  const eligible = players.filter(p => p !== currentModerator);
  return pickFair(eligible, tally, 'moderator');
}

// ===========================================================================
// NarrationEngine — Tamil sayings (Avvaiyar / Bharathiyar) mapped to phases
// ===========================================================================

const POET_BY_SOURCE = {
  'Aathichoodi': 'Avvaiyar',
  'Konrai Vendhan': 'Avvaiyar',
  'Puthia Aathichoodi': 'Bharathiyar',
};

const NARRATION_DB = {
  LOBBY_WELCOME: [
    { tamil: 'இணக்கம் அறிந்துகொள்', transliteration: 'Inakkam arinthukol', translation: 'Understand and choose your companions wisely.', contextMeaning: 'Think carefully about who you can trust before the night falls.', source: 'Aathichoodi' },
    { tamil: 'கூடிப் பிரியேல்', transliteration: 'Koodip piriyel', translation: 'Do not abandon your friends after uniting.', contextMeaning: "Unity is the town's only defense against the outlaws.", source: 'Aathichoodi' },
    { tamil: 'நல்லாரோடு இணங்கு', transliteration: 'Nallaarodu inangu', translation: 'Associate with virtuous people.', contextMeaning: 'Build alliances with those who show clean logic.', source: 'Aathichoodi' },
    { tamil: 'ஒற்றுமை வலிமையாம்', transliteration: 'Otrumai valimaiyaam', translation: 'Unity is strength.', contextMeaning: 'Division and infighting only aid the Outlaws. Stick together.', source: 'Puthia Aathichoodi' },
    { tamil: 'கூடித் தொழில் செய்', transliteration: 'Koodith thozhil sey', translation: 'Work cooperatively.', contextMeaning: 'Townspeople must share ideas openly to solve the mystery.', source: 'Puthia Aathichoodi' },
  ],
  DAY_START_PEACE: [
    { tamil: 'ஒப்புரவு ஒழுகு', transliteration: 'Oppuravu ozhugu', translation: 'Align with community and help others.', contextMeaning: 'The Doctor successfully guarded our home. No lives were lost.', source: 'Aathichoodi' },
    { tamil: 'தானம் அல்லது தருமம் இல்லை', transliteration: 'Thaanam allathu tharumam illai', translation: 'There is no charity greater than protection.', contextMeaning: "Our Doctor stood between the victim and the outlaws' blades.", source: 'Konrai Vendhan' },
    { tamil: 'சாவதற்கு அஞ்சேல்', transliteration: 'Saavatharku anjel', translation: 'Do not fear death.', contextMeaning: 'We survived the dark night untouched. Let us speak with confidence.', source: 'Puthia Aathichoodi' },
    { tamil: 'சேர்க்கை அழியேல்', transliteration: 'Serkkai aziyel', translation: 'Do not destroy alliances/friendships.', contextMeaning: 'The community holds strong. Keep protecting each other.', source: 'Puthia Aathichoodi' },
  ],
  DAY_START_LOSS: [
    { tamil: 'சினம் சுருக்கிக் கொள்', transliteration: 'Sinam surukkik kol', translation: 'Control and reduce your anger.', contextMeaning: 'A fellow townsman was taken. Do not let wrath divide us.', source: 'Aathichoodi' },
    { tamil: 'ஐயம் புகினும் செய்வன செய்', transliteration: 'Aiyam puginum seyvana sey', translation: 'Even in adversity, do what is right.', contextMeaning: 'Tension is high. Do your duty to seek out truth.', source: 'Aathichoodi' },
    { tamil: 'அச்சம் தவிர்', transliteration: 'Acham thavir', translation: 'Avoid fear.', contextMeaning: 'A life was lost. Do not let fear dictate your nominations today.', source: 'Puthia Aathichoodi' },
    { tamil: 'வீரியம் பெருகு', transliteration: 'Veeriyam perugu', translation: 'Let courage multiply.', contextMeaning: 'Let the loss fuel our courage, not our confusion.', source: 'Puthia Aathichoodi' },
  ],
  NOMINATION_TENSION: [
    { tamil: 'கேள்வி முயல்', transliteration: 'Kelvi muyal', translation: 'Strive to ask questions and learn.', contextMeaning: 'Ask details, analyze discrepancies, and verify stories.', source: 'Aathichoodi' },
    { tamil: 'ஒருவரைப் பற்றிப் புறஞ்சொல்லேல்', transliteration: 'Oruvaraip pattrip puranjollel', translation: 'Do not speak ill of someone behind their back.', contextMeaning: 'Base your cases on logical inconsistencies, not rumors.', source: 'Aathichoodi' },
    { tamil: 'சிந்தனை செய்', transliteration: 'Sinthanai sey', translation: 'Think deeply / reflect.', contextMeaning: 'Do not rush. Reflect on who remains silent and who drives the noise.', source: 'Puthia Aathichoodi' },
    { tamil: 'கேட்டது நம்பேல்', transliteration: 'Kettathu nambel', translation: 'Do not believe everything you hear.', contextMeaning: 'The Outlaws will fabricate claims. Demand logical consistency.', source: 'Puthia Aathichoodi' },
  ],
  EXECUTION_RESOLVED: [
    { tamil: 'நேர்பட ஒழுகு', transliteration: 'Neerpada ozhugu', translation: 'Walk upright with honesty.', contextMeaning: 'An Outlaw has been exposed. Truth has cut through the web of lies.', source: 'Aathichoodi' },
    { tamil: 'வஞ்சகம் பேசேல்', transliteration: 'Vanjagam pesel', translation: 'Do not speak with double standards or deceit.', contextMeaning: 'The town has silenced a source of division.', source: 'Aathichoodi' },
    { tamil: 'தீயோர்க்கு அஞ்சேல்', transliteration: 'Theeyorkku anjel', translation: 'Do not fear the wicked.', contextMeaning: 'The town stands firm, exiling a threat without hesitation.', source: 'Puthia Aathichoodi' },
    { tamil: 'செய்வது துணிந்து செய்', transliteration: 'Seyvathu thuninthu sey', translation: 'Do what you do with courage.', contextMeaning: 'The decision was tough, but the town voted with conviction.', source: 'Puthia Aathichoodi' },
  ],
  GAME_OVER: [
    { tamil: 'மெய்யென்ற சொல் அல்லது மந்திரம் இல்லை', transliteration: 'Meiyendra sol allathu manthiram illai', translation: 'There is no mantra greater than truth.', contextMeaning: 'The outlaws are gone. The Town square returns to peace.', source: 'Konrai Vendhan' },
    { tamil: 'வெற்றி கொள்', transliteration: 'Vetri kol', translation: 'Conquer and win.', contextMeaning: 'Complete victory. The community has purged the threat.', source: 'Puthia Aathichoodi' },
    { tamil: 'வலிமை கொள்', transliteration: 'Valimai kol', translation: 'Be strong.', contextMeaning: 'The town survives through strength of unity and clear analysis.', source: 'Puthia Aathichoodi' },
    { tamil: 'தேசத்தைக் காப்பாய்', transliteration: 'Dhesathai kaappaay', translation: 'Protect your nation/community.', contextMeaning: 'The game concludes. The public space remains secure.', source: 'Puthia Aathichoodi' },
  ],
};

export const NarrationEngine = {
  pickSaying(category) {
    const list = NARRATION_DB[category];
    if (!list || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  },
  poetFor(saying) { return POET_BY_SOURCE[saying.source]; },
  scriptFor(category, victimName) {
    switch (category) {
      case 'LOBBY_WELCOME': return 'Gather round, everyone. We are preparing to secure our square.';
      case 'DAY_START_PEACE': return 'The shadows struck, but our community stood guard. No casualties.';
      case 'DAY_START_LOSS': return `${victimName || 'A neighbor'} was taken. We must find the outlaws without letting anger blind us.`;
      case 'NOMINATION_TENSION': return 'Tensions rise. Let us debate, ask questions, and seek proof.';
      case 'EXECUTION_RESOLVED': return `${victimName || 'The suspect'} has been cast out. Let's see if our judgment was true.`;
      case 'GAME_OVER': return 'The struggle has ended. The final cards are laid bare.';
    }
  },
};

// ===========================================================================
// Night resolution
// ===========================================================================

export function resolveNight(actions, roster) {
  const kill = actions.find(a => a.action === 'KILL');
  const save = actions.find(a => a.action === 'SAVE');
  const investigate = actions.find(a => a.action === 'INVESTIGATE');
  const saved = !!kill && !!save && kill.target === save.target;
  const outcome = { victim: kill && !saved ? kill.target : undefined, saved };
  if (investigate) {
    const target = roster.find(p => p.name === investigate.target);
    if (target) outcome.investigation = { target: target.name, isOutlaw: target.role === 'OUTLAW' };
  }
  return outcome;
}

// ===========================================================================
// Reducer (appReducer) — ported from src/state/dispatch.ts
// ===========================================================================

export const STALE_SESSION_ALERT = "This QR code is from a past game session and can't be used.";
export function newSessionId() { return Math.random().toString(36).slice(2, 10); }

function withAlert(state, alert) { return { ...state, alert }; }
function tallyBucketFor(role) {
  switch (role) {
    case 'OUTLAW': return 'outlaw';
    case 'DETECTIVE': return 'detective';
    case 'DOCTOR': return 'doctor';
    case 'TOWN': return 'town';
    default: return null;
  }
}
function bumpTally(tally, name, bucket) {
  const current = tally[name] ?? { moderator: 0, outlaw: 0, detective: 0, doctor: 0, town: 0 };
  return { ...tally, [name]: { ...current, [bucket]: current[bucket] + 1 } };
}

export function appReducer(state, action) {
  const session = state.session;
  switch (action.type) {
    case 'HYDRATED':
      return { session: action.session, alert: null };

    case 'PROFILE_CREATED':
      return {
        alert: null,
        session: {
          sessionId: '', deviceMode: 'PLAYER', roundNumber: 0, phase: 'LOBBY',
          self: { name: action.name, role: 'UNASSIGNED', status: 'WAITING_FOR_MODERATOR', isModerator: false },
          rotationTally: {},
        },
      };

    case 'SESSION_CREATED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      return {
        alert: null,
        session: {
          ...session, sessionId: newSessionId(), deviceMode: 'MODERATOR', roundNumber: 1, phase: 'LOBBY',
          self: { ...session.self, isModerator: true, status: 'ACTIVE' },
          roster: [{ ...session.self, isModerator: true, status: 'ACTIVE' }],
          pendingActions: [], rotationTally: {}, ballots: {},
        },
      };
    }

    case 'PROFILE_CLEARED': {
      if (!session || session.sessionId !== '') return withAlert(state, 'Leave the game night first to change your name.');
      return { session: null, alert: null };
    }

    case 'SESSION_LEFT': {
      if (!session || session.deviceMode !== 'PLAYER' || session.sessionId === '') return withAlert(state, 'You are not in a game night.');
      return {
        alert: null,
        session: {
          sessionId: '', deviceMode: 'PLAYER', roundNumber: 0, phase: 'LOBBY',
          self: { ...session.self, isModerator: false, role: 'UNASSIGNED', status: 'WAITING_FOR_MODERATOR' },
          rotationTally: {},
        },
      };
    }

    case 'SESSION_CANCELLED': {
      if (!session || session.deviceMode !== 'MODERATOR' || session.phase !== 'LOBBY') return withAlert(state, 'A game night can only be cancelled from the lobby.');
      return {
        alert: null,
        session: {
          sessionId: '', deviceMode: 'PLAYER', roundNumber: 0, phase: 'LOBBY',
          self: { ...session.self, isModerator: false, role: 'UNASSIGNED', status: 'WAITING_FOR_MODERATOR' },
          rotationTally: {},
        },
      };
    }

    case 'JOIN_SCANNED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      return {
        alert: null,
        session: {
          ...session, sessionId: action.payload.sid, roundNumber: action.payload.roundNumber, phase: 'LOBBY',
          self: { ...session.self, status: 'ACTIVE' },
        },
      };
    }

    case 'JOIN_ACK_SCANNED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, "Join confirmations go to the Moderator's device.");
      if (action.payload.sid !== session.sessionId) return withAlert(state, STALE_SESSION_ALERT);
      const roster = session.roster;
      if (roster.some(p => p.name === action.payload.name)) return withAlert(state, `A player named ${action.payload.name} is already in the roster.`);
      const joiner = { name: action.payload.name, role: 'UNASSIGNED', status: 'ACTIVE', isModerator: false };
      return { alert: null, session: { ...session, roster: [...roster, joiner] } };
    }

    case 'ROLES_SCANNED': {
      if (!session) return withAlert(state, 'Role assignments are for player devices.');
      if (session.deviceMode === 'MODERATOR') {
        if (session.phase !== 'ROUND_OVER' || action.roundNumber <= session.roundNumber) return withAlert(state, 'Role assignments are for player devices.');
        return {
          alert: null,
          session: {
            ...session, deviceMode: 'PLAYER', roundNumber: action.roundNumber, phase: 'ROLE_ASSIGNMENT',
            companions: action.companions,
            self: { ...session.self, isModerator: false, role: action.role, status: 'ACTIVE' },
            roster: undefined, pendingActions: undefined, ballots: undefined, lastOutcome: undefined,
          },
        };
      }
      return {
        alert: null,
        session: {
          ...session, roundNumber: action.roundNumber, phase: 'ROLE_ASSIGNMENT', companions: action.companions,
          self: { ...session.self, role: action.role, status: 'ACTIVE' },
        },
      };
    }

    case 'STATE_SYNC_SCANNED': {
      if (!session || session.deviceMode !== 'PLAYER') return withAlert(state, 'State sync is for player devices.');
      if (action.payload.sid !== session.sessionId) return withAlert(state, STALE_SESSION_ALERT);
      const roster = action.payload.statusCodes.map(([name, code]) => {
        let status = 'ACTIVE';
        if (code === 'D') status = 'DECEASED';
        else if (code === 'E') status = 'ELIMINATED';
        else if (code === 'W') status = 'WAITING_FOR_MODERATOR';
        return { name, role: 'UNASSIGNED', status, isModerator: code === 'M' };
      });
      let selfStatus = session.self.status;
      const match = action.payload.statusCodes.find(([name]) => name === session.self.name);
      if (match) {
        const code = match[1];
        if (code === 'A') selfStatus = 'ACTIVE';
        else if (code === 'D') selfStatus = 'DECEASED';
        else if (code === 'E') selfStatus = 'ELIMINATED';
      }
      return {
        alert: null,
        session: { ...session, roundNumber: action.payload.roundNumber, phase: action.payload.phase, self: { ...session.self, status: selfStatus }, roster },
      };
    }

    case 'BALLOT_SCANNED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, "Ballots go to the Moderator's device.");
      if (action.payload.sid !== session.sessionId) return withAlert(state, STALE_SESSION_ALERT);
      if (action.payload.roundNumber !== session.roundNumber) return withAlert(state, 'This ballot is from a different round.');
      const ballots = session.ballots ?? {};
      const voterObj = session.roster.find(p => p.name === action.payload.voter);
      if (!voterObj || voterObj.status !== 'ACTIVE') return withAlert(state, `Voter ${action.payload.voter} is not active in the roster.`);
      const targetObj = session.roster.find(p => p.name === action.payload.target);
      if (!targetObj || targetObj.status !== 'ACTIVE') return withAlert(state, `Target ${action.payload.target} is not active in the roster.`);
      if (targetObj.isModerator) return withAlert(state, 'The Moderator holds no role and cannot be voted out.');
      return { alert: null, session: { ...session, ballots: { ...ballots, [action.payload.voter]: action.payload.target } } };
    }

    case 'HANDOFF_SCANNED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      if (session.sessionId && action.payload.sid !== session.sessionId) return withAlert(state, STALE_SESSION_ALERT);
      const roster = action.payload.roster.map(p => ({ ...p, isModerator: p.name === session.self.name, role: 'UNASSIGNED', status: 'ACTIVE' }));
      return {
        alert: null,
        session: {
          ...session, sessionId: action.payload.sid, deviceMode: 'MODERATOR', roundNumber: action.payload.roundNumber, phase: 'LOBBY',
          self: { ...session.self, isModerator: true, role: 'UNASSIGNED', status: 'ACTIVE' },
          roster, pendingActions: [], rotationTally: action.payload.rotationTally, lastOutcome: undefined, ballots: {},
        },
      };
    }

    case 'NIGHT_ACTION_LOGGED': {
      if (!session || session.deviceMode !== 'MODERATOR') return withAlert(state, "Night actions go to the Moderator's device.");
      const pending = session.pendingActions ?? [];
      const already = pending.some(a => a.actor === action.actor && a.action === action.action);
      if (already) return withAlert(state, `${action.actor} already logged a ${action.action} action this night.`);
      return { alert: null, session: { ...session, pendingActions: [...pending, { actor: action.actor, action: action.action, target: action.target }] } };
    }

    case 'ROUND_STARTED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, 'Only the Moderator can start a round.');
      const holders = session.roster.filter(p => !p.isModerator && p.status === 'ACTIVE');
      const outlaws = outlawCountFor(holders.length);
      if (outlaws === null) return withAlert(state, `Need ${MIN_ROLE_HOLDERS}-${MAX_ROLE_HOLDERS} joined players besides the Moderator (currently ${holders.length}).`);
      const assignment = assignRolesForRound(holders.map(p => p.name), { outlaws }, session.rotationTally);
      const roster = session.roster.map(p => p.isModerator ? p : { ...p, role: assignment[p.name] ?? p.role });
      return { alert: null, session: { ...session, roster, phase: 'ROLE_ASSIGNMENT', pendingActions: [], lastOutcome: undefined, lastElimination: undefined, ballots: {} } };
    }

    case 'PHASE_ADVANCED': {
      if (!session) return withAlert(state, 'No active session.');
      if (!ALLOWED_TRANSITIONS[session.phase].includes(action.to)) return withAlert(state, `Illegal phase transition: ${session.phase} -> ${action.to}`);
      const ballots = action.to === 'DAY_VOTE' ? {} : session.ballots;
      const lastElimination = action.to === 'NIGHT' ? undefined : session.lastElimination;
      return { alert: null, session: { ...session, phase: action.to, ballots, lastElimination } };
    }

    case 'NIGHT_RESOLVED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, 'Only the Moderator can resolve the night.');
      if (!ALLOWED_TRANSITIONS[session.phase].includes('DAY_NARRATION')) return withAlert(state, `Cannot resolve the night from ${session.phase}.`);
      const outcome = resolveNight(session.pendingActions ?? [], session.roster);
      const roster = session.roster.map(p => p.name === outcome.victim ? { ...p, status: 'DECEASED' } : p);
      return { alert: null, session: { ...session, roster, pendingActions: [], lastOutcome: outcome, phase: 'DAY_NARRATION' } };
    }

    case 'PLAYER_ELIMINATED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, 'Only the Moderator can log an elimination.');
      if (session.phase !== 'DAY_VOTE') return withAlert(state, 'Eliminations happen during the day vote.');
      if (session.roster.find(p => p.name === action.name)?.isModerator) return withAlert(state, 'The Moderator holds no role and cannot be voted out.');
      const roster = session.roster.map(p => p.name === action.name ? { ...p, status: 'ELIMINATED' } : p);
      return { alert: null, session: { ...session, roster, lastElimination: action.name } };
    }

    case 'PLAYER_REMOVED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, 'Only the Moderator can remove a player.');
      if (session.phase !== 'LOBBY' && session.phase !== 'ROUND_OVER') return withAlert(state, 'Players can only be removed between rounds (lobby or round over).');
      const target = session.roster.find(p => p.name === action.name);
      if (!target) return withAlert(state, `${action.name} is not in the roster.`);
      if (target.isModerator) return withAlert(state, 'The Moderator cannot remove themselves — cancel the game night or hand off instead.');
      return { alert: null, session: { ...session, roster: session.roster.filter(p => p.name !== action.name) } };
    }

    case 'ROUND_ENDED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) return withAlert(state, 'Only the Moderator can end a round.');
      let tally = session.rotationTally;
      for (const p of session.roster) {
        if (p.isModerator) tally = bumpTally(tally, p.name, 'moderator');
        else {
          const bucket = tallyBucketFor(p.role);
          if (bucket) tally = bumpTally(tally, p.name, bucket);
        }
      }
      return { alert: null, session: { ...session, rotationTally: tally, phase: 'ROUND_OVER' } };
    }

    case 'ALERT_CLEARED':
      return { ...state, alert: null };

    case 'GAME_NIGHT_CLEARED':
      return { session: null, alert: null };

    default:
      return state;
  }
}

// Shared roles-QR scan pipeline (ported from src/services/rolesScan.ts)
const ROLE_BY_CODE = { O: 'OUTLAW', E: 'DETECTIVE', D: 'DOCTOR', T: 'TOWN' };
export async function scanRolesPayload(data, session, dispatch) {
  const payload = QRCodec.decode(data);
  if (!payload || payload.kind !== 'roles') return { ok: false, title: 'Error', message: "Invalid QR code. Please scan the Moderator's Roles QR." };
  if (payload.sid !== session.sessionId) return { ok: false, title: 'Error', message: 'This QR code is from a different game session.' };
  const encrypted = payload.encryptedRoles[session.self.name];
  if (!encrypted) return { ok: false, title: 'Error', message: `Your name (${session.self.name}) is not registered in this round's role assignment.` };
  try {
    const decrypted = await QRCodec.decryptRole(encrypted, session.self.name, payload.sid, payload.roundNumber);
    const parts = decrypted.split('|');
    const roleCode = parts[0];
    if (!['O', 'E', 'D', 'T'].includes(roleCode)) throw new Error('Invalid role code');
    dispatch({ type: 'ROLES_SCANNED', role: ROLE_BY_CODE[roleCode], companions: parts[1] ? parts[1].split(',') : undefined, roundNumber: payload.roundNumber });
    return { ok: true, title: 'Success', message: 'Role decrypted successfully! Hold down the card to reveal it.' };
  } catch {
    return { ok: false, title: 'Error', message: 'Failed to reveal your role. Make sure you joined under this same name.' };
  }
}
