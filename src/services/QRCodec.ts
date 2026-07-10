import * as Crypto from 'expo-crypto';
import type {
  QRPayload,
  JoinSessionPayload,
  JoinAckPayload,
  RolesPayload,
  SyncPayload,
  BallotPayload,
  ModeratorHandoffPayload,
  PlayerProfile,
  RotationTally,
  RotationCounts
} from '../types';
import type { RoundPhase } from '../engine/GameStateMachine';

type TallyRow = [number, number, number, number, number];

function packCounts(c: RotationCounts): TallyRow {
  return [c.moderator, c.outlaw, c.detective, c.doctor, c.town];
}

function unpackCounts(row: TallyRow): RotationCounts {
  return { moderator: row[0], outlaw: row[1], detective: row[2], doctor: row[3], town: row[4] };
}

function isTallyRow(v: unknown): v is TallyRow {
  return Array.isArray(v) && v.length === 5 && v.every(n => typeof n === 'number');
}

// Percent-encoding based string-to-byte helpers (robust Unicode support without TextEncoder)
function stringToBytes(str: string): number[] {
  const encoded = encodeURIComponent(str);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded.charCodeAt(i);
    bytes.push(c);
  }
  return bytes;
}

function bytesToString(bytes: number[]): string {
  const chars = bytes.map(b => String.fromCharCode(b)).join('');
  return decodeURIComponent(chars);
}

// Pure JS Base64 encoder/decoder operating on numeric byte arrays
function base64Encode(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const l = bytes.length;
  for (i = 0; i < l; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < l ? bytes[i + 1] : NaN;
    const b3 = i + 2 < l ? bytes[i + 2] : NaN;

    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (Number.isNaN(b2) ? 0 : b2 >> 4);
    const c3 = Number.isNaN(b2) ? 64 : ((b2 & 15) << 2) | (Number.isNaN(b3) ? 0 : b3 >> 6);
    const c4 = Number.isNaN(b3) ? 64 : b3 & 63;

    result += chars.charAt(c1) + chars.charAt(c2) + (c3 === 64 ? '=' : chars.charAt(c3)) + (c4 === 64 ? '=' : chars.charAt(c4));
  }
  return result;
}

function base64Decode(str: string): number[] {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  const bytes: number[] = [];
  const len = str.length;
  let i = 0;
  for (i = 0; i < len; i += 4) {
    const c1 = lookup[str.charCodeAt(i)];
    const c2 = lookup[str.charCodeAt(i + 1)];
    const c3 = str.charAt(i + 2) === '=' ? 64 : lookup[str.charCodeAt(i + 2)];
    const c4 = str.charAt(i + 3) === '=' ? 64 : lookup[str.charCodeAt(i + 3)];

    const b1 = (c1 << 2) | (c2 >> 4);
    bytes.push(b1);
    if (c3 !== 64) {
      const b2 = ((c2 & 15) << 4) | (c3 >> 2);
      bytes.push(b2);
      if (c4 !== 64) {
        const b3 = ((c3 & 3) << 6) | c4;
        bytes.push(b3);
      }
    }
  }
  return bytes;
}

export class QRCodec {
  // v3.2 keyed obfuscation: the key is the player's PUBLIC name, not a secret token.
  // Goal is only "a stock camera scanning the roles QR sees noise, not roles" — a
  // determined in-session player can recompute the key (accepted, = peeking a card).
  private static async digestBytes(input: string): Promise<number[]> {
    const hex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
  }

  // SHA-256 yields 32 keystream bytes per block. A role string longer than one block
  // (e.g. an Outlaw with several long companion names in a 16-player game) needs more:
  // we derive further blocks CTR-style with an appended counter rather than repeating
  // the 32 bytes — a repeating XOR key would leak structure. Block 0 keeps the bare
  // input, so every ciphertext for a role string up to 32 bytes is byte-identical to
  // the original single-block scheme.
  static async generateKeystream(key: string, sid: string, roundNumber: number, byteLength: number = 32): Promise<number[]> {
    const base = `${key}${sid}${roundNumber}`;
    const stream: number[] = [];
    for (let block = 0; stream.length < byteLength; block++) {
      stream.push(...await this.digestBytes(block === 0 ? base : `${base}${block}`));
    }
    return stream.slice(0, byteLength);
  }

  static async encryptRole(roleText: string, name: string, sid: string, roundNumber: number): Promise<string> {
    const textBytes = stringToBytes(roleText);
    const keystream = await this.generateKeystream(name, sid, roundNumber, textBytes.length);
    const cipherBytes = textBytes.map((b, i) => b ^ keystream[i]);
    return base64Encode(cipherBytes);
  }

  static async decryptRole(ciphertextB64: string, name: string, sid: string, roundNumber: number): Promise<string> {
    const cipherBytes = base64Decode(ciphertextB64);
    const keystream = await this.generateKeystream(name, sid, roundNumber, cipherBytes.length);
    const textBytes = cipherBytes.map((b, i) => b ^ keystream[i]);
    return bytesToString(textBytes);
  }

  /** DEV: every wire payload logs to Metro — one terminal aggregates the live
      transcript from ALL connected devices (iPhones + AVDs). Compiled out of release. */
  private static devLog(direction: string, data: string): void {
    if (__DEV__) console.log(`[QR ${direction}]`, data);
  }

  static encode(payload: QRPayload): string {
    const wire = QRCodec.encodeInner(payload);
    QRCodec.devLog('encode', wire);
    return wire;
  }

  private static encodeInner(payload: QRPayload): string {
    switch (payload.kind) {
      case 'join':
        return JSON.stringify({
          k: 'j', s: payload.sid, r: payload.roundNumber, m: payload.moderatorName,
        });
      case 'joinAck':
        return JSON.stringify({
          k: 'a', s: payload.sid, n: payload.name,
        });
      case 'roles':
        return JSON.stringify({
          k: 'r', s: payload.sid, r: payload.roundNumber, e: payload.encryptedRoles,
        });
      case 'sync':
        return JSON.stringify({
          k: 's', s: payload.sid, r: payload.roundNumber, ph: payload.phase, st: payload.statusCodes,
        });
      case 'ballot':
        return JSON.stringify({
          k: 'b', s: payload.sid, r: payload.roundNumber, x: payload.voter, t: payload.target,
        });
      case 'handoff':
        // Wire carries player NAMES only (v3.2). The incoming Moderator encrypts the
        // next round's roles QR keyed on each name — no secret token to carry.
        return JSON.stringify({
          k: 'h', s: payload.sid, r: payload.roundNumber, ro: payload.roster.map(p => p.name),
          t: Object.fromEntries(
            Object.entries(payload.rotationTally).map(([name, c]) => [name, packCounts(c)])
          ),
        });
    }
  }

  static decode(data: string): QRPayload | null {
    QRCodec.devLog('decode', data);
    try {
      const w = JSON.parse(data);
      if (!w || typeof w !== 'object' || typeof w.s !== 'string' || !w.s) return null;

      if (w.k === 'j') {
        if (typeof w.r !== 'number' || typeof w.m !== 'string') return null;
        const join: JoinSessionPayload = {
          kind: 'join', sid: w.s, roundNumber: w.r, moderatorName: w.m,
        };
        return join;
      }

      if (w.k === 'a') {
        if (typeof w.n !== 'string') return null;
        const joinAck: JoinAckPayload = {
          kind: 'joinAck', sid: w.s, name: w.n,
        };
        return joinAck;
      }

      if (w.k === 'r') {
        if (typeof w.r !== 'number' || !w.e || typeof w.e !== 'object') return null;
        const roles: RolesPayload = {
          kind: 'roles', sid: w.s, roundNumber: w.r, encryptedRoles: w.e,
        };
        return roles;
      }

      if (w.k === 's') {
        if (typeof w.r !== 'number' || typeof w.ph !== 'string' || !Array.isArray(w.st)) return null;
        const sync: SyncPayload = {
          kind: 'sync', sid: w.s, roundNumber: w.r, phase: w.ph as RoundPhase, statusCodes: w.st,
        };
        return sync;
      }

      if (w.k === 'b') {
        if (typeof w.r !== 'number' || typeof w.x !== 'string' || typeof w.t !== 'string') return null;
        const ballot: BallotPayload = {
          kind: 'ballot', sid: w.s, roundNumber: w.r, voter: w.x, target: w.t,
        };
        return ballot;
      }

      if (w.k === 'h') {
        if (typeof w.r !== 'number' || !Array.isArray(w.ro) || !w.t || typeof w.t !== 'object') return null;
        const roster = [];
        for (const name of w.ro) {
          if (typeof name !== 'string') return null;
          roster.push({
            name,
            role: 'UNASSIGNED' as const, status: 'ACTIVE' as const, isModerator: false,
          });
        }
        const rotationTally: RotationTally = {};
        for (const [name, row] of Object.entries(w.t)) {
          if (!isTallyRow(row)) return null;
          rotationTally[name] = unpackCounts(row);
        }
        const handoff: ModeratorHandoffPayload = {
          kind: 'handoff', sid: w.s, roundNumber: w.r, roster, rotationTally,
        };
        return handoff;
      }

      return null;
    } catch {
      return null;
    }
  }
}
