import type { RoundPhase } from '../engine/GameStateMachine';
export type { RoundPhase };

export type TownsquareRole = 'OUTLAW' | 'DETECTIVE' | 'DOCTOR' | 'TOWN' | 'UNASSIGNED';
export type RoleCode = 'O' | 'E' | 'D' | 'T'; // Outlaw / dEtective / Doctor / Town — roles-QR wire codes
export type PlayerStatus = 'WAITING_FOR_MODERATOR' | 'ACTIVE' | 'DECEASED' | 'ELIMINATED';

export interface PlayerProfile {
  name: string;
  role: TownsquareRole;
  status: PlayerStatus;
  isModerator: boolean;
}

export interface RoundAction {
  actor: string;
  action: 'KILL' | 'SAVE' | 'INVESTIGATE'; // the three silent-night gestures (day voting is public, not a logged action)
  target: string;
}

export interface RotationCounts {
  moderator: number;
  outlaw: number;
  detective: number;
  doctor: number;
  town: number;
}

export type RotationTally = Record<string, RotationCounts>; // keyed by player name

export interface NightOutcome {
  victim?: string;                  // undefined when the Doctor's save landed or no kill was logged
  saved: boolean;
  investigation?: { target: string; isOutlaw: boolean };
}

export interface SessionState {
  sessionId: string;                 // '' until a session is created/joined; regenerated on "New Game Night"
  deviceMode: 'PLAYER' | 'MODERATOR';
  roundNumber: number;
  phase: RoundPhase;
  self: PlayerProfile;
  companions?: string[];             // player devices: fellow Outlaws, from the role link
  roster?: PlayerProfile[];          // present only when deviceMode === 'MODERATOR'
  pendingActions?: RoundAction[];    // present only when deviceMode === 'MODERATOR'
  lastOutcome?: NightOutcome;        // moderator device: most recent night resolution, drives narration
  lastElimination?: string;          // moderator device: who the town voted out today (names the card, gates night)
  rotationTally: RotationTally;
  ballots?: Record<string, string>;  // v3 moderator device: voter -> target ballot counts
}

/** QR payload shown on the Moderator's lobby screen; scanning it is how a player joins. */
export interface JoinSessionPayload {
  kind: 'join';
  sid: string;
  roundNumber: number;
  moderatorName: string;
}

/** v3.2 QR payload shown on the player's screen after scanning join QR to confirm the join (name only). */
export interface JoinAckPayload {
  kind: 'joinAck';
  sid: string;
  name: string;
}

/** v3.2 QR payload shown on the Moderator's screen containing name-keyed (obfuscated) roles for all players. */
export interface RolesPayload {
  kind: 'roles';
  sid: string;
  roundNumber: number;
  encryptedRoles: Record<string, string>; // name -> base64-encoded encrypted role ciphertext
}

/** v3 QR payload shown on the Moderator's screen to sync alive/dead status lists. */
export interface SyncPayload {
  kind: 'sync';
  sid: string;
  roundNumber: number;
  phase: RoundPhase;
  statusCodes: [string, string][]; // [name, statusCode] pairs
}

/** v3 QR payload shown on a player's device containing their secret ballot vote. */
export interface BallotPayload {
  kind: 'ballot';
  sid: string;
  roundNumber: number;
  voter: string;
  target: string;
}

/** QR payload for handing the Moderator role (full roster + tally) to a successor. */
export interface ModeratorHandoffPayload {
  kind: 'handoff';
  sid: string;
  roundNumber: number;
  roster: PlayerProfile[];
  rotationTally: RotationTally;
}

export type QRPayload =
  | JoinSessionPayload
  | JoinAckPayload
  | RolesPayload
  | SyncPayload
  | BallotPayload
  | ModeratorHandoffPayload;
